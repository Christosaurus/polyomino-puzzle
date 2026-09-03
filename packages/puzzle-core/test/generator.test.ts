import { describe, expect, it } from "vitest";
import { generateBatch, generateLevel } from "../src/generator.js";
import { levelShape, validateLevel } from "../src/level.js";
import { rngFromSeed } from "../src/rng.js";
import { Shape } from "../src/shape.js";
import { solvePentominoes } from "../src/solver.js";

const FIXED_NOW = () => new Date("2026-09-03T00:00:00.000Z");

describe("generateLevel — guards", () => {
  it("rejects a shape whose size is not a multiple of 5", () => {
    const res = generateLevel({ shape: Shape.rectangle(2, 3), rng: rngFromSeed("x"), seed: "x" });
    expect(res.failure).toBe("shape-not-divisible");
    expect(res.level).toBeNull();
  });

  it("rejects when the pool is smaller than the piece count", () => {
    const res = generateLevel({
      shape: Shape.rectangle(5, 5), // 25 cells → 5 pieces
      rng: rngFromSeed("x"),
      seed: "x",
      piecePool: ["I", "L", "N"],
    });
    expect(res.failure).toBe("pool-too-small");
    expect(res.level).toBeNull();
  });
});

describe("generateLevel — output", () => {
  it("builds a valid, uniquely-solvable level for the single-piece case", () => {
    const shape = Shape.fromAscii(`
      ###
      #..
      #..
    `); // the V pentomino silhouette
    const res = generateLevel({
      shape,
      rng: rngFromSeed("v"),
      seed: "v",
      piecePool: ["V"],
      now: FIXED_NOW,
    });
    expect(res.level).not.toBeNull();
    const level = res.level!;
    expect(validateLevel(level)).toEqual([]);
    expect(level.pieces).toEqual(["V"]);
    expect(level.difficulty).toBe(0); // unscored
    expect(level.meta.distinctSolutions).toBe(1);
    expect(level.meta.seed).toBe("v");
    expect(level.meta.createdAt).toBe("2026-09-03T00:00:00.000Z");
  });

  it("is deterministic for a given seed", () => {
    const make = () =>
      generateLevel({
        shape: Shape.rectangle(3, 5),
        rng: rngFromSeed("same-seed"),
        seed: "same-seed",
        now: FIXED_NOW,
      });
    expect(JSON.stringify(make().level)).toBe(JSON.stringify(make().level));
  });

  it("independently re-verifies uniqueness of every level it returns", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      const res = generateLevel({
        shape: Shape.rectangle(3, 5),
        rng: rngFromSeed(seed),
        seed,
        now: FIXED_NOW,
      });
      if (!res.level) {
        expect(res.failure).toBe("exhausted-attempts");
        continue;
      }
      expect(validateLevel(res.level)).toEqual([]);
      const check = solvePentominoes(levelShape(res.level), res.level.pieces, {
        solutionLimit: 3,
        countMode: "distinct",
      });
      expect(check.solutionCount).toBe(1);
    }
  });
});

describe("generateBatch", () => {
  it("produces several valid levels across a set of shapes", () => {
    const out = generateBatch({
      shapes: [
        { shape: Shape.rectangle(3, 5), label: "3x5" },
        { shape: Shape.rectangle(4, 5), label: "4x5" },
        { shape: Shape.rectangle(2, 5), label: "2x5" },
      ],
      baseSeed: "batch-1",
      count: 4,
      rng: rngFromSeed("batch-1"),
      maxAttempts: 120,
      now: FIXED_NOW,
    });
    expect(out.levels.length).toBeGreaterThan(0);
    for (const level of out.levels) expect(validateLevel(level)).toEqual([]);
    // Ids are unique within a batch.
    expect(new Set(out.levels.map((l) => l.id)).size).toBe(out.levels.length);
  });
});
