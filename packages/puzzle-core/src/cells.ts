/**
 * Geometry primitives for working with sets of grid cells.
 *
 * A shape — a puzzle piece or a target silhouette — is just a list of `[row, col]`
 * cells. Nothing here knows about a board origin; shapes are compared and
 * deduplicated in a normalized form (translated so the top-left of the bounding
 * box sits at `[0, 0]`, then sorted).
 */

/** A single grid cell as `[row, col]`. Rows increase downward, columns rightward. */
export type Cell = readonly [number, number];

/** An ordered list of cells describing one shape. */
export type CellList = readonly Cell[];

/** Sort cells row-major so two lists of the same cells compare equal element-wise. */
function sorted(cells: readonly Cell[]): Cell[] {
  return [...cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/**
 * Translate so the minimum row and minimum column are both 0, then sort row-major.
 * Two shapes that differ only by position (and cell order) normalize to the same list.
 */
export function normalize(cells: CellList): Cell[] {
  if (cells.length === 0) return [];
  let minRow = Infinity;
  let minCol = Infinity;
  for (const [row, col] of cells) {
    if (row < minRow) minRow = row;
    if (col < minCol) minCol = col;
  }
  return sorted(cells.map(([row, col]): Cell => [row - minRow, col - minCol]));
}

/** A canonical string for a shape, invariant to translation and cell order. */
export function cellKey(cells: CellList): string {
  return normalize(cells)
    .map(([row, col]) => `${row},${col}`)
    .join(";");
}

/** True if the two shapes cover exactly the same cells up to translation. */
export function cellsEqual(a: CellList, b: CellList): boolean {
  return a.length === b.length && cellKey(a) === cellKey(b);
}

/** Rotate 90° clockwise about the origin: `[row, col] -> [col, -row]`. Not normalized. */
export function rotate90(cells: CellList): Cell[] {
  return cells.map(([row, col]): Cell => [col, -row]);
}

/** Mirror across the vertical axis: `[row, col] -> [row, -col]`. Not normalized. */
export function reflect(cells: CellList): Cell[] {
  return cells.map(([row, col]): Cell => [row, -col]);
}

/** Shift every cell by `[dRow, dCol]`. */
export function translate(cells: CellList, dRow: number, dCol: number): Cell[] {
  return cells.map(([row, col]): Cell => [row + dRow, col + dCol]);
}

/**
 * Every distinct orientation of a shape under rotation and (optionally) reflection.
 * Each result is normalized; duplicates — e.g. the four rotations of the X pentomino —
 * are collapsed. Order is not significant.
 */
export function orientations(
  cells: CellList,
  { allowReflection = true }: { allowReflection?: boolean } = {},
): Cell[][] {
  const seen = new Map<string, Cell[]>();
  const starts = allowReflection ? [cells, reflect(cells)] : [cells];
  for (const start of starts) {
    let current: Cell[] = [...start];
    for (let turn = 0; turn < 4; turn++) {
      const norm = normalize(current);
      const key = norm.map(([row, col]) => `${row},${col}`).join(";");
      if (!seen.has(key)) seen.set(key, norm);
      current = rotate90(current);
    }
  }
  return [...seen.values()];
}

/** A geometric operation on a shape (does not normalize). */
export type Transform = (cells: CellList) => Cell[];

/**
 * The eight transforms of the dihedral group D4: the identity, three rotations,
 * and each of those composed with a mirror. Used to find a target shape's own
 * symmetries so the solver can count solutions up to symmetry.
 */
export function dihedralTransforms(): Transform[] {
  const r1: Transform = (cs) => rotate90(cs);
  const r2: Transform = (cs) => rotate90(rotate90(cs));
  const r3: Transform = (cs) => rotate90(rotate90(rotate90(cs)));
  return [
    (cs) => cs.map(([r, c]): Cell => [r, c]),
    r1,
    r2,
    r3,
    (cs) => reflect(cs),
    (cs) => r1(reflect(cs)),
    (cs) => r2(reflect(cs)),
    (cs) => r3(reflect(cs)),
  ];
}

/** True if all cells form a single edge-connected group (4-connectivity). */
export function isConnected(cells: CellList): boolean {
  if (cells.length <= 1) return true;
  const present = new Set(cells.map(([row, col]) => `${row},${col}`));
  const start = cells[0]!;
  const stack: Cell[] = [start];
  const visited = new Set<string>([`${start[0]},${start[1]}`]);
  while (stack.length > 0) {
    const [row, col] = stack.pop()!;
    for (const [dRow, dCol] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      const nRow = row + dRow;
      const nCol = col + dCol;
      const nKey = `${nRow},${nCol}`;
      if (present.has(nKey) && !visited.has(nKey)) {
        visited.add(nKey);
        stack.push([nRow, nCol]);
      }
    }
  }
  return visited.size === cells.length;
}
