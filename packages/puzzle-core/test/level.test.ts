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

describe("validateLevel — ice mechanic", () => {
  /** A solution cell that borders a cell owned by a different piece. */
  function cellWithForeignNeighbour(level: Level): [number, number] {
    const owner = new Map<string, string>();
    for (const p of level.solution) {
      for (const [r, c] of p.cells) owner.set(`${r},${c}`, p.pieceId);
    }
    for (const p of level.solution) {
      for (const [r, c] of p.cells) {
        const foreign = [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ].some(([dr, dc]) => {
          const k = `${r + dr},${c + dc}`;
          return owner.has(k) && owner.get(k) !== p.pieceId;
        });
        if (foreign) return [r, c];
      }
    }
    throw new Error("no cell with a foreign neighbour");
  }

  it("accepts ice the solution can still be laid in some order", () => {
    const { level } = sample3x5();
    level.mechanics = { ice: [cellWithForeignNeighbour(level)] };
    expect(validateLevel(level)).toEqual([]);
  });

  it("flags an ice cell outside the shape", () => {
    const { level } = sample3x5();
    level.mechanics = { ice: [[99, 99]] };
    expect(validateLevel(level).some((e) => /ice cell .* outside the shape/.test(e))).toBe(true);
  });

  it("flags ice with no free neighbour when every pane is iced", () => {
    const { shape, level } = sample3x5();
    level.mechanics = { ice: shape.cells.map(([r, c]): [number, number] => [r, c]) };
    expect(validateLevel(level).some((e) => /locked in by ice/.test(e))).toBe(true);
  });
});

describe("validateLevel — candle mechanic", () => {
  it("accepts one candle on any solution piece", () => {
    const { level } = sample3x5();
    const cell = level.solution[0]!.cells[0]!;
    level.mechanics = { candle: [cell] };
    expect(validateLevel(level)).toEqual([]);
  });

  it("flags a candle cell outside the shape", () => {
    const { level } = sample3x5();
    level.mechanics = { candle: [[99, 99]] };
    expect(
      validateLevel(level).some((e) => /candle cell .* outside the shape/.test(e)),
    ).toBe(true);
  });

  it("flags two candles that would each have to be the last piece", () => {
    const { level } = sample3x5();
    // one cell from piece 0 and one from piece 1 — both can't go last
    level.mechanics = {
      candle: [level.solution[0]!.cells[0]!, level.solution[1]!.cells[0]!],
    };
    expect(validateLevel(level).some((e) => /both cannot be last/.test(e))).toBe(true);
  });
});

describe("validateLevel — chain mechanic", () => {
  it("accepts a chain between two cells of one solution piece", () => {
    const { level } = sample3x5();
    const p = level.solution[0]!;
    level.mechanics = { chains: [[p.cells[0]!, p.cells[p.cells.length - 1]!]] };
    expect(validateLevel(level)).toEqual([]);
  });

  it("flags a chain spanning two solution pieces", () => {
    const { level } = sample3x5();
    level.mechanics = {
      chains: [[level.solution[0]!.cells[0]!, level.solution[1]!.cells[0]!]],
    };
    expect(validateLevel(level).some((e) => /spans two solution pieces/.test(e))).toBe(true);
  });

  it("flags a chain cell outside the shape", () => {
    const { level } = sample3x5();
    level.mechanics = { chains: [[level.solution[0]!.cells[0]!, [99, 99]]] };
    expect(
      validateLevel(level).some((e) => /chain cell 99,99 is outside the shape/.test(e)),
    ).toBe(true);
  });
});

describe("validateLevel — wander mechanic", () => {
  it("accepts a short shard walk the solution can beat", () => {
    const { level } = sample3x5();
    // a 1-step walk along the top-left corner
    level.mechanics = { wander: [[0, 0]] };
    expect(validateLevel(level)).toEqual([]);
  });

  it("flags a non-connected walk", () => {
    const { level } = sample3x5();
    level.mechanics = {
      wander: [
        [0, 0],
        [2, 4],
      ],
    };
    expect(validateLevel(level).some((e) => /not to an adjacent cell/.test(e))).toBe(true);
  });

  it("flags a walk no placement order can beat", () => {
    const { level } = sample3x5();
    // the shard parks on one solution piece's cells for the first N moves —
    // that piece can never be placed. Order that piece's cells into a walk.
    const cells = [...level.solution[0]!.cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const walk: Array<[number, number]> = [cells[0]!];
    const remaining = cells.slice(1);
    while (remaining.length) {
      const last = walk[walk.length - 1]!;
      const i = remaining.findIndex(
        ([r, c]) => Math.abs(r - last[0]) + Math.abs(c - last[1]) === 1,
      );
      if (i < 0) break;
      walk.push(remaining.splice(i, 1)[0]!);
    }
    // only run the assertion when we actually got a connected walk of ≥3 cells
    if (walk.length >= 3) {
      level.mechanics = { wander: walk };
      expect(
        validateLevel(level).some((e) => /beats the wandering shard/.test(e)),
      ).toBe(true);
    }
  });
});
