/**
 * Kaskade — the speed mode.
 *
 * A fixed frame starts empty. Shards ride down a conveyor on the right; you drag
 * them onto the frame to cover cells. Fill a whole row and it ignites and
 * clears, freeing space. Cover as much as you can before the clock runs out;
 * score rewards speed (a multiplier that builds while you place cleanly and
 * resets when a shard falls off the belt).
 */

import { type Rng, rngFromSeed } from "@polyomino/puzzle-core";
import { pickShardName, shardByColorIndex, shardColorIndex, shardDef } from "./shards.js";

export const CASCADE_ROWS = 8;
export const CASCADE_COLS = 6;
const DURATION_MS = 150_000; // 2:30 Grundzeit (Joker/Blitzstein legen noch drauf)
const BASE_SPAWN_MS = 2200;
const MIN_SPAWN_MS = 950;
const BELT_TRAVEL_MS_START = 12_200; // time for a shard to ride top→bottom, at run start
const BELT_TRAVEL_MS_END = 5_900; // ...and by the end of the run — the belt speeds up
export const CASCADE_LIVES = 3;
const MAX_ON_BELT = 3;
const MIN_GAP_Y = 0.36; // spacing between shards on the belt

export interface Pos {
  row: number;
  col: number;
}

export interface Shard {
  id: number;
  name: string;
  orientationIndex: number;
  /** 0 = top of belt, 1 = fallen off the bottom. */
  y: number;
}

export interface CascadeResult {
  score: number;
  cleared: number;
  covered: number;
  perfectClears: number;
  livesLeft: number;
  bestChain: number;
  /** Gespielte Zeit in ms — für die Plausibilitätsprüfung der Bestenliste. */
  elapsedMs: number;
  /** Nur im Level-Modus aussagekräftig — Ziel erreicht, bevor Leben/Budget alle waren. */
  won: boolean;
}

/**
 * Ein Story-Level: dieselbe Kaskade-Mechanik, aber mit einem festen Ziel statt
 * einer Uhr. Kein Zeitdruck — der Druck kommt aus dem Scherben-Budget: ist es
 * aufgebraucht (und Band + Ablage leer), bevor `targetRows` erreicht ist, ist
 * das Level verloren, genau wie bei 0 Leben.
 */
export interface LevelConfig {
  rows: number;
  cols: number;
  /** Wie viele Scherben dieses Level insgesamt ausspuckt — kein Nachschub danach. */
  shardBudget: number;
  /** So viele Reihen müssen geräumt werden, um zu gewinnen. */
  targetRows: number;
  lives: number;
}

/**
 * A short-lived objective with a real constraint. Vier Arten, eine zufällig
 * pro Fenster — reißt der Spieler eine, kommt sofort die nächste, andere Art.
 * Belohnung: ein Leben zurück (oder Punkte, wenn schon voll) **und** Extrazeit
 * — Runden werden länger, aber nur wer die Aufgaben löst, verdient sich das.
 */
export type ChallengeKind = "straight" | "rows" | "mono" | "combo";
export interface Challenge {
  kind: ChallengeKind;
  target: number;
  progress: number;
  /** `elapsedMs()` value at which the challenge expires. */
  deadline: number;
  label: string;
}
const CHALLENGE_KINDS: ReadonlyArray<{ kind: ChallengeKind; target: number; label: string }> = [
  { kind: "straight", target: 1, label: "Reihe nur aus geraden Linien (2·3·4)" },
  { kind: "rows", target: 2, label: "Räume 2 Reihen" },
  { kind: "mono", target: 1, label: "Reihe nur in einer Farbe" },
  { kind: "combo", target: 3, label: "Baue eine Kette ×3" },
];
const CHALLENGE_COOLDOWN_MIN = 12_000;
const CHALLENGE_COOLDOWN_JITTER = 8_000;
/** Wie lange ein Fenster offen ist — exportiert, damit die View den Balken
 *  (Countdown-Leiste über dem Brett) als Anteil davon füllen kann. */
export const CHALLENGE_WINDOW_MS = 22_000;
const CHALLENGE_FIRST_AT = 12_000;
/** Bonuszeit für eine gelöste Aufgabe — Runden werden länger, wenn man sie löst. */
const CHALLENGE_TIME_BONUS_MS = 10_000;

export class CascadeState {
  readonly rows: number;
  readonly cols: number;
  /** 0 = empty, otherwise 1-based index into PIECE_NAMES for the colour. */
  readonly board: Int8Array;
  /** Gesetzt, wenn dies ein Story-Level ist (Budget statt Uhr) — sonst `null` = Free Play. */
  readonly level: LevelConfig | null;

  belt: Shard[] = [];
  hold: Shard | null = null;

  score = 0;
  multiplier = 1;
  cleared = 0;
  perfectClears = 0;
  misses = 0;
  /** A shard reaching the bottom unplaced costs one of these; hit 0 and the run ends. */
  lives: number;
  /** Aufeinanderfolgende Platzierungen, die je mindestens eine Reihe räumen —
   *  reißt bei einer Platzierung ohne Clear oder einem verpassten Splitter. */
  chain = 0;
  bestChain = 0;
  /** Row indices cleared by the most recent `place()` — for the view's flash. */
  lastCleared: number[] = [];
  /** Score before the most recent clear-causing placement — for the view's "+N" pop. */
  private clearScoreBase = 0;
  private freshClear = false;
  /** Nur Level-Modus: wie viele neue Leerzeilen beim letzten Kollaps oben
   *  entstanden sind — die View animiert damit das Zusammenrutschen. */
  private collapsedRows = 0;
  /** Höchste bereits gefeierte Multiplikator-Stufe (abgerundet). */
  private multTierSeen = 1;
  private tierUp = 0;
  private perfectFlag = false;

  /** The rows cleared by the last placement, once — for the view's burst/flash/pop. */
  consumeFreshClear(): { rows: number[]; gain: number; chain: number; collapsedRows: number } | null {
    if (!this.freshClear) return null;
    this.freshClear = false;
    const collapsedRows = this.collapsedRows;
    this.collapsedRows = 0;
    return {
      rows: [...this.lastCleared],
      gain: Math.round(this.score - this.clearScoreBase),
      chain: this.chain,
      collapsedRows,
    };
  }
  /** Neue Multiplikator-Stufe (2..6), einmalig — oder `null`. Für Screen-Shake + Fanfare. */
  consumeTierUp(): number | null {
    if (!this.tierUp) return null;
    const t = this.tierUp;
    this.tierUp = 0;
    return t;
  }
  /** Einmalig `true`, direkt nachdem das Brett komplett leer geworden ist — der
   *  „alle Scherben weg"-Bonus (siehe `place()`). Für eine eigene Feier in der View. */
  consumePerfectClear(): boolean {
    const v = this.perfectFlag;
    this.perfectFlag = false;
    return v;
  }
  /** The active mini-challenge, if any — cleared automatically on success or timeout. */
  challenge: Challenge | null = null;

  private rng: Rng;
  private nextId = 1;
  private spawnCount = 0;
  private started: number | null = null;
  private extraMs = 0;
  private spawnTimer = 0;
  private spawnInterval = BASE_SPAWN_MS;
  private endedAt: number | null = null;
  private pausedAt: number | null = null;
  private pausedTotal = 0;
  private nextChallengeAt = CHALLENGE_FIRST_AT;
  private challengeWon = false;

  constructor(seed: string, level: LevelConfig | null = null) {
    this.rng = rngFromSeed(seed);
    this.level = level;
    this.rows = level?.rows ?? CASCADE_ROWS;
    this.cols = level?.cols ?? CASCADE_COLS;
    this.board = new Int8Array(this.rows * this.cols);
    this.lives = level?.lives ?? CASCADE_LIVES;
    this.belt.push(this.makeShard(0.72), this.makeShard(0.38), this.makeShard(0.04));
  }

  private makeShard(y: number): Shard {
    this.spawnCount += 1;
    const name = pickShardName(this.rng, this.coveredCells() / (this.rows * this.cols));
    return { id: this.nextId++, name, orientationIndex: 0, y };
  }

  /** Wie viele Scherben dieses Level noch ausspuckt — `Infinity` im Free Play. */
  get shardsLeft(): number {
    return this.level ? Math.max(0, this.level.shardBudget - this.spawnCount) : Infinity;
  }
  /** Nur im Level-Modus aussagekräftig: Ziel schon erreicht? */
  get won(): boolean {
    return this.level !== null && this.cleared >= this.level.targetRows;
  }

  /** Belt speed ramps up over the run — a run gets visibly faster near the end.
   *  Im Level-Modus gibt's keine Uhr, gegen die man ramped — konstantes Tempo. */
  private travelMs(): number {
    if (this.level) return BELT_TRAVEL_MS_START;
    const t = this.started === null ? 0 : Math.min(1, this.elapsedMs() / DURATION_MS);
    return BELT_TRAVEL_MS_START + (BELT_TRAVEL_MS_END - BELT_TRAVEL_MS_START) * t;
  }

  start(): void {
    if (this.started === null) this.started = performance.now();
  }
  get isStarted(): boolean {
    return this.started !== null;
  }
  get isPaused(): boolean {
    return this.pausedAt !== null;
  }
  pause(): void {
    if (this.pausedAt === null && this.started !== null && this.endedAt === null) {
      this.pausedAt = performance.now();
    }
  }
  resume(): void {
    if (this.pausedAt !== null) {
      this.pausedTotal += performance.now() - this.pausedAt;
      this.pausedAt = null;
    }
  }
  elapsedMs(): number {
    if (this.started === null) return 0;
    const end = this.endedAt ?? this.pausedAt ?? performance.now();
    return end - this.started - this.pausedTotal;
  }
  /** Im Level-Modus bedeutungslos (keine Uhr) — `Infinity`, statt eine falsche
   *  Zahl runterzuzählen, gegen die niemand spielt. */
  remainingMs(): number {
    if (this.level) return Infinity;
    return Math.max(0, DURATION_MS + this.extraMs - this.elapsedMs());
  }
  get isOver(): boolean {
    if (!this.isStarted) return false;
    if (this.lives <= 0) return true;
    if (this.level) {
      // gewonnen, oder aus Scherben (Band + Ablage leer, kein Nachschub mehr) —
      // beides beendet den Lauf, ohne dass eine Uhr mitspielt
      if (this.won) return true;
      return this.shardsLeft <= 0 && this.belt.length === 0 && !this.hold;
    }
    return this.remainingMs() <= 0;
  }
  finish(): void {
    if (this.endedAt === null) this.endedAt = performance.now();
  }

  result(): CascadeResult {
    return {
      score: Math.round(this.score),
      cleared: this.cleared,
      covered: this.coveredCells(),
      perfectClears: this.perfectClears,
      livesLeft: this.lives,
      bestChain: this.bestChain,
      elapsedMs: Math.round(this.elapsedMs()),
      won: this.won,
    };
  }

  // ── Belt ─────────────────────────────────────────────────────────────────
  /** Advance the belt; drop shards that reach the bottom. */
  tick(dt: number): void {
    if (!this.isStarted || this.isOver || this.isPaused) return;
    const speed = dt / (this.travelMs() / 1000);
    for (const s of this.belt) s.y += speed;

    // passive ramp: spawns come a little faster the longer the run goes — nur
    // im Free Play, ein Level soll sein eigenes, vorhersagbares Tempo halten
    if (!this.level) this.spawnInterval = Math.max(MIN_SPAWN_MS, this.spawnInterval - dt * 13);

    const fell = this.belt.filter((s) => s.y >= 1);
    if (fell.length > 0) {
      this.belt = this.belt.filter((s) => s.y < 1);
      this.misses += fell.length;
      this.multiplier = 1;
      this.chain = 0;
      this.multTierSeen = 1;
      // the whole point now: every shard on the belt is meant to get used —
      // let one ride off unplaced and it costs a life, same as failing a move
      this.lives = Math.max(0, this.lives - fell.length);
      this.spawnInterval = Math.max(MIN_SPAWN_MS, this.spawnInterval * 0.97);
    }

    // gentle multiplier decay while idle
    this.multiplier = Math.max(1, this.multiplier - dt * 0.12);

    this.spawnTimer += dt * 1000;
    const topGap = this.belt.length === 0 ? 1 : Math.min(...this.belt.map((s) => s.y));
    if (
      this.spawnTimer >= this.spawnInterval &&
      this.belt.length < MAX_ON_BELT &&
      topGap >= MIN_GAP_Y &&
      this.shardsLeft > 0 // Level: kein Nachschub mehr, wenn das Budget aufgebraucht ist
    ) {
      this.spawnTimer = 0;
      this.belt.push(this.makeShard(0));
    }

    // objective: a short window to pull off a constrained clear for a life back
    // — nur im Free Play; ein Level hat schon sein eigenes Ziel, keine Zeit-Boni
    if (this.level) return;
    if (this.challenge) {
      if (this.elapsedMs() >= this.challenge.deadline) {
        this.challenge = null;
        this.nextChallengeAt = this.elapsedMs() + CHALLENGE_COOLDOWN_MIN + this.rng.next() * CHALLENGE_COOLDOWN_JITTER;
      }
    } else if (this.elapsedMs() >= this.nextChallengeAt && this.remainingMs() > CHALLENGE_WINDOW_MS + 5000) {
      const pick = CHALLENGE_KINDS[Math.floor(this.rng.next() * CHALLENGE_KINDS.length)]!;
      this.challenge = {
        kind: pick.kind,
        target: pick.target,
        progress: 0,
        deadline: this.elapsedMs() + CHALLENGE_WINDOW_MS,
        label: pick.label,
      };
    }
  }

  challengeRemainingMs(): number {
    return this.challenge ? Math.max(0, this.challenge.deadline - this.elapsedMs()) : 0;
  }
  /** True once, right after a challenge is won — consume it to trigger a celebration. */
  consumeChallengeWin(): boolean {
    const v = this.challengeWon;
    this.challengeWon = false;
    return v;
  }

  cells(shard: Shard): ReadonlyArray<readonly [number, number]> {
    const o = shardDef(shard.name).orientations;
    return o[shard.orientationIndex % o.length]!;
  }
  orientationCount(name: string): number {
    return shardDef(name).orientations.length;
  }
  colorIndex(name: string): number {
    return shardColorIndex(name);
  }

  rotate(shard: Shard): void {
    shard.orientationIndex = (shard.orientationIndex + 1) % this.orientationCount(shard.name);
  }

  /**
   * Move a belt shard into the hold slot. Any shard already held goes straight
   * back onto the belt at the top — unconditionally, no discard, no cap. You
   * can shelter exactly one shard at a time and no more; grabbing a second one
   * puts the first back in play where it can still ride off and cost a life.
   * (This closes the old stall: hold two, cycle them, never lose a life.)
   */
  toHold(shard: Shard): void {
    this.belt = this.belt.filter((s) => s.id !== shard.id);
    if (this.hold) {
      this.belt.unshift({ ...this.hold, y: 0.02 });
    }
    this.hold = shard;
  }
  takeHold(): Shard | null {
    const s = this.hold;
    this.hold = null;
    return s;
  }
  removeFromBelt(id: number): void {
    this.belt = this.belt.filter((s) => s.id !== id);
  }
  returnToBelt(shard: Shard): void {
    this.belt.push({ ...shard, y: 0 });
  }

  // ── Board ────────────────────────────────────────────────────────────────
  private idx(r: number, c: number): number {
    return r * this.cols + c;
  }
  filled(r: number, c: number): boolean {
    return r >= 0 && c >= 0 && r < this.rows && c < this.cols && this.board[this.idx(r, c)] !== 0;
  }
  canPlace(shard: Shard, pos: Pos): boolean {
    for (const [dr, dc] of this.cells(shard)) {
      const r = pos.row + dr;
      const c = pos.col + dc;
      if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return false;
      if (this.board[this.idx(r, c)] !== 0) return false;
    }
    return true;
  }

  /** Place a shard. Returns rows cleared, or -1 if it doesn't fit. */
  place(shard: Shard, pos: Pos): number {
    if (!this.canPlace(shard, pos)) return -1;
    const ci = this.colorIndex(shard.name);
    this.clearScoreBase = this.score;
    for (const [dr, dc] of this.cells(shard)) {
      this.board[this.idx(pos.row + dr, pos.col + dc)] = ci;
    }
    this.score += 5 * this.multiplier;
    this.multiplier = Math.min(6, this.multiplier + 0.25);

    const rows = this.clearFullRows();
    if (rows > 0) {
      this.cleared += rows;
      this.score += 12 * rows * rows * this.multiplier;
      this.multiplier = Math.min(6, this.multiplier + 0.4 * rows);
      this.freshClear = true;
      this.chain += 1;
      if (this.chain > this.bestChain) this.bestChain = this.chain;
    } else {
      this.chain = 0;
    }
    // eine neue Multiplikator-Stufe (2..6) zünden — einmalig, für Shake + Fanfare
    const tier = Math.floor(this.multiplier);
    if (tier > this.multTierSeen) {
      this.multTierSeen = tier;
      this.tierUp = tier;
    }
    // "combo"-Aufgabe: hängt an der Kette, nicht an einer einzelnen Reihe —
    // darum erst hier geprüft, nachdem this.chain aktuell ist
    if (this.challenge?.kind === "combo" && this.chain >= this.challenge.target) {
      this.creditChallenge(this.challenge.target);
    }
    if (this.coveredCells() === 0 && (rows > 0 || this.board.every((v) => v === 0))) {
      // perfect clear (only counts if we actually cleared something)
      if (rows > 0) {
        this.perfectClears += 1;
        this.score += 200 * this.multiplier;
        this.extraMs += 5000;
        this.perfectFlag = true;
      }
    }
    return rows;
  }

  /**
   * Clear every full row. Credits the active challenge (straight/mono/rows —
   * "combo" is checked separately in `place()`, after the chain updates).
   *
   * Im Level-Modus fallen geräumte Reihen nicht einfach leer aus — der ganze
   * Rest des Turms rutscht wie bei Tetris zusammen: alles, was noch über einer
   * geräumten Reihe stand, sackt nach unten, oben wird Platz frei. Das ist die
   * "Steine rutschen nach"-Bewegung der Rettungsszene. Im Free Play bleibt das
   * alte Verhalten (Reihe wird leer, nichts rutscht) — dort ist Tempo der Kern,
   * kein Turm, der abgetragen wird.
   */
  private clearFullRows(): number {
    this.lastCleared = [];
    const clearedSet = new Set<number>();
    for (let r = 0; r < this.rows; r++) {
      let full = true;
      let straightOnly = true;
      let monoOnly = true;
      let firstColor = -1;
      for (let c = 0; c < this.cols; c++) {
        const v = this.board[this.idx(r, c)];
        if (!v) {
          full = false;
          break;
        }
        if (!shardByColorIndex(v).straight) straightOnly = false;
        if (firstColor === -1) firstColor = v;
        else if (v !== firstColor) monoOnly = false;
      }
      if (full) {
        clearedSet.add(r);
        this.lastCleared.push(r);
        const kind = this.challenge?.kind;
        if (kind === "straight" && straightOnly) this.creditChallenge();
        else if (kind === "mono" && monoOnly) this.creditChallenge();
        else if (kind === "rows") this.creditChallenge();
      }
    }
    if (clearedSet.size === 0) return 0;

    if (this.level) {
      // Kollaps: alle nicht geräumten Reihen behalten ihre Reihenfolge, rücken
      // aber ganz nach unten zusammen — oben (Reihe 0) entsteht der Freiraum.
      const kept: number[] = [];
      for (let r = 0; r < this.rows; r++) if (!clearedSet.has(r)) kept.push(r);
      const next = new Int8Array(this.rows * this.cols);
      const topGap = this.rows - kept.length;
      for (let i = 0; i < kept.length; i++) {
        const srcRow = kept[i]!;
        const dstRow = topGap + i;
        for (let c = 0; c < this.cols; c++) next[dstRow * this.cols + c] = this.board[srcRow * this.cols + c]!;
      }
      this.board.set(next);
      this.collapsedRows = topGap; // für die View: so viele neue Leerzeilen oben
    } else {
      for (const r of clearedSet) for (let c = 0; c < this.cols; c++) this.board[this.idx(r, c)] = 0;
    }
    return this.lastCleared.length;
  }

  private creditChallenge(amount = 1): void {
    const ch = this.challenge;
    if (!ch) return;
    ch.progress = Math.min(ch.target, ch.progress + amount);
    if (ch.progress < ch.target) return;
    this.completeChallenge();
  }

  /** Belohnung für eine gelöste Aufgabe: ein Leben zurück (oder Punkte, wenn
   *  schon voll) und immer Extrazeit — so werden Runden länger, aber nur
   *  wenn man die Aufgaben tatsächlich löst. */
  private completeChallenge(): void {
    if (this.lives < CASCADE_LIVES) this.lives += 1;
    else this.score += 250 * this.multiplier;
    this.extraMs += CHALLENGE_TIME_BONUS_MS;
    this.challengeWon = true;
    this.challenge = null;
    this.nextChallengeAt =
      this.elapsedMs() + CHALLENGE_COOLDOWN_MIN + this.rng.next() * CHALLENGE_COOLDOWN_JITTER;
  }

  coveredCells(): number {
    let n = 0;
    for (const v of this.board) if (v !== 0) n += 1;
    return n;
  }
}
