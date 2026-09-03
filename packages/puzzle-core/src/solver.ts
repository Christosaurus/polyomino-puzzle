/**
 * Exact-cover solver for "fill this shape with exactly these pieces".
 *
 * Knuth's Algorithm X with Dancing Links over a flat `Int32Array` node pool.
 * Columns are the target cells plus one per piece; rows are the legal placements.
 * Fast enough for pentomino-sized boards (≤ 60 cells): finding one solution or
 * proving a small level unique is near-instant; exhaustively counting a full
 * 60-cell board takes a few seconds.
 *
 * Two jobs:
 *   - the generator calls it to verify a level is solvable and to count how many
 *     solutions it has (uniqueness);
 *   - the game can call it for hints.
 *
 * "How many solutions" is counted **up to the target shape's own symmetry** by
 * default: a solution and its mirror image in a symmetric board are the same
 * puzzle answer.
 */

import { type Cell, type CellList, normalize } from "./cells.js";
import { ALL_PENTOMINOES, type PentominoName, pentomino } from "./pentomino.js";
import { Shape } from "./shape.js";

/** A piece the solver may use, with every orientation it is allowed to take. */
export interface SolverPiece {
  readonly id: string;
  readonly orientations: readonly CellList[];
}

/** One piece placed at absolute coordinates within the shape's frame. */
export interface Placement {
  readonly pieceId: string;
  readonly cells: readonly Cell[];
}

export type CountMode = "raw" | "distinct";

export interface SolveOptions {
  /** Stop once this many solutions have been found. Default 2 (enough for a uniqueness check). */
  solutionLimit?: number;
  /** `"distinct"` collapses solutions equal under the shape's symmetry; `"raw"` counts all. Default `"distinct"`. */
  countMode?: CountMode;
  /** Abort the search after this many nodes, as a runaway guard. Default 5,000,000. */
  maxNodes?: number;
}

export interface SolveResult {
  /** One representative per counted solution, up to `solutionLimit`. */
  solutions: Placement[][];
  /** Number of solutions found (per `countMode`). Exact when `exhausted` is true, otherwise capped at `solutionLimit`. */
  solutionCount: number;
  /** True if the whole search space was explored — then `solutionCount` is exact. */
  exhausted: boolean;
  /** Search-tree nodes visited. A cheap proxy for how hard the level is to solve by hand. */
  nodes: number;
  /** True if the search stopped at `maxNodes` before finishing. */
  hitNodeCap: boolean;
}

interface CompiledPlacement {
  readonly pieceIndex: number;
  /** Indices (0..N-1) of the target cells this placement covers. */
  readonly cellIds: readonly number[];
  readonly cells: readonly Cell[];
}

/**
 * Solve for a target `Shape` using named classic pentominoes (each at most once),
 * with rotation and reflection allowed.
 */
export function solvePentominoes(
  shape: Shape,
  pieceNames: readonly PentominoName[],
  options: SolveOptions = {},
): SolveResult {
  const pieces: SolverPiece[] = pieceNames.map((name) => ({
    id: name,
    orientations: pentomino(name).orientations,
  }));
  return solve(shape, pieces, options);
}

/** All 12 pentominoes as solver pieces — the full 60-cell set. */
export function allPentominoPieces(): SolverPiece[] {
  return ALL_PENTOMINOES.map((p) => ({ id: p.name, orientations: p.orientations }));
}

export function solve(
  shape: Shape,
  pieces: readonly SolverPiece[],
  options: SolveOptions = {},
): SolveResult {
  const solutionLimit = options.solutionLimit ?? 2;
  const countMode: CountMode = options.countMode ?? "distinct";
  const maxNodes = options.maxNodes ?? 5_000_000;

  const empty: SolveResult = {
    solutions: [],
    solutionCount: 0,
    exhausted: true,
    nodes: 0,
    hitNodeCap: false,
  };

  const totalPieceCells = pieces.reduce((sum, p) => sum + (p.orientations[0]?.length ?? 0), 0);
  if (pieces.length === 0 || totalPieceCells !== shape.size) {
    // The pieces cannot possibly tile the shape exactly.
    return empty;
  }

  // Index every target cell 0..N-1.
  const cellIndex = new Map<string, number>();
  shape.cells.forEach(([row, col], i) => cellIndex.set(`${row},${col}`, i));
  const cellCount = shape.cells.length;
  // Compile placements: every (piece, orientation, offset) that lands entirely inside the shape.
  const placements: CompiledPlacement[] = [];

  pieces.forEach((piece, pieceIndex) => {
    const seenOrientations = new Set<string>();
    for (const orientation of piece.orientations) {
      const norm = normalize(orientation);
      const oKey = norm.map(([r, c]) => `${r},${c}`).join(";");
      if (seenOrientations.has(oKey)) continue;
      seenOrientations.add(oKey);

      let height = 0;
      let width = 0;
      for (const [r, c] of norm) {
        if (r > height) height = r;
        if (c > width) width = c;
      }
      for (let dRow = 0; dRow + height < shape.rows; dRow++) {
        for (let dCol = 0; dCol + width < shape.cols; dCol++) {
          const cellIds: number[] = [];
          const cells: Cell[] = [];
          let fits = true;
          for (const [r, c] of norm) {
            const idx = cellIndex.get(`${r + dRow},${c + dCol}`);
            if (idx === undefined) {
              fits = false;
              break;
            }
            cellIds.push(idx);
            cells.push([r + dRow, c + dCol]);
          }
          if (fits) placements.push({ pieceIndex, cellIds, cells });
        }
      }
    }
  });

  // ── Exact cover via Dancing Links (Knuth's Algorithm X) ───────────────────
  // Columns: one per target cell (each covered exactly once), then one per piece
  // (each used exactly once). Rows: one per compiled placement. Column headers
  // track a live size, so choosing the most-constrained column is O(columns).
  const columnCount = cellCount + pieces.length;
  const nodeCount = 1 + columnCount + placements.reduce((s, p) => s + p.cellIds.length + 1, 0);

  const left = new Int32Array(nodeCount);
  const right = new Int32Array(nodeCount);
  const up = new Int32Array(nodeCount);
  const down = new Int32Array(nodeCount);
  const colOf = new Int32Array(nodeCount);
  const colSize = new Int32Array(nodeCount);
  const rowOf = new Int32Array(nodeCount).fill(-1);

  const ROOT = 0;
  left[ROOT] = ROOT;
  right[ROOT] = ROOT;
  let n = 1;

  // Column headers, in a ring anchored at the root.
  for (let c = 0; c < columnCount; c++) {
    const h = n++;
    colOf[h] = h;
    colSize[h] = 0;
    up[h] = h;
    down[h] = h;
    left[h] = left[ROOT]!;
    right[h] = ROOT;
    right[left[ROOT]!] = h;
    left[ROOT] = h;
  }
  const headerFor = (c: number): number => 1 + c;

  // One row of DLX nodes per placement: its cell columns plus its piece column.
  placements.forEach((p, rowId) => {
    const columns = [...p.cellIds, cellCount + p.pieceIndex];
    let rowStart = -1;
    for (const c of columns) {
      const h = headerFor(c);
      const node = n++;
      rowOf[node] = rowId;
      colOf[node] = h;
      down[node] = h;
      up[node] = up[h]!;
      down[up[h]!] = node;
      up[h] = node;
      colSize[h] = colSize[h]! + 1;
      if (rowStart === -1) {
        rowStart = node;
        left[node] = node;
        right[node] = node;
      } else {
        left[node] = left[rowStart]!;
        right[node] = rowStart;
        right[left[rowStart]!] = node;
        left[rowStart] = node;
      }
    }
  });

  const cover = (c: number): void => {
    right[left[c]!] = right[c]!;
    left[right[c]!] = left[c]!;
    for (let i = down[c]!; i !== c; i = down[i]!) {
      for (let j = right[i]!; j !== i; j = right[j]!) {
        up[down[j]!] = up[j]!;
        down[up[j]!] = down[j]!;
        const cj = colOf[j]!;
        colSize[cj] = colSize[cj]! - 1;
      }
    }
  };

  const uncover = (c: number): void => {
    for (let i = up[c]!; i !== c; i = up[i]!) {
      for (let j = left[i]!; j !== i; j = left[j]!) {
        const cj = colOf[j]!;
        colSize[cj] = colSize[cj]! + 1;
        up[down[j]!] = j;
        down[up[j]!] = j;
      }
    }
    right[left[c]!] = c;
    left[right[c]!] = c;
  };

  const symmetries = countMode === "distinct" ? shape.symmetries() : null;
  const seenCanonical = new Set<string>();
  const representatives: Placement[][] = [];
  let solutionCount = 0;
  let nodes = 0;
  let hitNodeCap = false;
  const chosenRows: number[] = [];

  const record = (): void => {
    const solution: Placement[] = chosenRows.map((rowId) => {
      const p = placements[rowId]!;
      return { pieceId: pieces[p.pieceIndex]!.id, cells: p.cells };
    });
    if (symmetries) {
      const canonical = canonicalKey(shape, solution, symmetries);
      if (seenCanonical.has(canonical)) return;
      seenCanonical.add(canonical);
    }
    solutionCount += 1;
    if (representatives.length < solutionLimit) representatives.push(solution);
  };

  const search = (): void => {
    if (hitNodeCap || solutionCount >= solutionLimit) return;
    nodes += 1;
    if (nodes > maxNodes) {
      hitNodeCap = true;
      return;
    }
    if (right[ROOT] === ROOT) {
      record();
      return;
    }

    // Most-constrained column: smallest live size.
    let chosen = -1;
    let best = Infinity;
    for (let h = right[ROOT]!; h !== ROOT; h = right[h]!) {
      const s = colSize[h]!;
      if (s < best) {
        best = s;
        chosen = h;
        if (s <= 1) break;
      }
    }
    if (chosen === -1 || best === 0) return; // a column with no rows — dead end

    cover(chosen);
    for (let r = down[chosen]!; r !== chosen; r = down[r]!) {
      chosenRows.push(rowOf[r]!);
      for (let j = right[r]!; j !== r; j = right[j]!) cover(colOf[j]!);

      search();

      for (let j = left[r]!; j !== r; j = left[j]!) uncover(colOf[j]!);
      chosenRows.pop();
      if (hitNodeCap || solutionCount >= solutionLimit) break;
    }
    uncover(chosen);
  };

  search();

  // The search only stops early when it hits the node cap or reaches the
  // solution limit. If neither happened, every branch was explored.
  const exhausted = !hitNodeCap && solutionCount < solutionLimit;

  return {
    solutions: representatives,
    solutionCount,
    exhausted,
    nodes,
    hitNodeCap,
  };
}

/**
 * A translation-independent key for a solution, minimized over the shape's
 * symmetries so that a solution and its symmetric images share one key.
 */
function canonicalKey(
  shape: Shape,
  solution: readonly Placement[],
  symmetries: readonly ((cells: CellList) => Cell[])[],
): string {
  let best: string | null = null;
  for (const t of symmetries) {
    // Transform every cell of every piece together, then retranslate the whole
    // board consistently (min row/col over all cells).
    const tagged: { pieceId: string; cells: Cell[] }[] = solution.map((pl) => ({
      pieceId: pl.pieceId,
      cells: t(pl.cells),
    }));
    let minRow = Infinity;
    let minCol = Infinity;
    for (const g of tagged) {
      for (const [r, c] of g.cells) {
        if (r < minRow) minRow = r;
        if (c < minCol) minCol = c;
      }
    }
    const serialized = tagged
      .map((g) => {
        const cells = g.cells
          .map(([r, c]): Cell => [r - minRow, c - minCol])
          .sort((a, b) => a[0] - b[0] || a[1] - b[1])
          .map(([r, c]) => `${r},${c}`)
          .join(" ");
        return `${g.pieceId}:${cells}`;
      })
      .sort()
      .join("|");
    if (best === null || serialized < best) best = serialized;
  }
  return best ?? "";
}
