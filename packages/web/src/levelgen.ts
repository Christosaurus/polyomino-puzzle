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
  const pool =
    preferPieces && shapesForPieceCount(preferPieces).length > 0
      ? shapesForPieceCount(preferPieces)
      : SHAPES;
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
  return null;
}

/** The daily puzzle: deterministic from the calendar day, mid difficulty. */
export function dailyLevel(day: string): Level | null {
  return makeLevel(`daily:${day}`, 3);
}

/**
 * Descent level for a given depth — grows in pieces and difficulty. The first
 * few depths stay deliberately tiny so a run opens with a couple of easy,
 * confidence-building clears before it starts asking anything of you.
 */
export function descentLevel(depth: number, runSeed: string): Level | null {
  const pieces = Math.min(11, 2 + Math.floor((depth - 1) / 2));
  const difficulty = Math.min(5, 1 + Math.floor((depth - 1) / 3));
  return makeLevel(`${runSeed}:d${depth}`, difficulty, pieces);
}
