/**
 * Kaskade view: a large board on the left, a wide conveyor belt on the right.
 * Drag shards off the belt (or the hold slot) onto the board with one finger.
 */

import { cssVar, shade } from "./colors.js";
import { CascadeState, type Pos, type Shard } from "./cascade.js";
import { boardGrid, drawPieceBody, roundRect } from "./render.js";
import { sfx } from "./sfx.js";
import { shardByColorIndex, shardDef } from "./shards.js";
import { nf } from "./format.js";

const TAP_MOVE_PX = 10;
/** Eine gezogene Figur schwebt so viele Zellhöhen über dem echten Touchpoint —
 *  sonst sitzt der Daumen genau auf der Figur und man erkennt sie nicht. */
// Wie weit die gezogene Figur über dem tatsächlichen Berührungspunkt
// schwebt — gilt für die frei schwebende Vorschau UND (über `snappedFor`)
// für das an den Rastern einschnappende Ziel selbst, damit der Daumen nicht
// genau die Zielzellen verdeckt und man den Rest des Spielfelds im Blick
// behält.
export const DRAG_LIFT_CELLS = 1.6;
/** "+N"-Pops und die große Kette/Tier-Einblendung bleiben spürbar länger stehen,
 *  bevor sie wegfallen/-faden — sonst wirkt der Erfolg zu flüchtig. */
const POP_LIFE_S = 1.8;
const COMBO_LIFE_S = 1.9;
/** Zeit, die der diagonale Schein bei einem perfekten Brett braucht, um von
 *  links oben nach rechts unten zu laufen. */
const PERFECT_SHINE_S = 0.9;
/** Wie lange das große Herz bei einem erspielten Leben zu sehen ist. */
const HEART_BURST_S = 1.15;
/** Kurzer greller Blitz überm Panel im Aufprall-Moment der Schockwelle. */
const SHOCKWAVE_S = 0.32;
/** Wie lange der Schockwellen-Ring braucht, um von der Brettmitte bis weit
 *  über den Bildschirmrand hinaus zu expandieren (Vollbild-Ebene, siehe
 *  `fxRingT`) — deutlich länger als der Blitz, damit er wirklich als eigene,
 *  fortlaufende Welle wirkt statt nur als Aufblitzen. */
const FX_RING_S = 0.95;
/** Wie lange ein einzelner Splitter unterwegs ist, bevor er verglüht. */
const FX_CHUNK_S_MIN = 0.75;
const FX_CHUNK_S_MAX = 1.35;
/** Wie lange das lila Panel nach einer Schockwelle nachleuchtet. */
const ULTIMATE_GLOW_S = 10;

interface Layout {
  cssW: number;
  cssH: number;
  boardX: number;
  boardY: number;
  cell: number;
  beltX: number;
  beltW: number;
  beltTop: number;
  beltH: number;
  /** Gemeinsame Zeile oben im Panel: links die Challenge-Karte (DOM), rechts
   *  Hold — beide gleich hoch. */
  topRowH: number;
  holdY: number;
  holdW: number;
  holdH: number;
  bandH: number;
  shardCell: number;
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  max: number;
  color: string;
  size: number;
  rot: number;
  spin: number;
}
interface Drag {
  shard: Shard;
  from: "belt" | "hold";
  px: number;
  py: number;
  sx: number;
  sy: number;
  moved: boolean;
  /** Anhebung der Figur über dem Finger in Zellen -- pro Figur, damit auch
   *  hohe Figuren fast komplett ÜBER dem Finger schweben (Brett bleibt sichtbar). */
  lift: number;
  grabR: number;
  grabC: number;
}

export interface CascadeCallbacks {
  onEnd: (result: ReturnType<CascadeState["result"]>) => void;
  onHud: (s: {
    score: number;
    mult: number;
    cleared: number;
    ms: number;
    lives: number;
    chain: number;
    /** `Infinity` im Free Play — nur im Level-Modus ein echtes Budget. */
    shardsLeft: number;
    /** Brett ist eng geworden (>= DANGER_FRAC belegt) — steuert den Warn-
     *  Zustand im HUD (Klärfunke-Hervorhebung), siehe `.board-wrap.danger`. */
    crowded: boolean;
    /** True, solange das Weiterspielen-Angebot auf eine Entscheidung wartet
     *  (Abschnitt 4c) — steuert den Kauf-Dialog in app.ts. */
    awaitingContinue: boolean;
    /** Preis für die nächste Weiterspielen-Nutzung, `null` erst relevant
     *  wenn `awaitingContinue` true ist. */
    continuePrice: number | null;
  }) => void;
}

/** Ab dieser Belegung gilt das Brett als "eng" — sichtbarer Gefahr-Zustand
 *  im HUD (Abschnitt 3, `art-refs/KONZEPT-kaskade-oekonomie.md`). Intern
 *  steuert `pickShardName` schon vorher gleitend gegen (mehr kleine Teile,
 *  je voller), das hier ist nur die feste Schwelle für die sichtbare Warnung. */
const DANGER_FRAC = 0.78;
/** Band-Position (0 = oben, 1 = fällt runter), ab der das Bandende zu glühen
 *  beginnt, und ab der es einmal pro Scherbe tickt. Eine Rettung ab
 *  `BELT_SAVE_Y` gilt als knapp ("PHEW!"). */
const BELT_DANGER_Y = 0.7;
const BELT_WARN_Y = 0.82;
const BELT_SAVE_Y = 0.82;
/** Roter Schlag-Blitz an den Rändern, wenn ein Leben vom Band fällt. */
const LIFE_FLASH_S = 0.45;
/** Dauer des kurzen Zoom-Punchs beim Räumen. */
const PUNCH_S = 0.28;
/** Laufzeit des Lichtkopfs durch eine geräumte Reihe/Spalte (Sek.) -- die
 *  Zellen poppen genau dann, wenn er sie erreicht. */
const CLEAR_SWEEP_S = 0.225;
/** Dauer des Pop-Ausbruchs einer einzelnen geräumten Zelle. */
const GHOST_S = 0.28;
/** Räum-Animation: wechselt zufällig (nie zweimal derselbe Stil hintereinander). */
type ClearStyle = "sweepR" | "sweepL" | "burst" | "bar";
/** Tempo der Räum-Animation in Abhängigkeit von der Kette: ein einzelner Clear
 *  läuft im Normaltempo (1), jede direkt folgende Kette macht alles schneller
 *  (Wisch, Zellen-Pop, Splitter, Punch) -- bis höchstens 2,4-fach. Nach einem
 *  Zug ohne Clear fällt die Kette auf 0 und damit das Tempo zurück. */
const chainSpeed = (chain: number): number => (chain >= 2 ? Math.min(2.4, 1 + 0.3 * (chain - 1)) : 1);

export class CascadeView {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private wrap: HTMLElement;
  private game: CascadeState;
  private cb: CascadeCallbacks;

  private layout: Layout | null = null;
  /** `computeLayout` erzwingt einen Reflow (DOM-Reads). Nur neu rechnen, wenn
   *  sich Viewport oder Challenge-Band ändern — nicht pro Frame. */
  private layoutDirty = true;
  /** Sobald die Spielfläche einmal vermessen ist, steht sie fest — auch wenn
   *  z. B. die mobile Adressleiste beim Ziehen ein-/ausblendet und dadurch
   *  `visualViewport` kurz eine andere Höhe meldet. Das Brett darf sich
   *  während eines Laufs nie mehr sichtbar verschieben oder umgrößern. */
  private layoutLocked = false;
  /** Letzte plausible Messung — erst wenn zwei Frames in Folge dieselbe Breite/
   *  Position liefern, gilt das Layout als wirklich gesetzt und wird gesperrt.
   *  Auf manchen Geräten (beobachtet auf echtem iOS, nicht im Desktop-Test)
   *  liefert der erste "plausible" Messwert noch nicht die endgültige Breite —
   *  ohne diese zweite Prüfung fror `layoutLocked` dann dauerhaft ein zu
   *  schmales Brett ein, mit sichtbarer Lücke zum Gürtel. */
  private lastMeasuredW: number | null = null;
  private lastMeasuredTop: number | null = null;
  private drag: Drag | null = null;
  /** Dreh-Tutorial (nur vor der allerersten je gespielten Runde, siehe
   *  `beginRotateTutorial`): solange gesetzt, reagiert im Band nur diese eine
   *  Scherbe, jede Berührung dreht sie statt sie zu platzieren, und
   *  `game.start()` bleibt aus -- die Runde steht bewusst still. */
  private tutorialShardId: number | null = null;
  private onTutorialTap: (() => void) | null = null;
  /** Tutorial-Schritt 2 ("Reihe füllen"): Zielposition der Scherbe in der
   *  vorbereiteten Lücke. Gesetzt = Schritt 2 aktiv. */
  private tutorialGap: Pos | null = null;
  private tutorialGapBox: { row: number; col: number; h: number; w: number } | null = null;
  private onTutorialPlaced: (() => void) | null = null;
  private running = false;
  private raf = 0;
  private last = 0;
  private flash: { row: number; t: number; style: ClearStyle; speed: number }[] = [];
  private flashCols: { col: number; t: number; style: ClearStyle; speed: number }[] = [];
  /** Geräumte Zellen, die noch kurz stehen bleiben und nacheinander poppen. */
  private ghosts: Array<{
    row: number;
    col: number;
    colorIndex: number;
    delay: number;
    t: number;
    popped: boolean;
    /** Reihenfolge-Index für den aufsteigenden Ton (nur erste Linie), sonst -1. */
    tick: number;
    /** Tempo-Faktor dieses Clears (Kette). */
    speed: number;
    /** Kette des Clears -- hebt die Tonhöhe der Pop-Töne. */
    chain: number;
  }> = [];
  private punchSpeed = 1;
  private lastClearStyle: ClearStyle | null = null;
  private sparks: Spark[] = [];
  /** short-lived "+N" score pops */
  private pops: { x: number; y: number; t: number; text: string; color: string; s?: number }[] = [];
  /** Zoom-Punch des Panels beim Räumen (0..LIFE) und seine Stärke. */
  private punchScale = 1;
  private punchT = -1;
  private punchMag = 0;
  private placePop: { r: number; c: number; t: number } | null = null;
  /** Scherben, für die der Vorwarn-Tick schon lief (je Scherbe nur einmal). */
  private warned = new Set<number>();
  private lastLives = -1;
  private lifeFlashT = -1;
  /** Winziges Staubwölkchen beim Platzieren — billig: ein paar Kreise, kein Glow. */
  private dust: Array<{ x: number; y: number; vx: number; vy: number; t: number; max: number; r: number }> = [];
  private ended = false;
  private nowMs = 0;
  /** Nur Level-Modus: wie viele Reihen der Schutt gerade sichtbar bedeckt —
   *  gleitet sanft auf `game.shrunkRows` zu, statt in einem Ruck zu springen,
   *  damit man das Feld wirklich schrumpfen *sieht*. */
  private rubbleDisplay = 0;
  /** Höchste bereits "gelandete" Schutt-Reihe — für den kurzen Setz-Hüpfer,
   *  wenn eine neue Reihe Steine ankommt. */
  private rubbleSettledRows = 0;
  private rubbleBounceT = 999;
  /** Kamera-Wackler bei fetten Momenten (Mehrfach-Clear, Tier-Sprung, perfektes Brett). */
  private shakeT = 0;
  private shakeMag = 0;
  /** Große Einblendung übers Brett — Kette oder neue Multiplikator-Stufe.
   *  `fontScale` skaliert die Schriftgröße relativ zur Zellgröße — kürzere
   *  Rufe (KETTE ×3, PERFEKT!) dürfen groß sein, längere Sätze brauchen eine
   *  kleinere Schrift, sonst laufen sie übers Brett. `noOutline` lässt den
   *  dunklen Rand weg (nur die reine Farbe). `growOnFade` wächst durchgehend
   *  bis zum Verschwinden statt nur kurz zu "atmen" — das klassische
   *  Reward-Popup-Wachstum. */
  private comboPop: {
    text: string;
    t: number;
    color: string;
    fontScale?: number;
    noOutline?: boolean;
    growOnFade?: boolean;
  } | null = null;
  /** Kurzer goldener Blitz übers ganze Brett bei einer neuen Multiplikator-Stufe. */
  private tierFlashT = -1;
  /** Perfektes Brett: läuft einmal 0→1, steuert den diagonalen Schein von
   *  links oben nach rechts unten (-1 = inaktiv). */
  private perfectShineT = -1;
  /** Erspieltes Herz durch eine Aufgabe: großes, halbtransparentes Herz
   *  wächst einmal auf und verschwindet wieder (-1 = inaktiv). */
  private heartBurstT = -1;
  /** Schockwelle (Christians "Bombe"): kurzer, greller Blitz überm Panel im
   *  Aufprall-Moment (läuft einmal 0→1, -1 = inaktiv) — der eigentliche Ring
   *  + die Splitter laufen auf der Vollbild-Ebene `fx*` weiter unten, die NICHT
   *  vom `overflow:hidden` des Panels begrenzt ist. */
  private shockwaveT = -1;
  /** Vollbild-Ebene für die Schockwelle: eigene Canvas außerhalb des lila
   *  Panels (siehe #k-shockwave-fx in index.html), damit Ring + Splitter
   *  sichtbar aus dem Spielfeld heraus über den ganzen Screen fliegen können. */
  private fxCanvas: HTMLCanvasElement | null = null;
  private fxCtx: CanvasRenderingContext2D | null = null;
  private fxChunks: Spark[] = [];
  private fxRingT = -1;
  private fxOriginX = 0;
  private fxOriginY = 0;
  private fxMaxR = 0;
  /** Ob im letzten Frame etwas auf der FX-Ebene stand — für den einen sauberen
   *  Clear-Frame, nachdem Ring+Splitter fertig sind (danach wieder Ruhe/kein
   *  Resize-Overhead mehr, bis das nächste Mal etwas los ist). */
  private fxWasActive = false;
  /** Nachleuchten des lila Panels nach einer Schockwelle (-1 = inaktiv, zählt
   *  0→ULTIMATE_GLOW_S, steuert nur die CSS-Klasse `ultimate-glow` auf `wrap`). */
  private ultimateGlowT = -1;
  /** alle Brettzellen als [r,c] — für das gecachte Leer-Raster (einmal gebaut) */
  private readonly gridCells: ReadonlyArray<readonly [number, number]>;

  constructor(canvas: HTMLCanvasElement, wrap: HTMLElement, game: CascadeState, cb: CascadeCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.wrap = wrap;
    this.game = game;
    this.cb = cb;
    this.fxCanvas = document.getElementById("k-shockwave-fx") as HTMLCanvasElement | null;
    this.fxCtx = this.fxCanvas?.getContext("2d") ?? null;
    const cells: [number, number][] = [];
    for (let r = 0; r < game.rows; r++) for (let c = 0; c < game.cols; c++) cells.push([r, c]);
    this.gridCells = cells;
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    window.addEventListener("resize", this.kick);
    window.visualViewport?.addEventListener("resize", this.kick);
    this.start();
  }

  /** Band-Rechteck in CSS-Pixeln relativ zur Canvas-Ecke -- für den
   *  Rotations-Hinweis, der eine DOM-Aussparung exakt übers Band legt.
   *  `null`, solange noch kein Frame gelayoutet wurde. */
  get beltRect(): { x: number; y: number; w: number; h: number } | null {
    const L = this.layout;
    if (!L) return null;
    return { x: L.beltX, y: L.beltTop, w: L.beltW, h: L.beltH };
  }

  /** Startet das Dreh-Tutorial: nur die oberste Band-Scherbe reagiert noch auf
   *  Eingaben, jede Berührung dreht sie (nie platzieren), `game.start()`
   *  bleibt aus. `onTap` feuert bei jeder erfolgreichen Drehung -- app.ts
   *  zählt mit und beendet das Tutorial (via `endRotateTutorial()` +
   *  explizitem `game.start()`) nach ein paar Wiederholungen. */
  beginRotateTutorial(onTap: () => void): void {
    const topmost = [...this.game.belt].sort((a, b) => a.y - b.y)[0] ?? null;
    this.tutorialShardId = topmost ? topmost.id : null;
    this.onTutorialTap = onTap;
  }
  endRotateTutorial(): void {
    this.tutorialShardId = null;
    this.onTutorialTap = null;
    this.tutorialGap = null;
    this.tutorialGapBox = null;
    this.onTutorialPlaced = null;
  }
  /** Tutorial-Schritt 2: bereitet unten eine Lücke vor, in die genau die
   *  Tutorial-Scherbe passt -- alle anderen Zellen der betroffenen Reihen sind
   *  gefüllt, ein Treffer räumt sie also. Nimmt dafür die Ausrichtung mit der
   *  kleinsten Höhe. Gibt `false` zurück, wenn das nicht möglich ist. Nur im
   *  Free Play (im Level-Modus schrumpft das Brett). */
  beginPlaceTutorial(onPlaced: () => void): boolean {
    const g = this.game;
    const shard = g.belt.find((s) => s.id === this.tutorialShardId);
    if (!shard || g.level) return false;
    const dims = (): { h: number; w: number; minR: number; minC: number } => {
      const cs = g.cells(shard);
      const rs = cs.map((c) => c[0]);
      const cc = cs.map((c) => c[1]);
      const minR = Math.min(...rs);
      const minC = Math.min(...cc);
      return { h: Math.max(...rs) - minR + 1, w: Math.max(...cc) - minC + 1, minR, minC };
    };
    let best = shard.orientationIndex;
    let bh = 99;
    let bw = 99;
    for (let o = 0; o < g.orientationCount(shard.name); o++) {
      shard.orientationIndex = o;
      const d = dims();
      if (d.h < bh || (d.h === bh && d.w < bw)) {
        bh = d.h;
        bw = d.w;
        best = o;
      }
    }
    shard.orientationIndex = best;
    const d = dims();
    if (d.h > g.rows || d.w > g.cols) return false;
    const row0 = g.rows - d.h;
    const col0 = Math.floor((g.cols - d.w) / 2);
    // untere Reihen komplett füllen (bunt, aus den Farben der Bandscherben) …
    const colors = g.belt.map((s) => g.colorIndex(s.name));
    for (let r = row0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) g.board[r * g.cols + c] = colors[(r + c) % colors.length]!;
    }
    // Zwei Steine direkt über den gefüllten Reihen stehen lassen: nach dem Räumen
    // ist das Brett dann nicht leer -- sonst zählte das Tutorial als "Perfect
    // Clear" (Bonus-Splitter + Erfolg für jeden Neuspieler).
    if (row0 > 0) {
      g.board[(row0 - 1) * g.cols] = colors[0]!;
      g.board[(row0 - 1) * g.cols + (g.cols - 1)] = colors[colors.length - 1]!;
    }
    // … und genau die Form der Scherbe wieder freiräumen
    for (const [dr, dc] of g.cells(shard)) g.board[(row0 + dr - d.minR) * g.cols + (col0 + dc - d.minC)] = 0;
    this.tutorialGap = { row: row0 - d.minR, col: col0 - d.minC };
    this.tutorialGapBox = { row: row0, col: col0, h: d.h, w: d.w };
    this.onTutorialPlaced = onPlaced;
    return true;
  }
  /** Rechteck der Lücke (Canvas-relative CSS-Pixel) + Zellgröße. */
  get tutorialGapRect(): { x: number; y: number; w: number; h: number; cell: number } | null {
    const L = this.layout;
    const b = this.tutorialGapBox;
    if (!L || !b) return null;
    return { x: L.boardX + b.col * L.cell, y: L.boardY + b.row * L.cell, w: b.w * L.cell, h: b.h * L.cell, cell: L.cell };
  }
  /** Bildschirmposition (Canvas-relative CSS-Pixel) + sinnvoller Spotlight-
   *  Radius für die Tutorial-Scherbe. `null` ohne aktives Tutorial oder
   *  solange kein Layout steht. */
  get tutorialShardPoint(): { x: number; y: number; r: number } | null {
    const L = this.layout;
    if (this.tutorialShardId === null || !L) return null;
    const row = this.beltRows(L).find((row) => row.shard.id === this.tutorialShardId);
    if (!row) return null;
    return { x: L.beltX + L.beltW / 2, y: row.cy, r: Math.max(50, Math.min(L.bandH, L.beltW) * 0.62) };
  }

  destroy(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointercancel", this.onUp);
    window.removeEventListener("resize", this.kick);
    window.visualViewport?.removeEventListener("resize", this.kick);
    // Vollbild-FX-Ebene ist global (liegt außerhalb dieses Screens) — beim
    // Verlassen sofort leeren, sonst blitzt ein mitten in der Animation
    // abgebrochener Rest über dem nächsten Screen auf.
    this.fxChunks = [];
    this.fxRingT = -1;
    this.fxCtx?.clearRect(0, 0, this.fxCanvas?.width ?? 0, this.fxCanvas?.height ?? 0);
    this.ultimateGlowT = -1;
    this.wrap.classList.remove("ultimate-glow");
  }

  private start(): void {
    this.running = true;
    this.last = performance.now();
    const loop = (ts: number): void => {
      if (!this.running) return;
      const dt = Math.min(0.05, (ts - this.last) / 1000);
      this.last = ts;
      this.step(dt);
      this.render();
      this.renderFx();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    let fbTs = performance.now();
    const fb = (): void => {
      if (!this.running) return;
      const now = performance.now();
      if (now - this.last > 240) {
        this.step(Math.min(0.05, (now - fbTs) / 1000));
        this.render();
        this.renderFx();
      }
      fbTs = now;
      window.setTimeout(fb, 140);
    };
    window.setTimeout(fb, 140);
  }

  private kick = (): void => {
    if (this.layoutLocked) {
      // Gesperrt heißt "kein Zittern der Adressleiste soll neu layouten" --
      // ein ECHTER Resize danach (Rotation, Split-Screen, Browser-Zoom) darf
      // die Zellgröße aber nicht für den Rest des Laufs falsch stehen lassen,
      // sonst rechnen boardCell()/pt() dauerhaft mit einer Breite, die der
      // Canvas gar nicht mehr hat -- Spalten verschieben sich, eine wird
      // unerreichbar. Nur bei einer wirklich deutlichen Breitenänderung (nicht
      // dem üblichen 1-2px-Zittern) wieder entsperren und neu vermessen.
      const w = this.wrap.clientWidth;
      if (this.lastMeasuredW === null || Math.abs(this.lastMeasuredW - w) < 24) return;
      this.layoutLocked = false;
    }
    this.layoutDirty = true;
    this.render();
  };

  private step(dt: number): void {
    this.nowMs = performance.now();
    this.game.tick(dt);

    // Vorwarnung: sobald eine Scherbe zum ersten Mal kurz vorm Bandende ist,
    // ein leiser Doppel-Tick (+ kurzer Haptik-Impuls) -- je Scherbe einmal.
    if (this.game.isStarted && !this.game.isOver) {
      for (const s of this.game.belt) {
        if (s.y >= BELT_WARN_Y && !this.warned.has(s.id)) {
          this.warned.add(s.id);
          sfx.warn();
          sfx.vibrate(12);
        }
      }
      if (this.warned.size > 24) {
        const live = new Set(this.game.belt.map((s) => s.id));
        for (const id of this.warned) if (!live.has(id)) this.warned.delete(id);
      }
    }
    // Leben verloren (Scherbe vom Band gefallen): Schlag, Wackler, roter Blitz.
    const livesNow = this.game.lives;
    if (this.lastLives >= 0 && livesNow < this.lastLives) {
      this.shake(10);
      this.lifeFlashT = 0;
      sfx.lifeLost();
      sfx.vibrate(35);
    }
    this.lastLives = livesNow;
    if (this.lifeFlashT >= 0 && (this.lifeFlashT += dt) > LIFE_FLASH_S) this.lifeFlashT = -1;

    // Schutt sanft auf den echten Stand nachziehen — das Feld schrumpft dann
    // sichtbar über ~0,4s, statt in einem Frame zu springen.
    if (this.rubbleDisplay !== this.game.shrunkRows) {
      const d = this.game.shrunkRows - this.rubbleDisplay;
      const step = d * Math.min(1, dt * 5);
      this.rubbleDisplay += Math.abs(step) > 0.002 ? step : d;
    }
    const settled = Math.floor(this.rubbleDisplay + 0.001);
    if (settled > this.rubbleSettledRows) {
      this.rubbleSettledRows = settled;
      this.rubbleBounceT = 0; // neue Reihe Steine ist gerade angekommen — kurzer Hüpfer
    }
    this.rubbleBounceT += dt;
    if (this.shakeMag > 0) {
      this.shakeT += dt;
      // schneller Ruck statt Dauerwackeln: von voller Stärke in ~0,3s wieder ruhig
      this.shakeMag = Math.max(0, this.shakeMag - dt * 24);
    }
    // Wackler bewegt das ganze lila Feld (Panel + Canvas als Einheit), nicht
    // nur den Zeicheninhalt — sonst wandert das Brett relativ zum Rahmen.
    this.wrap.style.transform =
      this.shakeMag > 0.05
        ? `translate(${(Math.random() - 0.5) * 2 * this.shakeMag}px, ${(Math.random() - 0.5) * 2 * this.shakeMag}px)`
        : "";
    // Zoom-Punch beim Räumen: wird im Canvas selbst gezeichnet (siehe render),
    // NICHT per CSS-Transform am Panel -- das machte die Seite kurz breiter als
    // den Bildschirm (horizontaler Scrollbalken) und verschob die Trefferkoordinaten.
    this.punchScale = 1;
    if (this.punchT >= 0) {
      this.punchT += dt * this.punchSpeed;
      const k = this.punchT / PUNCH_S;
      if (k >= 1) {
        this.punchT = -1;
      } else {
        // schneller Ausschlag, weiches Zurückfedern
        this.punchScale = 1 + this.punchMag * Math.sin(k * Math.PI) * (1 - k);
      }
    }
    if (this.comboPop && (this.comboPop.t += dt) > COMBO_LIFE_S) this.comboPop = null;
    if (this.tierFlashT >= 0) {
      this.tierFlashT += dt;
      if (this.tierFlashT > 0.5) this.tierFlashT = -1;
    }
    if (this.perfectShineT >= 0) {
      this.perfectShineT += dt;
      // etwas länger laufen lassen als die reine Lauf-Dauer, damit die letzte
      // Zelle (rechts unten) auch noch sauber ausfadet, statt abzuschneiden
      if (this.perfectShineT > PERFECT_SHINE_S * 1.3) this.perfectShineT = -1;
    }
    if (this.heartBurstT >= 0) {
      this.heartBurstT += dt;
      if (this.heartBurstT > HEART_BURST_S) this.heartBurstT = -1;
    }
    if (this.shockwaveT >= 0) {
      this.shockwaveT += dt;
      if (this.shockwaveT > SHOCKWAVE_S) this.shockwaveT = -1;
    }
    if (this.fxRingT >= 0) {
      this.fxRingT += dt;
      if (this.fxRingT > FX_RING_S) this.fxRingT = -1;
    }
    if (this.fxChunks.length) {
      for (const s of this.fxChunks) {
        s.t += dt;
        if (s.t < 0) continue; // wartet noch auf seine Zelle (Räum-Verzögerung)
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += 340 * dt; // etwas mehr Schwerkraft als die Board-Funken — fallen sichtbar
        s.vx *= 1 - dt * 0.6; // wenig Reibung — sie sollen weit rausfliegen, nicht gleich abbremsen
        s.rot += s.spin * dt;
      }
      this.fxChunks = this.fxChunks.filter((s) => s.t < s.max);
    }
    if (this.ultimateGlowT >= 0) {
      this.ultimateGlowT += dt;
      if (this.ultimateGlowT > ULTIMATE_GLOW_S) {
        this.ultimateGlowT = -1;
        this.wrap.classList.remove("ultimate-glow");
      }
    }
    this.flash = this.flash.filter((f) => (f.t += dt * f.speed) < 0.5);
    this.flashCols = this.flashCols.filter((f) => (f.t += dt * f.speed) < 0.5);
    for (const s of this.sparks) {
      s.t += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 260 * dt; // gentle gravity
      s.vx *= 1 - dt * 1.5;
      s.rot += s.spin * dt;
    }
    this.sparks = this.sparks.filter((s) => s.t < s.max);
    if (this.ghosts.length && this.layout) {
      const L = this.layout;
      const gold = cssVar("--gold");
      for (const g of this.ghosts) {
        g.t += dt * g.speed;
        if (!g.popped && g.t >= g.delay) {
          g.popped = true;
          const x = L.boardX + (g.col + 0.5) * L.cell;
          const y = L.boardY + (g.row + 0.5) * L.cell;
          for (let i = 0; i < 2; i++) {
            const ang = Math.random() * Math.PI * 2;
            const sp = 60 + Math.random() * 140;
            this.sparks.push({
              x,
              y,
              vx: Math.cos(ang) * sp,
              vy: Math.sin(ang) * sp - 60,
              t: 0,
              max: 0.35 + Math.random() * 0.3,
              color: i === 0 ? "#ffffff" : gold,
              size: 2.5 + Math.random() * 3.5,
              rot: Math.random() * Math.PI,
              spin: (Math.random() - 0.5) * 14,
            });
          }
          if (g.tick >= 0) sfx.cellPop(g.tick + Math.max(0, g.chain - 1) * 2);
        }
      }
      this.ghosts = this.ghosts.filter((g) => g.t < g.delay + GHOST_S);
    }
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < POP_LIFE_S);
    if (this.placePop && (this.placePop.t += dt) > 0.28) this.placePop = null;
    for (const d of this.dust) {
      d.t += dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vx *= 1 - dt * 2.2;
      d.vy *= 1 - dt * 2.2;
    }
    this.dust = this.dust.filter((d) => d.t < d.max);

    const clear = this.game.consumeFreshClear();
    if (clear && this.layout) {
      const L = this.layout;
      const style = this.pickClearStyle();
      const speed = chainSpeed(clear.chain);
      this.punchSpeed = speed;
      for (const r of clear.rows) this.flash.push({ row: r, t: 0, style, speed });
      for (const c of clear.cols) this.flashCols.push({ col: c, t: 0, style, speed });
      // Position der Zelle entlang ihrer Linie (0..1) -> Verzögerung, mit der
      // sie poppt, sobald der Lichtkopf sie erreicht.
      const rowSet = new Set(clear.rows);
      const fracOf = (row: number, col: number): number =>
        rowSet.has(row)
          ? this.game.cols > 1 ? col / (this.game.cols - 1) : 0.5
          : this.game.rows > 1 ? row / (this.game.rows - 1) : 0.5;
      const delayOf = (row: number, col: number): number => {
        const f = fracOf(row, col);
        if (style === "sweepR") return f * CLEAR_SWEEP_S;
        if (style === "sweepL") return (1 - f) * CLEAR_SWEEP_S;
        if (style === "burst") return Math.abs(f - 0.5) * 2 * CLEAR_SWEEP_S;
        return 0;
      };
      // Aufsteigender Ton nur für die erste Linie (sonst Kakophonie bei Mehrfach-Clears)
      const firstIsRow = clear.rows.length > 0;
      const firstLine = firstIsRow ? clear.rows[0]! : clear.cols[0]!;
      const order = clear.cells
        .filter((c) => (firstIsRow ? c.row === firstLine : c.col === firstLine))
        .sort((a, b) => delayOf(a.row, a.col) - delayOf(b.row, b.col));
      for (const cell of clear.cells) {
        this.ghosts.push({
          row: cell.row,
          col: cell.col,
          colorIndex: cell.colorIndex,
          delay: delayOf(cell.row, cell.col),
          t: 0,
          popped: false,
          tick: order.findIndex((o) => o.row === cell.row && o.col === cell.col),
          speed,
          chain: clear.chain,
        });
      }
      this.spawnLineClearChunks(clear.cells, L, delayOf, speed);
      const lineCount = clear.rows.length + clear.cols.length;
      if (lineCount > 0) sfx.rowClear(lineCount);
      // Wucht wächst mit Reihenzahl und Kette: 1 Reihe 0.5, 2 Reihen 0.75, 3+ ~1.
      const power = Math.min(1, 0.25 + lineCount * 0.25 + Math.max(0, clear.chain - 1) * 0.15);
      if (lineCount > 0) {
        this.punchMag = 0.012 + 0.06 * power * power;
        this.punchT = 0;
        if (lineCount === 1) this.shake(2.4);
        if (power >= 0.7) sfx.thump(power);
      }
      if (clear.gain >= 12 && lineCount > 0) {
        const popRow = clear.rows.length > 0 ? clear.rows[0]! + 0.2 : 0.4;
        this.pops.push({
          x: L.boardX + (this.game.cols * L.cell) / 2,
          y: L.boardY + popRow * L.cell,
          t: 0,
          text: `+${nf(clear.gain)}`,
          color: cssVar("--gold"),
          s: clear.gain >= 400 ? 1.6 : clear.gain >= 150 ? 1.4 : clear.gain >= 50 ? 1.2 : 1,
        });
      }
      sfx.vibrate(Math.round(16 + 26 * power));
      // Zwei verschiedene Combo-Arten, die auch verschieden aussehen — nicht
      // immer dieselbe Zeile. Mehrfach-Clear ist seltener/größer, geht vor.
      let comboShown = false;
      if (lineCount >= 2) {
        // "QUAD CLEAR!" statt vorher "MEGA-CLEAR!" -- kollidierte namentlich
        // mit dem viel selteneren, viel größeren Schockwellen-Moment weiter
        // unten ("💥 ULTIMATE CLEAR!"), der intern genau "Mega Clear" heißt
        // (Playtest-Bug B14). Bleibt in der DOUBLE/TRIPLE-Eskalationsfamilie,
        // statt einen Namen zu recyceln, der schon fürs größere Ereignis steht.
        const MULTI_ROW_NAMES: Record<number, string> = { 2: "DOUBLE CLEAR!", 3: "TRIPLE CLEAR!" };
        this.comboPop = {
          text: MULTI_ROW_NAMES[lineCount] ?? "QUAD CLEAR!",
          t: 0,
          color: cssVar("--sky"),
        };
        comboShown = true;
        sfx.milestone();
        this.shake(Math.min(9, 3 + lineCount * 2));
      }
      // Kette: mehrere Clears direkt hintereinander — eigene Feier, eskalierend
      if (clear.chain >= 2) {
        if (!comboShown) {
          const tierColors = ["", "", cssVar("--gold"), cssVar("--mango"), cssVar("--pink"), cssVar("--sky")];
          this.comboPop = {
            text: `CHAIN ×${clear.chain}`,
            t: 0,
            color: tierColors[Math.min(clear.chain, tierColors.length - 1)] || cssVar("--gold"),
          };
        }
        sfx.streak(clear.chain);
        // Wackler erst ab Kette 3 — sonst wackelt's bei fast jedem zweiten
        // Zug, das nervt statt zu feiern
        if (clear.chain >= 3) this.shake(Math.min(9, 3 + clear.chain * 1.1));
      }
      // Level-Modus: der Rest des Turms ist gerade zusammengerutscht — ein
      // kurzer Ruck, proportional zur Zahl der neuen Leerzeilen oben.
      if (clear.collapsedRows > 0) this.shake(Math.min(7, 2 + clear.collapsedRows * 1.4));
    }
    const tier = this.game.consumeTierUp();
    if (tier !== null) {
      this.tierFlashT = 0;
      sfx.milestone();
      this.shake(Math.min(9, 4 + tier * 0.8));
      if (!this.comboPop) this.comboPop = { text: `×${tier} MULTI!`, t: 0, color: cssVar("--gold") };
    }
    // das ganze Brett leer bekommen — der seltenste, größte Moment im Lauf
    if (this.game.consumePerfectClear() && this.layout) {
      const L = this.layout;
      // Zeitbonus gibt's nur im Free Play — im Level läuft keine Uhr
      this.comboPop = { text: this.game.level ? "PERFECT!" : "PERFECT! +5S", t: 0, color: cssVar("--go") };
      sfx.milestone();
      this.shake(9);
      this.spawnBigBurst(L);
      this.perfectShineT = 0;
    }
    // Mini-Aufgabe gelöst: kein Kasten, nur ein großer, reinweißer Text ohne
    // Rand, der wächst und dabei wegfadet — das klassische Reward-Popup, wie
    // in den meisten Match-Spielen.
    if (this.game.consumeChallengeWin()) {
      // ein Herz erspielt? Eigene, größere Feier obendrauf — sonst die normale.
      const wonHeart = this.game.consumeChallengeHeart();
      sfx.win(wonHeart ? 2 : 1);
      if (!this.comboPop) {
        this.comboPop = {
          text: "Task Done! +15s",
          t: 0,
          color: "#ffffff",
          fontScale: 0.55,
          noOutline: true,
          growOnFade: true,
        };
      }
      if (wonHeart && this.layout) {
        this.heartBurstT = 0;
        this.spawnHeartBurst(this.layout);
      }
    }
    // Kombi-Angebot angenommen und erfüllt — dieselbe Art Feier, aber mit der
    // Belohnung, die schon bei der Anfrage stand (nicht immer +15s).
    const comboWin = this.game.consumeComboWin();
    if (comboWin) {
      sfx.win(comboWin.heart ? 2 : 1);
      if (!this.comboPop) {
        this.comboPop = {
          text: `Combo Done! ${comboWin.rewardLabel}`,
          t: 0,
          color: "#ffffff",
          fontScale: 0.55,
          noOutline: true,
          growOnFade: true,
        };
      }
      if (comboWin.heart && this.layout) {
        this.heartBurstT = 0;
        this.spawnHeartBurst(this.layout);
      }
    }
    // Schockwelle: der große, clip-taugliche Moment — 2+ Reihen UND 2+ Spalten
    // auf einen Schlag, das ganze Brett fliegt in Scherben auseinander.
    const mega = this.game.consumeMegaClear();
    if (mega && this.layout) {
      this.comboPop = {
        text: "💥 ULTIMATE CLEAR!",
        t: 0,
        color: cssVar("--stop"),
        fontScale: 0.5,
      };
      sfx.milestone();
      sfx.vibrate(40);
      this.shake(22);
      this.shockwaveT = 0;
      this.perfectShineT = 0; // derselbe weiße Schein wie beim Perfect Clear obendrauf
      this.spawnShockwave(mega.cells, this.layout);
      // Nachleuchten: das lila Panel selbst pulsiert 10s nach — siehe
      // .ultimate-glow in index.html (Halo-Ebene hinter dem Panel, per
      // negativem inset + Blur, für den 3D-Eindruck).
      this.ultimateGlowT = 0;
      this.wrap.classList.add("ultimate-glow");
    }
    if (this.game.isOver && !this.ended) {
      this.ended = true;
      this.game.finish();
      if (this.game.lives <= 0) sfx.fail();
      else sfx.win(2);
      this.cb.onEnd(this.game.result());
    }
    const crowded = this.game.coveredCells() / (this.game.rows * this.game.cols) >= DANGER_FRAC;
    // Direkt am Panel getoggelt (nicht über eine App.ts-Klasse), gleiches
    // Muster wie `ultimate-glow` oben — die View besitzt `this.wrap` schon.
    this.wrap.classList.toggle("danger", crowded && !this.game.isOver);
    this.cb.onHud({
      score: Math.round(this.game.score),
      mult: this.game.multiplier,
      cleared: this.game.cleared,
      ms: this.game.remainingMs(),
      lives: this.game.lives,
      chain: this.game.chain,
      shardsLeft: this.game.shardsLeft,
      crowded: crowded && !this.game.isOver,
      awaitingContinue: this.game.awaitingContinueOffer,
      continuePrice: this.game.nextContinuePrice(),
    });
  }

  // ── Layout — the board is as big as the width allows ────────────────────
  private computeLayout(): Layout {
    const pad = 8;
    const wrapW = this.wrap.clientWidth;
    // Der Canvas rendert `width:100%` seines Wraps (`.board-wrap`), der aber
    // selbst 10px Padding links/rechts hat — `clientWidth` zählt dieses
    // Padding MIT. Ohne den Abzug rechnet das Layout mit mehr Breite, als der
    // Canvas tatsächlich bekommt, und alles landet beim Zeichnen minimal
    // seitlich gestaucht (Kreise werden zu Ellipsen, Zellen wirken enger als
    // geplant) — ein Teil davon, warum die Figuren zu klein wirkten.
    const cssW = (wrapW || 340) - 20;
    const viewportH = window.visualViewport?.height ?? window.innerHeight;

    // Echter vertikaler Platz: Viewport minus wo der Canvas tatsächlich anfängt
    // — das schließt automatisch ALLES ein, was darüber sitzt (Rettungsszene,
    // HUD-Zeilen, Leben, Serie-Abzeichen, Challenge-Reservierung), egal wie
    // viel das gerade ist. Der alte feste Abzug (216px + Challenge-Band) war
    // auf eine bestimmte Chrome-Höhe geeicht und lag daneben, sobald oben mehr
    // stand (z. B. die Rettungsszene) — das Brett lief dann über den
    // sichtbaren Bereich hinaus ("nur das halbe Feld sichtbar").
    const rawTop = this.canvas.getBoundingClientRect().top;
    const canvasTop = rawTop > 40 ? rawTop : 160;
    // Mindestbreite als Plausibilitätsschwelle: mitten in einer Screen-
    // Umblendung oder vor dem ersten Layout-Pass kann clientWidth kurz einen
    // winzigen Zwischenwert liefern (z. B. 20-30px), der > 0, aber offenkundig
    // keine echte Bretttbreite ist. Ohne diese Schwelle hätte layoutLocked
    // genau so einen Ausreißer für immer eingefroren — genau der Bug, den
    // Christian als "nur das halbe Feld sichtbar" gemeldet hat.
    const measured = rawTop > 40 && wrapW >= 150;
    if (!measured) {
      this.layoutDirty = true; // noch nicht verlässlich vermessen → nächsten Frame erneut
    } else if (
      this.lastMeasuredW !== null &&
      Math.abs(this.lastMeasuredW - wrapW) < 1 &&
      this.lastMeasuredTop !== null &&
      Math.abs(this.lastMeasuredTop - rawTop) < 1
    ) {
      this.layoutLocked = true; // zwei Frames in Folge identisch — jetzt wirklich fest
    } else {
      this.layoutDirty = true; // plausibel, aber evtl. noch ein Zwischenstand — einen Frame gegenprüfen
    }
    this.lastMeasuredW = wrapW;
    this.lastMeasuredTop = rawTop;

    // Platz für den Ad-Banner unter dem Brett reservieren (siehe .ad-slot in
    // index.html: 56px Höhe + 8px margin-top) — sonst rechnet sich das Feld
    // zu groß und schiebt den Banner aus dem sichtbaren Bereich. Die
    // Kaskaden-Fähigkeiten sitzen als eigene Zeile ÜBER dem Brett (zwischen
    // .k-lives und .board-wrap) und brauchen keine eigene Höhen-Reservierung
    // — `canvasTop` (unten) erfasst diese Zeile schon automatisch mit, wie
    // jede andere HUD-Zeile über dem Brett.
    // Kein Banner neben dem Spielfeld (Fehltipps beim Ziehen): der frühere
    // Platzhalter ist entfernt, die Höhe gehört dem Brett.
    const AD_SLOT_H = 0;
    // KEIN künstlicher Mindestwert (`Math.max(280, ...)`) mehr hier — der
    // sorgte auf kurzen Bildschirmen (viel HUD-Inhalt oben, wenig Höhe übrig)
    // dafür, dass `cssH` größer gerechnet wurde, als tatsächlich Platz war.
    // Der Canvas wurde dann auf diese zu große Höhe gepinnt (siehe render(),
    // canvas.style.height = cssH), aber `.board-wrap` hat `overflow: hidden`
    // — das Ergebnis war ein am unteren Rand ABGESCHNITTENES Spielfeld, nicht
    // ein harmlos zu kleines. Die echte Untergrenze sitzt weiter unten bei
    // `cell = Math.max(22, ...)` — ein kleineres, aber VOLLSTÄNDIG sichtbares
    // Brett ist immer besser als ein größer gerechnetes, das geclippt wird.
    const maxH = Math.max(0, viewportH - canvasTop - 24 - AD_SLOT_H);
    // topRowH schwankt so oder so nur zwischen 52-70px (siehe Clamp unten) —
    // für die Höhen-Rechnung reicht ein Schätzwert aus der Mitte, die paar
    // Pixel Unterschied ändern die Zellgröße nicht spürbar.
    const availH = Math.max(0, maxH - 62 - 10);

    // Zellgröße = das Engere von "Höhe reicht für 8 Reihen" und "Breite
    // reicht fürs Brett, wenn der Gürtel nur seine Mindestbreite bekommt".
    // Auf einem Hochkant-Handy mit 8 Reihen ist meist die Höhe der engere
    // Faktor — vorher blieb dann der Rest der Breite als Lücke zwischen
    // Feld und Gürtel einfach ungenutzt liegen.
    // War 62 -- Playtest-Bug "Gürtel-Lesbarkeit": auf breiten, kurzen Handys
    // bindet die BREITE (nicht die Höhe), das Brett frisst dann die ganze
    // Breite bis auf genau diese Mindestbreite, und der Gürtel (samt seiner
    // Scherben, siehe `shardCell` unten) landet in genau diesem Fall an
    // seiner absoluten Untergrenze -- 15,5px Scherben gegen 45px Brettzellen.
    // 76 statt 62 gibt dem Gürtel in diesem Fall spürbar mehr Luft; die
    // Brettzelle wird dadurch nur um ~(76-62)/cols Pixel kleiner, und nur in
    // genau diesem breite-bindet-Fall -- im (häufigeren) höhe-bindet-Fall
    // hat der Gürtel ohnehin schon mehr als dieses Minimum übrig.
    // 88 statt 76: nach dem Wegfall des Ad-Platzhalters wächst das Brett stark,
    // und der Gürtel (Scherben ~55 % der Brettzelle) soll nicht mitschrumpfen.
    const MIN_BELT_W = 88;
    const MAX_BELT_W = 150;
    const heightCell = Math.floor(availH / this.game.rows);
    const widthCellAtMinBelt = Math.floor((cssW - MIN_BELT_W - pad * 3) / this.game.cols);
    const cell = Math.max(22, Math.min(heightCell, widthCellAtMinBelt));
    const boardW = cell * this.game.cols;
    const boardH = cell * this.game.rows;
    const boardX = pad;

    // Der Gürtel bekommt den kompletten Rest der Breite, statt einer festen
    // Quote — kein toter Platz mehr zwischen Feld und Gürtel, egal ob gerade
    // Höhe oder Breite bindet.
    const beltW = Math.round(Math.max(MIN_BELT_W, Math.min(MAX_BELT_W, cssW - boardW - pad * 3)));
    // Gemeinsame obere Zeile: links die Challenge-Karte (DOM, siehe index.html
    // .challenge — folgt --top-row-h/--belt-w unten), rechts Hold, genauso
    // breit wie der Gürtel und etwas höher als frühers Hold-Quadrat.
    const topRowH = Math.round(Math.max(52, Math.min(70, beltW * 0.9)));
    const holdY = pad;
    const holdW = beltW;
    const holdH = topRowH;
    const beltX = cssW - beltW - pad;
    const boardY = pad + topRowH + 10;

    const beltTop = boardY;
    const beltH = boardH;

    const cssH = boardY + boardH + pad;
    const bandH = beltH / 3.15;
    const shardCell = Math.max(11, Math.min(bandH / 4.2, beltW / 4.2));

    // Die DOM-Challenge-Karte (Kind von `this.wrap`) richtet sich per CSS an
    // diesen Variablen aus — so bleibt sie exakt neben/so hoch wie Hold, ohne
    // dass die Canvas-Zahlen doppelt in CSS gepflegt werden müssten.
    this.wrap.style.setProperty("--belt-w", `${beltW}px`);
    this.wrap.style.setProperty("--top-row-h", `${topRowH}px`);
    this.wrap.style.setProperty("--k-pad", `${pad}px`);

    return {
      cssW,
      cssH,
      boardX,
      boardY,
      cell,
      beltX,
      beltW,
      beltTop,
      beltH,
      topRowH,
      holdY,
      holdW,
      holdH,
      bandH,
      shardCell,
    };
  }

  /** Screen y for each belt shard, sorted, with a guaranteed minimum gap. */
  private beltRows(L: Layout): Array<{ shard: Shard; cy: number }> {
    const rawCy = (y: number) =>
      L.beltTop + L.bandH / 2 + Math.max(0, Math.min(1, y)) * (L.beltH - L.bandH);
    const sorted = [...this.game.belt].sort((a, b) => a.y - b.y);
    let last = -Infinity;
    return sorted.map((shard) => {
      const cy = Math.max(rawCy(shard.y), last + L.bandH);
      last = cy;
      return { shard, cy };
    });
  }

  /** Kamera-Wackler anstoßen — nie kleiner machen als einen laufenden, größeren. */
  private shake(mag: number): void {
    if (mag > this.shakeMag) this.shakeMag = mag;
  }

  /** Großer Funkenregen übers ganze Brett verteilt — für den Perfekt-Clear. */
  private spawnBigBurst(L: Layout): void {
    const gold = cssVar("--gold");
    const n = 42;
    for (let i = 0; i < n; i++) {
      const x = L.boardX + Math.random() * this.game.cols * L.cell;
      const y = L.boardY + Math.random() * this.game.rows * L.cell;
      const ang = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 200;
      this.sparks.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 80,
        t: 0,
        max: 0.5 + Math.random() * 0.5,
        color: i % 3 === 0 ? "#ffffff" : i % 3 === 1 ? gold : cssVar("--go"),
        size: 3 + Math.random() * 5,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 14,
      });
    }
  }

  /** Kleiner Funkenkranz aus der Brettmitte — für das erspielte Herz. */
  private spawnHeartBurst(L: Layout): void {
    const cx = L.boardX + (this.game.cols * L.cell) / 2;
    const cy = L.boardY + (this.game.rows * L.cell) / 2;
    const pink = cssVar("--pink");
    const n = 20;
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 160;
      this.sparks.push({
        x: cx,
        y: cy,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 40,
        t: 0,
        max: 0.5 + Math.random() * 0.45,
        color: i % 2 === 0 ? "#ffffff" : pink,
        size: 3 + Math.random() * 4,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 14,
      });
    }
  }

  /**
   * Jede übergebene Zelle zerspringt in mehrere kleine Kugel-Splitter (nicht
   * ein einzelner Funke), radial von `originX/Y` weg katapultiert — über das
   * lila Panel hinaus, auf der Vollbild-Ebene `#k-shockwave-fx` (siehe
   * `fxCanvas`), NICHT auf dem Board-Canvas, weil `.board-wrap` per
   * `overflow:hidden` alles kappen würde, was über seinen Rand hinausgeht.
   * Von `spawnShockwave()` (Mega-Clear, volle Wucht) UND von
   * `spawnLineClearChunks()` (normaler Clear, kleiner skaliert) genutzt —
   * dieselbe Technik, nur andere `opts`, statt zwei Partikelsysteme zu
   * pflegen (Abschnitt 6 im Ökonomie-Konzept: "größter Effekt-
   * Wiederverwendungs-Gewinn im Projekt").
   */
  private spawnColorChunks(
    cells: ReadonlyArray<{ row: number; col: number; colorIndex: number }>,
    L: Layout,
    originX: number,
    originY: number,
    opts: {
      chunksPerCell: number;
      speedMin: number;
      speedMax: number;
      distFactor: number;
      upBias: number;
      sizeMin: number;
      sizeMax: number;
      lifeMin: number;
      lifeMax: number;
      /** Start-Verzögerung je Zelle in Sekunden (Räum-Wisch). */
      delayOf?: (row: number, col: number) => number;
    },
  ): void {
    const rect = this.canvas.getBoundingClientRect();
    for (const { row, col, colorIndex } of cells) {
      const delay = opts.delayOf?.(row, col) ?? 0;
      const x = rect.left + L.boardX + (col + 0.5) * L.cell;
      const y = rect.top + L.boardY + (row + 0.5) * L.cell;
      const dx = x - originX;
      const dy = y - originY;
      const dist = Math.hypot(dx, dy) || 1;
      const baseAng = Math.atan2(dy, dx);
      const color = shardByColorIndex(colorIndex).color;
      // Eine Kugel zerspringt in mehrere kleine Kugeln, keine Würfel (die
      // Spielteile SIND Kugeln, siehe drawPieceBody) — "Glas, das zersplittert,
      // nur abgerundet". Start eng um die ursprüngliche Position gebündelt
      // (0.22 statt breiter Streuung), damit auch in Zeitlupe klar bleibt:
      // DIESE eine Kugel ist es, die hier auseinanderfliegt, nicht irgendein
      // zufälliges Partikelchaos. Alle Splitter behalten die Farbe der
      // Ursprungskugel, bis auf einen weißen Glanz-Splitter fürs Funkeln.
      for (let i = 0; i < opts.chunksPerCell; i++) {
        const ang = baseAng + (Math.random() - 0.5) * 0.7;
        const sp = opts.speedMin + Math.random() * (opts.speedMax - opts.speedMin) + dist * opts.distFactor;
        this.fxChunks.push({
          x: x + (Math.random() - 0.5) * L.cell * 0.22,
          y: y + (Math.random() - 0.5) * L.cell * 0.22,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp - opts.upBias,
          t: -delay,
          max: opts.lifeMin + Math.random() * (opts.lifeMax - opts.lifeMin),
          color: i === 0 ? "#ffffff" : color,
          size: L.cell * (opts.sizeMin + Math.random() * (opts.sizeMax - opts.sizeMin)),
          rot: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * 26,
        });
      }
    }
  }

  /** Mega-Clear: volle Wucht, plus der Ring, der den ganzen Screen erreicht. */
  private spawnShockwave(
    cells: ReadonlyArray<{ row: number; col: number; colorIndex: number }>,
    L: Layout,
  ): void {
    const rect = this.canvas.getBoundingClientRect();
    const cx = L.boardX + (this.game.cols * L.cell) / 2;
    const cy = L.boardY + (this.game.rows * L.cell) / 2;
    const originX = rect.left + cx;
    const originY = rect.top + cy;
    this.fxOriginX = originX;
    this.fxOriginY = originY;
    // Ring muss von der Brettmitte aus JEDE Bildschirmecke erreichen, egal wo
    // das Panel gerade sitzt — sonst bleibt in einer Ecke sichtbar Rest stehen.
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let maxR = 0;
    for (const [px, py] of [
      [0, 0],
      [vw, 0],
      [0, vh],
      [vw, vh],
    ] as const) {
      maxR = Math.max(maxR, Math.hypot(px - originX, py - originY));
    }
    this.fxMaxR = maxR;
    this.fxRingT = 0;

    this.spawnColorChunks(cells, L, originX, originY, {
      chunksPerCell: 6,
      speedMin: 420,
      speedMax: 840,
      distFactor: 0.7,
      upBias: 220,
      sizeMin: 0.16,
      sizeMax: 0.34,
      lifeMin: FX_CHUNK_S_MIN,
      lifeMax: FX_CHUNK_S_MAX,
    });
  }

  /**
   * Normaler Reihen-/Spalten-Clear: dieselbe Kugel-Splitter-Technik wie die
   * Schockwelle, nur spürbar kleiner/ruhiger und ohne den Vollbild-Ring —
   * der bleibt dem seltenen Mega-Clear vorbehalten, sonst verliert der große
   * Moment seine Sonderstellung. Ersetzt die frühere generische goldene
   * Funkendusche: Splitter tragen jetzt die tatsächliche Farbe der
   * geräumten Scherben, statt immer gleich golden zu sein.
   */
  private spawnLineClearChunks(
    cells: ReadonlyArray<{ row: number; col: number; colorIndex: number }>,
    L: Layout,
    delayOf?: (row: number, col: number) => number,
    speed = 1,
  ): void {
    if (!cells.length) return;
    const rect = this.canvas.getBoundingClientRect();
    const originX = rect.left + L.boardX + (this.game.cols * L.cell) / 2;
    const originY = rect.top + L.boardY + (this.game.rows * L.cell) / 2;
    this.spawnColorChunks(cells, L, originX, originY, {
      chunksPerCell: 2,
      speedMin: 90,
      speedMax: 310,
      distFactor: 0.25,
      upBias: 90,
      sizeMin: 0.1,
      sizeMax: 0.22,
      lifeMin: 0.35 / speed,
      lifeMax: 0.6 / speed,
      delayOf: delayOf ? (r, c) => delayOf(r, c) / speed : undefined,
    });
  }

  /**
   * Zeichnet Ring + Kugel-Splitter der Schockwelle auf die Vollbild-Ebene
   * (`#k-shockwave-fx`), die außerhalb von `.board-wrap` liegt und darum
   * nicht von dessen `overflow: hidden` gekappt wird — genau deshalb kann die
   * Welle sichtbar über das lila Panel hinaus übern ganzen Screen laufen.
   * Eigener Render-Pass, läuft neben `render()` her (siehe `start()`).
   */
  private renderFx(): void {
    const canvas = this.fxCanvas;
    const ctx = this.fxCtx;
    if (!canvas || !ctx) return;
    const active = this.fxRingT >= 0 || this.fxChunks.length > 0;
    if (!active && !this.fxWasActive) return; // Ruhezustand: nichts zu tun, nichts zu räumen
    this.fxWasActive = active;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(window.innerWidth * dpr);
    const h = Math.round(window.innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    if (!active) return; // gerade eben fertig geworden — der Clear-Frame reicht

    if (this.fxRingT >= 0) {
      const k = this.fxRingT / FX_RING_S;
      const eased = 1 - (1 - k) ** 2; // schnell raus, dann austrudeln — kein starres Lineartempo
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = cssVar("--stop");
      ctx.lineWidth = Math.max(1, 18 * (1 - k));
      ctx.globalAlpha = Math.max(0, (1 - k) * 0.85);
      ctx.beginPath();
      ctx.arc(this.fxOriginX, this.fxOriginY, this.fxMaxR * eased, 0, Math.PI * 2);
      ctx.stroke();
      // zweiter, engerer Ring kurz dahinter — wirkt dichter als eine einzelne Linie
      ctx.lineWidth = Math.max(1, 9 * (1 - k));
      ctx.globalAlpha = Math.max(0, (1 - k) * 0.55);
      ctx.beginPath();
      ctx.arc(this.fxOriginX, this.fxOriginY, Math.max(0, this.fxMaxR * eased - 46), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (this.fxChunks.length) {
      for (const s of this.fxChunks) {
        if (s.t < 0) continue;
        const k = 1 - s.t / s.max;
        ctx.globalAlpha = Math.max(0, k);
        this.drawSplinter(ctx, s.x, s.y, s.size * (0.65 + k * 0.55), s.rot, s.color);
      }
      ctx.globalAlpha = 1;
    }
  }

  /**
   * Staub beim Platzieren — nicht ein Wölkchen an einem Punkt, sondern ein
   * dünner Splash rings um die ganze Form, der von hinten hervorkommt: wird
   * *vor* dem Teil gezeichnet, sodass das Teil selbst die Mitte der Wolke
   * verdeckt und nur der nach außen gespritzte Rand darunter hervorschaut —
   * wie eine staubige Figur, die hinfällt. Sehr dezent (klein, kurzlebig,
   * niedrige Deckkraft), nur für den kleinen 3D-Eindruck.
   */
  private spawnDust(cellsAbs: ReadonlyArray<readonly [number, number]>, L: Layout): void {
    let cr = 0;
    let cc = 0;
    for (const [r, c] of cellsAbs) {
      cr += r;
      cc += c;
    }
    cr /= cellsAbs.length;
    cc /= cellsAbs.length;
    const cx = L.boardX + (cc + 0.5) * L.cell;
    const cy = L.boardY + (cr + 0.5) * L.cell;
    for (const [r, c] of cellsAbs) {
      const x = L.boardX + (c + 0.5) * L.cell;
      const y = L.boardY + (r + 0.5) * L.cell;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const baseAng = Math.atan2(dy, dx);
      for (let i = 0; i < 2; i++) {
        const a = baseAng + (Math.random() - 0.5) * 1.1;
        const sp = 12 + Math.random() * 16 + Math.min(20, dist * 0.15);
        this.dust.push({
          x: x + (Math.random() - 0.5) * L.cell * 0.35,
          y: y + (Math.random() - 0.5) * L.cell * 0.35,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp * 0.5 + 10, // sackt eher ab, statt hochzupuffen — "fällt"
          t: 0,
          max: 0.24 + Math.random() * 0.14,
          r: L.cell * (0.09 + Math.random() * 0.05),
        });
      }
    }
  }


  /** Steinfarben in Lumen-Palette — meist kühles Traube/Iris, ab und zu ein
   *  goldener Splitter darunter (Funkeln im Geröll, wie in den Referenzbildern). */
  private static readonly RUBBLE_HUES = ["#5039c6", "#8b6bff", "#2a1d6b", "#8b6bff", "#5039c6", "#ffc23b"];

  /**
   * Der Schutt, der die obersten `rows` Reihen des Bretts wieder eingenommen
   * hat — dasselbe Feld, das gerade kleiner wird, nicht ein separates Bild.
   * Glänzende Steinbrocken im Lumen-Look (dieselbe Kugel-Schattierung wie die
   * Spielteile), mit einem kurzen Hüpfer, wenn eine neue Reihe ankommt.
   */
  private drawRubbleFill(L: Layout, rows: number): void {
    const ctx = this.ctx;
    const w = this.game.cols * L.cell;
    // kurzer Setz-Hüpfer: die Kante überschießt beim Landen leicht und
    // schwingt zurück, statt einfach stehenzubleiben
    const bt = this.rubbleBounceT;
    const overshoot = bt < 0.26 ? Math.sin((bt / 0.26) * Math.PI) * (1 - bt / 0.26) * L.cell * 0.16 : 0;
    const h = rows * L.cell + overshoot;
    ctx.save();
    ctx.beginPath();
    ctx.rect(L.boardX, L.boardY, w, h);
    ctx.clip();

    const grad = ctx.createLinearGradient(0, L.boardY, 0, L.boardY + h);
    grad.addColorStop(0, "#251d47");
    grad.addColorStop(1, "#3a2e63");
    ctx.fillStyle = grad;
    ctx.fillRect(L.boardX, L.boardY, w, h);

    // mehrere kleine, glänzende Brocken pro Zelle — dichter als eine Kugel
    // pro Zelle, näher am "Geröllhaufen"-Bild der Vorlage. Deterministisch
    // nach Zelle geseedet, damit es zwischen Frames nicht flimmert.
    const rowsToDraw = Math.ceil(rows) + 1;
    for (let r = -1; r < rowsToDraw; r++) {
      for (let c = 0; c < this.game.cols; c++) {
        for (let k = 0; k < 3; k++) {
          const seed = (((r * 13 + c * 7 + k * 29) % 17) + 17) % 17;
          const hue = CascadeView.RUBBLE_HUES[seed % CascadeView.RUBBLE_HUES.length]!;
          const cx = L.boardX + (c + 0.5) * L.cell + (((seed % 7) - 3) / 3) * L.cell * 0.32;
          const cy = L.boardY + (r + 0.5) * L.cell + ((((seed * 5) % 7) - 3) / 3) * L.cell * 0.32;
          const rr = L.cell * (0.1 + (seed % 5) * 0.018);
          const g = ctx.createRadialGradient(cx - rr * 0.3, cy - rr * 0.35, rr * 0.1, cx, cy, rr);
          g.addColorStop(0, shade(hue, 0.5));
          g.addColorStop(0.5, hue);
          g.addColorStop(1, shade(hue, -0.4));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, rr, 0, 6.28);
          ctx.fill();
        }
      }
    }
    // ein feiner heller Streifen genau an der Kante zum Spielfeld — die Grenze,
    // die beim nächsten Clear weiter runterrutscht
    const edgeY = L.boardY + h;
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fillRect(L.boardX, edgeY - 2, w, 2);
    ctx.restore();
  }

  private drawStar(x: number, y: number, r: number, rot: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = rot + (i * Math.PI) / 4;
      const rad = i % 2 === 0 ? r : r * 0.4;
      const px = x + Math.cos(a) * rad;
      const py = y + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Ein kleiner Kugel-Splitter — für die Schockwelle (`renderFx`). Die
   * Spielteile selbst sind ja Kugeln (`drawPieceBody`), darum muss auch jeder
   * Splitter eine kleine Kugel sein, keine Ecke/Kante wie ein Würfel — "Glas,
   * das zersplittert, nur abgerundet". Radialer Verlauf mit Glanzpunkt, der
   * über `rot` leicht wandert, für einen tumbelnden 3D-Eindruck. Nimmt den
   * Kontext explizit entgegen, weil er auf der Vollbild-FX-Ebene zeichnet,
   * nicht auf dem Board-Canvas (`this.ctx`).
   */
  private drawSplinter(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rot: number, color: string): void {
    const r = size / 2;
    const hx = x + Math.cos(rot) * r * 0.3;
    const hy = y + Math.sin(rot) * r * 0.3;
    const grad = ctx.createRadialGradient(hx - r * 0.25, hy - r * 0.3, r * 0.1, x, y, r * 1.08);
    grad.addColorStop(0, shade(color, 0.6));
    grad.addColorStop(0.55, color);
    grad.addColorStop(1, shade(color, -0.3));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Herz-Umriss, `size` = Breite über die beiden Lappen. Füllt/stroket nicht
   *  selbst — Aufrufer entscheidet (Glow-Schicht vs. Hauptform). */
  private heartPath(cx: number, cy: number, size: number): void {
    const ctx = this.ctx;
    const s = size / 2;
    const top = cy - s * 0.35;
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.85);
    ctx.bezierCurveTo(cx - s * 1.3, top + s * 0.1, cx - s * 0.55, top - s * 0.85, cx, top - s * 0.15);
    ctx.bezierCurveTo(cx + s * 0.55, top - s * 0.85, cx + s * 1.3, top + s * 0.1, cx, cy + s * 0.85);
    ctx.closePath();
  }

  // ── Render ───────────────────────────────────────────────────────────────
  private render(): void {
    if (this.layoutDirty || !this.layout) {
      this.layoutDirty = false;
      this.layout = this.computeLayout();
    }
    const L = this.layout;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(L.cssW * dpr);
    const h = Math.round(L.cssH * dpr);
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    // Beide Seiten explizit pinnen, nicht nur die Höhe: `.board-wrap` ist ein
    // schrumpfbares Flex-Item, und dessen Canvas-Kind rendert per CSS mit
    // `width:100%` seines Wraps. Ändert sich die verfügbare Flex-Breite NACH
    // dieser Messung (z. B. weil oben ein Abzeichen erscheint und den Wrap
    // schmaler drückt), würde der Canvas kleiner gezeichnet als `L.cssW`,
    // während `pt()`/`boardCell()` weiter mit `L.cssW` rechnen -- jeder Zug
    // landet dann in der falschen Zelle, meist eine Reihe zu hoch. Mit einer
    // festen Pixelbreite bleibt die tatsächliche Canvas-Box IMMER exakt so
    // groß wie die Layout-Mathematik annimmt, unabhängig vom Flex-Container.
    this.canvas.style.width = `${L.cssW}px`;
    this.canvas.style.height = `${L.cssH}px`;
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, L.cssW, L.cssH);
    // Zoom-Punch: alles bis zum roten Lebensverlust-Blitz um die Brettmitte skalieren.
    ctx.save();
    if (this.punchScale !== 1) {
      const pcx = L.boardX + (this.game.cols * L.cell) / 2;
      const pcy = L.boardY + (this.game.rows * L.cell) / 2;
      ctx.translate(pcx, pcy);
      ctx.scale(this.punchScale, this.punchScale);
      ctx.translate(-pcx, -pcy);
    }

    // leeres Brett-Raster: einmal gebaut, danach nur noch als Bild geblittet
    const grid = boardGrid(this.gridCells, L.cell, dpr, cssVar("--cell"));
    ctx.drawImage(grid.canvas, L.boardX, L.boardY, grid.w, grid.h);

    // Level-Modus: der Schutt hat die obersten `rubbleDisplay` Reihen schon
    // wieder eingenommen — das Spielfeld ist dort sichtbar kleiner geworden,
    // nicht nur leer. Läuft weich mit, wenn eine Reihe geräumt wird.
    if (this.game.level && this.rubbleDisplay > 0.01) {
      this.drawRubbleFill(L, Math.min(this.rubbleDisplay, this.game.rows));
    }

    ctx.strokeStyle = cssVar("--board-edge");
    ctx.lineWidth = 3;
    roundRect(
      ctx,
      L.boardX - 3,
      L.boardY - 3,
      this.game.cols * L.cell + 6,
      this.game.rows * L.cell + 6,
      12,
    );
    ctx.stroke();

    // nur noch 1 Leben: sichtbarer Druck — der Rand pulsiert rot, statt dass
    // die Gefahr nur in einer kleinen Herz-Reihe steht
    if (this.game.lives === 1 && !this.game.isOver) {
      const pulse = 0.5 + 0.5 * Math.sin(this.nowMs / 260);
      ctx.save();
      ctx.strokeStyle = cssVar("--stop");
      ctx.globalAlpha = 0.45 + 0.4 * pulse;
      ctx.lineWidth = 3 + pulse * 3;
      roundRect(
        ctx,
        L.boardX - 4,
        L.boardY - 4,
        this.game.cols * L.cell + 8,
        this.game.rows * L.cell + 8,
        13,
      );
      ctx.stroke();
      ctx.restore();
    }

    // Staub *zuerst* — das Teil wird direkt danach obendrauf gezeichnet und
    // verdeckt die Mitte der Wolke, nur der nach außen gespritzte Rand schaut
    // unter der Form hervor. Billig: einfache Alpha-Kreise, kein Glow.
    if (this.dust.length) {
      ctx.save();
      ctx.fillStyle = "#e9e4ff";
      for (const d of this.dust) {
        const k = 1 - d.t / d.max;
        ctx.globalAlpha = Math.max(0, k) * 0.32;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r * (1 + (1 - k) * 0.7), 0, 6.28);
        ctx.fill();
      }
      ctx.restore();
    }

    // filled cells — the just-placed piece gets a quick pop
    for (let r = 0; r < this.game.rows; r++) {
      for (let c = 0; c < this.game.cols; c++) {
        const v = this.game.board[r * this.game.cols + c];
        if (v && v > 0) {
          const pp = this.placePop;
          let opts: { scaleX: number; scaleY: number; glow: number } | undefined;
          if (pp && r === pp.r && c >= pp.c && c < pp.c + 4 && r < pp.r + 3) {
            // Squash-and-Stretch statt reinem Größer-Pulsieren: bei der
            // Landung (t=0) erst breit+flach (Aufprall), schwingt durch die
            // runde Neutralform in schmal+hoch (Nachschwung), klingt dann
            // sauber auf 1:1 aus -- klassisches Animationsprinzip, macht die
            // Landung spürbar statt die Figur einfach "erscheinen" zu lassen.
            const k = pp.t / 0.28;
            const wobble = Math.cos(k * Math.PI * 2.2) * (1 - k);
            const squash = 0.16 * wobble;
            opts = { scaleX: 1 + squash, scaleY: 1 - squash, glow: 10 };
          }
          drawPieceBody(ctx, [[r, c]], L.boardX, L.boardY, L.cell, shardByColorIndex(v).color, opts);
        }
      }
    }

    // Geräumte Zellen: bleiben kurz stehen und poppen nacheinander (aufblitzen,
    // aufblähen, zerplatzen), sobald der Lichtkopf sie erreicht.
    for (const gh of this.ghosts) {
      const u = (gh.t - gh.delay) / GHOST_S;
      const color = shardByColorIndex(gh.colorIndex).color;
      if (u >= 1) continue;
      if (u < 0) {
        drawPieceBody(ctx, [[gh.row, gh.col]], L.boardX, L.boardY, L.cell, color);
        continue;
      }
      const sc = 1 + 0.32 * Math.sin(Math.min(1, u * 1.6) * Math.PI * 0.5) - 0.45 * u * u;
      drawPieceBody(ctx, [[gh.row, gh.col]], L.boardX, L.boardY, L.cell, color, {
        scale: sc,
        alpha: 1 - u * u * u,
        glow: 10 * (1 - u),
      });
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.5 * Math.sin(u * Math.PI);
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, L.boardX + gh.col * L.cell + 2, L.boardY + gh.row * L.cell + 2, L.cell - 4, L.cell - 4, 6);
      ctx.fill();
      ctx.restore();
    }

    // Räum-Animation je geräumter Reihe / Spalte (Stil wechselt zufällig)
    for (const f of this.flash) this.drawClearFlash(L, f, false, f.row);
    for (const f of this.flashCols) this.drawClearFlash(L, f, true, f.col);

    // star sparks from row clears — „lighter" gibt schon Glühen, kein shadowBlur
    if (this.sparks.length) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const s of this.sparks) {
        const k = 1 - s.t / s.max;
        ctx.globalAlpha = Math.max(0, k);
        ctx.fillStyle = s.color;
        this.drawStar(s.x, s.y, s.size * (0.5 + k * 0.7), s.rot);
      }
      ctx.restore();
    }

    // "+N" score pops — steigen kurz auf, kippen dann satt nach unten weg und faden aus
    for (const pop of this.pops) {
      const k = pop.t / POP_LIFE_S;
      const rise = L.cell * 1.5;
      const y =
        k < 0.3
          ? pop.y - rise * (k / 0.3)
          : pop.y - rise + rise * 0.85 * ((k - 0.3) / 0.7) ** 2;
      const alpha = k < 0.65 ? 1 : Math.max(0, 1 - (k - 0.65) / 0.35);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = pop.color;
      ctx.font = `800 ${Math.round(L.cell * 0.6 * (pop.s ?? 1))}px "Baloo 2", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 4;
      // Einschlag: beim Erscheinen kurz überdimensioniert, dann auf Größe
      const sc = pop.t < 0.14 ? 1 + 0.55 * (1 - pop.t / 0.14) : 1;
      ctx.translate(pop.x, y);
      ctx.scale(sc, sc);
      ctx.lineJoin = "round";
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(20, 10, 40, 0.7)";
      ctx.strokeText(pop.text, 0, 0);
      ctx.fillText(pop.text, 0, 0);
      ctx.restore();
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    // neue Multiplikator-Stufe: ein kurzer goldener Blitz übers ganze Brett
    if (this.tierFlashT >= 0) {
      const p = this.tierFlashT / 0.5;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.max(0, 1 - p) * 0.5;
      ctx.fillStyle = cssVar("--gold");
      roundRect(ctx, L.boardX - 3, L.boardY - 3, this.game.cols * L.cell + 6, this.game.rows * L.cell + 6, 12);
      ctx.fill();
      ctx.restore();
    }

    // Schockwelle: greller, kurzer Blitz im Aufprall-Moment — der eigentliche
    // Ring + die Splitter fliegen auf der Vollbild-Ebene weiter (renderFx),
    // weil .board-wrap alles am Rand kappen würde (overflow: hidden).
    if (this.shockwaveT >= 0) {
      const k = this.shockwaveT / SHOCKWAVE_S;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.max(0, (1 - k) ** 2) * 0.85;
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, L.boardX - 4, L.boardY - 4, this.game.cols * L.cell + 8, this.game.rows * L.cell + 8, 14);
      ctx.fill();
      ctx.restore();
    }

    // Perfektes Brett: ein weißer Schein läuft einmal diagonal von links oben
    // nach rechts unten übers (jetzt leere) Feld — jede Zelle blitzt kurz auf,
    // sobald die Welle sie erreicht.
    if (this.perfectShineT >= 0) {
      const p = this.perfectShineT / PERFECT_SHINE_S;
      const band = 0.22;
      const rows = this.game.rows;
      const cols = this.game.cols;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const dCell = (rows <= 1 ? 0 : r / (rows - 1)) * 0.5 + (cols <= 1 ? 0 : c / (cols - 1)) * 0.5;
          const dist = Math.abs(dCell - p);
          if (dist > band) continue;
          ctx.globalAlpha = (1 - dist / band) * 0.9;
          ctx.fillStyle = "#ffffff";
          roundRect(ctx, L.boardX + c * L.cell + 2, L.boardY + r * L.cell + 2, L.cell - 4, L.cell - 4, 6);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // Herz erspielt: groß, halbtransparent, wächst einmal auf und verschwindet
    // wieder — mittig übers Brett gelegt, aber weich genug (Alpha, kein Klick-
    // Fang), dass es beim Weiterspielen nicht im Weg steht.
    if (this.heartBurstT >= 0) {
      const p = this.heartBurstT / HEART_BURST_S;
      const growP = Math.min(1, p / 0.7);
      const eased = 1 - (1 - growP) ** 3;
      const scale = 0.5 + 0.85 * eased;
      const alpha = p < 0.1 ? (p / 0.1) * 0.8 : p > 0.65 ? Math.max(0, 0.8 * (1 - (p - 0.65) / 0.35)) : 0.8;
      const cx = L.boardX + (this.game.cols * L.cell) / 2;
      const cy = L.boardY + (this.game.rows * L.cell) / 2;
      const size = Math.min(this.game.cols * L.cell, this.game.rows * L.cell) * 0.85 * scale;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      this.heartPath(cx, cy, size * 1.25);
      ctx.fillStyle = "rgba(255, 90, 130, 0.35)";
      ctx.fill();
      ctx.restore();
      this.heartPath(cx, cy, size);
      const hg = ctx.createRadialGradient(cx - size * 0.15, cy - size * 0.2, size * 0.05, cx, cy, size * 0.75);
      hg.addColorStop(0, "#ffb3c6");
      hg.addColorStop(0.55, "#ff5f85");
      hg.addColorStop(1, "#e8305c");
      ctx.fillStyle = hg;
      ctx.fill();
      // kleiner Glanzpunkt oben links — macht's "juicy" statt flach
      ctx.globalAlpha = Math.max(0, alpha) * 0.7;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(cx - size * 0.22, cy - size * 0.28, size * 0.09, size * 0.15, -0.5, 0, 6.28);
      ctx.fill();
      ctx.restore();
    }

    // Kette / Multiplikator-Sprung: eine große Einblendung über der Mitte des Bretts
    if (this.comboPop) {
      const pop = this.comboPop;
      const p = pop.t / COMBO_LIFE_S;
      const growing = pop.growOnFade ?? false;
      const popIn = p < 0.1 ? p / 0.1 : 1; // schnell rein
      // growOnFade: wächst und fadet durchgehend ab dem Einstieg (klassisches
      // Reward-Popup); sonst: kurz "atmen", lange stehen, erst spät ausklingen.
      const fade = growing
        ? Math.max(0, 1 - Math.max(0, p - 0.08) / 0.92)
        : p > 0.78
          ? 1 - (p - 0.78) / 0.22
          : 1;
      const drop = !growing && p > 0.78 ? ((p - 0.78) / 0.22) ** 2 * L.cell * 0.5 : 0;
      const scale = growing
        ? 0.8 + 0.7 * Math.min(1, p / 0.9)
        : 0.7 + 0.3 * popIn + 0.08 * Math.sin(p * Math.PI * 2) * (1 - p);
      const cx = L.boardX + (this.game.cols * L.cell) / 2;
      const cy = L.boardY + (this.game.rows * L.cell) / 2 + drop;
      ctx.save();
      ctx.globalAlpha = Math.max(0, fade);
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.font = `900 ${Math.round(L.cell * (pop.fontScale ?? 0.85))}px "Baloo 2", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (!pop.noOutline) {
        ctx.lineWidth = 5;
        ctx.strokeStyle = "rgba(20, 10, 40, 0.55)";
        ctx.strokeText(pop.text, 0, 0);
      }
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, 0, 0);
      ctx.restore();
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }

    // belt
    ctx.fillStyle = cssVar("--surface-2");
    roundRect(ctx, L.beltX, L.beltTop, L.beltW, L.beltH, 16);
    ctx.fill();
    ctx.strokeStyle = cssVar("--hairline");
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    for (let i = 1; i < 3; i++) {
      const y = L.beltTop + i * (L.beltH / 3);
      ctx.beginPath();
      ctx.moveTo(L.beltX + 8, y);
      ctx.lineTo(L.beltX + L.beltW - 8, y);
      ctx.stroke();
    }
    // Gefahrenzone: je näher die am weitesten gerutschte Scherbe dem Bandende
    // kommt, desto stärker und schneller pulsiert ein warmes Glühen am unteren
    // Bandrand (bewusst am Band, NICHT als rote Kontur an der Scherbe).
    if (this.game.isStarted && !this.game.isOver && !this.game.isPaused) {
      let urgency = 0;
      for (const s of this.game.belt) {
        urgency = Math.max(urgency, (s.y - BELT_DANGER_Y) / (1 - BELT_DANGER_Y));
      }
      if (urgency > 0) this.drawBeltFlames(L, Math.min(1, urgency));
    }
    for (const { shard, cy } of this.beltRows(L)) {
      if (this.drag && this.drag.shard.id === shard.id) continue;
      this.drawShard(shard, L.beltX + L.beltW / 2, cy, L.shardCell);
    }

    // hold slot — jetzt so breit wie der Gürtel, oben neben der Challenge-Karte
    const holdCx = L.beltX + L.holdW / 2;
    const holdCy = L.holdY + L.holdH / 2;
    const holdMin = Math.min(L.holdW, L.holdH);
    ctx.fillStyle = cssVar("--surface");
    roundRect(ctx, L.beltX, L.holdY, L.holdW, L.holdH, 16);
    ctx.fill();
    ctx.strokeStyle = cssVar("--hairline");
    ctx.stroke();
    if (this.game.hold && !(this.drag && this.drag.from === "hold")) {
      this.drawShard(this.game.hold, holdCx, holdCy, holdMin * 0.3);
    } else if (!(this.drag && this.drag.from === "hold")) {
      ctx.fillStyle = cssVar("--ink-dim");
      ctx.font = `700 ${Math.round(holdMin * 0.15)}px "Hanken Grotesk", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Hold", holdCx, holdCy);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }

    // Vorschau: Reihen/Spalten, die die gezogene Figur *jetzt* räumen würde,
    // schimmern schon vorm Loslassen weiß — man sieht das Ergebnis, bevor man
    // sich festlegt, statt es erst danach zu erfahren.
    if (this.drag) {
      const snap = this.snappedFor(this.drag, L);
      if (this.overBoard(this.drag.px, this.drag.py, L, this.drag.lift) && this.game.canPlace(this.drag.shard, snap)) {
        const preview = this.previewLines(this.drag.shard, snap);
        if (preview.rows.length || preview.cols.length) this.drawLinePreview(preview, L);
      }
      this.drawDrag(L);
    }

    ctx.restore(); // Ende Zoom-Punch

    // Letztes Leben: dauerhaft pulsierende warme Vignette an den Rändern --
    // man spürt "jetzt zählt's", ohne etwas Wichtiges zu verdecken.
    if (this.game.isStarted && !this.game.isOver && !this.game.isPaused && this.game.lives === 1) {
      const pulse = 0.5 + 0.5 * Math.sin((this.nowMs / 1000) * 2.4 * Math.PI * 2);
      const vcx = L.cssW / 2;
      const vcy = L.cssH / 2;
      const vg = this.ctx.createRadialGradient(vcx, vcy, Math.min(L.cssW, L.cssH) * 0.3, vcx, vcy, Math.max(L.cssW, L.cssH) * 0.8);
      vg.addColorStop(0, "rgba(255, 70, 40, 0)");
      vg.addColorStop(1, `rgba(255, 70, 40, ${(0.14 + 0.14 * pulse).toFixed(3)})`);
      this.ctx.fillStyle = vg;
      this.ctx.fillRect(0, 0, L.cssW, L.cssH);
    }

    // Lebensverlust: kurzer roter Blitz von den Rändern her, blendet schnell aus.
    if (this.lifeFlashT >= 0) {
      const k = 1 - this.lifeFlashT / LIFE_FLASH_S;
      const cx = L.cssW / 2;
      const cyy = L.cssH / 2;
      const g = this.ctx.createRadialGradient(cx, cyy, Math.min(L.cssW, L.cssH) * 0.25, cx, cyy, Math.max(L.cssW, L.cssH) * 0.75);
      g.addColorStop(0, "rgba(255, 50, 50, 0)");
      g.addColorStop(1, `rgba(255, 50, 50, ${(0.5 * k).toFixed(3)})`);
      this.ctx.fillStyle = g;
      this.ctx.fillRect(0, 0, L.cssW, L.cssH);
    }
  }

  /** Zufälliger Räum-Stil mit Gewichten, nie derselbe wie beim letzten Clear. */
  private pickClearStyle(): ClearStyle {
    const pool: Array<[ClearStyle, number]> = [
      ["sweepR", 3],
      ["sweepL", 2],
      ["burst", 3],
      ["bar", 2],
    ];
    const opts = pool.filter(([st]) => st !== this.lastClearStyle);
    let r = Math.random() * opts.reduce((a, [, w]) => a + w, 0);
    let pick = opts[0]![0];
    for (const [st, w] of opts) {
      if ((r -= w) <= 0) {
        pick = st;
        break;
      }
    }
    this.lastClearStyle = pick;
    return pick;
  }

  /** Eine geräumte Reihe (`vert` false) oder Spalte: Leiste + je nach Stil
   *  ein oder zwei Lichtköpfe mit Schweif. `bar` ist der klassische Blitz ohne
   *  Wisch, dafür kräftiger. */
  private drawClearFlash(L: Layout, f: { t: number; style: ClearStyle }, vert: boolean, index: number): void {
    const ctx = this.ctx;
    const p = f.t / 0.5;
    const len = (vert ? this.game.rows : this.game.cols) * L.cell;
    const x0 = vert ? L.boardX + index * L.cell : L.boardX;
    const y0 = vert ? L.boardY : L.boardY + index * L.cell;
    const at = (frac: number): { x: number; y: number } =>
      vert ? { x: x0 + L.cell / 2, y: y0 + len * frac } : { x: x0 + len * frac, y: y0 + L.cell / 2 };
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = vert ? ctx.createLinearGradient(x0, y0, x0, y0 + len) : ctx.createLinearGradient(x0, y0, x0 + len, y0);
    const a = f.style === "bar" ? (1 - p) ** 1.4 : (1 - p) * 0.9;
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, `rgba(255,240,190,${a.toFixed(3)})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    const thick = L.cell * (1 + p * 0.6 + (f.style === "bar" ? 0.55 * (1 - p) : 0));
    if (vert) ctx.fillRect(x0 - (thick - L.cell) / 2, y0, thick, len);
    else ctx.fillRect(x0, y0 - (thick - L.cell) / 2, len, thick);

    if (f.style !== "bar" && p < 0.75) {
      const q = Math.min(1, p / (CLEAR_SWEEP_S / 0.5));
      const fade = 1 - p / 0.75;
      // Köpfe + Start des Schweifs (Anteil 0..1 entlang der Linie)
      const heads: Array<{ pos: number; from: number }> =
        f.style === "sweepR"
          ? [{ pos: q, from: 0 }]
          : f.style === "sweepL"
            ? [{ pos: 1 - q, from: 1 }]
            : [
                { pos: 0.5 - 0.5 * q, from: 0.5 },
                { pos: 0.5 + 0.5 * q, from: 0.5 },
              ];
      for (const h of heads) {
        // Schweif: heller Verlauf vom Start der Welle bis zum Kopf
        const s0 = at(h.from);
        const s1 = at(h.pos);
        const tail = ctx.createLinearGradient(s0.x, s0.y, s1.x, s1.y);
        tail.addColorStop(0, "rgba(255,230,160,0)");
        tail.addColorStop(1, `rgba(255,240,190,${(0.5 * fade).toFixed(3)})`);
        ctx.fillStyle = tail;
        const lo = Math.min(h.from, h.pos);
        const hi = Math.max(h.from, h.pos);
        if (vert) ctx.fillRect(x0, y0 + len * lo, L.cell, len * (hi - lo));
        else ctx.fillRect(x0 + len * lo, y0, len * (hi - lo), L.cell);
        // Kopf
        const c = at(h.pos);
        const hg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, L.cell * 1.7);
        hg.addColorStop(0, `rgba(255,255,255,${(fade * 0.8).toFixed(3)})`);
        hg.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = hg;
        ctx.fillRect(c.x - L.cell * 1.7, c.y - L.cell * 1.7, L.cell * 3.4, L.cell * 3.4);
      }
    }
    ctx.restore();
  }

  /** Feuriger Rand ums Band: der Rahmen glüht orange-rot und flackert
   *  unregelmäßig, dazu wandern helle Funken-Segmente am Rand entlang. `u`
   *  (0..1) wächst, je näher die gefährdetste Scherbe dem Abfall kommt:
   *  Rand dicker, heller, Flackern schneller. Unten ist der Rand am heißesten. */
  private drawBeltFlames(L: Layout, u: number): void {
    const ctx = this.ctx;
    const t = this.nowMs / 1000;
    const x = L.beltX + 1.5;
    const y = L.beltTop + 1.5;
    const w = L.beltW - 3;
    const h = L.beltH - 3;
    const sp = 5 + u * 7;
    // unregelmäßiges Flackern: drei Sinus mit krummen Verhältnissen
    const flick = Math.min(
      1.2,
      Math.max(
        0.35,
        0.7 + 0.22 * Math.sin(t * sp) + 0.14 * Math.sin(t * sp * 2.3 + 1.3) + 0.08 * Math.sin(t * sp * 5.1 + 0.4),
      ),
    );
    const a = Math.min(1, (0.35 + 0.6 * u) * flick);

    // weiches Glühen von innen, unten stärker
    ctx.save();
    roundRect(ctx, L.beltX, L.beltTop, L.beltW, L.beltH, 16);
    ctx.clip();
    const inner = ctx.createLinearGradient(0, L.beltTop + L.beltH, 0, L.beltTop + L.beltH * 0.4);
    inner.addColorStop(0, `rgba(255, 110, 40, ${((0.1 + 0.22 * u) * flick).toFixed(3)})`);
    inner.addColorStop(1, "rgba(255, 70, 30, 0)");
    ctx.fillStyle = inner;
    ctx.fillRect(L.beltX, L.beltTop, L.beltW, L.beltH);
    ctx.restore();

    // glühender Rand: oben rot, unten gelb-orange, mit Schein nach außen
    ctx.save();
    const rim = ctx.createLinearGradient(0, y, 0, y + h);
    rim.addColorStop(0, `rgba(255, 70, 40, ${(a * 0.55).toFixed(3)})`);
    rim.addColorStop(1, `rgba(255, 175, 60, ${a.toFixed(3)})`);
    // breiter, weicher Halo darunter -- macht den Rand von weitem als Glut lesbar
    ctx.strokeStyle = `rgba(255, 120, 40, ${(a * 0.35).toFixed(3)})`;
    ctx.lineWidth = 9 + 9 * u * flick;
    ctx.shadowColor = `rgba(255, 90, 30, ${a.toFixed(3)})`;
    ctx.shadowBlur = 18 + 30 * u * flick;
    roundRect(ctx, x, y, w, h, 15);
    ctx.stroke();
    ctx.shadowColor = `rgba(255, 110, 40, ${a.toFixed(3)})`;
    ctx.shadowBlur = 10 + 24 * u * flick;
    ctx.strokeStyle = rim;
    ctx.lineWidth = 3.5 + 4 * u * flick;
    roundRect(ctx, x, y, w, h, 15);
    ctx.stroke();

    // helle Funken-Segmente, die am Rand entlangwandern
    const per = 2 * (w + h);
    ctx.setLineDash([per * 0.07, per * 0.05, per * 0.03, per * 0.09]);
    ctx.lineDashOffset = -t * (40 + u * 90);
    ctx.shadowBlur = 4 + 8 * u;
    ctx.strokeStyle = `rgba(255, 235, 150, ${a.toFixed(3)})`;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 15);
    ctx.stroke();
    ctx.restore();
  }

  /** Reihen/Spalten, die durch `shard` an `pos` vollständig gefüllt würden. */
  private previewLines(shard: Shard, pos: Pos): { rows: number[]; cols: number[] } {
    const dragCells = new Set<number>();
    for (const [dr, dc] of this.game.cells(shard)) {
      dragCells.add((pos.row + dr) * this.game.cols + (pos.col + dc));
    }
    const rows: number[] = [];
    for (let r = 0; r < this.game.rows; r++) {
      let full = true;
      for (let c = 0; c < this.game.cols; c++) {
        if (!this.game.filled(r, c) && !dragCells.has(r * this.game.cols + c)) {
          full = false;
          break;
        }
      }
      if (full) rows.push(r);
    }
    // Spalten räumen nur im Free Play (siehe clearFullRows in cascade.ts) —
    // die Vorschau muss dieselbe Regel befolgen, sonst verspricht sie im
    // Level-Modus etwas, das beim Ablegen gar nicht passiert.
    const cols: number[] = [];
    if (!this.game.level) {
      for (let c = 0; c < this.game.cols; c++) {
        let full = true;
        for (let r = 0; r < this.game.rows; r++) {
          if (!this.game.filled(r, c) && !dragCells.has(r * this.game.cols + c)) {
            full = false;
            break;
          }
        }
        if (full) cols.push(c);
      }
    }
    return { rows, cols };
  }

  /** Weißes Schimmern über jeder Reihe/Spalte aus `previewLines` — pulsiert,
   *  solange man drüber hält, und ist sofort wieder weg, sobald man wegzieht. */
  private drawLinePreview(lines: { rows: number[]; cols: number[] }, L: Layout): void {
    const ctx = this.ctx;
    const shimmer = 0.55 + 0.35 * Math.sin(this.nowMs / 140);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const r of lines.rows) {
      const y = L.boardY + r * L.cell;
      const w = this.game.cols * L.cell;
      const g = ctx.createLinearGradient(L.boardX, y, L.boardX + w, y);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, `rgba(255,255,255,${shimmer})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      roundRect(ctx, L.boardX, y, w, L.cell, 6);
      ctx.fill();
    }
    for (const c of lines.cols) {
      const x = L.boardX + c * L.cell;
      const h = this.game.rows * L.cell;
      const g = ctx.createLinearGradient(x, L.boardY, x, L.boardY + h);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, `rgba(255,255,255,${shimmer})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      roundRect(ctx, x, L.boardY, L.cell, h, 6);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawShard(shard: Shard, cx: number, cy: number, cell: number, selected = false): void {
    const cells = this.game.cells(shard);
    let maxR = 0;
    let maxC = 0;
    let minR = 9;
    let minC = 9;
    for (const [r, c] of cells) {
      maxR = Math.max(maxR, r);
      maxC = Math.max(maxC, c);
      minR = Math.min(minR, r);
      minC = Math.min(minC, c);
    }
    const w = (maxC - minC + 1) * cell;
    const hh = (maxR - minR + 1) * cell;
    drawPieceBody(
      this.ctx,
      cells.map(([r, c]) => [r - minR, c - minC] as [number, number]),
      cx - w / 2,
      cy - hh / 2,
      cell,
      shardDef(shard.name).color,
      selected ? { selected: true } : undefined,
    );
  }

  private drawDrag(L: Layout): void {
    const d = this.drag!;
    const snap = this.snappedFor(d, L);
    if (this.overBoard(d.px, d.py, L, d.lift)) {
      const ok = this.game.canPlace(d.shard, snap);
      const cells = this.game
        .cells(d.shard)
        .map(([r, c]) => [r + snap.row, c + snap.col] as [number, number]);
      const ctx = this.ctx;
      // Farbe bleibt IMMER die echte Teile-Farbe — nicht rot einfärben, sonst
      // sieht ein von Natur aus rotes Teil (z. B. #ff4d4d) genauso aus wie ein
      // ungültig platziertes. „Geht nicht" zeigt ein leichtes Kopfschütteln +
      // gedämpfte Deckkraft — keine rote Kontur mehr (auf Wunsch raus).
      const jitter = ok ? 0 : Math.sin(this.nowMs / 60) * L.cell * 0.045;
      ctx.save();
      ctx.translate(jitter, 0);
      drawPieceBody(ctx, cells, L.boardX, L.boardY, L.cell, shardDef(d.shard.name).color, {
        alpha: ok ? 0.96 : 0.55,
        scale: 1.03,
        glow: ok ? 20 : 0,
        selected: ok,
      });
      ctx.restore();
    } else {
      // big, follows the finger — deutlich über dem Touchpoint, sonst sitzt
      // der Daumen genau auf der Figur und man erkennt sie gar nicht
      this.drawShard(d.shard, d.px, d.py - L.cell * d.lift, L.cell * 1.05, true);
    }
  }

  // ── Input ────────────────────────────────────────────────────────────────
  private pt(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  private overBoard(x: number, y: number, L: Layout, lift = DRAG_LIFT_CELLS): boolean {
    // Die untere Grenze muss den Anheb-Versatz (DRAG_LIFT_CELLS) mit abdecken:
    // snappedFor() rechnet die Zielzeile aus `py - cell*DRAG_LIFT_CELLS` — um
    // unten auf die letzte Reihe zu treffen, muss der Finger also spürbar
    // TIEFER als das Brett selbst stehen. Ohne diesen Zuschlag galt der
    // Finger dort schon als "nicht mehr übers Brett", bevor die unterste
    // Reihe überhaupt erreichbar war — die Reihe war praktisch unbespielbar.
    return (
      x >= L.boardX - L.cell * 0.6 &&
      y >= L.boardY - L.cell * 0.6 &&
      x < L.boardX + L.cell * (this.game.cols + 0.6) &&
      y < L.boardY + L.cell * (this.game.rows + lift + 0.6)
    );
  }
  private boardCell(x: number, y: number, L: Layout): Pos {
    return {
      row: Math.round((y - L.boardY - L.cell / 2) / L.cell),
      col: Math.round((x - L.boardX - L.cell / 2) / L.cell),
    };
  }
  /** Anhebung für diese Figur: Mindestens `DRAG_LIFT_CELLS`, bei hohen Figuren
   *  so viel mehr, dass ihre Unterkante noch ~0,9 Zellen ÜBER dem Finger liegt --
   *  der Finger verdeckt dann nicht die Figur/das Zielfeld, man sieht das Brett. */
  private liftFor(shard: Shard): number {
    const cells = this.game.cells(shard);
    const cen = this.centroid(shard);
    let maxR = 0;
    for (const [dr] of cells) maxR = Math.max(maxR, dr);
    return Math.max(DRAG_LIFT_CELLS, maxR - cen.r + 0.5 + 0.9);
  }

  /**
   * Wohin die gezogene Figur einrastet. Unter Zeitdruck verklickt man sich
   * leicht -- das Einrasten ist darum bewusst großzügig und bevorzugt gute Züge:
   *  - Die Figur hängt `d.lift` Zellen ÜBER dem Finger (Zielzelle = Schwerpunkt).
   *  - Alle gültigen Positionen im Umfeld (3x3 um die gerundete Zielzelle)
   *    werden bewertet: eine Position, die Reihen/Spalten RÄUMT, gewinnt (je
   *    mehr, desto besser), wenn sie höchstens ~1,2 Zellen vom echten
   *    Finger-Ziel entfernt liegt; danach zählt Kontakt zu Wand und Steinen
   *    (sauberer Anschluss), danach die Nähe.
   *  - Ist die Zielzelle selbst belegt, rastet die Figur auf die nächste gültige
   *    Position (bis ~1,6 Zellen) ein, statt als Fehlwurf zu enden.
   *  - Ist die Zielzelle gültig und nichts in der Nähe räumt, bleibt es genau
   *    dort -- jede legale Position bleibt erreichbar.
   */
  private snappedFor(d: Drag, L: Layout): Pos {
    const fx = (d.px - L.boardX - L.cell / 2) / L.cell;
    const fy = (d.py - L.cell * d.lift - L.boardY - L.cell / 2) / L.cell;
    const t: Pos = { row: Math.round(fy), col: Math.round(fx) };
    const raw: Pos = { row: t.row - d.grabR, col: t.col - d.grabC };
    // unrundetes Ziel (obere linke Zelle der Figur) für echte Abstände
    const rawF = { row: fy - d.grabR, col: fx - d.grabC };

    const cells = this.game.cells(d.shard);
    let minR = 0;
    let maxR = 0;
    let minC = 0;
    let maxC = 0;
    for (const [dr, dc] of cells) {
      minR = Math.min(minR, dr);
      maxR = Math.max(maxR, dr);
      minC = Math.min(minC, dc);
      maxC = Math.max(maxC, dc);
    }
    // Zielposition immer so klemmen, dass die Figur komplett im Raster liegt.
    const clampPos = (p: Pos): Pos => ({
      row: Math.max(-minR, Math.min(this.game.rows - 1 - maxR, p.row)),
      col: Math.max(-minC, Math.min(this.game.cols - 1 - maxC, p.col)),
    });
    const clamped = clampPos(raw);
    const primaryValid = this.game.canPlace(d.shard, clamped);

    // Kontakt: Kanten der Figur, die an Wand oder belegte Zellen stoßen.
    const contactOf = (p: Pos): number => {
      const mine = new Set(cells.map(([dr, dc]) => (p.row + dr) * 1000 + (p.col + dc)));
      let n = 0;
      for (const [dr, dc] of cells) {
        for (const [ar, ac] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const r = p.row + dr + ar;
          const c = p.col + dc + ac;
          if (mine.has(r * 1000 + c)) continue;
          if (r < 0 || c < 0 || r >= this.game.rows || c >= this.game.cols || this.game.filled(r, c)) n++;
        }
      }
      return n;
    };

    const R_CLEAR = 1.2;
    const R_FALLBACK = 1.6;
    let best: Pos | null = null;
    let bestScore = -Infinity;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const cand = clampPos({ row: clamped.row + dr, col: clamped.col + dc });
        if (!this.game.canPlace(d.shard, cand)) continue;
        const lines = this.previewLines(d.shard, cand);
        const count = lines.rows.length + lines.cols.length;
        const isPrimary = cand.row === clamped.row && cand.col === clamped.col;
        // Ohne Räumen nur die Zielzelle selbst -- oder, wenn die belegt ist, der
        // nächste gültige Nachbar (Rettung vor dem Fehlwurf).
        if (count === 0 && !isPrimary && primaryValid) continue;
        const dist = Math.hypot(cand.row - rawF.row, cand.col - rawF.col);
        if (dist > (count > 0 ? R_CLEAR : R_FALLBACK)) continue;
        const score = count * 10 + contactOf(cand) * 0.3 - dist * 4;
        if (score > bestScore) {
          bestScore = score;
          best = cand;
        }
      }
    }
    return best ?? clamped;
  }

  private centroid(shard: Shard): { r: number; c: number } {
    const cells = this.game.cells(shard);
    let sr = 0;
    let sc = 0;
    for (const [r, c] of cells) {
      sr += r;
      sc += c;
    }
    return { r: Math.round(sr / cells.length), c: Math.round(sc / cells.length) };
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.layout || this.game.isOver || this.game.isPaused) return;
    const L = this.layout;
    const { x, y } = this.pt(e);

    if (this.tutorialShardId !== null) {
      // Dreh-Tutorial aktiv: Ablage + Brett bleiben tot, nur die eine
      // freigestellte Band-Scherbe reagiert -- `game.start()` bewusst NICHT
      // aufgerufen, die Runde steht still, bis app.ts das Tutorial beendet.
      if (x < L.beltX - 28) return;
      let nearest: Shard | null = null;
      let best = Infinity;
      for (const row of this.beltRows(L)) {
        const dist = Math.abs(y - row.cy);
        if (dist < best) {
          best = dist;
          nearest = row.shard;
        }
      }
      if (!nearest || nearest.id !== this.tutorialShardId) return;
      this.canvas.setPointerCapture(e.pointerId);
      const cen = this.centroid(nearest);
      this.drag = { shard: nearest, from: "belt", px: x, py: y, sx: x, sy: y, moved: false, lift: this.liftFor(nearest), grabR: cen.r, grabC: cen.c };
      if (this.tutorialGap) sfx.pickUp();
      return;
    }

    this.game.start();

    let shard: Shard | null = null;
    let from: "belt" | "hold" = "belt";

    // hold slot?
    if (
      this.game.hold &&
      x >= L.beltX - 20 &&
      y >= L.holdY - 12 &&
      y <= L.holdY + L.holdH + 12
    ) {
      shard = this.game.hold;
      from = "hold";
    } else if (x >= L.beltX - 28) {
      // anywhere in (or just left of) the belt column → nearest shard
      const rows = this.beltRows(L);
      let best = Infinity;
      for (const row of rows) {
        const dist = Math.abs(y - row.cy);
        if (dist < best) {
          best = dist;
          shard = row.shard;
        }
      }
    }
    if (!shard) return;

    this.canvas.setPointerCapture(e.pointerId);
    const cen = this.centroid(shard);
    this.drag = {
      shard,
      from,
      px: x,
      py: y,
      sx: x,
      sy: y,
      moved: false,
      lift: this.liftFor(shard),
      grabR: cen.r,
      grabC: cen.c,
    };
    sfx.pickUp();
    sfx.vibrate(8); // a tiny tick when a shard is picked up
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.drag) return;
    const { x, y } = this.pt(e);
    this.drag.px = x;
    this.drag.py = y;
    if (Math.hypot(x - this.drag.sx, y - this.drag.sy) > TAP_MOVE_PX) this.drag.moved = true;
  };

  private onUp = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || !this.layout) return;
    this.drag = null;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    const L = this.layout;
    let forcedSnap: Pos | null = null;

    if (this.tutorialShardId !== null) {
      if (d.shard.id !== this.tutorialShardId) return;
      if (!this.tutorialGap) {
        // Schritt 1 (Dreh-Tutorial): JEDE Berührung der freigestellten Scherbe
        // dreht sie -- auch ein leichtes Verrutschen zählt als Dreh-Tap, nie
        // als Platzierung (die Runde ist absichtlich noch nicht gestartet).
        this.game.rotate(d.shard);
        sfx.pickUp();
        this.onTutorialTap?.();
        return;
      }
      // Schritt 2: nur das Ziehen in die vorbereitete Lücke zählt, alles andere
      // springt zurück. Bewusst großzügig (±2 Zeilen, ±1 Spalte; die Scherbe schwebt ja über dem
      // Finger): wer der Hand folgt oder direkt auf die Lücke tippt, soll
      // nicht an einer Zelle Versatz scheitern. Passt es, rastet die Scherbe
      // exakt in die Lücke ein und der normale Platzier-Pfad läuft unten.
      const snapT = d.moved && this.overBoard(d.px, d.py, L, d.lift) ? this.snappedFor(d, L) : null;
      if (
        !snapT ||
        Math.abs(snapT.row - this.tutorialGap.row) > 2 ||
        Math.abs(snapT.col - this.tutorialGap.col) > 1
      ) {
        if (d.moved) sfx.invalid();
        return;
      }
      forcedSnap = this.tutorialGap;
    }

    // tap → rotate the shard in place. Nur an der Bewegung fest gemacht, NICHT
    // zusätzlich an einem Zeitlimit (Playtest-Bug B10): ein längeres, aber
    // ortsfestes Drücken wurde sonst als "konnte nicht platziert werden"
    // gewertet und warf die Scherbe versehentlich mit Fehlerton in die
    // Ablage, obwohl der Finger nie vom Fleck kam.
    if (!d.moved) {
      this.game.rotate(d.shard);
      sfx.pickUp();
      return;
    }

    if (this.overBoard(d.px, d.py, L, d.lift)) {
      const snap = forcedSnap ?? this.snappedFor(d, L);
      const rows = this.game.place(d.shard, snap);
      if (rows >= 0) {
        if (d.from === "belt") this.game.removeFromBelt(d.shard.id);
        else this.game.hold = null;
        sfx.place();
        sfx.vibrate(8);
        if (this.tutorialGap) {
          const done = this.onTutorialPlaced;
          this.endRotateTutorial();
          done?.();
        }
        // Knapp gerettet: die Scherbe war schon fast am Bandende.
        if (d.from === "belt" && d.shard.y >= BELT_SAVE_Y) {
          this.pops.push({
            x: L.boardX + (this.game.cols * L.cell) / 2,
            y: L.boardY + snap.row * L.cell,
            t: 0,
            text: "PHEW!",
            color: "#ffd24a",
            s: 1.9,
          });
          sfx.save();
          sfx.vibrate(20);
        }
        // Winziger Wackler bei jeder Platzierung — nur ein kurzer Ruck, spürbar
        // wenn man draufachtet, aber weit unter den Clear-/Combo-Wacklern.
        this.shake(3.5);
        this.placePop = { r: snap.row, c: snap.col, t: 0 };
        // Staub rings um die ganze Form, nicht nur an einem Punkt
        const cellsAbs = this.game
          .cells(d.shard)
          .map(([dr, dc]) => [snap.row + dr, snap.col + dc] as [number, number]);
        this.spawnDust(cellsAbs, L);
        // the burst / flash / "+N" pop are spawned in step() via consumeFreshClear
        return;
      }
    }
    // couldn't place → send to hold (from belt) or keep in hold
    if (d.from === "belt") {
      this.game.toHold(d.shard);
      sfx.invalid();
    }
  };
}
