import { describe, expect, it } from "vitest";
import {
  type Cell,
  cellKey,
  cellsEqual,
  isConnected,
  normalize,
  orientations,
  reflect,
  rotate90,
  translate,
} from "../src/cells.js";

describe("normalize", () => {
  it("shifts the bounding box to the origin", () => {
    expect(normalize([
      [5, 7],
      [5, 8],
      [6, 7],
    ])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
    ]);
  });

  it("is order-independent", () => {
    const a: Cell[] = [
      [1, 0],
      [0, 0],
      [0, 1],
    ];
    const b: Cell[] = [
      [0, 1],
      [1, 0],
      [0, 0],
    ];
    expect(normalize(a)).toEqual(normalize(b));
  });

  it("handles the empty shape", () => {
    expect(normalize([])).toEqual([]);
  });
});

describe("cellKey / cellsEqual", () => {
  it("ignores translation and order", () => {
    const l1: Cell[] = [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
    ];
    const l2 = translate(l1, 3, -4).reverse();
    expect(cellKey(l1)).toBe(cellKey(l2));
    expect(cellsEqual(l1, l2)).toBe(true);
  });

  it("distinguishes genuinely different shapes", () => {
    expect(cellsEqual([[0, 0], [0, 1]], [[0, 0], [1, 0]])).toBe(false);
  });
});

describe("rotate90", () => {
  it("returns to the start after four turns", () => {
    const shape: Cell[] = [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 1],
    ];
    let r: Cell[] = [...shape];
    for (let i = 0; i < 4; i++) r = rotate90(r);
    expect(cellsEqual(r, shape)).toBe(true);
  });

  it("turns a horizontal domino into a vertical one", () => {
    expect(normalize(rotate90([
      [0, 0],
      [0, 1],
    ]))).toEqual([
      [0, 0],
      [1, 0],
    ]);
  });
});

describe("reflect", () => {
  it("is its own inverse", () => {
    const shape: Cell[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 2],
    ];
    expect(cellsEqual(reflect(reflect(shape)), shape)).toBe(true);
  });
});

describe("orientations", () => {
  it("collapses the symmetric plus shape to one", () => {
    const plus: Cell[] = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 1],
    ];
    expect(orientations(plus)).toHaveLength(1);
  });

  it("gives a straight line two orientations", () => {
    const line: Cell[] = [
      [0, 0],
      [1, 0],
      [2, 0],
    ];
    expect(orientations(line)).toHaveLength(2);
  });

  it("gives an L-tromino four orientations without reflection", () => {
    const bent: Cell[] = [
      [0, 0],
      [1, 0],
      [1, 1],
    ];
    expect(orientations(bent, { allowReflection: false })).toHaveLength(4);
  });

  it("every orientation preserves the cell count", () => {
    const s: Cell[] = [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ];
    for (const o of orientations(s)) expect(o).toHaveLength(s.length);
  });
});

describe("isConnected", () => {
  it("accepts an edge-connected shape", () => {
    expect(isConnected([
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ])).toBe(true);
  });

  it("rejects a diagonal-only touch", () => {
    expect(isConnected([
      [0, 0],
      [1, 1],
    ])).toBe(false);
  });

  it("rejects a detached cell", () => {
    expect(isConnected([
      [0, 0],
      [0, 1],
      [0, 2],
      [5, 5],
    ])).toBe(false);
  });
});
