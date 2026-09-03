import type { PentominoName } from "@polyomino/puzzle-core";

/** A distinct, reasonably colour-blind-friendly hue per pentomino. */
export const PIECE_COLORS: Record<PentominoName, string> = {
  F: "#ef4444",
  I: "#f97316",
  L: "#f59e0b",
  N: "#84cc16",
  P: "#22c55e",
  T: "#14b8a6",
  U: "#06b6d4",
  V: "#3b82f6",
  W: "#6366f1",
  X: "#a855f7",
  Y: "#ec4899",
  Z: "#78716c",
};
