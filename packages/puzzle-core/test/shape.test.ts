import { describe, expect, it } from "vitest";
import { Shape } from "../src/shape.js";

describe("Shape.fromCells", () => {
  it("normalizes to the origin", () => {
    const s = Shape.fromCells([
      [3, 4],
      [3, 5],
      [4, 4],
    ]);
    expect(s.cells).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
    ]);
    expect(s.rows).toBe(2);
    expect(s.cols).toBe(2);
    expect(s.size).toBe(3);
  });

  it("rejects an empty shape", () => {
    expect(() => Shape.fromCells([])).toThrow(/at least one cell/i);
  });

  it("rejects a duplicated cell", () => {
    expect(() =>
      Shape.fromCells([
        [0, 0],
        [0, 0],
      ]),
    ).toThrow(/duplicate/i);
  });
});

describe("Shape.rectangle", () => {
  it("has the right size and bounds", () => {
    const s = Shape.rectangle(6, 10);
    expect(s.size).toBe(60);
    expect(s.rows).toBe(6);
    expect(s.cols).toBe(10);
    expect(s.isConnected()).toBe(true);
  });
});

describe("Shape.fromAscii", () => {
  it("reads filled cells and strips indentation", () => {
    const s = Shape.fromAscii(`
      ###
      #..
      #..
    `);
    expect(s.toAscii()).toBe("###\n#..\n#..");
    expect(s.size).toBe(5);
  });

  it("round-trips through toAscii", () => {
    const art = "#.#\n###\n.#.";
    expect(Shape.fromAscii(art).toAscii()).toBe(art);
  });

  it("supports a shape with a hole", () => {
    const s = Shape.fromAscii(`
      #####
      #...#
      #####
    `);
    expect(s.size).toBe(12);
    expect(s.has(1, 2)).toBe(false);
    expect(s.has(1, 0)).toBe(true);
  });
});

describe("Shape.symmetries", () => {
  it("finds 4 for a non-square rectangle", () => {
    expect(Shape.rectangle(6, 10).symmetries()).toHaveLength(4);
  });

  it("finds 8 for a square", () => {
    expect(Shape.rectangle(4, 4).symmetries()).toHaveLength(8);
  });

  it("finds only the identity for an asymmetric blob", () => {
    const s = Shape.fromAscii(`
      ##.
      ###
      #..
    `);
    expect(s.symmetries()).toHaveLength(1);
  });

  it("finds 2 for a shape with a single mirror axis", () => {
    // A "T" tetromino silhouette: vertical mirror only.
    const s = Shape.fromAscii(`
      ###
      .#.
    `);
    expect(s.symmetries()).toHaveLength(2);
  });
});
