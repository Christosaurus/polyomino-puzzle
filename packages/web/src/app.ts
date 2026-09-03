/**
 * App shell: bottom-tab navigation between Spielen (regions → levels), Täglich,
 * Abstieg, Kaskade and Sammlung; plus the shared play screen for the three
 * "fill the frame" modes and the Kaskade screen.
 */

import { type Level, parseLevel } from "@polyomino/puzzle-core";
import { ACHIEVEMENTS, syncAchievements, unlockedCount } from "./achievements.js";
import { CascadeState } from "./cascade.js";
import { CascadeView } from "./cascade-view.js";
import { GameState } from "./game.js";
import { dailyLevel, descentLevel } from "./levelgen.js";
import * as store from "./progress.js";
import { buildRegions, type Manifest, type Region } from "./regions.js";
import { sfx } from "./sfx.js";
import { GameView } from "./view.js";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const fmt = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

type Tab = "home" | "daily" | "descent" | "cascade" | "collection";
const SCREENS = [
  "home",
  "region",
  "daily",
  "descent",
  "cascade",
  "collection",
  "play",
  "kaskade",
] as const;
type ScreenName = (typeof SCREENS)[number];

let manifest: Manifest | null = null;
let regions: Region[] = [];
let gameView: GameView | null = null;
let cascadeView: CascadeView | null = null;
let clockTimer = 0;

let mode: "campaign" | "daily" | "descent" = "campaign";
let campaignAt: { region: Region; index: number } | null = null;
let descentState: { seed: string; depth: number } | null = null;

// ── Navigation ─────────────────────────────────────────────────────────────
function showScreen(name: ScreenName): void {
  for (const s of SCREENS) $(`screen-${s}`).hidden = s !== name;
  const inGame = name === "play" || name === "kaskade";
  $("tabbar").hidden = inGame;
  if (!inGame) teardownGame();
}

function setTab(tab: Tab): void {
  for (const btn of document.querySelectorAll<HTMLButtonElement>("#tabbar button")) {
    btn.classList.toggle("on", btn.dataset.tab === tab);
  }
  if (tab === "home") renderHome();
  if (tab === "daily") renderDaily();
  if (tab === "descent") renderDescent();
  if (tab === "cascade") renderCascade();
  if (tab === "collection") renderCollection();
  showScreen(tab);
}

function teardownGame(): void {
  gameView?.destroy();
  gameView = null;
  cascadeView?.destroy();
  cascadeView = null;
  if (clockTimer) window.clearInterval(clockTimer);
  clockTimer = 0;
}

// ── Home / regions ─────────────────────────────────────────────────────────
function regionStars(r: Region): { got: number; max: number } {
  const s = store.load();
  const got = r.levels.reduce((n, l) => n + (s.levels[l.id]?.stars ?? 0), 0);
  return { got, max: r.levels.length * 3 };
}

function renderHome(): void {
  if (!manifest) return;
  const s = store.load();
  const total = store.totalStars(s);
  $("home-stars").innerHTML = `<b>★ ${total}</b> / ${manifest.levels.length * 3}`;
  $("home-status").textContent = "Bring das Licht zurück, Region für Region.";

  const host = $("regions");
  host.replaceChildren();
  regions.forEach((r, i) => {
    const locked = total < r.starsToUnlock;
    const { got, max } = regionStars(r);
    const card = document.createElement("div");
    card.className = `card${locked ? " locked" : ""}`;
    card.innerHTML = `
      <div class="row">
        <div><div class="big">${r.name}</div><div class="muted">${r.subtitle}</div></div>
        <div style="text-align:right">${
          locked ? `🔒 ${r.starsToUnlock}★` : `<b style="color:var(--lumen)">★ ${got}</b><div class="muted">/ ${max}</div>`
        }</div>
      </div>
      <div class="progress"><i style="width:${max ? (got / max) * 100 : 0}%"></i></div>`;
    if (!locked) card.addEventListener("click", () => openRegion(i));
    host.append(card);
  });
}

function openRegion(index: number): void {
  const r = regions[index];
  if (!r) return;
  $("region-name").textContent = r.name;
  $("region-sub").textContent = r.subtitle;
  const s = store.load();
  const host = $("region-levels");
  host.replaceChildren();
  r.levels.forEach((entry, i) => {
    const stars = s.levels[entry.id]?.stars ?? 0;
    const el = document.createElement("button");
    el.className = `lvl${stars > 0 ? " done" : ""}`;
    el.innerHTML =
      `<span class="n">${i + 1}</span>` +
      `<span class="s">${[0, 1, 2].map((k) => `<span class="${k < stars ? "on" : ""}">★</span>`).join("")}</span>`;
    el.addEventListener("click", () => playCampaign(r, i));
    host.append(el);
  });
  showScreen("region");
}

// ── Shared play screen ─────────────────────────────────────────────────────
interface OverlayOpts {
  title: string;
  stars?: number;
  sub?: string;
  nextLabel: string;
  onNext: () => void;
  quitLabel?: string;
  onQuit: () => void;
}
function showOverlay(o: OverlayOpts): void {
  $("ov-title").textContent = o.title;
  const starsEl = $("ov-stars");
  starsEl.hidden = o.stars === undefined;
  [...starsEl.children].forEach((c, i) => c.classList.toggle("on", i < (o.stars ?? 0)));
  $("ov-sub").innerHTML = o.sub ?? "";
  const next = $<HTMLButtonElement>("ov-next");
  const quit = $<HTMLButtonElement>("ov-quit");
  next.textContent = o.nextLabel;
  quit.textContent = o.quitLabel ?? "Übersicht";
  next.onclick = o.onNext;
  quit.onclick = o.onQuit;
  const ov = $("play-overlay");
  ov.classList.remove("show");
  void ov.offsetWidth;
  ov.classList.add("show");
}
function hideOverlay(): void {
  $("play-overlay").classList.remove("show");
}

function startClock(game: GameState): void {
  if (clockTimer) window.clearInterval(clockTimer);
  const tick = (): void => {
    const ms = game.remainingMs();
    const el = $("play-clock");
    el.textContent = fmt(ms);
    el.classList.toggle("warn", !game.isWon() && (ms < 15_000 || ms / game.limitMs < 0.2));
  };
  tick();
  clockTimer = window.setInterval(tick, 250);
}

function mountGame(game: GameState, cb: { onWin: (s: number, ms: number) => void; onTimeout: () => void }): void {
  teardownGame();
  hideOverlay();
  if (import.meta.env.DEV) (window as unknown as { __game: GameState }).__game = game;
  gameView = new GameView($<HTMLCanvasElement>("play-canvas"), $("play-wrap"), game, cb);
  startClock(game);
  showScreen("play");
  window.scrollTo(0, 0);
}

function celebrate(freshly: ReturnType<typeof syncAchievements>): void {
  if (freshly.length > 0) toast(`Erfolg: ${freshly[0]!.name}`);
}

// Campaign
async function playCampaign(region: Region, index: number): Promise<void> {
  mode = "campaign";
  campaignAt = { region, index };
  const entry = region.levels[index];
  if (!entry) return;
  $("play-title-txt").textContent = `${region.name} · ${index + 1}`;
  let level: Level;
  try {
    level = parseLevel(await (await fetch(`levels/${entry.id}.json`)).text());
  } catch {
    return;
  }
  const game = new GameState(level);
  mountGame(game, {
    onWin: (stars, ms) => {
      store.recordLevel(entry.id, stars, ms, game.usedUndo);
      celebrate(syncAchievements());
      const hasNext = index + 1 < region.levels.length;
      showOverlay({
        title: "Gelöst!",
        stars,
        sub: `Zeit <b>${fmt(ms)}</b> · <b>${fmt(game.remainingMs())}</b> übrig`,
        nextLabel: hasNext ? "Weiter ›" : "Region ✓",
        onNext: () => (hasNext ? playCampaign(region, index + 1) : openRegion(regions.indexOf(region))),
        onQuit: () => openRegion(regions.indexOf(region)),
      });
    },
    onTimeout: () =>
      showOverlay({
        title: "Das Licht flackert aus",
        sub: "Diesmal war die Uhr schneller.",
        nextLabel: "Nochmal",
        onNext: () => playCampaign(region, index),
        onQuit: () => openRegion(regions.indexOf(region)),
      }),
  });
}

// Daily
function renderDaily(): void {
  const s = store.load();
  $("daily-streak").textContent = `🔥 ${s.daily.streak}`;
  $("daily-best").textContent = String(s.daily.bestStreak);
  const done = s.daily.lastDayDone === store.todayKey();
  $<HTMLButtonElement>("daily-play").textContent = done ? "Heute nochmal" : "Heute spielen";
  $("daily-note").textContent = done
    ? "Heute schon geschafft — Streak gesichert."
    : "Ein neues Fenster jeden Tag — für alle gleich.";
}
async function playDaily(): Promise<void> {
  mode = "daily";
  const day = store.todayKey();
  toast("Fenster wird gebaut …");
  await yieldPaint();
  const level = dailyLevel(day);
  if (!level) {
    toast("Konnte kein Tagesrätsel erzeugen");
    return;
  }
  $("play-title-txt").textContent = "Täglich";
  const game = new GameState(level);
  mountGame(game, {
    onWin: (stars, ms) => {
      store.recordLevel(`daily:${day}`, stars, ms, game.usedUndo);
      const before = store.load().daily.streak;
      const after = store.recordDaily().daily.streak;
      celebrate(syncAchievements());
      showOverlay({
        title: "Gelöst!",
        stars,
        sub: after > before ? `Streak <b>🔥 ${after}</b>` : `Zeit <b>${fmt(ms)}</b>`,
        nextLabel: "Fertig",
        onNext: () => setTab("daily"),
        onQuit: () => setTab("daily"),
      });
    },
    onTimeout: () =>
      showOverlay({
        title: "Das Licht flackert aus",
        nextLabel: "Nochmal",
        onNext: playDaily,
        onQuit: () => setTab("daily"),
      }),
  });
}

// Descent
function renderDescent(): void {
  const s = store.load();
  $("descent-best").textContent = `Ebene ${s.descent.bestDepth}`;
  $("descent-runs").textContent = String(s.descent.runs);
}
function startDescent(): void {
  descentState = { seed: `run-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, depth: 1 };
  playDescentLevel();
}
async function playDescentLevel(): Promise<void> {
  mode = "descent";
  if (!descentState) return;
  const { seed, depth } = descentState;
  toast("Fenster wird gebaut …");
  await yieldPaint();
  const level = descentLevel(depth, seed);
  if (!level) {
    endDescent();
    return;
  }
  $("play-title-txt").textContent = `Ebene ${depth}`;
  const base = new GameState(level);
  const game = new GameState(level, Math.round(base.limitMs * 0.72));
  mountGame(game, {
    onWin: () => {
      descentState!.depth = depth + 1;
      store.recordDescent(depth);
      celebrate(syncAchievements());
      showOverlay({
        title: `Ebene ${depth} ✓`,
        sub: `<b>${fmt(game.remainingMs())}</b> übrig`,
        nextLabel: "Tiefer ›",
        onNext: playDescentLevel,
        quitLabel: "Aufhören",
        onQuit: endDescent,
      });
    },
    onTimeout: () => {
      store.recordDescent(depth);
      celebrate(syncAchievements());
      endDescent(depth);
    },
  });
}
function endDescent(reachedDepth?: number): void {
  const depth = reachedDepth ?? descentState?.depth ?? 0;
  descentState = null;
  showOverlay({
    title: "Abstieg beendet",
    sub: `Du kamst bis <b>Ebene ${depth}</b>.`,
    nextLabel: "Neuer Lauf",
    onNext: startDescent,
    onQuit: () => setTab("descent"),
  });
}

// ── Kaskade ────────────────────────────────────────────────────────────────
function renderCascade(): void {
  const s = store.load();
  $("cascade-best").textContent = String(s.cascade.bestScore);
  $("cascade-cleared").textContent = String(s.cascade.bestCleared);
}
function startCascade(): void {
  teardownGame();
  $("k-overlay").classList.remove("show");
  const game = new CascadeState(`kaskade-${Date.now()}`);
  if (import.meta.env.DEV) (window as unknown as { __cascade: CascadeState }).__cascade = game;
  cascadeView = new CascadeView($<HTMLCanvasElement>("k-canvas"), $("k-wrap"), game, {
    onHud: (h) => {
      $("k-score-txt").textContent = String(h.score);
      $("k-mult").textContent = `×${h.mult.toFixed(1)}`;
      $("k-cleared").textContent = String(h.cleared);
      const el = $("k-clock");
      el.textContent = fmt(h.ms);
      el.classList.toggle("warn", h.ms < 12_000);
    },
    onEnd: (r) => {
      store.recordCascade(r.score, r.cleared);
      celebrate(syncAchievements());
      $("k-result").innerHTML =
        `<b>${r.score}</b> Punkte · ${r.cleared} Reihen` +
        (r.perfectClears ? ` · ${r.perfectClears}× perfekt` : "");
      const ov = $("k-overlay");
      ov.classList.remove("show");
      void ov.offsetWidth;
      ov.classList.add("show");
    },
  });
  showScreen("kaskade");
  window.scrollTo(0, 0);
}

// ── Sammlung ───────────────────────────────────────────────────────────────
function renderCollection(): void {
  const s = store.load();
  const avg = s.stats.solved ? s.stats.totalMs / s.stats.solved : 0;
  const stats: [string, string][] = [
    ["Sterne", String(store.totalStars(s))],
    ["Fenster gelöst", String(s.stats.solved)],
    ["Ø Zeit", s.stats.solved ? fmt(avg) : "–"],
    ["Abstieg", `Ebene ${s.descent.bestDepth}`],
    ["Kaskade", String(s.cascade.bestScore)],
    ["Erfolge", `${unlockedCount(s)} / ${ACHIEVEMENTS.length}`],
  ];
  $("stats").replaceChildren(
    ...stats.map(([label, val]) => {
      const d = document.createElement("div");
      d.className = "stat";
      d.innerHTML = `<b>${val}</b><small>${label}</small>`;
      return d;
    }),
  );
  $("achievements").replaceChildren(
    ...ACHIEVEMENTS.map((a) => {
      const done = a.done(s);
      const d = document.createElement("div");
      d.className = `ach${done ? " done" : " locked"}`;
      d.innerHTML = `<div class="ic">${a.icon}</div><div><div class="t">${a.name}</div><div class="h">${a.hint}</div></div>`;
      return d;
    }),
  );
}

/** Yield to the renderer so a "building…" hint can paint before a slow sync call. */
const yieldPaint = (): Promise<void> => new Promise((r) => setTimeout(r, 24));

// ── Toast ──────────────────────────────────────────────────────────────────
let toastTimer = 0;
function toast(text: string): void {
  const el = $("toast");
  el.textContent = text;
  el.classList.add("show");
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("show"), 2400);
}

// ── Wiring ─────────────────────────────────────────────────────────────────
for (const btn of document.querySelectorAll<HTMLButtonElement>("#tabbar button")) {
  btn.addEventListener("click", () => setTab(btn.dataset.tab as Tab));
}
$("region-back").addEventListener("click", () => setTab("home"));
$("play-back").addEventListener("click", () => {
  if (mode === "campaign" && campaignAt) openRegion(regions.indexOf(campaignAt.region));
  else if (mode === "daily") setTab("daily");
  else setTab("descent");
});
$("play-reset").addEventListener("click", () => {
  if (mode === "campaign" && campaignAt) playCampaign(campaignAt.region, campaignAt.index);
  else if (mode === "daily") playDaily();
  else playDescentLevel();
});
$("daily-play").addEventListener("click", playDaily);
$("descent-play").addEventListener("click", startDescent);
$("cascade-play").addEventListener("click", startCascade);
$("k-back").addEventListener("click", () => setTab("cascade"));
$("k-quit").addEventListener("click", () => setTab("cascade"));
$("k-again").addEventListener("click", startCascade);

async function boot(): Promise<void> {
  try {
    manifest = (await (await fetch("levels/manifest.json")).json()) as Manifest;
    regions = buildRegions(manifest);
    renderHome();
  } catch (err) {
    $("home-status").textContent = `Levels konnten nicht geladen werden (${(err as Error).message}).`;
  }
}
void boot();
