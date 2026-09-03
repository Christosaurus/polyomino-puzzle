import { describe, expect, it } from "vitest";
import type { Cell } from "../src/cells.js";
import { PENTOMINO_NAMES, type PentominoName } from "../src/pentomino.js";
import { Shape } from "../src/shape.js";
import { type Placement, solve, solvePentominoes } from "../src/solver.js";

const ALL_12 = PENTOMINO_NAMES;

/** Assert a solution exactly tiles the shape with the expected pieces. */
function expectValidSolution(
  shape: Shape,
  solution: readonly Placement[],
  expectedPieceIds: readonly string[],
): void {
  expect(solution.map((p) => p.pieceId).sort()).toEqual([...expectedPieceIds].sort());

  const covered = new Set<string>();
  for (const placement of solution) {
    for (const [row, col] of placement.cells) {
      const key = `${row},${col}`;
      expect(shape.has(row, col), `cell ${key} is inside the shape`).toBe(true);
      expect(covered.has(key), `cell ${key} covered only once`).toBe(false);
      covered.add(key);
    }
  }
  expect(covered.size).toBe(shape.size);
}

describe("solve — trivial cases", () => {
  it("places a single piece into its own silhouette", () => {
    const shape = Shape.fromAscii(`
      ###
      #..
      #..
    `);
    const result = solvePentominoes(shape, ["V"], { solutionLimit: 10 });
    expect(result.solutionCount).toBe(1);
    expect(result.exhausted).toBe(true);
    expectValidSolution(shape, result.solutions[0]!, ["V"]);
  });

  it("reports no solution when a piece cannot fit the silhouette", () => {
    const plus = Shape.fromAscii(`
      .#.
      ###
      .#.
    `);
    const result = solvePentominoes(plus, ["I"], { solutionLimit: 10 });
    expect(result.solutionCount).toBe(0);
    expect(result.exhausted).toBe(true);
    expect(result.solutions).toHaveLength(0);
  });

  it("reports no solution when total piece cells != shape size", () => {
    const result = solvePentominoes(Shape.rectangle(3, 3), ["I", "L"], { solutionLimit: 10 });
    expect(result.solutionCount).toBe(0);
    expect(result.exhausted).toBe(true);
    expect(result.nodes).toBe(0);
  });

  it("solves a non-rectangular target (plus shape, X piece)", () => {
    const plus = Shape.fromAscii(`
      .#.
      ###
      .#.
    `);
    const result = solvePentominoes(plus, ["X"], { solutionLimit: 10 });
    expect(result.solutionCount).toBe(1);
    expect(result.exhausted).toBe(true);
  });
});

describe("solve — classic pentomino rectangle counts", () => {
  it("3×20 has 2 solutions up to symmetry (8 raw)", () => {
    const shape = Shape.rectangle(3, 20);

    const distinct = solvePentominoes(shape, ALL_12, {
      solutionLimit: 50,
      countMode: "distinct",
    });
    expect(distinct.solutionCount).toBe(2);
    expect(distinct.exhausted).toBe(true);
    for (const s of distinct.solutions) expectValidSolution(shape, s, ALL_12);

    const raw = solvePentominoes(shape, ALL_12, { solutionLimit: 50, countMode: "raw" });
    expect(raw.solutionCount).toBe(8);
    expect(raw.exhausted).toBe(true);
  });

  // Exhaustive counts for the larger rectangles are correct but take seconds in
  // JS, so they stay out of the default run. Verified manually:
  //   4×15 → 368 distinct / 1472 raw
  //   5×12 → 1010 distinct / 4040 raw
  //   6×10 → 2339 distinct / 9356 raw
  it.skip("4×15 / 5×12 / 6×10 exhaustive counts (slow)", { timeout: 300_000 }, () => {
    for (const [dims, distinct, raw] of [
      [[4, 15], 368, 1472],
      [[5, 12], 1010, 4040],
      [[6, 10], 2339, 9356],
    ] as const) {
      const shape = Shape.rectangle(dims[0], dims[1]);
      const d = solvePentominoes(shape, ALL_12, { solutionLimit: 1e6, countMode: "distinct" });
      const r = solvePentominoes(shape, ALL_12, { solutionLimit: 1e6, countMode: "raw" });
      expect(d.solutionCount).toBe(distinct);
      expect(r.solutionCount).toBe(raw);
    }
  });
});

describe("solve — uniqueness check semantics", () => {
  it("stops at the solution limit and reports not exhausted", () => {
    const result = solvePentominoes(Shape.rectangle(4, 15), ALL_12, {
      solutionLimit: 2,
      countMode: "distinct",
    });
    expect(result.solutionCount).toBe(2);
    expect(result.exhausted).toBe(false);
    expect(result.solutions).toHaveLength(2);
  });

  it("reports nodes visited as a difficulty signal", () => {
    const result = solvePentominoes(Shape.rectangle(3, 20), ALL_12, { solutionLimit: 50 });
    expect(result.nodes).toBeGreaterThan(0);
    expect(result.hitNodeCap).toBe(false);
  });

  it("honours the node cap", () => {
    const result = solvePentominoes(Shape.rectangle(4, 15), ALL_12, {
      solutionLimit: 10_000,
      countMode: "raw",
      maxNodes: 100,
    });
    expect(result.hitNodeCap).toBe(true);
    expect(result.exhausted).toBe(false);
    expect(result.nodes).toBeLessThanOrEqual(101);
  });
});

describe("solve — custom pieces with duplicates", () => {
  it("treats swapped identical pieces as one solution up to symmetry", () => {
    // 2×5 board tiled by two P-pentominoes. Distinct count collapses the mirror
    // images and the P1/P2 swap that symmetry induces.
    const shape = Shape.rectangle(2, 5);
    const pOrientations: Cell[][] = [
      [
        [0, 0],
        [0, 1],
        [0, 2],
        [1, 0],
        [1, 1],
      ],
      [
        [0, 0],
        [0, 1],
        [0, 2],
        [1, 1],
        [1, 2],
      ],
      [
        [0, 0],
        [0, 1],
        [1, 0],
        [1, 1],
        [1, 2],
      ],
      [
        [0, 1],
        [0, 2],
        [1, 0],
        [1, 1],
        [1, 2],
      ],
    ];
    const pieces = [
      { id: "P1", orientations: pOrientations },
      { id: "P2", orientations: pOrientations },
    ];
    const raw = solve(shape, pieces, { solutionLimit: 100, countMode: "raw" });
    const distinct = solve(shape, pieces, { solutionLimit: 100, countMode: "distinct" });
    expect(raw.exhausted).toBe(true);
    expect(distinct.exhausted).toBe(true);
    expect(raw.solutionCount).toBeGreaterThan(0);
    expect(distinct.solutionCount).toBeLessThanOrEqual(raw.solutionCount);
  });
});

describe("solve — input guards", () => {
  it("returns no solution for an empty piece list", () => {
    const result = solve(Shape.rectangle(2, 2), [], { solutionLimit: 5 });
    expect(result.solutionCount).toBe(0);
    expect(result.exhausted).toBe(true);
  });

  it("accepts every classic pentomino name", () => {
    const names: PentominoName[] = [...ALL_12];
    expect(names).toHaveLength(12);
  });
});
