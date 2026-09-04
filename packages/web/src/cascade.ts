/**
 * Kaskade — the speed mode.
 *
 * A fixed frame starts empty. Shards ride down a conveyor on the right; you drag
 * them onto the frame to cover cells. Fill a whole row and it ignites and
 * clears, freeing space. Cover as much as you can before the clock runs out;
 * score rewards speed (a multiplier that builds while you place cleanly and
 * resets when a shard falls off the belt).
 */

import { PENTOMINOES, type PentominoName, type Rng, rngFromSeed } from "@polyomino/puzzle-core";
import { PIECE_NAMES } from "./colors.js";

export const CASCADE_ROWS = 6;
export const CASCADE_COLS = 7;
const DURATION_MS = 90_000;
const BASE_SPAWN_MS = 2600;
const MIN_SPAWN_MS = 1300;
const BELT_TRAVEL_MS = 13_000; // time for a shard to ride top→bottom
const MAX_ON_BELT = 3;
const MIN_GAP_Y = 0.34; // spacing between shards on the belt

export interface Pos {
  row: number;
  col: number;
}

export interface Shard {
  id: number;
  name: PentominoName;
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
  private started: number | null = null;
  private extraMs = 0;
  private spawnTimer = 0;
  private spawnInterval = BASE_SPAWN_MS;
  private endedAt: number | null = null;

  constructor(seed: string) {
    this.rng = rngFromSeed(seed);
    this.belt.push(this.makeShard(0.72), this.makeShard(0.38), this.makeShard(0.04));
  }

  private makeShard(y: number): Shard {
    return {
      id: this.nextId++,
      name: this.rng.pick(PIECE_NAMES),
      orientationIndex: 0,
      y,
    };
  }

  start(): void {
    if (this.started === null) this.started = performance.now();
  }
  get isStarted(): boolean {
    return this.started !== null;
  }
  elapsedMs(): number {
    if (this.started === null) return 0;
    return (this.endedAt ?? performance.now()) - this.started;
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
    if (!this.isStarted || this.isOver) return;
    const speed = dt / (BELT_TRAVEL_MS / 1000);
    for (const s of this.belt) s.y += speed;

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
    const o = PENTOMINOES[shard.name].orientations;
    return o[shard.orientationIndex % o.length]!;
  }
  orientationCount(name: PentominoName): number {
    return PENTOMINOES[name].orientations.length;
  }
  colorIndex(name: PentominoName): number {
    return PIECE_NAMES.indexOf(name) + 1;
  }

  rotate(shard: Shard): void {
    shard.orientationIndex = (shard.orientationIndex + 1) % this.orientationCount(shard.name);
  }

  /** Move a belt shard into the hold slot, bumping any held shard back to the belt. */
  toHold(shard: Shard): void {
    this.belt = this.belt.filter((s) => s.id !== shard.id);
    if (this.hold) this.belt.unshift({ ...this.hold, y: 0 });
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

  coveredCells(): number {
    let n = 0;
    for (const v of this.board) if (v !== 0) n += 1;
    return n;
  }
}
