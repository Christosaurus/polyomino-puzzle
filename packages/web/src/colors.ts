import type { PentominoName } from "@polyomino/puzzle-core";

/** Jewel tones on a dark board — bold, saturated, distinct per piece. */
export const PIECE_COLORS: Record<PentominoName, string> = {
  F: "#ff4d4d",
  I: "#ff8a1e",
  L: "#ffc233",
  N: "#a9e34b",
  P: "#3ddc84",
  T: "#1fc7c7",
  U: "#26a9f4",
  V: "#4b6bff",
  W: "#8b5cf6",
  X: "#c15cf0",
  Y: "#ff4fa3",
  Z: "#9aa6b2",
};

export const PIECE_NAMES = Object.keys(PIECE_COLORS) as PentominoName[];

/** Lighten (amount > 0) or darken (amount < 0) a `#rrggbb` colour. */
export function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const mix = (channel: number): number => {
    const target = amount >= 0 ? 255 : 0;
    return Math.round(channel + (target - channel) * Math.abs(amount));
  };
  const r = mix((n >> 16) & 0xff);
  const g = mix((n >> 8) & 0xff);
  const b = mix(n & 0xff);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

const cache = new Map<string, string>();
export function cssVar(name: string): string {
  const hit = cache.get(name);
  if (hit) return hit;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
  cache.set(name, v);
  return v;
}
export function clearCssVarCache(): void {
  cache.clear();
}
