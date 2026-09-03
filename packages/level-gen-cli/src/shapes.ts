/**
 * The catalogue of target silhouettes the generator draws from.
 *
 * Every shape's cell count must be a multiple of 5 (one pentomino = 5 cells) and
 * strictly fewer than 60 (a 60-cell board forces the whole 12-piece set, which
 * is never uniquely solvable). Shapes that break these rules are filtered out in
 * `main.ts` with a warning.
 */

import { Shape } from "@polyomino/puzzle-core";

export interface CatalogShape {
  label: string;
  shape: Shape;
}

const ascii = (label: string, art: string): CatalogShape => ({ label, shape: Shape.fromAscii(art) });

export const SHAPE_CATALOG: CatalogShape[] = [
  { label: "rect-2x5", shape: Shape.rectangle(2, 5) },
  { label: "rect-3x5", shape: Shape.rectangle(3, 5) },
  { label: "rect-4x5", shape: Shape.rectangle(4, 5) },
  { label: "rect-5x5", shape: Shape.rectangle(5, 5) },
  { label: "rect-3x10", shape: Shape.rectangle(3, 10) },
  { label: "rect-4x10", shape: Shape.rectangle(4, 10) },
  { label: "rect-5x6", shape: Shape.rectangle(5, 6) },
  { label: "rect-5x8", shape: Shape.rectangle(5, 8) },
  { label: "rect-5x9", shape: Shape.rectangle(5, 9) },
  { label: "rect-5x10", shape: Shape.rectangle(5, 10) },
  { label: "rect-5x11", shape: Shape.rectangle(5, 11) },

  // Concave silhouettes — chunkier than a thin frame so pentominoes still fit.
  // Cell counts verified: 20, 25, 30, 30.
  ascii(
    "triangle-20",
    `
      ...##...
      ..####..
      .######.
      ########
    `,
  ),
  ascii(
    "ell-25",
    `
      ###.....
      ###.....
      ###.....
      ########
      ########
    `,
  ),
  ascii(
    "notch-30",
    `
      ###..###
      ########
      ########
      ########
    `,
  ),
  ascii(
    "step-30",
    `
      .....##
      #######
      #######
      #######
      #######
    `,
  ),
];
