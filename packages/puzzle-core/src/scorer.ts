/**
 * Difficulty scoring.
 *
 * `scoreLevel` turns a level into a bundle of signals plus one combined `score`.
 * The signals matter more than the exact score — the weights here are a starting
 * point, to be re-tuned against real solve-time telemetry once the game ships.
 *
 * Absolute score thresholds don't transfer as the generator changes, so levels
 * are bucketed by *percentile* across a batch (`bucketByPercentile`), not by
 * fixed cutoffs.
 */

import { levelShape, type Level } from "./level.js";
import { ALL_PENTOMINOES } from "./pentomino.js";
import { analyzeDifficulty, type SolverPiece } from "./solver.js";

export interface DifficultySignals {
  pieceCount: number;
  /** Solver search nodes for the uniqueness check (from the level meta). */
  solverNodes: number;
  /** 0–1: fraction of the level deducible without guessing. Higher = easier. */
  forcedMoveFraction: number;
  /** Mean legal-placement count at the tightest cell during a guided solve. */
  meanBranching: number;
  maxBranching: number;
  /** 0–1: how much of the bounding box is *not* part of the shape. Concave/holey shapes read as harder. */
  hollowness: number;
  /** Combined score, roughly 0–1, higher = harder. */
  score: number;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export function scoreLevel(level: Level): DifficultySignals {
  const shape = levelShape(level);
  const pieces: SolverPiece[] = level.pieces.map((name) => {
    const p = ALL_PENTOMINOES.find((pp) => pp.name === name);
    if (!p) throw new Error(`Unknown piece in level ${level.id}: ${name}`);
    return { id: p.name, orientations: p.orientations };
  });

  const { originRow, originCol } = level.shape;
  const solution = level.solution.map((pl) => ({
    pieceId: pl.pieceId,
    cells: pl.cells.map(([r, c]): [number, number] => [r - originRow, c - originCol]),
  }));

  const analysis = analyzeDifficulty(shape, pieces, solution);

  const bboxArea = shape.rows * shape.cols;
  const hollowness = bboxArea > 0 ? (bboxArea - shape.size) / bboxArea : 0;

  const pieceCount = level.pieces.length;
  const solverNodes = Math.max(1, level.meta.solverNodes);

  const score =
    0.4 * clamp01(Math.log10(solverNodes) / 5) + // ~100k nodes → 1.0
    0.25 * (1 - analysis.forcedMoveFraction) +
    0.15 * clamp01((analysis.meanBranching - 1) / 5) +
    0.1 * clamp01(pieceCount / 12) +
    0.1 * clamp01(hollowness * 2);

  return {
    pieceCount,
    solverNodes,
    forcedMoveFraction: analysis.forcedMoveFraction,
    meanBranching: analysis.meanBranching,
    maxBranching: analysis.maxBranching,
    hollowness,
    score,
  };
}

export interface ScoredLevel {
  level: Level;
  signals: DifficultySignals;
}

/**
 * Score every level and assign `difficulty` 1..`bucketCount` by score percentile.
 * Mutates each level's `difficulty`. Returns the scored levels sorted easiest first.
 */
export function bucketByPercentile(
  levels: readonly Level[],
  bucketCount = 5,
): ScoredLevel[] {
  const scored: ScoredLevel[] = levels.map((level) => ({ level, signals: scoreLevel(level) }));
  scored.sort((a, b) => a.signals.score - b.signals.score);

  const n = scored.length;
  scored.forEach((entry, i) => {
    entry.level.difficulty =
      n <= 1 ? 1 : Math.min(bucketCount, 1 + Math.floor((i / n) * bucketCount));
  });
  return scored;
}
