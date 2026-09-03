import type { PentominoName } from "@polyomino/puzzle-core";

/** A distinct, reasonably colour-blind-friendly hue per pentomino. */
export const PIECE_COLORS: Record<PentominoName, string> = {
  F: "#f0463f",
  I: "#ff7a1a",
  L: "#f6ad1c",
  N: "#8bc926",
  P: "#25c065",
  T: "#12b8a6",
  U: "#22a7e6",
  V: "#3d6ff2",
  W: "#7b5cf0",
  X: "#b451e6",
  Y: "#ec3f92",
  Z: "#8a7f77",
};

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
