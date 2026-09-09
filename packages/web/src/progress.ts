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

/** „Noch keine Bestzeit" — JSON-fest (anders als `Infinity`, das zu `null` wird). */
export const NO_BEST_MS = Number.MAX_SAFE_INTEGER;

export type JokerKind = "hint" | "time" | "solvent";
export type Jokers = Record<JokerKind, number>;

export const MAX_LIVES = 5;
export const LIFE_REGEN_MS = 20 * 60_000;

export interface SaveData {
  levels: Record<string, LevelResult>;
  profile: { name: string; avatar: string };
  daily: { lastDayDone: string; streak: number; bestStreak: number; claimedMilestones: number[] };
  descent: { bestDepth: number; runs: number; seq: number };
  cascade: { bestScore: number; bestCleared: number; runs: number };
  achievements: string[];
  /** Story-Beats, die schon gespielt wurden (für „Erinnerungen"). */
  beatsSeen: string[];
  jokers: Jokers;
  /** Region ids whose completion reward has been granted. */
  regionRewards: string[];
  /** Highest milestone threshold already claimed. */
  milestone: number;
  /** Light shards — the spendable currency (shop, hearts). */
  shards: number;
  /**
   * Fenster erhellt — die Haupt-Fortschrittszahl der **Story**. Steigt nur durch
   * neu gelöste Kampagnen-Fenster; Abstieg / Kaskade / Tagesfenster füttern sie
   * bewusst *nicht* mehr (die dienen Erfolgen + Lichtsplittern). Sie treibt die
   * Laterne (Regionstor) und die Welt-Helligkeit.
   */
  panes: number;
  /**
   * Ein Kampagnen-Fenster, das gerade begonnen, aber nicht abgeschlossen wurde.
   * Wird beim ersten Zug gesetzt und bei Sieg / Timeout / Verlassen wieder
   * geleert. Steht beim nächsten Start noch etwas drin, war es ein Reload oder
   * App-Kill mitten im Level → zählt nachträglich als Fehlschlag (ein Herz weg),
   * sonst wäre „App wegwischen" ein Gratis-Neustart.
   */
  pendingAttempt: string | null;
  lives: { count: number; nextAt: number };
  stats: {
    solved: number;
    totalMs: number;
    noUndoStreak: number;
    bestNoUndoStreak: number;
    /** Serie gelöster Kampagnen-Fenster in Folge; reißt bei einem Fehlschlag. */
    winStreak: number;
    bestWinStreak: number;
  };
}

const EMPTY: SaveData = {
  levels: {},
  profile: { name: "", avatar: "grin" },
  daily: { lastDayDone: "", streak: 0, bestStreak: 0, claimedMilestones: [] },
  descent: { bestDepth: 0, runs: 0, seq: 0 },
  cascade: { bestScore: 0, bestCleared: 0, runs: 0 },
  achievements: [],
  beatsSeen: [],
  jokers: { hint: 3, time: 2, solvent: 2 },
  regionRewards: [],
  milestone: 0,
  shards: 0,
  panes: 0,
  pendingAttempt: null,
  lives: { count: MAX_LIVES, nextAt: 0 },
  stats: {
    solved: 0,
    totalMs: 0,
    noUndoStreak: 0,
    bestNoUndoStreak: 0,
    winStreak: 0,
    bestWinStreak: 0,
  },
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
      profile: { ...EMPTY.profile, ...parsed.profile },
      daily: { ...EMPTY.daily, ...parsed.daily, claimedMilestones: parsed.daily?.claimedMilestones ?? [] },
      descent: { ...EMPTY.descent, ...parsed.descent },
      cascade: { ...EMPTY.cascade, ...parsed.cascade },
      achievements: parsed.achievements ?? [],
      beatsSeen: parsed.beatsSeen ?? [],
      jokers: { ...EMPTY.jokers, ...parsed.jokers },
      regionRewards: parsed.regionRewards ?? [],
      milestone: parsed.milestone ?? 0,
      shards: parsed.shards ?? 0,
      // Altstände ohne `panes`: aus der Zahl gelöster Fenster ableiten, damit
      // ein bestehender Spieler nicht bei null anfängt.
      panes: parsed.panes ?? parsed.stats?.solved ?? 0,
      pendingAttempt: parsed.pendingAttempt ?? null,
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
 * Monotone Zeitbasis gegen Systemuhr-Manipulation (Herzen / Tagesserie farmen).
 * Bei Sitzungsstart merken wir die Wanduhr **und** `performance.now()` (läuft
 * monoton, unabhängig von der Systemuhr). Springt die Wanduhr während der
 * Sitzung deutlich weiter als die monotone Zeit, wurde sie vorgestellt → wir
 * klemmen auf die tatsächlich verstrichene Zeit zurück. Eine echte lange
 * Abwesenheit passiert *zwischen* Sitzungen und wird beim ersten Aufruf voll
 * angerechnet (dann ist `SESSION` frisch).
 */
const SESSION = { wall: Date.now(), mono: performance.now() };
export function trustedNow(): number {
  const wall = Date.now();
  const drift = wall - SESSION.wall - (performance.now() - SESSION.mono);
  // 2 min Slack für NTP-Korrekturen / Schlaf-Aufwach-Ungenauigkeit
  return drift > 120_000 ? SESSION.wall + (performance.now() - SESSION.mono) : wall;
}

/**
 * Calendar-day key in the player's own local timezone. `toISOString()` would
 * use UTC, which quietly shifts the "day" for anyone not on UTC — e.g. for a
 * German player (UTC+1/+2), the local evening still reads as "tomorrow" in
 * UTC for an hour or two after local midnight has already passed, which is
 * exactly backwards from what a daily streak should feel like.
 */
export function todayKey(now = new Date(trustedNow())): string {
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

/** Der Lichtsplitter-Multiplikator bei einer Serie von `streak` Siegen. */
export function winMultiplier(streak: number): number {
  if (streak >= 7) return 3;
  if (streak >= 4) return 2;
  if (streak >= 2) return 1.5;
  return 1;
}
export function winStreak(d = load()): number {
  return d.stats.winStreak;
}

export interface LevelReward {
  /** Lichtsplitter nach Multiplikator. */
  shards: number;
  /** Der angewandte Multiplikator (1 / 1.5 / 2 / 3). */
  mult: number;
  /** Die neue Serienlänge. */
  streak: number;
  firstClear: boolean;
}

/** Record a campaign/daily level completion; keeps the better result. */
export function recordLevel(
  levelId: string,
  stars: number,
  ms: number,
  usedUndo: boolean,
): LevelReward {
  const out: LevelReward = { shards: 0, mult: 1, streak: 0, firstClear: false };
  update((d) => {
    const prev = d.levels[levelId];
    // „Erstmals erhellt" heißt: vorher nie *gewonnen*. Ein reiner Fehlschlag
    // legt zwar schon einen Eintrag an (`recordFail`, mit `stars: 0`), macht
    // das Fenster damit aber nicht zum Clear — sonst wäre ein einmal
    // verlorenes Fenster für immer kein Erstclear und würde nie `panes`
    // erhöhen (Sackgasse Richtung Farbhof/Finale).
    const firstClear = !prev || prev.stars === 0;
    out.firstClear = firstClear;
    if (!prev || stars > prev.stars || (stars === prev.stars && ms < prev.bestMs)) {
      d.levels[levelId] = { stars, bestMs: ms };
    } else {
      d.levels[levelId] = { ...prev };
    }
    d.levels[levelId]!.fails = 0; // a win always clears the pity streak
    d.pendingAttempt = null; // sauber abgeschlossen

    const isCampaign = !levelId.startsWith("daily:");

    if (firstClear) {
      // Nur ein *neu* gelöstes Fenster zählt für Serie, Fortschritt und
      // Statistik. Wiederholen eines Trivial-Fensters darf nichts davon farmen.
      if (isCampaign) {
        d.stats.winStreak += 1;
        d.stats.bestWinStreak = Math.max(d.stats.bestWinStreak, d.stats.winStreak);
        d.panes += 1; // ein neues Fenster im Tal erhellt
      }
      out.streak = d.stats.winStreak;
      out.mult = isCampaign ? winMultiplier(d.stats.winStreak) : 1;
      out.shards = Math.round((stars + 3) * out.mult);

      d.stats.solved += 1;
      d.stats.totalMs += ms;
      if (usedUndo) {
        d.stats.noUndoStreak = 0;
      } else {
        d.stats.noUndoStreak += 1;
        d.stats.bestNoUndoStreak = Math.max(d.stats.bestNoUndoStreak, d.stats.noUndoStreak);
      }
    } else {
      // Wiederholung: kein Fortschritt, kein Multiplikator — nur ein
      // Token-Betrag, damit „ich hab die Sterne verbessert" sich lohnt.
      out.streak = d.stats.winStreak;
      out.mult = 1;
      out.shards = Math.min(2, stars);
    }
    d.shards += out.shards;
  });
  return out;
}

const PITY_THRESHOLD = 2;

/** A level timed out. Track it so a repeat run can offer a free assist. Breaks the win streak. */
export function recordFail(levelId: string): number {
  let fails = 0;
  update((d) => {
    const prev = d.levels[levelId];
    fails = (prev?.fails ?? 0) + 1;
    d.levels[levelId] = { stars: prev?.stars ?? 0, bestMs: prev?.bestMs ?? NO_BEST_MS, fails };
    d.stats.winStreak = 0;
    d.pendingAttempt = null;
  });
  return fails;
}

/** Ein Kampagnen-Fenster wurde betreten und der erste Zug gemacht. */
export function beginAttempt(levelId: string): void {
  update((d) => {
    d.pendingAttempt = levelId;
  });
}

/** Sauberer Abschluss (Sieg / bewusstes Verlassen) — kein offener Versuch mehr. */
export function endAttempt(): void {
  update((d) => {
    d.pendingAttempt = null;
  });
}

/**
 * Beim Start: stand noch ein offener Versuch in den Save-Daten (Reload / Kill
 * mitten im Level)? Gibt die Level-id zurück und räumt den Marker weg — der
 * Aufrufer verbucht das als Fehlschlag.
 */
export function takePendingAttempt(): string | null {
  const id = load().pendingAttempt;
  if (id) endAttempt();
  return id;
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

export function recordDaily(now = new Date(trustedNow())): SaveData {
  const key = todayKey(now);
  return update((d) => {
    if (d.daily.lastDayDone === key) return;
    const yesterday = todayKey(new Date(now.getTime() - 864e5));
    d.daily.streak = d.daily.lastDayDone === yesterday ? d.daily.streak + 1 : 1;
    d.daily.lastDayDone = key;
    d.daily.bestStreak = Math.max(d.daily.bestStreak, d.daily.streak);
  });
}

/** Einen Tagesserien-Meilenstein einlösen — nur einmal, auch wenn die Serie
 *  bricht und die Schwelle erneut erreicht wird. */
export function claimDailyMilestone(days: number): boolean {
  let fresh = false;
  update((d) => {
    if (!d.daily.claimedMilestones.includes(days)) {
      d.daily.claimedMilestones.push(days);
      fresh = true;
    }
  });
  return fresh;
}

export function recordDescent(depth: number): SaveData {
  return update((d) => {
    d.descent.runs += 1;
    d.descent.bestDepth = Math.max(d.descent.bestDepth, depth);
    // erhellt bewusst *kein* Story-Fenster — der Abstieg dient Erfolgen +
    // Lichtsplittern, die Story bleibt der Kampagne vorbehalten
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
    // erhellt keine Story-Fenster mehr — Punkte zählen für Erfolge, die
    // Lichtsplitter fürs Herz-/Joker-Budget
  });
}

/** Fenster erhellt — die eine Fortschrittszahl. */
export function panes(d: SaveData = load()): number {
  return d.panes;
}

export function markBeatSeen(id: string): void {
  update((d) => {
    if (!d.beatsSeen.includes(id)) d.beatsSeen.push(id);
  });
}
export function beatsSeen(): string[] {
  return load().beatsSeen;
}

// ── Profile ────────────────────────────────────────────────────────────────
/** Player name — generated once and kept, then editable. */
export function playerName(): string {
  const d = load();
  if (d.profile.name) return d.profile.name;
  const name = `player_${Math.random().toString(36).slice(2, 9)}`;
  update((s) => void (s.profile.name = name));
  return name;
}
export function setPlayerName(name: string): void {
  const clean = name.trim().slice(0, 18);
  if (clean) update((d) => void (d.profile.name = clean));
}
export function avatarId(): string {
  return load().profile.avatar || "grin";
}
export function setAvatarId(id: string): void {
  update((d) => void (d.profile.avatar = id));
}

/**
 * „Stufe" ist einfach „Fenster erhellt" — eine Zahl, ein Fortschritt, keine
 * zweite XP-Formel daneben (KONZEPT-lumen.md §F).
 */
export function playerLevel(d: SaveData = load()): number {
  return 1 + d.panes;
}

// ── Lives ──────────────────────────────────────────────────────────────────
/** Apply regen, return the live view. */
export function lives(now = trustedNow()): { count: number; msToNext: number } {
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
export function spendLife(now = trustedNow()): boolean {
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
