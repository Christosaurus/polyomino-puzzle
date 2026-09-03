/** Target silhouettes for on-the-fly level generation (daily, descent). */

import { Shape } from "@polyomino/puzzle-core";

const ascii = (art: string): Shape => Shape.fromAscii(art);

export interface CatalogShape {
  shape: Shape;
  cells: number;
}

const RAW: Shape[] = [
  Shape.rectangle(2, 5),
  Shape.rectangle(3, 5),
  Shape.rectangle(4, 5),
  Shape.rectangle(5, 5),
  Shape.rectangle(3, 10),
  Shape.rectangle(4, 10),
  Shape.rectangle(5, 6),
  Shape.rectangle(5, 8),
  Shape.rectangle(5, 9),
  Shape.rectangle(5, 10),
  Shape.rectangle(5, 11),
  ascii(`
    ...##...
    ..####..
    .######.
    ########
  `),
  ascii(`
    ###.....
    ###.....
    ###.....
    ########
    ########
  `),
  ascii(`
    ###..###
    ########
    ########
    ########
  `),
  ascii(`
    .....##
    #######
    #######
    #######
    #######
  `),
];

export const SHAPES: CatalogShape[] = RAW.filter(
  (s) => s.size % 5 === 0 && s.size / 5 < 12,
).map((s) => ({ shape: s, cells: s.size }));

/** Shapes with exactly `pieceCount` pentominoes' worth of cells. */
export function shapesForPieceCount(pieceCount: number): CatalogShape[] {
  return SHAPES.filter((s) => s.cells === pieceCount * 5);
}
