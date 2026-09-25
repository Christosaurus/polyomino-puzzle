/** Achievement definitions and unlock checks against the save data. */

import { type SaveData, update } from "./progress.js";

export interface Achievement {
  id: string;
  name: string;
  hint: string;
  icon: string;
  done: (d: SaveData) => boolean;
}

/**
 * Kaskade-Erfolgsleiter (Abschnitt 5.2 im Ökonomie-Konzept) — ersetzt die
 * drei alten, rein score-basierten Schwellen. Der Playtest fand: alle drei
 * fielen im ersten guten Lauf, danach war die Erfolgsliste für Kaskade tot.
 * Sechs Dimensionen statt nur Score (Gesamtzahl geräumter Reihen, beste
 * Kette, Perfect Clears, Mega Clears, erfüllte Kombi-Angebote, gespielte
 * Runden), je dreistufig (Bronze/Silber/Gold) — läuft über die kumulierten
 * `d.cascade.total*`-Felder aus `progress.ts` (siehe `recordCascade()`),
 * damit auch nach Woche 3 noch ein Ziel offen ist, statt nach einer einzigen
 * starken Runde alles freizuschalten.
 */
export const ACHIEVEMENTS: Achievement[] = [
  { id: "streak-3", name: "Daily Ritual", hint: "3 days in a row, one daily window", icon: "☀", done: (d) => d.daily.bestStreak >= 3 },
  { id: "streak-7", name: "Week in the Light", hint: "7-day streak", icon: "🗓", done: (d) => d.daily.bestStreak >= 7 },
  { id: "streak-30", name: "A Month of Glasswork", hint: "30-day streak", icon: "📅", done: (d) => d.daily.bestStreak >= 30 },

  { id: "cascade-lines-100", name: "Line Worker", hint: "Clear 100 lines total in Cascade", icon: "🧱", done: (d) => d.cascade.totalCleared >= 100 },
  { id: "cascade-lines-1000", name: "Line Foreman", hint: "1,000 lines cleared total", icon: "🏗", done: (d) => d.cascade.totalCleared >= 1000 },
  { id: "cascade-lines-10000", name: "Line Legend", hint: "10,000 lines cleared total", icon: "🗿", done: (d) => d.cascade.totalCleared >= 10_000 },

  { id: "cascade-chain-5", name: "Chain Reaction", hint: "Chain ×5 in one streak", icon: "🔗", done: (d) => d.cascade.bestChain >= 5 },
  { id: "cascade-chain-10", name: "Unbroken", hint: "Chain ×10", icon: "⛓", done: (d) => d.cascade.bestChain >= 10 },
  { id: "cascade-chain-20", name: "Chain Lightning", hint: "Chain ×20", icon: "🌩", done: (d) => d.cascade.bestChain >= 20 },

  { id: "cascade-perfect-1", name: "Clean Sweep", hint: "Your first Perfect Clear", icon: "🧹", done: (d) => d.cascade.totalPerfectClears >= 1 },
  { id: "cascade-perfect-10", name: "Spotless", hint: "10 Perfect Clears total", icon: "✨", done: (d) => d.cascade.totalPerfectClears >= 10 },
  { id: "cascade-perfect-50", name: "Immaculate", hint: "50 Perfect Clears total", icon: "💎", done: (d) => d.cascade.totalPerfectClears >= 50 },

  { id: "cascade-mega-1", name: "Shockwave", hint: "Your first Mega Clear", icon: "💥", done: (d) => d.cascade.totalMegaClears >= 1 },
  { id: "cascade-mega-5", name: "Chain of Explosions", hint: "5 Mega Clears total", icon: "🎇", done: (d) => d.cascade.totalMegaClears >= 5 },
  { id: "cascade-mega-25", name: "Force of Nature", hint: "25 Mega Clears total", icon: "🌋", done: (d) => d.cascade.totalMegaClears >= 25 },

  { id: "cascade-combo-5", name: "Deal Maker", hint: "5 combo offers fulfilled", icon: "🤝", done: (d) => d.cascade.totalCombosWon >= 5 },
  { id: "cascade-combo-25", name: "Trusted Supplier", hint: "25 combo offers fulfilled", icon: "📦", done: (d) => d.cascade.totalCombosWon >= 25 },
  { id: "cascade-combo-100", name: "Never Late", hint: "100 combo offers fulfilled", icon: "🚚", done: (d) => d.cascade.totalCombosWon >= 100 },

  { id: "cascade-runs-10", name: "Regular", hint: "Play 10 rounds of Cascade", icon: "🎟", done: (d) => d.cascade.runs >= 10 },
  { id: "cascade-runs-50", name: "Storm Chaser", hint: "50 rounds played", icon: "🌪", done: (d) => d.cascade.runs >= 50 },
  { id: "cascade-runs-200", name: "Storm Veteran", hint: "200 rounds played", icon: "🏆", done: (d) => d.cascade.runs >= 200 },
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
