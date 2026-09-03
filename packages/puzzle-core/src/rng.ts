/**
 * A tiny seedable pseudo-random generator.
 *
 * Level generation must be reproducible: the same seed always produces the same
 * levels, so a level pack can be regenerated in CI and a bad batch can be traced
 * back to its seed.
 */

export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Next integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** A uniformly chosen element. */
  pick<T>(items: readonly T[]): T;
  /** A new array with `count` distinct elements chosen uniformly (no repeats). */
  sample<T>(items: readonly T[], count: number): T[];
  /** Fisher–Yates shuffle, in place, returning the same array. */
  shuffle<T>(items: T[]): T[];
}

/** FNV-1a 32-bit hash — used to turn a string seed into a numeric one, and for ids. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 — small, fast, good enough for content generation. */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (maxExclusive: number): number => {
    if (maxExclusive <= 0) throw new Error(`int(${maxExclusive}): bound must be positive`);
    return Math.floor(next() * maxExclusive);
  };

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new Error("pick() from an empty list");
    return items[int(items.length)]!;
  };

  const shuffle = <T>(items: T[]): T[] => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = int(i + 1);
      const tmp = items[i]!;
      items[i] = items[j]!;
      items[j] = tmp;
    }
    return items;
  };

  const sample = <T>(items: readonly T[], count: number): T[] => {
    if (count < 0 || count > items.length) {
      throw new Error(`sample(${count}) from ${items.length} items`);
    }
    return shuffle([...items]).slice(0, count);
  };

  return { next, int, pick, sample, shuffle };
}

/** An `Rng` seeded from a string. */
export function rngFromSeed(seed: string): Rng {
  return mulberry32(hashString(seed));
}
