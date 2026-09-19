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
  { id: "streak-3", name: "Daily Ritual", hint: "3 days in a row, one daily window", icon: "☀", done: (d) => d.daily.bestStreak >= 3 },
  { id: "streak-7", name: "Week in the Light", hint: "7-day streak", icon: "🗓", done: (d) => d.daily.bestStreak >= 7 },
  { id: "streak-30", name: "A Month of Glasswork", hint: "30-day streak", icon: "📅", done: (d) => d.daily.bestStreak >= 30 },
  { id: "cascade-500", name: "In the Shard Storm", hint: "500 points before you run out of shards", icon: "⚡", done: (d) => d.cascade.bestScore >= 500 },
  { id: "cascade-2000", name: "Not a Shard for Him", hint: "2000 points in the Shard Storm", icon: "🌊", done: (d) => d.cascade.bestScore >= 2000 },
  { id: "cascade-5000", name: "Flood", hint: "5000 points in the Shard Storm", icon: "💧", done: (d) => d.cascade.bestScore >= 5000 },
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
