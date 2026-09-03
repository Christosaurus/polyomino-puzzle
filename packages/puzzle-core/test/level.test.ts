import { describe, expect, it } from "vitest";
import {
  buildLevel,
  LEVEL_SCHEMA_VERSION,
  type Level,
  levelShape,
  parseLevel,
  serializeLevel,
  validateLevel,
} from "../src/level.js";
import type { PentominoName } from "../src/pentomino.js";
import { Shape } from "../src/shape.js";
import { solvePentominoes } from "../src/solver.js";

/** A real, solved 3×5 level to build tests on. */
function sample3x5(): { shape: Shape; level: Level } {
  const shape = Shape.rectangle(3, 5);
  const candidateSubsets: PentominoName[][] = [
    ["P", "N", "L"],
    ["L", "N", "Y"],
    ["F", "P", "L"],
    ["V", "P", "L"],
    ["U", "P", "L"],
    ["Y", "L", "N"],
    ["I", "P", "L"],
    ["Z", "P", "L"],
    ["T", "P", "L"],
    ["W", "P", "L"],
  ];
  for (const subset of candidateSubsets) {
    const r = solvePentominoes(shape, subset, { solutionLimit: 1, countMode: "raw" });
    if (r.solutionCount === 0) continue;
    const solution = r.solutions[0]!.map((p) => ({
      pieceId: p.pieceId as PentominoName,
      cells: p.cells,
    }));
    const level = buildLevel({
      id: "test-3x5",
      shape,
      pieces: subset,
      allowReflection: true,
      solution,
      meta: {
        generatorVersion: "test",
        seed: "test",
        solutionCountChecked: 2,
        distinctSolutions: 1,
        solverNodes: r.nodes,
        createdAt: "2026-09-03T00:00:00.000Z",
      },
    });
    return { shape, level };
  }
  throw new Error("no 3x5 tiling found for the test fixtures");
}

describe("buildLevel / validateLevel", () => {
  it("builds a valid level whose solution tiles the shape", () => {
    const { level } = sample3x5();
    expect(level.schemaVersion).toBe(LEVEL_SCHEMA_VERSION);
    expect(validateLevel(level)).toEqual([]);
  });

  it("round-trips through serialize / parse", () => {
    const { level } = sample3x5();
    const restored = parseLevel(serializeLevel(level));
    expect(restored).toEqual(level);
  });

  it("reconstructs the same target shape", () => {
    const { shape, level } = sample3x5();
    expect(levelShape(level).key()).toBe(shape.key());
  });

  it("applies the board origin to the solution cells", () => {
    const shape = Shape.fromAscii("#####"); // I pentomino, one row
    const level = buildLevel({
      id: "origin-test",
      shape,
      originRow: 4,
      originCol: 2,
      pieces: ["I"],
      allowReflection: true,
      solution: [{ pieceId: "I", cells: shape.cells }],
      meta: {
        generatorVersion: "test",
        seed: "s",
        solutionCountChecked: 2,
        distinctSolutions: 1,
        solverNodes: 1,
        createdAt: "2026-09-03T00:00:00.000Z",
      },
    });
    expect(level.solution[0]!.cells).toEqual([
      [4, 2],
      [4, 3],
      [4, 4],
      [4, 5],
      [4, 6],
    ]);
    expect(validateLevel(level)).toEqual([]);
  });
});

describe("validateLevel catches broken levels", () => {
  const base = (): Level => sample3x5().level;

  it("flags a solution that leaves a cell empty", () => {
    const level = base();
    level.solution[0]!.cells.pop();
    const errors = validateLevel(level);
    expect(errors.some((e) => /empty|expected 5/.test(e))).toBe(true);
  });

  it("flags a piece list that disagrees with the solution", () => {
    const level = base();
    level.pieces[0] = level.pieces[0] === "X" ? "Z" : "X";
    expect(validateLevel(level).some((e) => /solution pieces/.test(e))).toBe(true);
  });

  it("flags a solution cell outside the shape", () => {
    const level = base();
    level.solution[0]!.cells[0] = [99, 99];
    expect(validateLevel(level).some((e) => /outside the shape/.test(e))).toBe(true);
  });

  it("flags the wrong schema version", () => {
    const level = base() as unknown as { schemaVersion: number };
    level.schemaVersion = 99;
    expect(validateLevel(level).some((e) => /schemaVersion/.test(e))).toBe(true);
  });

  it("flags an out-of-range difficulty", () => {
    const level = base();
    level.difficulty = 7;
    expect(validateLevel(level).some((e) => /difficulty/.test(e))).toBe(true);
  });
});
