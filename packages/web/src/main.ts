/**
 * Bootstrap: load the bundled level pack, show a picker with earned stars, run
 * the selected level, keep the HUD (timer) and the win card in sync.
 */

import { type Level, parseLevel } from "@polyomino/puzzle-core";
import { GameState } from "./game.js";
import { loadProgress, type Progress, recordResult, totalStars } from "./progress.js";
import { sfx } from "./sfx.js";
import { GameView } from "./view.js";

interface ManifestEntry {
  id: string;
  difficulty: number;
  pieces: string;
}
interface Manifest {
  seed: string;
  levels: ManifestEntry[];
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const picker = $("picker");
const pickerStatus = $("picker-status");
const levelsGrid = $("levels");
const totalStarsEl = $("total-stars");
const gameSection = $("game");
const canvas = $<HTMLCanvasElement>("canvas");
const boardWrap = $("board-wrap");
const timerEl = $("timer");
const winEl = $("win");
const winStars = $("win-stars");
const winTime = $("win-time");
const muteBtn = $<HTMLButtonElement>("btn-mute");

let manifest: Manifest | null = null;
let progress: Progress = loadProgress();
let view: GameView | null = null;
let game: GameState | null = null;
let currentIndex = -1;
let timerHandle = 0;

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

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
  progress = loadProgress();
  const earned = totalStars(progress);
  const possible = manifest.levels.length * 3;
  totalStarsEl.innerHTML = `<b>★ ${earned}</b> / ${possible}`;
  pickerStatus.textContent = `${manifest.levels.length} Levels`;

  levelsGrid.replaceChildren();
  manifest.levels.forEach((entry, i) => {
    const result = progress[entry.id];
    const stars = result?.stars ?? 0;
    const btn = document.createElement("button");
    btn.className = `lvl${stars > 0 ? " done" : ""}`;
    btn.innerHTML =
      `<span class="check">✓</span>` +
      `<span class="n">${String(i + 1).padStart(2, "0")}</span>` +
      `<span class="s">${[0, 1, 2]
        .map((k) => `<span class="${k < stars ? "on" : ""}">★</span>`)
        .join("")}</span>`;
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

  game = new GameState(level);
  if (import.meta.env.DEV) (window as unknown as { __game: GameState }).__game = game;
  if (view) view.setGame(game);
  else view = new GameView(canvas, boardWrap, game, { onWin: handleWin });

  picker.hidden = true;
  gameSection.hidden = false;
  hideWin();
  window.scrollTo(0, 0);
  startTimerLoop();
}

function startTimerLoop(): void {
  stopTimerLoop();
  const tick = (): void => {
    if (!game) return;
    const ms = game.elapsedMs();
    timerEl.textContent = fmt(ms);
    timerEl.classList.toggle("over", ms / 1000 > game.parSeconds && !game.isWon());
  };
  tick();
  timerHandle = window.setInterval(tick, 250);
}
function stopTimerLoop(): void {
  if (timerHandle) window.clearInterval(timerHandle);
  timerHandle = 0;
}

function handleWin(stars: number, ms: number): void {
  if (!manifest || currentIndex < 0) return;
  const entry = manifest.levels[currentIndex]!;
  const prevBest = progress[entry.id]?.bestMs;
  const best = recordResult(entry.id, stars, ms);
  progress = loadProgress();

  [...winStars.children].forEach((el, i) => el.classList.toggle("on", i < stars));
  const isNewBest = prevBest === undefined || ms <= prevBest;
  winTime.innerHTML =
    `Zeit <b>${fmt(ms)}</b>` +
    (isNewBest ? " · neue Bestzeit! 🏆" : ` · Best <b>${fmt(best.bestMs)}</b>`);
  showWin();
}

function showWin(): void {
  // re-trigger the CSS star animation
  winEl.classList.remove("show");
  void winEl.offsetWidth;
  winEl.classList.add("show");
}
function hideWin(): void {
  winEl.classList.remove("show");
}

function backToPicker(): void {
  stopTimerLoop();
  picker.hidden = false;
  gameSection.hidden = true;
  hideWin();
  renderPicker();
}

function resetLevel(): void {
  if (currentIndex >= 0) void openLevel(currentIndex);
}

function nextLevel(): void {
  if (manifest && currentIndex + 1 < manifest.levels.length) void openLevel(currentIndex + 1);
  else backToPicker();
}

muteBtn.addEventListener("click", () => {
  const next = !sfx.muted;
  sfx.setMuted(next);
  muteBtn.textContent = next ? "🔇" : "🔊";
});
$("btn-back").addEventListener("click", backToPicker);
$("btn-reset").addEventListener("click", resetLevel);
$("btn-next").addEventListener("click", nextLevel);

void loadManifest();
