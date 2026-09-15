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
    name: "Der Wachtturm",
    blurb: "Umbra hat den Turm verschüttet. Mira sitzt fest.",
    hero: "mira",
    config: { rows: 5, cols: 6, shardBudget: 10, targetRows: 3, lives: 3 },
  },
  {
    id: "res02",
    name: "Die Kammer",
    blurb: "Ein Einsturz hat Anselms Werkstatt begraben.",
    hero: "anselm",
    config: { rows: 6, cols: 6, shardBudget: 13, targetRows: 4, lives: 3 },
  },
  {
    id: "res03",
    name: "Der Bergpass",
    blurb: "Der Weg zu Mira ist unter Geröll verschwunden.",
    hero: "mira",
    config: { rows: 6, cols: 6, shardBudget: 15, targetRows: 5, lives: 3 },
  },
  {
    id: "res04",
    name: "Die Schlucht",
    blurb: "Anselm klammert sich am Rand — jede Reihe zählt.",
    hero: "anselm",
    config: { rows: 7, cols: 6, shardBudget: 18, targetRows: 6, lives: 3 },
  },
  {
    id: "res05",
    name: "Der Steinbruch",
    blurb: "Umbra türmt schneller, als du schaffen kannst? Zeig's ihm.",
    hero: "mira",
    config: { rows: 7, cols: 6, shardBudget: 20, targetRows: 7, lives: 3 },
  },
  {
    id: "res06",
    name: "Die Ruine",
    blurb: "Weniger Leben, mehr Schutt. Anselm zählt auf dich.",
    hero: "anselm",
    config: { rows: 8, cols: 6, shardBudget: 22, targetRows: 8, lives: 2 },
  },
  {
    id: "res07",
    name: "Der Abgrund",
    blurb: "Fast am Ende der Reihe — Mira hört dich schon graben.",
    hero: "mira",
    config: { rows: 8, cols: 6, shardBudget: 24, targetRows: 9, lives: 2 },
  },
  {
    id: "res08",
    name: "Umbras Bann",
    blurb: "Der schwerste Verschütt von allen. Hol Anselm da raus.",
    hero: "anselm",
    config: { rows: 8, cols: 6, shardBudget: 26, targetRows: 10, lives: 2 },
  },
];

export function rescueLevelById(id: string): RescueLevel | undefined {
  return RESCUE_LEVELS.find((l) => l.id === id);
}
