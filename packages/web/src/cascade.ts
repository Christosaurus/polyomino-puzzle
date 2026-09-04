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
import { BOMB_DEF, pickShardName, shardColorIndex, shardDef } from "./shards.js";

export const CASCADE_ROWS = 8;
export const CASCADE_COLS = 6;
const DURATION_MS = 90_000;
const BASE_SPAWN_MS = 2200;
const MIN_SPAWN_MS = 950;
const BELT_TRAVEL_MS_START = 10_500; // time for a shard to ride top→bottom, at run start
const BELT_TRAVEL_MS_END = 6_200; // ...and by the end of the run — the belt speeds up
const MAX_ON_BELT = 3;
const MIN_GAP_Y = 0.36; // spacing between shards on the belt
/** Every Nth spawn is the "Blitzstein" — a rare, deliberate novelty, not raw RNG. */
const BOMB_EVERY = 7;

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
}

export class CascadeState {
  readonly rows = CASCADE_ROWS;
  readonly cols = CASCADE_COLS;
  /** 0 = empty, otherwise 1-based index into PIECE_NAMES for the colour. */
  readonly board = new Int8Array(CASCADE_ROWS * CASCADE_COLS);

  belt: Shard[] = [];
  hold: Shard | null = null;

  score = 0;
  multiplier = 1;
  cleared = 0;
  perfectClears = 0;
  misses = 0;
  /** Row indices cleared by the most recent `place()` — for the view's flash. */
  lastCleared: number[] = [];

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

  constructor(seed: string) {
    this.rng = rngFromSeed(seed);
    this.belt.push(this.makeShard(0.72), this.makeShard(0.38), this.makeShard(0.04));
  }

  private makeShard(y: number): Shard {
    this.spawnCount += 1;
    const isBomb = this.spawnCount % BOMB_EVERY === 0;
    const name = isBomb ? BOMB_DEF.name : pickShardName(this.rng, this.coveredCells() / (this.rows * this.cols));
    return { id: this.nextId++, name, orientationIndex: 0, y };
  }

  /** Belt speed ramps up over the run — a run gets visibly faster near the end. */
  private travelMs(): number {
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
  remainingMs(): number {
    return Math.max(0, DURATION_MS + this.extraMs - this.elapsedMs());
  }
  get isOver(): boolean {
    return this.isStarted && this.remainingMs() <= 0;
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
    };
  }

  // ── Belt ─────────────────────────────────────────────────────────────────
  /** Advance the belt; drop shards that reach the bottom. */
  tick(dt: number): void {
    if (!this.isStarted || this.isOver || this.isPaused) return;
    const speed = dt / (this.travelMs() / 1000);
    for (const s of this.belt) s.y += speed;

    // passive ramp: spawns come a little faster the longer the run goes
    this.spawnInterval = Math.max(MIN_SPAWN_MS, this.spawnInterval - dt * 13);

    const fell = this.belt.filter((s) => s.y >= 1);
    if (fell.length > 0) {
      this.belt = this.belt.filter((s) => s.y < 1);
      this.misses += fell.length;
      this.multiplier = 1;
      this.spawnInterval = Math.max(MIN_SPAWN_MS, this.spawnInterval * 0.97);
    }

    // gentle multiplier decay while idle
    this.multiplier = Math.max(1, this.multiplier - dt * 0.12);

    this.spawnTimer += dt * 1000;
    const topGap = this.belt.length === 0 ? 1 : Math.min(...this.belt.map((s) => s.y));
    if (
      this.spawnTimer >= this.spawnInterval &&
      this.belt.length < MAX_ON_BELT &&
      topGap >= MIN_GAP_Y
    ) {
      this.spawnTimer = 0;
      this.belt.push(this.makeShard(0));
    }
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
  isBomb(name: string): boolean {
    return shardDef(name).special === "bomb";
  }

  rotate(shard: Shard): void {
    shard.orientationIndex = (shard.orientationIndex + 1) % this.orientationCount(shard.name);
  }

  /** Move a belt shard into the hold slot, bumping any held shard back to the belt. */
  toHold(shard: Shard): void {
    this.belt = this.belt.filter((s) => s.id !== shard.id);
    if (this.hold) {
      if (this.belt.length < MAX_ON_BELT) {
        this.belt.unshift({ ...this.hold, y: 0 });
      } else {
        // no room to put the old one back — lose it
        this.misses += 1;
        this.multiplier = 1;
      }
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
    const def = shardDef(shard.name);
    const ci = this.colorIndex(shard.name);
    const touchedRows = new Set<number>();
    for (const [dr, dc] of this.cells(shard)) {
      const r = pos.row + dr;
      this.board[this.idx(r, pos.col + dc)] = ci;
      touchedRows.add(r);
    }
    this.score += 5 * this.multiplier;
    this.multiplier = Math.min(6, this.multiplier + 0.25);

    let rows: number;
    if (def.special === "bomb") {
      // the Blitzstein ignites its own row outright, full or not
      rows = this.forceClearRows([...touchedRows]);
      this.score += 40 * this.multiplier;
      this.extraMs += 3000;
    } else {
      rows = this.clearFullRows();
    }
    if (rows > 0) {
      this.cleared += rows;
      this.score += 12 * rows * rows * this.multiplier;
      this.multiplier = Math.min(6, this.multiplier + 0.4 * rows);
    }
    if (this.coveredCells() === 0 && (rows > 0 || this.board.every((v) => v === 0))) {
      // perfect clear (only counts if we actually cleared something)
      if (rows > 0) {
        this.perfectClears += 1;
        this.score += 200 * this.multiplier;
        this.extraMs += 5000;
      }
    }
    return rows;
  }

  private clearFullRows(): number {
    this.lastCleared = [];
    for (let r = 0; r < this.rows; r++) {
      let full = true;
      for (let c = 0; c < this.cols; c++) {
        if (this.board[this.idx(r, c)] === 0) {
          full = false;
          break;
        }
      }
      if (full) {
        for (let c = 0; c < this.cols; c++) this.board[this.idx(r, c)] = 0;
        this.lastCleared.push(r);
      }
    }
    return this.lastCleared.length;
  }

  /** Clear the given rows outright, regardless of whether they're full. */
  private forceClearRows(rows: number[]): number {
    this.lastCleared = [];
    for (const r of rows) {
      for (let c = 0; c < this.cols; c++) this.board[this.idx(r, c)] = 0;
      this.lastCleared.push(r);
    }
    return this.lastCleared.length;
  }

  coveredCells(): number {
    let n = 0;
    for (const v of this.board) if (v !== 0) n += 1;
    return n;
  }
}
