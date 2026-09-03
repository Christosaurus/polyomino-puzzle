/**
 * Level generator — works backwards from a solution.
 *
 * Given a target shape, it picks a random subset of pentominoes that fills the
 * shape's cell count, checks whether that subset actually tiles the shape, and
 * then checks the tiling is *unique* (up to the shape's symmetry). Subsets that
 * don't tile, or tile more than one way, are discarded. What survives is a clean
 * level with exactly one intended answer.
 *
 * This is the part with the most tuning headroom: which shapes, which subsets,
 * and how strict the uniqueness rule is all shape how the finished levels feel.
 */

import { ALL_PENTOMINOES, type PentominoName } from "./pentomino.js";
import { buildLevel, type Level, type LevelMeta, validateLevel } from "./level.js";
import { hashString, type Rng } from "./rng.js";
import type { Shape } from "./shape.js";
import { solvePentominoes } from "./solver.js";

const PENTOMINO_CELLS = 5;
const ALL_NAMES: readonly PentominoName[] = ALL_PENTOMINOES.map((p) => p.name);

export interface GenerateOptions {
  shape: Shape;
  rng: Rng;
  /** Seed string, recorded in the level meta. */
  seed: string;
  /** Names the generator may draw from. Default: all 12 pentominoes. */
  piecePool?: readonly PentominoName[];
  /** How many random subsets to try before giving up. Default 300. */
  maxAttempts?: number;
  /**
   * A level is kept only if it has exactly this many distinct solutions.
   * Default 1 (strictly unique).
   */
  targetDistinctSolutions?: number;
  /** Node cap for the uniqueness check; a level that can't be verified within it is rejected. Default 2,000,000. */
  maxSolverNodes?: number;
  generatorVersion?: string;
  /** Overrides `createdAt` in the meta (for reproducible tests). */
  now?: () => Date;
}

export type GenerateFailure = "shape-not-divisible" | "pool-too-small" | "exhausted-attempts";

export interface GenerateResult {
  level: Level | null;
  attempts: number;
  /** Attempts that produced no tiling at all. */
  noTiling: number;
  /** Attempts that tiled but not uniquely. */
  ambiguous: number;
  failure?: GenerateFailure;
}

export function generateLevel(options: GenerateOptions): GenerateResult {
  const {
    shape,
    rng,
    seed,
    piecePool = ALL_NAMES,
    maxAttempts = 300,
    targetDistinctSolutions = 1,
    maxSolverNodes = 2_000_000,
    generatorVersion = "0.1.0",
    now = () => new Date(),
  } = options;

  const result: GenerateResult = { level: null, attempts: 0, noTiling: 0, ambiguous: 0 };

  if (shape.size % PENTOMINO_CELLS !== 0) {
    return { ...result, failure: "shape-not-divisible" };
  }
  const pieceCount = shape.size / PENTOMINO_CELLS;
  if (pieceCount > piecePool.length) {
    return { ...result, failure: "pool-too-small" };
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    result.attempts = attempt;
    const subset = rng.sample(piecePool, pieceCount);

    const first = solvePentominoes(shape, subset, {
      solutionLimit: 1,
      countMode: "raw",
      maxNodes: maxSolverNodes,
    });
    if (first.solutionCount === 0 || first.solutions.length === 0) {
      result.noTiling += 1;
      continue;
    }

    const uniqueness = solvePentominoes(shape, subset, {
      solutionLimit: targetDistinctSolutions + 1,
      countMode: "distinct",
      maxNodes: maxSolverNodes,
    });
    if (uniqueness.hitNodeCap) {
      result.ambiguous += 1; // couldn't prove it — treat as unusable
      continue;
    }
    if (uniqueness.solutionCount !== targetDistinctSolutions) {
      result.ambiguous += 1;
      continue;
    }

    const solution = first.solutions[0]!.map((p) => ({
      pieceId: p.pieceId as PentominoName,
      cells: p.cells,
    }));

    const meta: LevelMeta = {
      generatorVersion,
      seed,
      solutionCountChecked: targetDistinctSolutions + 1,
      distinctSolutions: uniqueness.solutionCount,
      solverNodes: uniqueness.nodes,
      createdAt: now().toISOString(),
    };

    const id = `L${(hashString(`${seed}|${shape.key()}|${subset.join(",")}`) >>> 0)
      .toString(36)
      .padStart(7, "0")}`;

    const level = buildLevel({
      id,
      shape,
      pieces: subset,
      allowReflection: true,
      solution,
      meta,
    });

    const errors = validateLevel(level);
    if (errors.length > 0) {
      // A generated level that fails its own validation is a bug — surface it.
      throw new Error(`Generated level ${id} is invalid:\n  - ${errors.join("\n  - ")}`);
    }

    result.level = level;
    return result;
  }

  return { ...result, failure: "exhausted-attempts" };
}

export interface GenerateBatchOptions extends Omit<GenerateOptions, "shape" | "seed"> {
  /** Shapes to generate levels for, tried in order. */
  shapes: ReadonlyArray<{ shape: Shape; label?: string }>;
  /** Base seed; each level uses `${baseSeed}#${index}`. */
  baseSeed: string;
  /** How many levels to produce in total. */
  count: number;
}

export interface GenerateBatchResult {
  levels: Level[];
  /** Per-attempt diagnostics, useful for tuning the generator. */
  attempts: number;
  noTiling: number;
  ambiguous: number;
  failures: number;
}

/** Generate `count` levels, cycling through `shapes`. */
export function generateBatch(options: GenerateBatchOptions): GenerateBatchResult {
  const { shapes, baseSeed, count, rng, ...rest } = options;
  if (shapes.length === 0) throw new Error("generateBatch needs at least one shape");

  const out: GenerateBatchResult = {
    levels: [],
    attempts: 0,
    noTiling: 0,
    ambiguous: 0,
    failures: 0,
  };

  for (let i = 0; out.levels.length < count && i < count * 20; i++) {
    const entry = shapes[i % shapes.length]!;
    const res = generateLevel({
      ...rest,
      rng,
      shape: entry.shape,
      seed: `${baseSeed}#${i}`,
    });
    out.attempts += res.attempts;
    out.noTiling += res.noTiling;
    out.ambiguous += res.ambiguous;
    if (res.level) out.levels.push(res.level);
    else out.failures += 1;
  }

  return out;
}
