/**
 * Per-viewer progress, kept in localStorage: best time and star rating per level.
 * Every read/write is guarded — storage can be unavailable or throw.
 */

const KEY = "polyomino.progress.v1";

export interface LevelResult {
  stars: number;
  bestMs: number;
}
export type Progress = Record<string, LevelResult>;

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Progress) : {};
  } catch {
    return {};
  }
}

function save(progress: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    /* storage full or blocked — progress is best-effort */
  }
}

/** Record a completion; keeps the better result. Returns the stored (best) result. */
export function recordResult(levelId: string, stars: number, ms: number): LevelResult {
  const progress = loadProgress();
  const prev = progress[levelId];
  const next: LevelResult =
    prev && (prev.stars > stars || (prev.stars === stars && prev.bestMs <= ms))
      ? prev
      : { stars, bestMs: ms };
  progress[levelId] = next;
  save(progress);
  return next;
}

export function totalStars(progress: Progress): number {
  return Object.values(progress).reduce((sum, r) => sum + r.stars, 0);
}
