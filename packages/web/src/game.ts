/**
 * Runtime game state for one level.
 *
 * Pure geometry — no solver. A move is legal when the piece's cells all sit
 * inside the target shape and none overlap another placed piece. The level is
 * won when every target cell is covered (piece sizes sum to the shape size, so
 * that also means every piece is placed).
 */

import {
  type Cell,
  type Level,
  levelShape,
  PENTOMINOES,
  type PentominoName,
  type Shape,
} from "@polyomino/puzzle-core";

export interface Pos {
  row: number;
  col: number;
}

export interface PieceState {
  /** Unique instance key (a level can repeat a pentomino name). */
  key: string;
  name: PentominoName;
  orientationIndex: number;
  /** Board position of the piece's local (0,0), or null while in the tray. */
  pos: Pos | null;
}

/** Target solve time per difficulty (1..5), in seconds — beat it for 3 stars. */
const PAR_SECONDS = [0, 40, 70, 110, 160, 240];

export class GameState {
  readonly level: Level;
  readonly shape: Shape;
  readonly pieces: PieceState[];
  readonly parSeconds: number;
  private readonly shapeCells: Set<string>;
  private startedAt: number | null = null;
  private finishedAt: number | null = null;

  constructor(level: Level) {
    this.level = level;
    this.shape = levelShape(level);
    this.parSeconds = PAR_SECONDS[level.difficulty] ?? 120;
    this.shapeCells = new Set(this.shape.cells.map(([r, c]) => `${r},${c}`));
    this.pieces = level.pieces.map((name, i) => ({
      key: `${name}#${i}`,
      name,
      orientationIndex: 0,
      pos: null,
    }));
  }

  /** Start the clock on the player's first action. */
  markStarted(): void {
    if (this.startedAt === null) this.startedAt = performance.now();
  }

  get started(): boolean {
    return this.startedAt !== null;
  }

  elapsedMs(): number {
    if (this.startedAt === null) return 0;
    return (this.finishedAt ?? performance.now()) - this.startedAt;
  }

  /** 3 stars for beating par, 2 for under 2× par, 1 otherwise. */
  starRating(): number {
    const seconds = this.elapsedMs() / 1000;
    if (seconds <= this.parSeconds) return 3;
    if (seconds <= this.parSeconds * 2) return 2;
    return 1;
  }

  orientationCount(name: PentominoName): number {
    return PENTOMINOES[name].orientations.length;
  }

  /** Local cells (normalized to 0,0) of a piece in its current orientation. */
  localCells(piece: PieceState): readonly Cell[] {
    const orientations = PENTOMINOES[piece.name].orientations;
    return orientations[piece.orientationIndex % orientations.length]!;
  }

  /** Absolute cells if the piece were at `pos`. */
  cellsAt(piece: PieceState, pos: Pos): Array<[number, number]> {
    return this.localCells(piece).map(([r, c]) => [r + pos.row, c + pos.col]);
  }

  private occupied(exceptKey?: string): Set<string> {
    const out = new Set<string>();
    for (const piece of this.pieces) {
      if (!piece.pos || piece.key === exceptKey) continue;
      for (const [r, c] of this.cellsAt(piece, piece.pos)) out.add(`${r},${c}`);
    }
    return out;
  }

  canPlace(piece: PieceState, pos: Pos): boolean {
    const blocked = this.occupied(piece.key);
    for (const [r, c] of this.cellsAt(piece, pos)) {
      const key = `${r},${c}`;
      if (!this.shapeCells.has(key)) return false;
      if (blocked.has(key)) return false;
    }
    return true;
  }

  place(piece: PieceState, pos: Pos): boolean {
    if (!this.canPlace(piece, pos)) return false;
    piece.pos = { ...pos };
    return true;
  }

  removeToTray(piece: PieceState): void {
    piece.pos = null;
  }

  /** Cycle to the next orientation; if that makes a placed piece illegal, send it back to the tray. */
  nextOrientation(piece: PieceState): void {
    piece.orientationIndex = (piece.orientationIndex + 1) % this.orientationCount(piece.name);
    if (piece.pos && !this.canPlace(piece, piece.pos)) piece.pos = null;
  }

  get placedCount(): number {
    return this.pieces.filter((p) => p.pos).length;
  }

  isWon(): boolean {
    return this.occupied().size === this.shape.size;
  }

  /** Freeze the timer — call once, when the level is solved. */
  finish(): void {
    if (this.finishedAt === null) this.finishedAt = performance.now();
  }

  reset(): void {
    for (const piece of this.pieces) {
      piece.pos = null;
      piece.orientationIndex = 0;
    }
    this.startedAt = null;
    this.finishedAt = null;
  }
}
