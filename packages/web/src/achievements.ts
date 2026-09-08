/** Achievement definitions and unlock checks against the save data. */

import { type SaveData, totalStars, update } from "./progress.js";

export interface Achievement {
  id: string;
  name: string;
  hint: string;
  icon: string;
  done: (d: SaveData) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  // ── das Tal erhellen ──
  { id: "first-light", name: "Erstes Licht", hint: "Erhelle dein erstes Fenster", icon: "✦", done: (d) => d.panes >= 1 },
  { id: "ten-panes", name: "Der Garten atmet", hint: "20 Fenster im Tal erhellt", icon: "❖", done: (d) => d.panes >= 20 },
  { id: "panes-40", name: "Halbes Tal im Licht", hint: "40 Fenster erhellt", icon: "🏮", done: (d) => d.panes >= 40 },
  { id: "stars-15", name: "Ruhige Schnitte", hint: "Sammle 15 Sterne", icon: "★", done: (d) => totalStars(d) >= 15 },
  { id: "stars-40", name: "Meisterstücke", hint: "Sammle 40 Sterne", icon: "☆", done: (d) => totalStars(d) >= 40 },
  { id: "clean-hands", name: "Anselms Hand", hint: "5 Fenster in Folge ohne Zurücknehmen", icon: "✋", done: (d) => d.stats.bestNoUndoStreak >= 5 },
  // ── die Geschichte ──
  { id: "the-cut", name: "Die Schnitte", hint: "Erkenne, wer die Fenster geschnitten hat", icon: "✂", done: (d) => d.beatsSeen.includes("a2-die-wendung") },
  { id: "the-why", name: "Das Warum", hint: "Erfahre, warum er sammelt", icon: "🕯", done: (d) => d.beatsSeen.includes("a3-das-warum") },
  { id: "last-window", name: "Das letzte Fenster", hint: "Bau es mit ihm zu Ende", icon: "🪟", done: (d) => !!d.levels["boss_01"]?.stars },
  // ── die Nebenwege ──
  { id: "streak-3", name: "Tagesritual", hint: "3 Tage in Folge ein Fenster", icon: "☀", done: (d) => d.daily.bestStreak >= 3 },
  { id: "streak-7", name: "Woche im Licht", hint: "7 Tage Streak", icon: "🗓", done: (d) => d.daily.bestStreak >= 7 },
  { id: "descent-5", name: "In Anselms Stollen", hint: "Steig 5 Ebenen hinab", icon: "▼", done: (d) => d.descent.bestDepth >= 5 },
  { id: "descent-10", name: "Tief, wo er war", hint: "10 Ebenen tief in den Stollen", icon: "⛓", done: (d) => d.descent.bestDepth >= 10 },
  { id: "cascade-500", name: "Im Scherbenregen", hint: "500 Punkte, bevor die Splitter weg sind", icon: "⚡", done: (d) => d.cascade.bestScore >= 500 },
  { id: "cascade-2000", name: "Kein Splitter für ihn", hint: "2000 Punkte im Scherbenregen", icon: "🌊", done: (d) => d.cascade.bestScore >= 2000 },
];

export function unlockedCount(d: SaveData): number {
  return ACHIEVEMENTS.filter((a) => a.done(d)).length;
}

/**
 * Persist any newly-satisfied achievements and return the ones that just flipped
 * (for a toast). Call after every result.
 */
export function syncAchievements(): Achievement[] {
  let freshly: Achievement[] = [];
  update((d) => {
    freshly = ACHIEVEMENTS.filter((a) => a.done(d) && !d.achievements.includes(a.id));
    for (const a of freshly) d.achievements.push(a.id);
  });
  return freshly;
}
