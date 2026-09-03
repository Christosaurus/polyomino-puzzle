/**
 * Bootstrap: load the bundled level pack, show a picker, run the selected level.
 */

import { type Level, parseLevel } from "@polyomino/puzzle-core";
import { GameState } from "./game.js";
import { GameView } from "./view.js";

interface ManifestEntry {
  id: string;
  difficulty: number;
  pieces: string;
  rows: number;
  cols: number;
}
interface Manifest {
  seed: string;
  levels: ManifestEntry[];
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const picker = $("picker");
const pickerStatus = $("picker-status");
const levelsGrid = $("levels");
const gameSection = $("game");
const gameControls = $("game-controls");
const canvas = $<HTMLCanvasElement>("canvas");
const boardWrap = $("board-wrap");

let view: GameView | null = null;
let manifest: Manifest | null = null;
let currentIndex = -1;

async function loadManifest(): Promise<void> {
  try {
    const res = await fetch("levels/manifest.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = (await res.json()) as Manifest;
    renderPicker();
  } catch (err) {
    pickerStatus.textContent = `Levels konnten nicht geladen werden (${(err as Error).message}).`;
  }
}

function renderPicker(): void {
  if (!manifest) return;
  pickerStatus.textContent = `${manifest.levels.length} Levels · Seed „${manifest.seed}"`;
  levelsGrid.replaceChildren();
  manifest.levels.forEach((entry, i) => {
    const btn = document.createElement("button");
    const num = document.createElement("strong");
    num.textContent = String(i + 1).padStart(2, "0");
    const diff = document.createElement("span");
    diff.className = "diff";
    diff.textContent = "★".repeat(entry.difficulty) || "–";
    btn.append(num, diff);
    btn.addEventListener("click", () => void openLevel(i));
    levelsGrid.append(btn);
  });
}

async function openLevel(index: number): Promise<void> {
  if (!manifest) return;
  const entry = manifest.levels[index];
  if (!entry) return;
  currentIndex = index;

  let level: Level;
  try {
    const res = await fetch(`levels/${entry.id}.json`);
    level = parseLevel(await res.text());
  } catch (err) {
    pickerStatus.textContent = `Level ${entry.id} fehlerhaft: ${(err as Error).message}`;
    return;
  }

  const game = new GameState(level);
  if (view) view.setGame(game);
  else view = new GameView(canvas, boardWrap, game, showWin);

  picker.hidden = true;
  gameSection.hidden = false;
  gameControls.hidden = false;
  hideWin();
}

function backToPicker(): void {
  picker.hidden = false;
  gameSection.hidden = true;
  gameControls.hidden = true;
  hideWin();
}

function resetLevel(): void {
  if (currentIndex >= 0) void openLevel(currentIndex);
}

function nextLevel(): void {
  if (manifest && currentIndex + 1 < manifest.levels.length) void openLevel(currentIndex + 1);
  else backToPicker();
}

function showWin(): void {
  $("won").classList.add("show");
}
function hideWin(): void {
  $("won").classList.remove("show");
}

$("btn-back").addEventListener("click", backToPicker);
$("btn-reset").addEventListener("click", resetLevel);
$("btn-next").addEventListener("click", nextLevel);

void loadManifest();
