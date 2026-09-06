/**
 * Kaskade's own piece set — deliberately wider than the story mode's classic
 * pentominoes. Small pieces (a single cell, a domino, an L-tromino, the
 * O-tetromino, ...) give the player an easy out when the board gets crowded;
 * pentominoes stay in for bite. Every piece behaves the same way — cover cells,
 * fill a row, clear it. No wildcards.
 */

import {
  PENTOMINOES,
  PENTOMINO_NAMES,
  orientations,
  type Cell,
  type PentominoName,
  type Rng,
} from "@polyomino/puzzle-core";
import { PIECE_COLORS } from "./colors.js";

export interface ShardDef {
  name: string;
  size: number;
  color: string;
  /** Base spawn weight before the crowding bias is applied. */
  weight: number;
  /** All cells sit in a single row or a single column — a clean straight bar. */
  straight: boolean;
  orientations: ReadonlyArray<readonly Cell[]>;
}

function isStraight(cells: readonly Cell[]): boolean {
  if (cells.length < 2) return false; // a single cell isn't a "bar"
  const rows = new Set(cells.map((c) => c[0]));
  const cols = new Set(cells.map((c) => c[1]));
  return rows.size === 1 || cols.size === 1;
}

interface RawExtra {
  name: string;
  cells: Cell[];
  color: string;
  weight: number;
}

// small + medium shapes, on top of the 12 pentominoes — more of the board is
// coverable by an "easy" piece when things get tight.
const EXTRA: RawExtra[] = [
  { name: "mono", cells: [[0, 0]], color: "#ffe066", weight: 2 },
  { name: "duo", cells: [[0, 0], [0, 1]], color: "#66e05f", weight: 6 },
  { name: "trio-i", cells: [[0, 0], [0, 1], [0, 2]], color: "#45c1ff", weight: 5 },
  { name: "trio-l", cells: [[0, 0], [0, 1], [1, 0]], color: "#2fd9cf", weight: 5 },
  { name: "quad-o", cells: [[0, 0], [0, 1], [1, 0], [1, 1]], color: "#ff9c3d", weight: 4 },
  { name: "quad-i", cells: [[0, 0], [0, 1], [0, 2], [0, 3]], color: "#ff5fa8", weight: 3 },
  { name: "quad-l", cells: [[0, 0], [1, 0], [2, 0], [2, 1]], color: "#8b6bff", weight: 3 },
  { name: "quad-t", cells: [[0, 0], [0, 1], [0, 2], [1, 1]], color: "#ff5b6a", weight: 3 },
  { name: "quad-s", cells: [[0, 1], [0, 2], [1, 0], [1, 1]], color: "#a875ff", weight: 3 },
];

const PENTO_WEIGHT = 2;

const SHARD_DEFS: ShardDef[] = [
  ...EXTRA.map(
    (e): ShardDef => ({
      name: e.name,
      size: e.cells.length,
      color: e.color,
      weight: e.weight,
      straight: isStraight(e.cells),
      orientations: orientations(e.cells),
    }),
  ),
  ...(PENTOMINO_NAMES as PentominoName[]).map(
    (n): ShardDef => ({
      name: n,
      size: 5,
      color: PIECE_COLORS[n],
      weight: PENTO_WEIGHT,
      straight: isStraight(PENTOMINOES[n].orientations[0]!),
      orientations: PENTOMINOES[n].orientations,
    }),
  ),
];

const ALL_DEFS: ShardDef[] = SHARD_DEFS;
const BY_NAME = new Map(ALL_DEFS.map((d) => [d.name, d]));
const INDEX_BY_NAME = new Map(ALL_DEFS.map((d, i) => [d.name, i]));

export function shardDef(name: string): ShardDef {
  return BY_NAME.get(name) ?? SHARD_DEFS[0]!;
}

/** 1-based colour index for the board's Int8Array; 0 stays "empty". */
export function shardColorIndex(name: string): number {
  return (INDEX_BY_NAME.get(name) ?? 0) + 1;
}
export function shardByColorIndex(i: number): ShardDef {
  return ALL_DEFS[i - 1] ?? SHARD_DEFS[0]!;
}

/**
 * Weighted random pick, biased toward small pieces as the board fills up
 * (`crowdedFrac` 0..1) so a nearly-full board still has an easy out.
 */
export function pickShardName(rng: Rng, crowdedFrac: number): string {
  const f = Math.max(0, Math.min(1, crowdedFrac));
  let total = 0;
  const weights = SHARD_DEFS.map((d) => {
    let w = d.weight;
    if (d.size <= 3) w *= 1 + f * 1.4;
    else if (d.size >= 5) w *= Math.max(0.2, 1 - f * 0.75);
    total += w;
    return w;
  });
  let x = rng.next() * total;
  for (let i = 0; i < SHARD_DEFS.length; i++) {
    x -= weights[i]!;
    if (x <= 0) return SHARD_DEFS[i]!.name;
  }
  return SHARD_DEFS[SHARD_DEFS.length - 1]!.name;
}
