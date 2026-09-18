/** Achievement definitions and unlock checks against the save data. */

import { type SaveData, update } from "./progress.js";

export interface Achievement {
  id: string;
  name: string;
  hint: string;
  icon: string;
  done: (d: SaveData) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "streak-3", name: "Tagesritual", hint: "3 Tage in Folge ein Tagesfenster", icon: "☀", done: (d) => d.daily.bestStreak >= 3 },
  { id: "streak-7", name: "Woche im Licht", hint: "7 Tage Streak", icon: "🗓", done: (d) => d.daily.bestStreak >= 7 },
  { id: "streak-30", name: "Ein Monat Glaserarbeit", hint: "30 Tage Streak", icon: "📅", done: (d) => d.daily.bestStreak >= 30 },
  { id: "cascade-500", name: "Im Scherbenregen", hint: "500 Punkte, bevor die Splitter weg sind", icon: "⚡", done: (d) => d.cascade.bestScore >= 500 },
  { id: "cascade-2000", name: "Kein Splitter für ihn", hint: "2000 Punkte im Scherbenregen", icon: "🌊", done: (d) => d.cascade.bestScore >= 2000 },
  { id: "cascade-5000", name: "Flut", hint: "5000 Punkte im Scherbenregen", icon: "💧", done: (d) => d.cascade.bestScore >= 5000 },
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
