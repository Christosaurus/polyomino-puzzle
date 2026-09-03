import { describe, expect, it } from "vitest";
import { generateBatch } from "../src/generator.js";
import type { Level } from "../src/level.js";
import { rngFromSeed } from "../src/rng.js";
import { bucketByPercentile, scoreLevel } from "../src/scorer.js";
import { Shape } from "../src/shape.js";

function sampleLevels(count: number, seed: string): Level[] {
  return generateBatch({
    shapes: [
      { shape: Shape.rectangle(3, 5) },
      { shape: Shape.rectangle(4, 5) },
      { shape: Shape.rectangle(5, 5) },
      { shape: Shape.rectangle(5, 6) },
    ],
    baseSeed: seed,
    count,
    rng: rngFromSeed(seed),
    maxAttempts: 150,
    now: () => new Date("2026-09-03T00:00:00.000Z"),
  }).levels;
}

describe("scoreLevel", () => {
  it("returns signals in sensible ranges", () => {
    const levels = sampleLevels(6, "score-a");
    expect(levels.length).toBeGreaterThan(0);
    for (const level of levels) {
      const s = scoreLevel(level);
      expect(s.forcedMoveFraction).toBeGreaterThanOrEqual(0);
      expect(s.forcedMoveFraction).toBeLessThanOrEqual(1);
      expect(s.hollowness).toBeGreaterThanOrEqual(0);
      expect(s.hollowness).toBeLessThanOrEqual(1);
      expect(s.meanBranching).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeGreaterThan(0);
      expect(s.pieceCount).toBe(level.pieces.length);
    }
  });

  it("scores a rectangle as not hollow", () => {
    const [level] = sampleLevels(1, "score-rect");
    expect(level).toBeDefined();
    expect(scoreLevel(level!).hollowness).toBe(0);
  });
});

describe("bucketByPercentile", () => {
  it("assigns difficulty 1..5 across a batch", () => {
    const levels = sampleLevels(20, "bucket-a");
    expect(levels.length).toBeGreaterThanOrEqual(10);
    const scored = bucketByPercentile(levels, 5);

    for (const { level } of scored) {
      expect(level.difficulty).toBeGreaterThanOrEqual(1);
      expect(level.difficulty).toBeLessThanOrEqual(5);
    }
    // sorted easiest-first => difficulty is non-decreasing
    for (let i = 1; i < scored.length; i++) {
      expect(scored[i]!.level.difficulty).toBeGreaterThanOrEqual(scored[i - 1]!.level.difficulty);
    }
    // both ends of the range are used
    expect(scored[0]!.level.difficulty).toBe(1);
    expect(scored.at(-1)!.level.difficulty).toBe(5);
  });

  it("handles a single level", () => {
    const levels = sampleLevels(1, "bucket-one");
    const scored = bucketByPercentile(levels, 5);
    expect(scored[0]!.level.difficulty).toBe(1);
  });

  it("handles an empty list", () => {
    expect(bucketByPercentile([], 5)).toEqual([]);
  });
});
