/**
 * The classic 12 free pentominoes and their orientations.
 *
 * Each piece is stored in one base orientation (normalized). Rotation and
 * reflection are both allowed in this game, so a piece is used through all of
 * its distinct orientations — 8 for the chiral pieces, fewer for the symmetric
 * ones (X has just 1).
 */

import { type Cell, type CellList, normalize, orientations } from "./cells.js";

export type PentominoName =
  | "F"
  | "I"
  | "L"
  | "N"
  | "P"
  | "T"
  | "U"
  | "V"
  | "W"
  | "X"
  | "Y"
  | "Z";

export const PENTOMINO_NAMES: readonly PentominoName[] = [
  "F",
  "I",
  "L",
  "N",
  "P",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
];

/**
 * Base shapes, drawn in a natural orientation. Coordinates are `[row, col]`.
 * Every entry has 5 edge-connected cells; the unit tests assert this.
 *
 *   F  .##    I  #    L  #.    N  .#    P  ##    T  ###
 *      ##.       #       #.       .#       ##        .#.
 *      .#.       #       #.       ##       #.        .#.
 *                #       ##       #.
 *                #
 *
 *   U  #.#    V  #..    W  #..    X  .#.    Y  .#    Z  ##.
 *      ###       #..       ##.       ###       ##       .#.
 *                ###       .##       .#.       .#       .##
 *                                              .#
 */
const RAW: Record<PentominoName, readonly [number, number][]> = {
  F: [
    [0, 1],
    [0, 2],
    [1, 0],
    [1, 1],
    [2, 1],
  ],
  I: [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
  ],
  L: [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [3, 1],
  ],
  N: [
    [0, 1],
    [1, 1],
    [2, 0],
    [2, 1],
    [3, 0],
  ],
  P: [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
    [2, 0],
  ],
  T: [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 1],
    [2, 1],
  ],
  U: [
    [0, 0],
    [0, 2],
    [1, 0],
    [1, 1],
    [1, 2],
  ],
  V: [
    [0, 0],
    [1, 0],
    [2, 0],
    [2, 1],
    [2, 2],
  ],
  W: [
    [0, 0],
    [1, 0],
    [1, 1],
    [2, 1],
    [2, 2],
  ],
  X: [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, 2],
    [2, 1],
  ],
  Y: [
    [0, 1],
    [1, 0],
    [1, 1],
    [2, 1],
    [3, 1],
  ],
  Z: [
    [0, 0],
    [0, 1],
    [1, 1],
    [2, 1],
    [2, 2],
  ],
};

export interface Pentomino {
  readonly name: PentominoName;
  /** Base orientation, normalized. */
  readonly cells: readonly Cell[];
  /** Every distinct orientation under rotation and reflection, each normalized. */
  readonly orientations: readonly (readonly Cell[])[];
}

function build(name: PentominoName): Pentomino {
  const cells = normalize(RAW[name]);
  return { name, cells, orientations: orientations(cells, { allowReflection: true }) };
}

export const PENTOMINOES: Record<PentominoName, Pentomino> = Object.fromEntries(
  PENTOMINO_NAMES.map((name) => [name, build(name)]),
) as Record<PentominoName, Pentomino>;

/** All 12 pentominoes as a list, in canonical `F..Z` order. */
export const ALL_PENTOMINOES: readonly Pentomino[] = PENTOMINO_NAMES.map(
  (name) => PENTOMINOES[name],
);

/** Total cell count of the full set — 60, i.e. a 6×10 rectangle. */
export const PENTOMINO_SET_CELL_COUNT = 60;

/** Look up a piece by name, throwing on an unknown name. */
export function pentomino(name: PentominoName): Pentomino {
  const piece = PENTOMINOES[name];
  if (!piece) throw new Error(`Unknown pentomino: ${name}`);
  return piece;
}

export type { Cell, CellList };
