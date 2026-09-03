import { describe, expect, it } from "vitest";
import { hashString, mulberry32, rngFromSeed } from "../src/rng.js";

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("differs across seeds", () => {
    const a = Array.from({ length: 20 }, () => mulberry32(1).next());
    const b = Array.from({ length: 20 }, () => mulberry32(2).next());
    expect(a).not.toEqual(b);
  });

  it("produces floats in [0, 1)", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("int() stays in range", () => {
    const rng = mulberry32(9);
    const counts = new Array<number>(6).fill(0);
    for (let i = 0; i < 6000; i++) {
      const v = rng.int(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      counts[v] = (counts[v] ?? 0) + 1;
    }
    for (const c of counts) expect(c).toBeGreaterThan(600); // roughly uniform
  });

  it("int() rejects a non-positive bound", () => {
    expect(() => mulberry32(1).int(0)).toThrow();
  });
});

describe("sample / shuffle", () => {
  it("sample returns the requested count with no repeats", () => {
    const rng = mulberry32(3);
    const items = ["a", "b", "c", "d", "e", "f"];
    const s = rng.sample(items, 3);
    expect(s).toHaveLength(3);
    expect(new Set(s).size).toBe(3);
    for (const x of s) expect(items).toContain(x);
  });

  it("sample does not mutate the input", () => {
    const items = [1, 2, 3, 4];
    const copy = [...items];
    mulberry32(1).sample(items, 2);
    expect(items).toEqual(copy);
  });

  it("shuffle keeps the same multiset", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = mulberry32(5).shuffle([...items]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
  });

  it("sample rejects an out-of-range count", () => {
    expect(() => mulberry32(1).sample([1, 2], 3)).toThrow();
  });
});

describe("hashString / rngFromSeed", () => {
  it("hashString is stable and unsigned", () => {
    expect(hashString("hello")).toBe(hashString("hello"));
    expect(hashString("hello")).toBeGreaterThanOrEqual(0);
    expect(hashString("hello")).not.toBe(hashString("world"));
  });

  it("rngFromSeed derives a stream from a string", () => {
    const a = Array.from({ length: 10 }, () => rngFromSeed("level-pack-1").next());
    const b = Array.from({ length: 10 }, () => rngFromSeed("level-pack-1").next());
    expect(a).toEqual(b);
  });
});
