/**
 * Story-Modus — handgebaute Level auf Kaskade-Basis.
 *
 * Kein Timer: ein festes Scherben-Budget und ein Reihen-Ziel. Jede geräumte
 * Reihe entfernt einen Schuttbrocken aus der Szene über dem Brett und gibt der
 * eingeschlossenen Figur ein Stück mehr Platz — bei `targetRows` ist sie frei.
 * Läuft das Budget aus (Band + Ablage leer) oder gehen die Leben aus, bevor das
 * Ziel steht, ist das Level verloren.
 *
 * Wiederverwendet die schon gelieferten Portraits (`ui/chars/*.webp`) statt
 * neuer Kunst: Umbra bleibt über die ganze Reihe die Bedrohung, befreit werden
 * abwechselnd Mira und Anselm.
 */

import type { LevelConfig } from "./cascade.js";

export interface RescueLevel {
  id: string;
  name: string;
  /** Ein Satz Kontext, in der Szene über dem Brett. */
  blurb: string;
  /** Wer befreit wird — Portrait-Datei unter `ui/chars/`. */
  hero: "mira" | "anselm";
  config: LevelConfig;
}

export const RESCUE_LEVELS: RescueLevel[] = [
  {
    id: "res01",
    name: "The Watchtower",
    blurb: "Umbra has buried the tower. Mira is trapped.",
    hero: "mira",
    config: { rows: 5, cols: 6, shardBudget: 10, targetRows: 3, lives: 3 },
  },
  {
    id: "res02",
    name: "The Chamber",
    blurb: "A collapse has buried Anselm's workshop.",
    hero: "anselm",
    config: { rows: 6, cols: 6, shardBudget: 13, targetRows: 4, lives: 3 },
  },
  {
    id: "res03",
    name: "The Mountain Pass",
    blurb: "The path to Mira has vanished under rubble.",
    hero: "mira",
    config: { rows: 6, cols: 6, shardBudget: 15, targetRows: 5, lives: 3 },
  },
  {
    id: "res04",
    name: "The Ravine",
    blurb: "Anselm clings to the edge — every row counts.",
    hero: "anselm",
    config: { rows: 7, cols: 6, shardBudget: 18, targetRows: 6, lives: 3 },
  },
  {
    id: "res05",
    name: "The Quarry",
    blurb: "Umbra piles it up faster than you can clear it? Show him.",
    hero: "mira",
    config: { rows: 7, cols: 6, shardBudget: 20, targetRows: 7, lives: 3 },
  },
  {
    id: "res06",
    name: "The Ruin",
    blurb: "Fewer lives, more rubble. Anselm is counting on you.",
    hero: "anselm",
    config: { rows: 8, cols: 6, shardBudget: 22, targetRows: 8, lives: 2 },
  },
  {
    id: "res07",
    name: "The Abyss",
    blurb: "Almost at the end of the line — Mira can already hear you digging.",
    hero: "mira",
    config: { rows: 8, cols: 6, shardBudget: 24, targetRows: 9, lives: 2 },
  },
  {
    id: "res08",
    name: "Umbra's Curse",
    blurb: "The heaviest cave-in of all. Get Anselm out of there.",
    hero: "anselm",
    config: { rows: 8, cols: 6, shardBudget: 26, targetRows: 10, lives: 2 },
  },
];

export function rescueLevelById(id: string): RescueLevel | undefined {
  return RESCUE_LEVELS.find((l) => l.id === id);
}
