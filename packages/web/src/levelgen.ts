/** On-device level generation for the daily puzzle and the endless Descent. */

import { generateLevel, type Level, rngFromSeed } from "@polyomino/puzzle-core";
import { SHAPES, shapesForPieceCount } from "./shapes.js";

/**
 * Generate one solvable, uniquely-solvable level from a seed. Tries a few shapes
 * so a given seed reliably yields something. `difficulty` (1..5) is stamped on
 * the level so the timer and star thresholds scale.
 */
export function makeLevel(seed: string, difficulty: number, preferPieces?: number): Level | null {
  const rng = rngFromSeed(seed);
  const preferred = preferPieces ? shapesForPieceCount(preferPieces) : [];
  // try the preferred piece-count first, but never let a sparse/awkward pool
  // (e.g. the catalog has only one 2-piece shape, and a bare 2x5 rectangle
  // almost never has a unique pentomino-pair tiling) fail the whole level —
  // fall back to the full catalog rather than returning null.
  const pools = preferred.length > 0 ? [preferred, SHAPES] : [SHAPES];
  for (const pool of pools) {
    const order = rng.shuffle([...pool]);
    for (const entry of order) {
      const res = generateLevel({
        shape: entry.shape,
        rng: rngFromSeed(`${seed}:${entry.cells}`),
        seed,
        maxAttempts: 160,
        maxSolverNodes: 400_000,
        now: () => new Date(),
      });
      if (res.level) {
        res.level.difficulty = Math.max(1, Math.min(5, difficulty));
        return res.level;
      }
    }
  }
  return null;
}

/** The daily puzzle: deterministic from the calendar day, mid difficulty. */
export function dailyLevel(day: string): Level | null {
  return makeLevel(`daily:${day}`, 3);
}

/**
 * Descent level for a given depth and rotation `variant`. Pieces and difficulty
 * grow with depth; the first few depths stay at the smallest reliably-
 * generatable size (3 pentominoes — the catalog's only 2-piece shape, a bare
 * 2x5 rectangle, essentially never has a unique tiling, so `makeLevel` returns
 * null for it almost every time) so a run opens with a couple of easy,
 * confidence-building clears before it starts asking anything of you.
 *
 * `variant` (0..DESCENT_VARIANTS-1) picks one of several curated seeds per depth
 * so consecutive runs don't replay the exact same level sequence — each stays
 * at its depth's difficulty, it's just a different puzzle.
 */
export function descentDifficulty(depth: number): number {
  return Math.min(5, 1 + Math.floor((depth - 1) / 3));
}

export function descentLevel(depth: number, variant: number): Level | null {
  const pieces = Math.min(11, 3 + Math.floor((depth - 1) / 3));
  return makeLevel(`descent:v${variant}:d${depth}`, descentDifficulty(depth), pieces);
}
