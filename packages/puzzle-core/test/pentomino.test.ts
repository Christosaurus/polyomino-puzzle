import { describe, expect, it } from "vitest";
import { isConnected } from "../src/cells.js";
import {
  ALL_PENTOMINOES,
  PENTOMINO_NAMES,
  PENTOMINO_SET_CELL_COUNT,
  PENTOMINOES,
  type PentominoName,
  pentomino,
} from "../src/pentomino.js";

/**
 * Distinct fixed orientations of each free pentomino under rotation + reflection.
 * These sum to 63 — the classic count — which is the strongest single check that
 * the base shapes and the orientation logic are both correct.
 */
const EXPECTED_ORIENTATIONS: Record<PentominoName, number> = {
  F: 8,
  I: 2,
  L: 8,
  N: 8,
  P: 8,
  T: 4,
  U: 4,
  V: 4,
  W: 4,
  X: 1,
  Y: 8,
  Z: 4,
};

describe("the pentomino set", () => {
  it("has all 12 pieces", () => {
    expect(ALL_PENTOMINOES).toHaveLength(12);
    expect(PENTOMINO_NAMES).toHaveLength(12);
  });

  it("covers 60 cells in total", () => {
    const total = ALL_PENTOMINOES.reduce((sum, p) => sum + p.cells.length, 0);
    expect(total).toBe(PENTOMINO_SET_CELL_COUNT);
  });
});

describe.each(PENTOMINO_NAMES)("pentomino %s", (name) => {
  const piece = PENTOMINOES[name];

  it("has exactly 5 connected cells", () => {
    expect(piece.cells).toHaveLength(5);
    expect(isConnected(piece.cells)).toBe(true);
  });

  it("is stored normalized (touches row 0 and col 0)", () => {
    expect(Math.min(...piece.cells.map(([r]) => r))).toBe(0);
    expect(Math.min(...piece.cells.map(([, c]) => c))).toBe(0);
  });

  it(`has ${EXPECTED_ORIENTATIONS[name]} distinct orientations`, () => {
    expect(piece.orientations).toHaveLength(EXPECTED_ORIENTATIONS[name]);
  });

  it("keeps every orientation at 5 connected cells", () => {
    for (const o of piece.orientations) {
      expect(o).toHaveLength(5);
      expect(isConnected(o)).toBe(true);
    }
  });
});

describe("orientation totals", () => {
  it("sum to the classic 63 fixed pentominoes", () => {
    const total = ALL_PENTOMINOES.reduce((sum, p) => sum + p.orientations.length, 0);
    expect(total).toBe(63);
  });
});

describe("pentomino()", () => {
  it("looks a piece up by name", () => {
    expect(pentomino("F").name).toBe("F");
  });

  it("throws on an unknown name", () => {
    expect(() => pentomino("Q" as PentominoName)).toThrow(/unknown pentomino/i);
  });
});
