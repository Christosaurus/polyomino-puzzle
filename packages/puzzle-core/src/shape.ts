/**
 * A target silhouette — the region a level's pieces must fill exactly.
 *
 * Stored as a normalized set of cells (top-left of the bounding box at `[0, 0]`),
 * so any shape works: rectangles, but also L-shapes, shapes with holes, later
 * animated shapes. Nothing here assumes a rectangle.
 */

import {
  type Cell,
  type CellList,
  cellKey,
  dihedralTransforms,
  isConnected,
  normalize,
  type Transform,
} from "./cells.js";

const FILLED = "#Xx*█";

export class Shape {
  /** Normalized, row-major-sorted target cells. */
  readonly cells: readonly Cell[];
  /** Height of the bounding box. */
  readonly rows: number;
  /** Width of the bounding box. */
  readonly cols: number;

  private readonly present: Set<number>;

  private constructor(cells: readonly Cell[]) {
    this.cells = cells;
    let maxRow = 0;
    let maxCol = 0;
    for (const [row, col] of cells) {
      if (row > maxRow) maxRow = row;
      if (col > maxCol) maxCol = col;
    }
    this.rows = maxRow + 1;
    this.cols = maxCol + 1;
    this.present = new Set(cells.map(([row, col]) => row * this.cols + col));
  }

  /** Build from an explicit cell list. Throws on an empty list or a repeated cell. */
  static fromCells(cells: CellList): Shape {
    if (cells.length === 0) throw new Error("A shape needs at least one cell");
    const norm = normalize(cells);
    const seen = new Set<string>();
    for (const [row, col] of norm) {
      const k = `${row},${col}`;
      if (seen.has(k)) throw new Error(`Duplicate cell in shape: ${k}`);
      seen.add(k);
    }
    return new Shape(norm);
  }

  /** A solid `rows` × `cols` rectangle. */
  static rectangle(rows: number, cols: number): Shape {
    if (rows < 1 || cols < 1) throw new Error("Rectangle needs positive dimensions");
    const cells: Cell[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) cells.push([row, col]);
    }
    return new Shape(cells);
  }

  /**
   * Parse ASCII art. `#`, `X`, `x`, `*`, `█` are filled; everything else (space,
   * `.`) is empty. Blank leading/trailing lines are dropped and the common left
   * indentation is stripped, so a shape can be written naturally inside a
   * template literal.
   */
  static fromAscii(art: string): Shape {
    const lines = art.replace(/\r/g, "").split("\n");
    while (lines.length > 0 && lines[0]!.trim() === "") lines.shift();
    while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") lines.pop();
    if (lines.length === 0) throw new Error("Empty ASCII shape");

    const nonBlank = lines.filter((l) => l.trim() !== "");
    const indent = Math.min(...nonBlank.map((l) => l.match(/^ */)![0].length));

    const cells: Cell[] = [];
    lines.forEach((line, row) => {
      const body = line.slice(indent);
      for (let col = 0; col < body.length; col++) {
        if (FILLED.includes(body[col]!)) cells.push([row, col]);
      }
    });
    return Shape.fromCells(cells);
  }

  /** Number of cells to fill. */
  get size(): number {
    return this.cells.length;
  }

  /** Is `[row, col]` part of the target? */
  has(row: number, col: number): boolean {
    return (
      row >= 0 &&
      col >= 0 &&
      row < this.rows &&
      col < this.cols &&
      this.present.has(row * this.cols + col)
    );
  }

  /** True if the target is a single connected region (no detached islands). */
  isConnected(): boolean {
    return isConnected(this.cells);
  }

  /** Canonical key, invariant to translation. */
  key(): string {
    return cellKey(this.cells);
  }

  /**
   * The subset of D4 transforms under which this shape maps onto itself. Always
   * contains the identity. A 6×10 rectangle has 4; a square has 8; a fully
   * asymmetric blob has 1.
   */
  symmetries(): Transform[] {
    const target = this.key();
    return dihedralTransforms().filter((t) => cellKey(t(this.cells)) === target);
  }

  /** Render back to ASCII — handy for tests and debugging. */
  toAscii(filled = "#", empty = "."): string {
    const out: string[] = [];
    for (let row = 0; row < this.rows; row++) {
      let line = "";
      for (let col = 0; col < this.cols; col++) line += this.has(row, col) ? filled : empty;
      out.push(line);
    }
    return out.join("\n");
  }
}

export type { Cell, CellList };
