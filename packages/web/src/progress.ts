/**
 * Per-viewer save data in localStorage: level results, streaks, mode bests and
 * unlocked achievements. Every access is guarded — storage can be blocked or full.
 */

const KEY = "polyomino.save.v2";

export interface LevelResult {
  stars: number;
  bestMs: number;
}

export interface SaveData {
  levels: Record<string, LevelResult>;
  daily: { lastDayDone: string; streak: number; bestStreak: number };
  descent: { bestDepth: number; runs: number };
  cascade: { bestScore: number; bestCleared: number; runs: number };
  achievements: string[];
  stats: { solved: number; totalMs: number; noUndoStreak: number; bestNoUndoStreak: number };
}

const EMPTY: SaveData = {
  levels: {},
  daily: { lastDayDone: "", streak: 0, bestStreak: 0 },
  descent: { bestDepth: 0, runs: 0 },
  cascade: { bestScore: 0, bestCleared: 0, runs: 0 },
  achievements: [],
  stats: { solved: 0, totalMs: 0, noUndoStreak: 0, bestNoUndoStreak: 0 },
};

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(EMPTY);
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      ...structuredClone(EMPTY),
      ...parsed,
      levels: parsed.levels ?? {},
      daily: { ...EMPTY.daily, ...parsed.daily },
      descent: { ...EMPTY.descent, ...parsed.descent },
      cascade: { ...EMPTY.cascade, ...parsed.cascade },
      achievements: parsed.achievements ?? [],
      stats: { ...EMPTY.stats, ...parsed.stats },
    };
  } catch {
    return structuredClone(EMPTY);
  }
}

export function save(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* best effort */
  }
}

/** Mutate save data through `fn`, persist, return it. */
export function update(fn: (data: SaveData) => void): SaveData {
  const data = load();
  fn(data);
  save(data);
  return data;
}

export function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function totalStars(data: SaveData): number {
  return Object.values(data.levels).reduce((s, r) => s + r.stars, 0);
}

/** Record a campaign/daily level completion; keeps the better result. */
export function recordLevel(levelId: string, stars: number, ms: number, usedUndo: boolean): SaveData {
  return update((d) => {
    const prev = d.levels[levelId];
    if (!prev || stars > prev.stars || (stars === prev.stars && ms < prev.bestMs)) {
      d.levels[levelId] = { stars, bestMs: ms };
    }
    d.stats.solved += 1;
    d.stats.totalMs += ms;
    if (usedUndo) {
      d.stats.noUndoStreak = 0;
    } else {
      d.stats.noUndoStreak += 1;
      d.stats.bestNoUndoStreak = Math.max(d.stats.bestNoUndoStreak, d.stats.noUndoStreak);
    }
  });
}

export function recordDaily(now = new Date()): SaveData {
  const key = todayKey(now);
  return update((d) => {
    if (d.daily.lastDayDone === key) return;
    const yesterday = todayKey(new Date(now.getTime() - 864e5));
    d.daily.streak = d.daily.lastDayDone === yesterday ? d.daily.streak + 1 : 1;
    d.daily.lastDayDone = key;
    d.daily.bestStreak = Math.max(d.daily.bestStreak, d.daily.streak);
  });
}

export function recordDescent(depth: number): SaveData {
  return update((d) => {
    d.descent.runs += 1;
    d.descent.bestDepth = Math.max(d.descent.bestDepth, depth);
  });
}

export function recordCascade(score: number, cleared: number): SaveData {
  return update((d) => {
    d.cascade.runs += 1;
    d.cascade.bestScore = Math.max(d.cascade.bestScore, score);
    d.cascade.bestCleared = Math.max(d.cascade.bestCleared, cleared);
  });
}
