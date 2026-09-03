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
  { id: "first-light", name: "Erstes Licht", hint: "Löse dein erstes Fenster", icon: "✦", done: (d) => d.stats.solved >= 1 },
  { id: "ten-panes", name: "Glasermeister", hint: "Löse 10 Fenster", icon: "❖", done: (d) => d.stats.solved >= 10 },
  { id: "stars-15", name: "Sternensammler", hint: "Sammle 15 Sterne", icon: "★", done: (d) => totalStars(d) >= 15 },
  { id: "stars-30", name: "Lichtträger", hint: "Sammle 30 Sterne", icon: "☆", done: (d) => totalStars(d) >= 30 },
  { id: "clean-hands", name: "Ruhige Hand", hint: "5 Level in Folge ohne Zurücknehmen", icon: "✋", done: (d) => d.stats.bestNoUndoStreak >= 5 },
  { id: "streak-3", name: "Tagesritual", hint: "3 Tage Streak", icon: "☀", done: (d) => d.daily.bestStreak >= 3 },
  { id: "streak-7", name: "Woche im Licht", hint: "7 Tage Streak", icon: "🗓", done: (d) => d.daily.bestStreak >= 7 },
  { id: "descent-5", name: "Abstieg", hint: "Erreiche Ebene 5", icon: "▼", done: (d) => d.descent.bestDepth >= 5 },
  { id: "descent-10", name: "Tiefdunkel", hint: "Erreiche Ebene 10", icon: "⛓", done: (d) => d.descent.bestDepth >= 10 },
  { id: "cascade-500", name: "Im Fluss", hint: "500 Punkte in Kaskade", icon: "⚡", done: (d) => d.cascade.bestScore >= 500 },
  { id: "cascade-2000", name: "Kaskaden-Meister", hint: "2000 Punkte in Kaskade", icon: "🌊", done: (d) => d.cascade.bestScore >= 2000 },
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
