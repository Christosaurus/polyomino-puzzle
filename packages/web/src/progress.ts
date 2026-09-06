/**
 * Per-viewer save data in localStorage: level results, streaks, mode bests and
 * unlocked achievements. Every access is guarded — storage can be blocked or full.
 */

const KEY = "polyomino.save.v2";

export interface LevelResult {
  stars: number;
  bestMs: number;
  /** Consecutive timeouts on this level since the last win — drives the pity assist. */
  fails?: number;
}

export type JokerKind = "hint" | "time" | "solvent";
export type Jokers = Record<JokerKind, number>;

export const MAX_LIVES = 5;
export const LIFE_REGEN_MS = 20 * 60_000;

export interface SaveData {
  levels: Record<string, LevelResult>;
  daily: { lastDayDone: string; streak: number; bestStreak: number };
  descent: { bestDepth: number; runs: number; seq: number };
  cascade: { bestScore: number; bestCleared: number; runs: number };
  achievements: string[];
  jokers: Jokers;
  /** Region ids whose completion reward has been granted. */
  regionRewards: string[];
  /** Highest milestone threshold already claimed. */
  milestone: number;
  /** Light shards — the soft currency. */
  shards: number;
  lives: { count: number; nextAt: number };
  stats: { solved: number; totalMs: number; noUndoStreak: number; bestNoUndoStreak: number };
}

const EMPTY: SaveData = {
  levels: {},
  daily: { lastDayDone: "", streak: 0, bestStreak: 0 },
  descent: { bestDepth: 0, runs: 0, seq: 0 },
  cascade: { bestScore: 0, bestCleared: 0, runs: 0 },
  achievements: [],
  jokers: { hint: 3, time: 2, solvent: 2 },
  regionRewards: [],
  milestone: 0,
  shards: 0,
  lives: { count: MAX_LIVES, nextAt: 0 },
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
      jokers: { ...EMPTY.jokers, ...parsed.jokers },
      regionRewards: parsed.regionRewards ?? [],
      milestone: parsed.milestone ?? 0,
      shards: parsed.shards ?? 0,
      lives: { ...EMPTY.lives, ...parsed.lives },
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

/**
 * Calendar-day key in the player's own local timezone. `toISOString()` would
 * use UTC, which quietly shifts the "day" for anyone not on UTC — e.g. for a
 * German player (UTC+1/+2), the local evening still reads as "tomorrow" in
 * UTC for an hour or two after local midnight has already passed, which is
 * exactly backwards from what a daily streak should feel like.
 */
export function todayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Campaign stars only — daily results are stored under a `daily:` prefix and excluded. */
export function totalStars(data: SaveData): number {
  return Object.entries(data.levels)
    .filter(([id]) => !id.startsWith("daily:"))
    .reduce((s, [, r]) => s + r.stars, 0);
}

/** Record a campaign/daily level completion; keeps the better result. Returns shards earned. */
export function recordLevel(levelId: string, stars: number, ms: number, usedUndo: boolean): number {
  let earned = 0;
  update((d) => {
    const prev = d.levels[levelId];
    const firstClear = !prev;
    if (!prev || stars > prev.stars || (stars === prev.stars && ms < prev.bestMs)) {
      d.levels[levelId] = { stars, bestMs: ms };
    } else {
      d.levels[levelId] = { ...prev };
    }
    d.levels[levelId]!.fails = 0; // a win always clears the pity streak
    earned = stars + (firstClear ? 3 : 1);
    d.shards += earned;
    d.stats.solved += 1;
    d.stats.totalMs += ms;
    if (usedUndo) {
      d.stats.noUndoStreak = 0;
    } else {
      d.stats.noUndoStreak += 1;
      d.stats.bestNoUndoStreak = Math.max(d.stats.bestNoUndoStreak, d.stats.noUndoStreak);
    }
  });
  return earned;
}

const PITY_THRESHOLD = 2;

/** A level timed out. Track it so a repeat run can offer a free assist. */
export function recordFail(levelId: string): number {
  let fails = 0;
  update((d) => {
    const prev = d.levels[levelId];
    fails = (prev?.fails ?? 0) + 1;
    d.levels[levelId] = { stars: prev?.stars ?? 0, bestMs: prev?.bestMs ?? Infinity, fails };
  });
  return fails;
}

/** True once a level has failed enough in a row to earn a free hint + more time. */
export function pity(levelId: string): boolean {
  return (load().levels[levelId]?.fails ?? 0) >= PITY_THRESHOLD;
}

/** Consume the pity assist so it doesn't re-trigger next attempt regardless of outcome. */
export function clearPity(levelId: string): void {
  update((d) => {
    const prev = d.levels[levelId];
    if (prev) prev.fails = 0;
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

/** How many curated level-variants each Descent depth rotates through. */
export const DESCENT_VARIANTS = 10;

/**
 * Claim the next Descent rotation slot. Each new run advances `seq`, so back-to-
 * back runs walk through {@link DESCENT_VARIANTS} different level sequences
 * before any repeat — persisted immediately so an abandoned run still counts.
 */
export function beginDescentRun(): number {
  const variant = load().descent.seq % DESCENT_VARIANTS;
  update((d) => {
    d.descent.seq = (d.descent.seq + 1) % (DESCENT_VARIANTS * 1000);
  });
  return variant;
}

export function recordCascade(score: number, cleared: number): SaveData {
  return update((d) => {
    d.cascade.runs += 1;
    d.cascade.bestScore = Math.max(d.cascade.bestScore, score);
    d.cascade.bestCleared = Math.max(d.cascade.bestCleared, cleared);
  });
}

// ── Lives ──────────────────────────────────────────────────────────────────
/** Apply regen, return the live view. */
export function lives(now = Date.now()): { count: number; msToNext: number } {
  const d = load();
  const l = d.lives;
  if (l.count >= MAX_LIVES) return { count: MAX_LIVES, msToNext: 0 };
  let { count, nextAt } = l;
  if (nextAt === 0) nextAt = now + LIFE_REGEN_MS;
  while (count < MAX_LIVES && now >= nextAt) {
    count += 1;
    nextAt += LIFE_REGEN_MS;
  }
  if (count !== l.count || nextAt !== l.nextAt) {
    update((s) => {
      s.lives.count = count;
      s.lives.nextAt = count >= MAX_LIVES ? 0 : nextAt;
    });
  }
  return { count, msToNext: count >= MAX_LIVES ? 0 : Math.max(0, nextAt - now) };
}

/** Try to consume a life. Returns false if empty. */
export function spendLife(now = Date.now()): boolean {
  const { count } = lives(now);
  if (count <= 0) return false;
  update((s) => {
    if (s.lives.count >= MAX_LIVES) s.lives.nextAt = now + LIFE_REGEN_MS;
    s.lives.count = Math.max(0, s.lives.count - 1);
  });
  return true;
}

export function refillLives(): void {
  update((s) => {
    s.lives.count = MAX_LIVES;
    s.lives.nextAt = 0;
  });
}

export function addShards(n: number): void {
  update((s) => {
    s.shards += n;
  });
}
export function spendShards(n: number): boolean {
  let ok = false;
  update((s) => {
    if (s.shards >= n) {
      s.shards -= n;
      ok = true;
    }
  });
  return ok;
}

export function spendJoker(kind: JokerKind): boolean {
  let ok = false;
  update((d) => {
    if (d.jokers[kind] > 0) {
      d.jokers[kind] -= 1;
      ok = true;
    }
  });
  return ok;
}

/** Grant a region-completion reward once. Returns true if newly granted. */
export function grantRegionReward(regionId: string): boolean {
  let granted = false;
  update((d) => {
    if (d.regionRewards.includes(regionId)) return;
    d.regionRewards.push(regionId);
    d.jokers.hint += 3;
    d.jokers.time += 2;
    d.jokers.solvent += 2;
    d.shards += 25;
    d.lives.count = MAX_LIVES;
    d.lives.nextAt = 0;
    granted = true;
  });
  return granted;
}

export interface Milestone {
  threshold: number;
  shards: number;
  joker: JokerKind;
  label: string;
}

/** Claim every star-milestone the player has passed. Returns the newly claimed ones. */
export function claimMilestones(): Milestone[] {
  const fresh: Milestone[] = [];
  update((d) => {
    const stars = totalStars(d);
    let t = d.milestone + 6;
    while (t <= stars) {
      const m: Milestone = {
        threshold: t,
        shards: 15 + (t / 6) * 5,
        joker: (["hint", "time", "solvent"] as const)[(t / 6) % 3]!,
        label: `${t} Sterne`,
      };
      d.shards += m.shards;
      d.jokers[m.joker] += 2;
      d.milestone = t;
      fresh.push(m);
      t += 6;
    }
  });
  return fresh;
}
