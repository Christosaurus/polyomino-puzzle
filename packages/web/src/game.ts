/**
 * Runtime state for one "fill the frame" level (campaign / daily / descent).
 *
 * Pure geometry — no solver. A move is legal when the piece's cells all sit
 * inside the target shape and none overlap another placed piece. The level is
 * won when every target cell is covered.
 *
 * Time is a **countdown**. Run out before solving and the level fails.
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
  key: string;
  name: PentominoName;
  orientationIndex: number;
  pos: Pos | null;
}

function limitMsFor(level: Level): number {
  const pieces = level.pieces.length;
  const secs = (25 + pieces * 10) * (0.8 + level.difficulty * 0.14);
  return Math.round(secs) * 1000;
}

export class GameState {
  readonly level: Level;
  readonly shape: Shape;
  readonly pieces: PieceState[];
  limitMs: number;
  usedUndo = false;

  private readonly shapeCells: Set<string>;
  /** Piece name → its solution cells in the shape frame, sorted. */
  private readonly solutionCells = new Map<PentominoName, Array<[number, number]>>();
  private startedAt: number | null = null;
  private endedAt: number | null = null;

  constructor(level: Level, limitMsOverride?: number) {
    this.level = level;
    this.shape = levelShape(level);
    this.limitMs = limitMsOverride ?? limitMsFor(level);
    this.shapeCells = new Set(this.shape.cells.map(([r, c]) => `${r},${c}`));
    this.pieces = level.pieces.map((name, i) => ({
      key: `${name}#${i}`,
      name,
      orientationIndex: 0,
      pos: null,
    }));
    const { originRow, originCol } = level.shape;
    for (const s of level.solution) {
      this.solutionCells.set(
        s.pieceId,
        s.cells
          .map(([r, c]): [number, number] => [r - originRow, c - originCol])
          .sort((a, b) => a[0] - b[0] || a[1] - b[1]),
      );
    }
  }

  /** Add time (joker). */
  extendLimit(ms: number): void {
    this.limitMs += ms;
  }

  /** A piece that is either unplaced or sitting somewhere other than its solution spot. */
  firstUnsolved(): { piece: PieceState; cells: Array<[number, number]> } | null {
    for (const piece of this.pieces) {
      const target = this.solutionCells.get(piece.name);
      if (!target) continue;
      const here = piece.pos
        ? this.cellsAt(piece, piece.pos)
            .map(([r, c]): [number, number] => [r, c])
            .sort((a, b) => a[0] - b[0] || a[1] - b[1])
        : null;
      const matches =
        here !== null && here.every(([r, c], i) => r === target[i]![0] && c === target[i]![1]);
      if (!matches) return { piece, cells: target };
    }
    return null;
  }

  /** Solvent joker: pull every incorrectly placed piece back to the tray. Returns how many. */
  clearIncorrect(): number {
    let n = 0;
    for (const piece of this.pieces) {
      if (!piece.pos) continue;
      const target = this.solutionCells.get(piece.name);
      const here = this.cellsAt(piece, piece.pos)
        .map(([r, c]): [number, number] => [r, c])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const ok = target && here.every(([r, c], i) => r === target[i]![0] && c === target[i]![1]);
      if (!ok) {
        piece.pos = null;
        n += 1;
      }
    }
    return n;
  }

  markStarted(): void {
    if (this.startedAt === null) this.startedAt = performance.now();
  }
  get started(): boolean {
    return this.startedAt !== null;
  }

  elapsedMs(): number {
    if (this.startedAt === null) return 0;
    return (this.endedAt ?? performance.now()) - this.startedAt;
  }
  remainingMs(): number {
    return Math.max(0, this.limitMs - this.elapsedMs());
  }
  get timedOut(): boolean {
    return !this.isWon() && this.remainingMs() <= 0 && this.started;
  }

  /** 3 stars for finishing with lots of time left, then 2, then 1. */
  starRating(): number {
    if (this.timedOut) return 0;
    const frac = this.remainingMs() / this.limitMs;
    if (frac >= 0.55) return 3;
    if (frac >= 0.2) return 2;
    return 1;
  }

  orientationCount(name: PentominoName): number {
    return PENTOMINOES[name].orientations.length;
  }
  localCells(piece: PieceState): readonly Cell[] {
    const o = PENTOMINOES[piece.name].orientations;
    return o[piece.orientationIndex % o.length]!;
  }
  cellsAt(piece: PieceState, pos: Pos): Array<[number, number]> {
    return this.localCells(piece).map(([r, c]) => [r + pos.row, c + pos.col]);
  }

  private occupied(exceptKey?: string): Set<string> {
    const out = new Set<string>();
    for (const p of this.pieces) {
      if (!p.pos || p.key === exceptKey) continue;
      for (const [r, c] of this.cellsAt(p, p.pos)) out.add(`${r},${c}`);
    }
    return out;
  }

  canPlace(piece: PieceState, pos: Pos): boolean {
    const blocked = this.occupied(piece.key);
    for (const [r, c] of this.cellsAt(piece, pos)) {
      const key = `${r},${c}`;
      if (!this.shapeCells.has(key) || blocked.has(key)) return false;
    }
    return true;
  }

  place(piece: PieceState, pos: Pos): boolean {
    if (!this.canPlace(piece, pos)) return false;
    piece.pos = { ...pos };
    return true;
  }
  removeToTray(piece: PieceState): void {
    if (piece.pos) this.usedUndo = true;
    piece.pos = null;
  }
  nextOrientation(piece: PieceState): void {
    piece.orientationIndex = (piece.orientationIndex + 1) % this.orientationCount(piece.name);
    if (piece.pos && !this.canPlace(piece, piece.pos)) {
      piece.pos = null;
      this.usedUndo = true;
    }
  }

  get placedCount(): number {
    return this.pieces.filter((p) => p.pos).length;
  }
  isWon(): boolean {
    return this.occupied().size === this.shape.size;
  }
  finish(): void {
    if (this.endedAt === null) this.endedAt = performance.now();
  }
  reset(): void {
    for (const p of this.pieces) {
      p.pos = null;
      p.orientationIndex = 0;
    }
    this.startedAt = null;
    this.endedAt = null;
    this.usedUndo = false;
  }
}
