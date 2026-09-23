/**
 * App shell: bottom-tab navigation between Start (jetzt direkt Kaskade),
 * Täglich und Sammlung; plus der geteilte Play-Screen für Kaskade.
 * Kampagne (Regionen/Fenster), Abstieg UND Story Mode (Rettungslevel) sind
 * ohne Tab/Einstieg nicht mehr erreichbar (Christians Entscheidung: der
 * Fokus liegt jetzt ausschließlich auf Kaskade), ihr Code bleibt aber
 * unangetastet liegen (nicht gelöscht).
 */

import { type Level, parseLevel, rngFromSeed } from "@polyomino/puzzle-core";
import { ACHIEVEMENTS, syncAchievements, unlockedCount } from "./achievements.js";
import { BEATS, type Beat, beatAfter, INTRO, SPEAKERS } from "./beats.js";
import {
  type ChallengeKind,
  CHALLENGE_PREVIEW_MS,
  CHALLENGE_WINDOW_MS,
  COMBO_DECISION_MS,
  CascadeState,
} from "./cascade.js";
import { CascadeView } from "./cascade-view.js";
import { RESCUE_LEVELS, type RescueLevel } from "./rescue-levels.js";
import { GameState } from "./game.js";
import { dailyLevel, descentDifficulty, descentLevel, levelSignature } from "./levelgen.js";
import { countryName, detectCountry, flag } from "./countries.js";
import {
  isoWeek,
  type LeaderRow,
  playerId,
  startCascadeRun,
  submitCascadeScore,
  topCascade,
} from "./leaderboard.js";
import * as store from "./progress.js";
import type { JokerKind } from "./progress.js";
import { buildRegions, type Manifest, type Region } from "./regions.js";
import { Scenery, type SceneTheme } from "./scenery.js";
import { sfx } from "./sfx.js";
import { duckMusic, playMusic, setMusicEnabled, setMusicVolume } from "./music.js";
import { setAudioDesired } from "./audio-core.js";
import { miraLine, type StoryPlace } from "./story.js";
import { mountTalkarteFx } from "./talkarte.js";
import { pickChatter } from "./chatter.js";
import { windowName } from "./windows.js";
import { GameView } from "./view.js";
import { shardDef } from "./shards.js";
import { drawPieceBody } from "./render.js";
import { nf, xf } from "./format.js";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const fmt = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// iOS ignoriert `user-scalable=no`/`touch-action` als Homescreen-App gern
// mal weiter und zoomt/springt trotzdem beim schnellen Doppeltippen (das
// klassische "Doppeltipp zoomt in den Absatz"-Verhalten aus Safari) — macht
// ein Spiel mit schnellen Taps unspielbar. Fängt den zweiten Tap einer
// Doppeltipp-Sequenz global ab, bevor der Browser sie als Zoom deutet.
let lastTouchEndAt = 0;
window.addEventListener(
  "touchend",
  (e) => {
    const now = Date.now();
    if (now - lastTouchEndAt <= 350) e.preventDefault();
    lastTouchEndAt = now;
  },
  { passive: false },
);
const CHALLENGE_ICON: Record<ChallengeKind, string> = {
  straight: "📏",
  rows: "🧱",
  mono: "🎨",
  combo: "🔥",
};

/** Zeichnet die Zielfigur eines Kombi-Angebots klein auf eine eigene Canvas —
 *  Spieler müssen die Form erkennen, um zu entscheiden, ob sie annehmen. */
function drawPieceIcon(canvas: HTMLCanvasElement, name: string): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const def = shardDef(name);
  const cells = def.orientations[0]!;
  let maxR = 0;
  let maxC = 0;
  let minR = 9;
  let minC = 9;
  for (const [r, c] of cells) {
    maxR = Math.max(maxR, r);
    maxC = Math.max(maxC, c);
    minR = Math.min(minR, r);
    minC = Math.min(minC, c);
  }
  const w = maxC - minC + 1;
  const h = maxR - minR + 1;
  const size = canvas.clientWidth || canvas.width;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const cell = Math.floor((size - 6) / Math.max(w, h));
  const ox = (size - w * cell) / 2;
  const oy = (size - h * cell) / 2;
  drawPieceBody(
    ctx,
    cells.map(([r, c]) => [r - minR, c - minC] as [number, number]),
    ox,
    oy,
    cell,
    def.color,
  );
}

type Tab = "home" | "daily" | "descent" | "collection";
const SCREENS = [
  "home",
  "region",
  "daily",
  "descent",
  "rescue",
  "collection",
  "play",
  "kaskade",
] as const;
type ScreenName = (typeof SCREENS)[number];

let manifest: Manifest | null = null;
let regions: Region[] = [];
let gameView: GameView | null = null;
let cascadeView: CascadeView | null = null;
let cascadeGame: CascadeState | null = null;
/** Wohin „Neu starten" / „Beenden" in der Pause führen — Free Play und
 *  Story-Level teilen sich denselben Play-Screen + dieselbe Pause-Overlay,
 *  darum wird das hier pro Lauf umgebogen statt fest verdrahtet. */
let cascadeRestart: () => void = () => startCascade();
let cascadeQuit: () => void = () => setTab("home");
let clockTimer = 0;
/** Kurze Schonfrist nach dem Öffnen: wer nur reinschaut, kann ohne Kosten
 *  wieder raus — danach läuft die Uhr, auch ohne ersten Zug. Sonst wäre
 *  „Fenster öffnen, Lösung durchdenken, gratis raus, mit voller Zeit rein"
 *  ein Exploit. */
let graceTimer = 0;
const scenery = new Scenery($<HTMLCanvasElement>("scenery"));

/** How lit the world is (0..1), from campaign stars. */
function lightFrac(): number {
  // Das Tal ist voll im Licht, wenn alle Kampagnen-Fenster erhellt sind. `panes`
  // steigt nur über Erstclears (Nebenmodi zahlen nicht ein), also ist die
  // Fenster­zahl im Manifest die Obergrenze — kein „+12"-Puffer mehr, sonst
  // bliebe das Tal auch nach 100 % Kampagne bei ~82 % stehen.
  const full = Math.max(20, manifest?.levels.length ?? 30);
  return Math.min(1, store.panes(store.load()) / full);
}
function refreshLight(): void {
  // steep early curve so the first region visibly warms the world
  scenery.setLight(0.14 + 0.86 * Math.pow(lightFrac(), 0.6));
}

/**
 * „Noch N Fenster bis <Region>" — nur wenn eine gesperrte Region in Reichweite
 * ist. Wird nach einem Erstclear gezeigt, damit das nächste Regionstor sichtbar
 * bleibt.
 */
function nextRegionNudge(): string | null {
  const panes = store.panes();
  const next = regions.find((r) => panes < r.panesToUnlock);
  if (!next) return null;
  const left = next.panesToUnlock - panes;
  if (left > 8) return null;
  return `🔒 ${left} more windows to ${next.name}`;
}

const REGION_THEME: Record<string, SceneTheme> = {
  garden: "garden",
  workshop: "workshop",
  courtyard: "courtyard",
};

/** set the numeric part of a `.pill` (keeps the leading icon span) */
function pillValue(id: string, value: string): void {
  const el = $(id);
  const ic = el.querySelector(".ic");
  el.textContent = "";
  if (ic) el.append(ic);
  el.append(document.createTextNode(value));
}

function renderTopPills(): void {
  const s = store.load();
  const l = store.lives();
  const livesTxt = l.count >= store.MAX_LIVES ? `${l.count}` : `${l.count} · ${fmt(l.msToNext)}`;
  pillValue("home-lives", livesTxt);
  pillValue("home-shards", nf(s.shards));
  pillValue("play-lives", livesTxt);
  const rs = document.getElementById("region-stars");
  if (rs) pillValue("region-stars", nf(store.totalStars(s)));
}

/**
 * Herzen sind eine bewusste künstliche Verknappung — **nur im Story-Modus**.
 * Abstieg, Kaskade und das Tagesfenster kosten kein Herz. Wer nicht 20 min auf
 * ein Herz warten will, soll sich später über einen Werbe-Block eins holen
 * können (siehe `KONZEPT-lumen.md` §H — diese Entscheidung überschreibt den
 * dortigen Vorschlag, keine Herzen zu haben).
 */
function livesGate(onBuy: () => void): boolean {
  if (store.lives().count > 0) return true;
  const l = store.lives();
  const canPay = store.load().shards >= 30;
  showScreen("play");
  showOverlay({
    title: "No Hearts",
    sub: `A heart returns in <b>${fmt(l.msToNext)}</b>.`,
    rewards: [
      "📺 Watch ad → +1 heart  (soon)",
      canPay ? "✦ 30 shards → hearts full" : `✦ ${nf(store.load().shards)} / 30 shards`,
    ],
    nextLabel: canPay ? "Buy hearts (30 ✦)" : "Back",
    onNext: () => {
      if (store.spendShards(30)) {
        store.refillLives();
        toast("Hearts refilled");
        renderTopPills();
        onBuy();
      } else {
        setTab("home");
      }
    },
    quitLabel: "Back",
    onQuit: () => setTab("home"),
  });
  return false;
}

// ── Settings (sound / music / haptics) ─────────────────────────────────────
interface Settings {
  sound: boolean;
  music: boolean;
  haptics: boolean;
  /** 0..1 — Regler in den Einstellungen, unabhängig vom Music-An/Aus-Schalter. */
  musicVolume: number;
}
const DEFAULT_SETTINGS: Settings = { sound: true, music: true, haptics: true, musicVolume: 0.5 };
function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("lumen.settings") ?? "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
function saveSettings(s: Settings): void {
  try {
    localStorage.setItem("lumen.settings", JSON.stringify(s));
  } catch {
    /* ignore */
  }
  sfx.setMuted(!s.sound);
  sfx.setHaptics(s.haptics);
  setMusicEnabled(s.music);
  setMusicVolume(s.musicVolume);
  // Nur wenn tatsächlich Ton gewünscht ist, darf das Spiel den iOS-Audiokanal
  // übernehmen (siehe audio-core.ts) — sonst blockiert es unnötig z. B.
  // Spotify im Hintergrund, obwohl im Spiel selbst gar kein Ton läuft.
  setAudioDesired(s.sound || s.music);
}
let settings = loadSettings();
saveSettings(settings);

/** Musik-Zeile: Mute-Knopf links, Lautstärke-Regler rechts — ersetzt den
 *  sonst üblichen Aus/An-Schalter, weil Musik eine Lautstärke braucht,
 *  nicht nur ein Ja/Nein. */
function buildMusicRow(): HTMLElement {
  const row = document.createElement("div");
  row.className = "toggle-row music-row";
  const span = document.createElement("span");
  span.textContent = "🎵 Music";

  const control = document.createElement("div");
  control.className = "vol-control";

  const muteBtn = document.createElement("button");
  muteBtn.type = "button";
  muteBtn.className = "mute-btn";
  const syncMuteIcon = (): void => {
    muteBtn.textContent = settings.music ? "🔊" : "🔇";
    muteBtn.setAttribute("aria-label", settings.music ? "Mute music" : "Unmute music");
  };
  syncMuteIcon();
  muteBtn.addEventListener("click", () => {
    settings = { ...settings, music: !settings.music };
    saveSettings(settings);
    syncMuteIcon();
    if (settings.music) sfx.toggleOn();
  });

  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "vol-slider";
  slider.min = "0";
  slider.max = "100";
  slider.value = String(Math.round(settings.musicVolume * 100));
  slider.setAttribute("aria-label", "Music volume");
  slider.addEventListener("input", () => {
    settings = { ...settings, musicVolume: Number(slider.value) / 100 };
    saveSettings(settings);
  });

  control.append(muteBtn, slider);
  row.append(span, control);
  return row;
}

function renderSettingsToggles(host: HTMLElement): void {
  const rows: Array<[keyof Settings, string, string]> = [
    ["sound", "🔊", "Sound"],
    ["haptics", "📳", "Haptics"],
  ];
  host.replaceChildren(
    buildMusicRow(),
    ...rows.map(([key, icon, label]) => {
      const row = document.createElement("div");
      row.className = "toggle-row";
      const span = document.createElement("span");
      span.textContent = `${icon} ${label}`;

      // Die ganze „Aus | An"-Fläche ist ein Schalter. Er wird *im Platz*
      // umgestellt (aria-checked), nicht neu gebaut — sonst startet das Element
      // schon im Endzustand und die Gleit-Transition läuft nie.
      const seg = document.createElement("button");
      seg.type = "button";
      seg.className = "seg";
      seg.setAttribute("role", "switch");
      seg.setAttribute("aria-label", label);
      seg.setAttribute("aria-checked", String(settings[key]));
      const off = document.createElement("span");
      off.textContent = "Off";
      const on = document.createElement("span");
      on.textContent = "On";
      seg.append(off, on);
      seg.addEventListener("click", () => {
        const next = !settings[key];
        settings = { ...settings, [key]: next };
        seg.setAttribute("aria-checked", String(next));
        saveSettings(settings);
        // hörbare/fühlbare Bestätigung genau dann, wenn etwas *angeht*
        if (next && key === "sound") sfx.toggleOn();
        if (next && key === "haptics") sfx.vibrate(20);
      });

      row.append(span, seg);
      return row;
    }),
  );
}

let mode: "campaign" | "daily" | "descent" = "campaign";
let campaignAt: { region: Region; index: number } | null = null;
let descentState:
  | { variant: number; depth: number; streak: number; sawRecord: boolean; recent: string[]; shards: number }
  | null = null;
let activeGame: GameState | null = null;

/** Short bursts of praise for the between-levels moment, rotated (never RNG). */
const HYPE_WORDS = [
  "Wow!",
  "Amazing!",
  "Awesome!",
  "Incredible!",
  "Keep it up!",
  "Unstoppable!",
  "Fantastic!",
  "Superb!",
];

function hideAllOverlays(): void {
  for (const id of ["play-overlay", "pause-overlay", "k-overlay", "k-pause-overlay", "profile-overlay"]) {
    document.getElementById(id)?.classList.remove("show");
  }
  const cs = document.getElementById("cutscene");
  if (cs) {
    cs.classList.remove("show");
    cs.hidden = true;
  }
}

// ── Navigation ─────────────────────────────────────────────────────────────
function showScreen(name: ScreenName): void {
  for (const s of SCREENS) $(`screen-${s}`).hidden = s !== name;
  const inGame = name === "play" || name === "kaskade";
  $("tabbar").hidden = inGame;
  if (!inGame) {
    teardownGame();
    hideAllOverlays();
  }
}

function setTab(tab: Tab): void {
  for (const btn of document.querySelectorAll<HTMLButtonElement>("#tabbar button")) {
    btn.classList.toggle("on", btn.dataset.tab === tab);
  }
  if (tab === "home") renderHome();
  if (tab === "daily") renderDaily();
  if (tab === "descent") renderDescent();
  if (tab === "collection") renderCollection();
  playMusic("menu"); // Browsing-Screens teilen sich das ruhige Thema
  showScreen(tab);
}

function teardownGame(): void {
  gameView?.destroy();
  gameView = null;
  cascadeView?.destroy();
  cascadeView = null;
  cascadeGame = null;
  activeGame = null;
  if (clockTimer) window.clearInterval(clockTimer);
  clockTimer = 0;
  if (graceTimer) window.clearTimeout(graceTimer);
  graceTimer = 0;
  clearWinFx();
}

// ── Home / regions ─────────────────────────────────────────────────────────
function regionStars(r: Region): { got: number; max: number } {
  const s = store.load();
  const got = r.levels.reduce((n, l) => n + (s.levels[l.id]?.stars ?? 0), 0);
  return { got, max: r.levels.length * 3 };
}

/** Erste offene, noch nicht abgeschlossene Region + erstes ungelöste Fenster darin. */
/** Wie viele Fenster einer Region gelöst sind — zugleich der Index des ersten,
 *  das noch gesperrt ist (Fenster schalten nur nacheinander frei). */
function regionCleared(r: Region): number {
  const lv = store.load().levels;
  let i = 0;
  while (i < r.levels.length && lv[r.levels[i]!.id]?.stars) i++;
  return i;
}
/** Ist dieses Fenster spielbar? (Region offen + alle davor gelöst.) */
function isLevelUnlocked(r: Region, index: number): boolean {
  if (store.panes() < r.panesToUnlock) return false;
  return index <= regionCleared(r);
}

function currentCampaignTarget(): { region: Region; index: number; regionIndex: number } | null {
  const panes = store.panes();
  for (let ri = 0; ri < regions.length; ri++) {
    const r = regions[ri]!;
    if (panes < r.panesToUnlock) break;
    const next = regionCleared(r);
    if (next < r.levels.length) return { region: r, index: next, regionIndex: ri };
  }
  return null; // alle erreichbaren Fenster gelöst
}

/** Eine Station für einen Seitenmodus — im selben Pfad wie die Regionen. */
function sideStation(
  node: string,
  emoji: string,
  name: string,
  stat: string,
  sub: string,
  onClick: () => void,
): HTMLElement {
  const el = document.createElement("div");
  el.className = "station side current";
  el.style.setProperty("--node", node);
  el.innerHTML = `
    <div class="st-card">
      <div class="row">
        <div class="name">${emoji} ${name}</div>
        <div class="want">${stat}</div>
      </div>
      <div class="muted">${sub}</div>
    </div>`;
  el.addEventListener("click", onClick);
  return el;
}

function renderHome(): void {
  refreshLight();
  scenery.setTheme("surge");
  renderTopPills();
  const s = store.load();
  $("cascade-best").textContent = nf(s.cascade.bestScore);
  $("cascade-cleared").textContent = nf(s.cascade.bestCleared);
  const a = store.cascadeAttempts();
  $("cascade-attempts").textContent =
    a.count >= store.CASCADE_MAX_ATTEMPTS
      ? `🎮 ${a.count}/${store.CASCADE_MAX_ATTEMPTS} Versuche`
      : `🎮 ${a.count}/${store.CASCADE_MAX_ATTEMPTS} Versuche · nächster in ${fmt(a.msToNext)}`;
}

function openRegion(index: number): void {
  const r = regions[index];
  if (!r) return;
  $("screen-region").dataset.region = r.id;
  $("region-name").textContent = r.name;
  $("region-sub").textContent = r.subtitle;
  const s = store.load();
  const host = $("region-levels");
  host.replaceChildren();
  const cleared = regionCleared(r);
  r.levels.forEach((entry, i) => {
    const stars = s.levels[entry.id]?.stars ?? 0;
    const name = windowName(r.id, i, entry.id);
    const locked = i > cleared;
    const el = document.createElement("button");
    el.className = `lvl${stars > 0 ? " done" : ""}${locked ? " locked" : ""}`;
    el.title = locked ? "Light up the window before this one first" : name;
    el.setAttribute(
      "aria-label",
      locked ? `${name} — locked` : `${name} — ${stars} of 3 stars`,
    );
    el.innerHTML = locked
      ? `<span class="lock">🔒</span>`
      : `<span class="n">${i + 1}</span>` +
        `<span class="s">${[0, 1, 2]
          .map((k) => `<span class="${k < stars ? "on" : ""}">★</span>`)
          .join("")}</span>`;
    el.addEventListener("click", () => {
      if (locked) {
        toast("🔒 Light up the window before this one first.");
        return;
      }
      void playCampaign(r, i);
    });
    host.append(el);
  });
  showScreen("region");
}

// ── Shared play screen ─────────────────────────────────────────────────────
interface OverlayOpts {
  title: string;
  stars?: number;
  sub?: string;
  rewards?: string[];
  /** Miras Zeile zu diesem Ergebnis — sie sagt nicht zu jedem Fenster etwas. */
  mira?: string | null;
  nextLabel: string;
  onNext: () => void;
  quitLabel?: string;
  onQuit: () => void;
  /** Big animated praise line above the title — record breaks, streak milestones. */
  hype?: string;
  /** A stronger, gold treatment for `hype` (used for a new record). */
  hypeStrong?: boolean;
}
/** Sparkles flying out from the star row — bigger for a cleaner win. */
function spawnBurst(host: HTMLElement, n: number): void {
  const glyphs = ["✦", "★", "✨"];
  const colors = ["var(--gold)", "var(--aqua)", "var(--pink)"];
  host.replaceChildren();
  for (let i = 0; i < n; i++) {
    const el = document.createElement("i");
    const ang = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.6;
    const dist = 70 + Math.random() * 70;
    el.textContent = glyphs[i % glyphs.length]!;
    el.style.setProperty("--tx", `${Math.cos(ang) * dist}px`);
    el.style.setProperty("--ty", `${Math.sin(ang) * dist - 20}px`);
    el.style.setProperty("--bs", `${14 + Math.random() * 14}px`);
    el.style.setProperty("--bc", colors[i % colors.length]!);
    // fire as the stars slam into their sockets, not on overlay-in
    el.style.setProperty("--bd", `${(1.85 + Math.random() * 0.35).toFixed(2)}s`);
    el.style.setProperty("--bt", `${(0.7 + Math.random() * 0.5).toFixed(2)}s`);
    host.append(el);
  }
}

// ── Full-screen white star shower — fires the instant a board is solved ─────
let winfxRaf = 0;
/** Den Vollbild-Sternenregen sofort abräumen — sonst blitzt er über dem
 *  nächsten Level auf, wenn man gleich „Weiter" tippt. */
function clearWinFx(): void {
  if (winfxRaf) cancelAnimationFrame(winfxRaf);
  winfxRaf = 0;
  const c = document.getElementById("winfx") as HTMLCanvasElement | null;
  c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
}
function winStarBurst(intensity = 1): void {
  const canvas = $<HTMLCanvasElement>("winfx");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const drawStar = (x: number, y: number, r: number, rot: number): void => {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = rot + (i * Math.PI) / 4;
      const rad = i % 2 === 0 ? r : r * 0.4;
      const px = x + Math.cos(a) * rad;
      const py = y + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  };

  type P = { x: number; y: number; vx: number; vy: number; t: number; max: number; size: number; rot: number; spin: number };
  const ps: P[] = [];
  // a handful of origin points across the upper screen so the whole width lights up
  const origins = [
    [W * 0.5, H * 0.4],
    [W * 0.22, H * 0.32],
    [W * 0.78, H * 0.32],
    [W * 0.5, H * 0.62],
  ];
  const n = Math.round(22 * Math.min(2.4, intensity));
  const sizeK = 0.85 + 0.25 * Math.min(2.4, intensity);
  for (const [ox, oy] of origins) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = (130 + Math.random() * 560) * (0.9 + 0.25 * Math.min(2, intensity));
      ps.push({
        x: ox! + (Math.random() - 0.5) * 40,
        y: oy! + (Math.random() - 0.5) * 40,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        t: 0,
        max: 1.2 + Math.random() * 1.4,
        size: (5 + Math.random() * 16) * sizeK,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 7,
      });
    }
  }

  let last = performance.now();
  if (winfxRaf) cancelAnimationFrame(winfxRaf);
  const step = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(255,255,255,0.95)";
    let alive = false;
    for (const p of ps) {
      p.t += dt;
      if (p.t >= p.max) continue;
      alive = true;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 0.85; // smooth ease-out, no hard gravity
      p.vy = p.vy * (1 - dt * 0.85) + 40 * dt;
      p.rot += p.spin * dt;
      const k = 1 - p.t / p.max;
      ctx.globalAlpha = Math.max(0, k) * 0.95;
      ctx.shadowBlur = 16 * k;
      drawStar(p.x, p.y, p.size * (0.35 + k * 0.95), p.rot);
    }
    ctx.restore();
    if (alive) winfxRaf = requestAnimationFrame(step);
    else {
      ctx.clearRect(0, 0, W, H);
      winfxRaf = 0;
    }
  };
  winfxRaf = requestAnimationFrame(step);
}

const CHAR_EMOJI: Record<string, string> = { mira: "🏮", anselm: "🕯", umbra: "◆" };

/** Charakter-Portrait — das gemalte Bild, solange es da ist, sonst ein Emoji. */
function paintChar(host: HTMLElement, speaker: string): void {
  const img = document.createElement("img");
  img.alt = "";
  img.src = `ui/chars/${speaker}.webp`;
  img.addEventListener("error", () => {
    host.textContent = CHAR_EMOJI[speaker] ?? "✦";
  });
  host.replaceChildren(img);
}
/** Miras Portrait — das gemalte Bild, solange es da ist, sonst ihre Laterne. */
function paintMira(host: HTMLElement): void {
  if (host.querySelector("img")) return; // schon gesetzt
  paintChar(host, "mira");
}

// ── Startbildschirm-Sprechblase (selten) ──────────────────────────────────
let peekShownThisSession = false;
let homeReturns = 0;

/** Ab und zu schaut eine Figur auf dem Startbildschirm vorbei — höchstens einmal
 *  pro Sitzung, nicht direkt nach einer Cutscene, und nur wenn schon etwas
 *  passiert ist. */
function maybeShowPeek(): void {
  const peek = $("home-peek");
  homeReturns += 1;
  if (peekShownThisSession || pendingBeat || !$("cutscene").hidden) return;
  const s = store.load();
  const seen = new Set(store.beatsSeen());
  if (!INTRO.every((b) => seen.has(b.id))) return; // Intro läuft/lief noch nicht komplett durch
  if (homeReturns < 2) return; // nicht gleich beim ersten Aufschlagen
  const solvedAll = regions.every((r) => regionCleared(r) >= r.levels.length);
  // die am weitesten freigeschaltete Region — daran hängt die Story-Stimmung
  let unlockedRegion = 0;
  for (let i = 0; i < regions.length; i++) if (store.panes(s) >= regions[i]!.panesToUnlock) unlockedRegion = i;
  const line = pickChatter(
    {
      panes: store.panes(s),
      region: unlockedRegion,
      sawTwist: seen.has("a2-die-wendung"),
      finished: solvedAll,
    },
    store.panes(s),
  );
  if (!line) return;
  peekShownThisSession = true;
  const scrim = $("peek-scrim");
  paintChar($("peek-face"), line.who);
  $("peek-say").textContent = line.text;
  peek.hidden = false;
  scrim.hidden = false;
  window.setTimeout(() => {
    peek.classList.add("show");
    scrim.classList.add("show");
  }, 60);
  const hide = (): void => {
    peek.classList.remove("show");
    scrim.classList.remove("show");
    window.setTimeout(() => {
      peek.hidden = true;
      scrim.hidden = true;
    }, 450);
    peek.removeEventListener("click", hide);
    scrim.removeEventListener("click", hide);
  };
  peek.addEventListener("click", hide);
  scrim.addEventListener("click", hide);
  window.setTimeout(hide, 7000);
}

// ── Story-Beat / Cutscene ──────────────────────────────────────────────────
let pendingBeat: Beat | null = null;

/** Nach einem Sieg merken: fällt jetzt ein Beat? Wird beim „Weiter" gespielt. */
function queueBeat(panesBefore: number, panesAfter: number): void {
  const b = beatAfter(panesBefore, panesAfter);
  if (b && !store.beatsSeen().includes(b.id)) pendingBeat = b;
}

/** Einen bestimmten Beat erzwingen (z. B. das Finale nach dem Boss-Fenster). */
function forceBeat(id: string): void {
  const b = BEATS.find((x) => x.id === id);
  if (b && !store.beatsSeen().includes(b.id)) pendingBeat = b;
}

/** Wickelt eine „Weiter"-Aktion so ein, dass ein anstehender Beat davor läuft. */
function throughBeat(next: () => void): () => void {
  return () => {
    const b = pendingBeat;
    pendingBeat = null;
    if (b) playCutscene(b, next);
    else next();
  };
}

/**
 * Spielt mehrere Beats hintereinander (für die Intro-Sequenz). Die Bühne
 * (`#cutscene`, das dunkle Overlay) bleibt zwischen den Beats durchgehend
 * offen — nur das Bild/Portrait/der Text wechseln. Würde sie zwischen jedem
 * Beat kurz geschlossen und neu geöffnet, spielt ihre Öffnen-Animation
 * (`opacity 0 → 1`) jedes Mal neu ab, und für diese ~0,2 s blitzt der Screen
 * dahinter (Startbildschirm) sichtbar durch.
 */
function playSequence(beats: Beat[], done: () => void): void {
  const rest = beats.slice();
  let opened = false;
  const next = (): void => {
    const b = rest.shift();
    if (!b) return done();
    playCutscene(b, next, { alreadyOpen: opened, keepOpenAfter: rest.length > 0 });
    opened = true;
  };
  next();
}

/**
 * Spielt einen Beat als DOM-Cutscene, Zeile für Zeile, dann `done()`.
 * `alreadyOpen`: die Bühne steht schon (Kette aus `playSequence`) — nicht
 * nochmal ein-/ausblenden. `keepOpenAfter`: nach diesem Beat folgt sofort der
 * nächste — beim Fertigwerden nicht schließen.
 */
function playCutscene(
  beat: Beat,
  done: () => void,
  opts: { alreadyOpen?: boolean; keepOpenAfter?: boolean } = {},
): void {
  const { alreadyOpen = false, keepOpenAfter = false } = opts;
  const sp = SPEAKERS[beat.speaker];
  const scene = $("cutscene");
  scene.dataset.speaker = beat.speaker;
  // gemalter Hintergrund pro Beat (Intro); sonst der CSS-Verlauf
  const sceneEl = $("cs-scene");
  sceneEl.style.backgroundImage = beat.bg ? `url("${beat.bg}")` : "";
  sceneEl.classList.toggle("has-bg", !!beat.bg);
  sceneEl.classList.remove("fade");
  void sceneEl.offsetWidth; // Reflow → Fade-Animation neu starten
  sceneEl.classList.add("fade");
  const portrait = $("cs-portrait");
  if (sp.img) {
    const img = document.createElement("img");
    img.alt = "";
    img.src = sp.img;
    img.addEventListener("error", () => (portrait.textContent = sp.emoji));
    portrait.replaceChildren(img);
  } else if (sp.name) {
    portrait.textContent = sp.emoji;
  } else {
    // namenloser Erzähler ("welt") — kein Gesicht, das CSS blendet die Figur aus
    portrait.replaceChildren();
  }
  $("cs-name").textContent = sp.name;

  if (!alreadyOpen) {
    hideOverlay();
    duckMusic(true); // während der Szene ist die Musik im Hintergrund
    scene.hidden = false;
    scene.classList.add("show");
  }

  let line = 0;
  let typing = false;
  let typeT = 0;
  const linesEl = $("cs-lines");
  const tapEl = $("cs-tap");

  const type = (text: string): void => {
    window.clearTimeout(typeT);
    typing = true;
    tapEl.classList.add("busy");
    linesEl.textContent = "";
    let i = 0;
    const step = (): void => {
      linesEl.textContent = text.slice(0, (i += 2));
      if (i < text.length) {
        typeT = window.setTimeout(step, 14);
      } else {
        linesEl.textContent = text;
        typing = false;
        tapEl.classList.remove("busy");
      }
    };
    step();
  };

  const advance = (): void => {
    if (typing) {
      // erst mal fertig tippen
      window.clearTimeout(typeT);
      linesEl.textContent = beat.lines[line] ?? "";
      typing = false;
      tapEl.classList.remove("busy");
      return;
    }
    line += 1;
    if (line >= beat.lines.length) return finish();
    type(beat.lines[line]!);
  };

  const finish = (): void => {
    window.clearTimeout(typeT); // sonst tippt die letzte Zeile in die nächste Szene
    if (!keepOpenAfter) {
      scene.classList.remove("show");
      scene.hidden = true;
      duckMusic(false);
    }
    scene.removeEventListener("click", onClick);
    $("cs-skip").removeEventListener("click", onSkip);
    store.markBeatSeen(beat.id);
    done();
  };
  const onClick = (e: MouseEvent): void => {
    if ((e.target as HTMLElement).id === "cs-skip") return;
    advance();
  };
  const onSkip = (): void => finish();

  scene.addEventListener("click", onClick);
  $("cs-skip").addEventListener("click", onSkip);
  type(beat.lines[0]!);
  sfx.pickUp();
}

function showOverlay(o: OverlayOpts): void {
  const hypeEl = $("ov-hype");
  hypeEl.hidden = !o.hype;
  hypeEl.classList.toggle("strong", !!o.hypeStrong);
  if (o.hype) {
    hypeEl.textContent = o.hype;
    hypeEl.classList.remove("pop");
    void hypeEl.offsetWidth;
    hypeEl.classList.add("pop");
  }
  $("ov-title").textContent = o.title;
  // Result stars — rebuilt every time so the pop/flip animation always replays,
  // and always shown for a scored result (career/Descent/Daily always pass a
  // number, even 0). Only the un-scored overlays (timeout, "no lives") hide it.
  const starsEl = $("ov-stars");
  const numEl = $("ov-stars-num");
  if (o.stars === undefined) {
    starsEl.hidden = true;
    numEl.textContent = "";
  } else {
    const n = Math.max(0, Math.min(3, Math.round(o.stars)));
    starsEl.hidden = false;
    starsEl.replaceChildren(
      ...[0, 1, 2].map((i) => {
        const d = document.createElement("div");
        d.className = `star${i < n ? " earned" : ""}`;
        d.innerHTML =
          `<img class="sock" src="ui/star.webp" alt="" />` +
          `<span class="fill"><img src="ui/star.webp" alt="" /></span>`;
        return d;
      }),
    );
    void starsEl.offsetWidth; // restart the CSS animations
    numEl.textContent = `${n} / 3 ★`;
  }
  $("ov-sub").innerHTML = o.sub ?? "";
  $("ov-rewards").innerHTML = (o.rewards ?? []).map((r) => `<div>${r}</div>`).join("");
  const miraEl = $("ov-mira");
  miraEl.hidden = !o.mira;
  if (o.mira) {
    paintMira($("ov-mira-face"));
    $("ov-mira-say").textContent = o.mira;
  }
  const next = $<HTMLButtonElement>("ov-next");
  const quit = $<HTMLButtonElement>("ov-quit");
  next.textContent = o.nextLabel;
  quit.textContent = o.quitLabel ?? "Overview";
  next.onclick = o.onNext;
  quit.onclick = o.onQuit;
  $("pause-overlay").classList.remove("show");
  const ov = $("play-overlay");
  const card = ov.querySelector<HTMLElement>(".ocard")!;
  const burstHost = $("ov-burst");
  card.classList.remove("win-flash");
  const stars = o.stars ?? 0;
  if (stars > 0) spawnBurst(burstHost, stars === 3 ? 16 : stars === 2 ? 10 : 6);
  else burstHost.replaceChildren();
  ov.classList.remove("show");
  void ov.offsetWidth;
  ov.classList.add("show");
  if (stars === 3) {
    void card.offsetWidth;
    card.classList.add("win-flash");
  }
}
function hideOverlay(): void {
  $("play-overlay").classList.remove("show");
}

/**
 * Die große Zahl im HUD: mit Zugbudget die verbleibenden Züge, sonst die Uhr.
 * Züge sind die bessere Spannung — eine Uhr bestraft Nachdenken.
 */
function startClock(game: GameState): void {
  if (clockTimer) window.clearInterval(clockTimer);
  const el = $("play-clock");
  const txt = $("play-clock-txt");
  el.classList.toggle("moves", game.hasMoveBudget);
  const tick = (): void => {
    renderGoalStrip(game); // Ruß-Zähler läuft im selben Takt mit
    if (game.hasMoveBudget) {
      const left = game.movesLeft;
      txt.innerHTML = `${left}<i>moves</i>`;
      el.classList.toggle("warn", !game.isWon() && left <= 3);
      return;
    }
    const ms = game.remainingMs();
    txt.textContent = fmt(ms);
    el.classList.toggle("warn", !game.isWon() && (ms < 15_000 || ms / game.limitMs < 0.2));
  };
  tick();
  clockTimer = window.setInterval(tick, 250);
}

function renderJokers(): void {
  const j = store.load().jokers;
  ($("jk-hint-c").textContent = nf(j.hint));
  ($("jk-time-c").textContent = nf(j.time));
  ($("jk-solvent-c").textContent = nf(j.solvent));
  $("jk-time-l").textContent = activeGame?.hasMoveBudget ? "+3 moves" : "+20s";
  $<HTMLButtonElement>("jk-hint").disabled = j.hint <= 0;
  $<HTMLButtonElement>("jk-time").disabled = j.time <= 0;
  $<HTMLButtonElement>("jk-solvent").disabled = j.solvent <= 0;
}

function fireJokerButton(kind: JokerKind): void {
  const el = $(`jk-${kind}`);
  el.classList.remove("fire");
  void el.offsetWidth;
  el.classList.add("fire");
}

function useJoker(kind: JokerKind): void {
  if (!activeGame || !gameView || activeGame.isWon() || activeGame.failed) return;
  if (store.load().jokers[kind] <= 0) return; // nichts im Vorrat
  // erst prüfen, ob es überhaupt was zu verraten gibt — *dann* abbuchen
  if (kind === "hint" && !activeGame.firstUnsolved()) {
    toast("Nothing more to reveal");
    return;
  }
  if (!store.spendJoker(kind)) return;
  if (kind === "hint") gameView.showHint();
  fireJokerButton(kind);
  sfx.pickUp();
  if (kind === "time") {
    // same joker, whichever currency applies: moves, where there's a budget
    if (activeGame.hasMoveBudget) {
      activeGame.extendMoves(3);
      toast("+3 moves");
    } else {
      activeGame.extendLimit(20_000);
      toast("+20 seconds");
    }
  }
  if (kind === "solvent") {
    const n = activeGame.returnAllToTray();
    toast(n > 0 ? "Board cleared — rearrange" : "The board is already empty");
  }
  renderJokers();
}

function mountGame(
  game: GameState,
  cb: {
    onWin: (s: number, ms: number) => void;
    onTimeout: () => void;
    onUnlock?: () => void;
    onSolved?: () => void;
    onStart?: () => void;
  },
): void {
  teardownGame();
  hideOverlay();
  // jeder Sieg bekommt den Vollbild-Sternenregen — 3 Sterne etwas fetter
  cb.onSolved ??= () => winStarBurst(0.9 + 0.25 * game.starRating());
  // Der Streifen zeigt entweder die Abstiegs-Stufe oder das Level-Ziel
  const stage = $("play-stage");
  stage.hidden = mode !== "descent" && game.goal === "cover";
  if (stage.hidden) stage.replaceChildren(); // keinen alten Ruß-Zähler stehen lassen
  // Herzen kosten nur im Story-Modus — sonst zeigt das HUD die Splitter
  $("play-lives").hidden = mode !== "campaign";
  $("play-shards").hidden = mode === "campaign";
  activeGame = game;
  if (import.meta.env.DEV) (window as unknown as { __game: GameState }).__game = game;
  gameView = new GameView($<HTMLCanvasElement>("play-canvas"), $("play-wrap"), game, cb);
  renderJokers();
  startClock(game);
  showScreen("play");
  window.scrollTo(0, 0);

  armGrace(game, cb.onStart);
}

/** Startet die Schonfrist neu: nach 3,5 s ohne Zug (und ohne Pause) läuft die
 *  Uhr trotzdem an. */
function armGrace(game: GameState, onStart?: () => void): void {
  if (graceTimer) window.clearTimeout(graceTimer);
  graceTimer = window.setTimeout(() => {
    graceTimer = 0;
    if (activeGame !== game || game.started) return;
    if ($("pause-overlay").classList.contains("show")) return armGrace(game, onStart);
    if (game.markStarted()) onStart?.();
  }, 3500);
}

function celebrate(freshly: ReturnType<typeof syncAchievements>): void {
  for (const a of freshly) toast(`Achievement unlocked: ${a.name}`);
}

/** Collect the reward lines for a story-level win, applying side effects. */
function collectStoryRewards(levelId: string, stars: number, ms: number, usedUndo: boolean, region?: Region): string[] {
  const lines: string[] = [];
  const panesBefore = store.panes();
  const multBefore = store.winMultiplier(store.winStreak());
  const r = store.recordLevel(levelId, stars, ms, usedUndo);
  if (store.panes() > panesBefore) lines.push("🏮 +1 window lit");
  lines.push(
    r.mult > 1
      ? `✦ +${nf(r.shards)} light shards · streak ×${xf(r.mult)}`
      : `✦ +${nf(r.shards)} light shards`,
  );
  if (r.mult > multBefore) sfx.streak(Math.round(r.mult)); // multiplier went up
  // does this window unlock a region? say so, otherwise how far there's left
  const nextLocked = regions.find((rg) => store.panes() >= rg.panesToUnlock && panesBefore < rg.panesToUnlock);
  let big = false;
  if (nextLocked) {
    lines.push(`✨ ${nextLocked.name} — the lantern is lit!`);
    big = true;
  } else {
    const nudge = nextRegionNudge();
    if (nudge && r.firstClear) lines.push(nudge);
  }
  refreshLight();
  scenery.pulse(0.3 + 0.1 * stars); // the world visibly brightens a touch with every win
  celebrate(syncAchievements());
  for (const m of store.claimMilestones()) {
    lines.push(`🏆 Milestone ${nf(m.threshold)}★ · ✦ +${nf(m.shards)}`);
    scenery.pulse();
    big = true;
  }
  if (region) {
    const { got, max } = regionStars(region);
    if (got >= max && store.grantRegionReward(region.id)) {
      lines.push(`✨ ${region.name} awakens! ✦ +60, hearts full`);
      scenery.pulse();
      big = true;
    }
  }
  if (big) {
    sfx.milestone();
    winStarBurst(2.2);
  }
  renderTopPills();
  return lines;
}

// Campaign
async function playCampaign(region: Region, index: number): Promise<void> {
  if (!isLevelUnlocked(region, index)) {
    toast("🔒 This window is still locked.");
    return;
  }
  mode = "campaign";
  campaignAt = { region, index };
  if (!livesGate(() => void playCampaign(region, index))) return;
  const entry = region.levels[index];
  if (!entry) return;
  scenery.setTheme(REGION_THEME[region.id] ?? "menu");
  playMusic("play");
  $("screen-play").dataset.region = region.id;
  const streak = store.winStreak();
  const mult = store.winMultiplier(streak);
  $("play-title-txt").innerHTML =
    windowName(region.id, index, entry.id) +
    (mult > 1 ? ` <span class="serie">Streak ×${xf(mult)}</span>` : "");
  let level: Level;
  try {
    level = parseLevel(await (await fetch(`levels/${entry.id}.json`)).text());
  } catch {
    return;
  }
  const game = new GameState(level);

  // Weicher Einstieg: die ersten Fenster geben spürbar mehr Zeit, das erste
  // praktisch unbegrenzt — sonst kann man den Erstkontakt verlieren, bevor man
  // die Regeln kennt. Zieht sich über die ersten ~6 Fenster auf normal zurück.
  if (!game.hasMoveBudget) {
    const p = store.panes();
    const scale = p === 0 ? 8 : p <= 2 ? 1.6 : p <= 5 ? 1.25 : 1;
    if (scale > 1) game.extendLimit(Math.round(game.limitMs * (scale - 1)));
    if (p === 0) toast("Take your time — nothing's rushing you on the first window.");
  }

  const assisted = store.pity(entry.id);
  // vor dem Sieg lesen — `recordLevel` setzt den Zähler zurück
  const struggled = (store.load().levels[entry.id]?.fails ?? 0) > 0;
  if (entry.id === "boss_01")
    toast("🕯 The last window. Cut like in the workshop — and the candle right at the end.");
  else if (entry.id === "boss_02")
    toast("❖✦🕯 Double pane, wandering shard, and the candle — all at once. Plan your order.");
  else introduceMechanic(game);
  mountGame(game, {
    onStart: () => store.beginAttempt(entry.id),
    onWin: (stars, ms) => {
      store.endAttempt();
      const panesBefore = store.panes();
      const rewards = collectStoryRewards(entry.id, stars, ms, game.usedUndo, region);
      queueBeat(panesBefore, store.panes());
      // das Boss-Fenster ist das Finale — die Szene kommt hier, egal wie viele
      // Fenster schon hell sind
      if (entry.id === "boss_01") {
        forceBeat("finale");
        sfx.milestone();
        winStarBurst(2.4);
        scenery.pulse(1);
      }
      const hasNext = index + 1 < region.levels.length;
      const goNext = (): void =>
        void (hasNext ? playCampaign(region, index + 1) : openRegion(regions.indexOf(region)));
      const goBack = (): void => openRegion(regions.indexOf(region));
      showOverlay({
        title: stars === 3 ? "Flawless!" : "Lit!",
        stars,
        sub: `${windowName(region.id, index, entry.id)} · <b>${fmt(ms)}</b>`,
        rewards,
        // wenn gleich ein Beat kommt, schweigt Mira hier — eine Szene reicht
        mira: pendingBeat
          ? null
          : miraLine({
              solved: store.load().stats.solved,
              place: (REGION_THEME[region.id] ?? "garden") as StoryPlace,
              stars,
              struggled,
            }),
        nextLabel: hasNext ? "Next ›" : "Region ✓",
        onNext: throughBeat(goNext),
        onQuit: throughBeat(goBack),
      });
    },
    onTimeout: () => {
      // Story-Modus: ein Fehlschlag kostet ein Herz (bewusste Verknappung).
      const lostStreak = store.winStreak();
      store.spendLife();
      const fails = store.recordFail(entry.id); // setzt auch die Serie zurück
      renderTopPills();
      const l = store.lives();
      const streakNote = lostStreak >= 2 ? ` Streak ×${xf(store.winMultiplier(lostStreak))} lost.` : "";
      const candleOut = game.candleOut;
      showOverlay({
        title: candleOut ? "The Flame Is Out" : "The Light Flickers Out",
        sub:
          (candleOut ? "The candle must be covered right at the end. " : "") +
          (l.count > 0
            ? `<b>${l.count}</b> ${l.count === 1 ? "heart" : "hearts"} left.` +
              (fails >= 2 ? " Mira will help on your next attempt." : "")
            : `No hearts left — next in <b>${fmt(l.msToNext)}</b>.`) + streakNote,
        nextLabel: l.count > 0 ? "Try Again" : "Overview",
        onNext: () =>
          l.count > 0 ? playCampaign(region, index) : openRegion(regions.indexOf(region)),
        quitLabel: "Overview",
        onQuit: () => openRegion(regions.indexOf(region)),
      });
    },
  });
  if (assisted) {
    // this level has bitten twice in a row — soften the next attempt so it
    // doesn't just become a wall the player bounces off and quits at
    store.clearPity(entry.id);
    game.extendLimit(Math.round(game.limitMs * 0.3));
    gameView?.showHint();
    toast("This spot is tricky — extra time & a free hint 💡");
  }
}

// Daily
/** Sundays are the weekly "Herausforderung" — same daily window, plus a frozen zone. */
function isWeeklyChallengeDay(): boolean {
  return new Date().getDay() === 0;
}
/** Descent/Daily twist: lock part of the board until the rest is cleared. Returns whether it took. */
function maybeFreeze(game: GameState, seed: string): boolean {
  return game.applyFrozenTwist(rngFromSeed(seed));
}
const DAILY_MILESTONES: Array<{ days: number; shards: number }> = [
  { days: 3, shards: 10 },
  { days: 7, shards: 20 },
  { days: 14, shards: 35 },
  { days: 30, shards: 60 },
  { days: 60, shards: 100 },
  { days: 100, shards: 150 },
];

function renderDaily(): void {
  scenery.setTheme("garden");
  const s = store.load();
  $("daily-streak").textContent = `🔥 ${s.daily.streak}`;
  $("daily-best").textContent = nf(s.daily.bestStreak);
  const done = s.daily.lastDayDone === store.todayKey();
  const playBtn = $<HTMLButtonElement>("daily-play");
  playBtn.textContent = done ? "Done Today ✓" : "Play Today";
  playBtn.disabled = done;
  $("daily-note").textContent = done
    ? "Done — come back tomorrow for the next window."
    : isWeeklyChallengeDay()
    ? "🔒 Weekly challenge: part of the window starts locked."
    : "A new window every day — the same for everyone.";
}
async function playDaily(): Promise<void> {
  mode = "daily";
  playMusic("play");
  const day = store.todayKey();
  toast("Building window …");
  await yieldPaint();
  const level = dailyLevel(day);
  if (!level) {
    toast("Couldn't generate today's puzzle");
    return;
  }
  scenery.setTheme("garden");
  $("screen-play").dataset.region = "daily";
  $("play-title-txt").textContent = isWeeklyChallengeDay() ? "Daily Shard · 🔒 Week" : "Daily Shard";
  const game = new GameState(level);
  if (isWeeklyChallengeDay() && maybeFreeze(game, `daily:${day}:frozen`)) {
    toast("🔒 Weekly challenge: solve the open part first!");
  }
  mountGame(game, {
    onWin: (stars, ms) => {
      const r = store.recordLevel(`daily:${day}`, stars, ms, game.usedUndo);
      const before = store.load().daily.streak;
      const after = store.recordDaily().daily.streak;
      store.addShards(5);
      // Meilenstein nur beim *ersten* Erreichen — Serie brechen und wieder
      // hochbauen zahlt nicht erneut aus.
      const hit = after > before && DAILY_MILESTONES.find((m) => m.days === after);
      const milestone = hit && store.claimDailyMilestone(hit.days) ? hit : null;
      if (milestone) store.addShards(milestone.shards);
      celebrate(syncAchievements());
      renderTopPills();
      showOverlay({
        title: stars === 3 ? "Flawless!" : "Solved!",
        stars,
        sub: `The daily window · <b>${fmt(ms)}</b>`,
        rewards: [
          `✦ +${nf(r.shards + 5)} light shards`,
          after > before ? `🔥 Streak ${nf(after)} days` : `🔥 Streak ${nf(after)}`,
          ...(milestone ? [`🏆 ${nf(milestone.days)}-day streak · ✦ +${nf(milestone.shards)}`] : []),
        ],
        mira: miraLine({ solved: store.load().stats.solved, place: "daily", stars }),
        nextLabel: "Done",
        onNext: () => setTab("daily"),
        onQuit: () => setTab("daily"),
      });
      if (milestone) scenery.pulse();
    },
    onTimeout: () =>
      showOverlay({
        title: "The Light Flickers Out",
        sub: "Today's puzzle stays the same — try again.",
        nextLabel: "Try Again",
        onNext: playDaily,
        onQuit: () => setTab("daily"),
      }),
    onUnlock: () => toast("🔓 Area unlocked!"),
  });
}

// Descent
function renderDescent(): void {
  scenery.setTheme("workshop");
  const s = store.load();
  $("descent-best").textContent = `Level ${nf(s.descent.bestDepth)}`;
  $("descent-runs").textContent = nf(s.descent.runs);
}
function startDescent(): void {
  mode = "descent";
  playMusic("play");
  descentState = {
    variant: store.beginDescentRun(),
    depth: 1,
    streak: 0,
    sawRecord: false,
    recent: [],
    shards: 0,
  };
  void playDescentLevel();
}

/**
 * Der Streifen über dem Brett zeigt das Ziel, sobald es nicht „alles zudecken"
 * ist. Muss auf einen Blick lesbar sein — deshalb große Zahl plus Balken.
 */
/**
 * Beim ersten Fenster mit einer neuen Mechanik einmalig kurz erklären, was zu
 * tun ist — danach spricht die Optik für sich. Merker läuft über `beatsSeen`.
 */
function introduceMechanic(game: GameState): void {
  const seen = store.beatsSeen();
  if (game.hasCandle && !seen.includes("tut-candle")) {
    store.markBeatSeen("tut-candle");
    toast("🕯 The candle must be covered last — hold one piece back until the end.");
  } else if (game.hasIce && !seen.includes("tut-ice")) {
    store.markBeatSeen("tut-ice");
    toast("❄ Frosted panes only thaw once light reaches them — build from the outside in.");
  } else if (game.hasDouble && !seen.includes("tut-double")) {
    store.markBeatSeen("tut-double");
    toast("❖ Double pane: the back layer only opens once the front is covered.");
  } else if (game.hasStuck && !seen.includes("tut-stuck")) {
    store.markBeatSeen("tut-stuck");
    toast("✦ One shard is stuck — you'll never cover it. Build around it.");
  } else if (game.hasSeals && !seen.includes("tut-seal")) {
    store.markBeatSeen("tut-seal");
    toast("◆ A color seal: this pane only accepts the piece in its color.");
  } else if (game.hasWander && !seen.includes("tut-wander")) {
    store.markBeatSeen("tut-wander");
    toast("✦ A shard wanders across the board — build around it until it's gone.");
  } else if (game.hasChains && !seen.includes("tut-chain")) {
    store.markBeatSeen("tut-chain");
    toast("⛓ Chained panes: one and the same piece must cover both.");
  } else if (game.hasCracks && !seen.includes("tut-cracks")) {
    store.markBeatSeen("tut-cracks");
    toast("✂ Cracks in the glass: no piece may lie across a break line.");
  }
}

function renderGoalStrip(game: GameState): boolean {
  if (game.goal !== "soot" && game.goal !== "moth") return false;
  const bar = $("play-stage");
  bar.hidden = false;
  const done = game.sootCleared;
  const total = game.sootTotal;
  const moth = game.goal === "moth";
  // kriecht der Ruß und ist noch offen → Warnlampe an
  const creeping = game.sootSpreads && done < total;
  bar.classList.toggle("hot", creeping);
  const label = moth ? "Moths 🦋" : `Soot${game.sootSpreads ? " 🕯" : ""}`;
  bar.innerHTML =
    `<span class="ps-lvl">${label}</span>` +
    `<span class="ps-bar"><i style="width:${Math.round((done / total) * 100)}%"></i></span>` +
    `<span class="ps-note">${nf(done)} / ${nf(total)}${
      moth ? " free" : creeping ? " · creeping" : ""
    }</span>`;
  return true;
}

/** The difficulty-stage strip above the board — Descent only. */
function renderDescentStage(depth: number, streak: number): void {
  const bar = $("play-stage");
  bar.hidden = false;
  const stage = descentDifficulty(depth);
  const pips = [1, 2, 3, 4, 5].map((s) => `<i class="${s <= stage ? "on" : ""}"></i>`).join("");
  const hot = streak >= 3 && streak % 3 === 0;
  bar.classList.toggle("hot", hot);
  bar.innerHTML =
    `<span class="ps-lvl">Level ${depth}</span>` +
    `<span class="ps-pips">${pips}</span>` +
    `<span class="ps-note">${hot ? `${streak}× in a row 🔥` : `Stage ${stage}`}</span>`;
}

async function playDescentLevel(): Promise<void> {
  mode = "descent";
  if (!descentState) return;
  const { variant, depth, streak, recent } = descentState;
  scenery.setTheme("workshop");
  toast("Building window …");
  await yieldPaint();
  const level = descentLevel(depth, variant, new Set(recent));
  if (!level) {
    endDescent();
    return;
  }
  // remember the last few puzzles so the next one is never a repeat
  recent.push(levelSignature(level));
  if (recent.length > 6) recent.shift();
  $("screen-play").dataset.region = "descent";
  const best = store.load().descent.bestDepth;
  $("play-title-txt").textContent =
    depth > best && best > 0
      ? `Descent · Level ${depth} · 🏆 new record!`
      : `Descent · Level ${depth} · Record ${best}`;
  renderDescentStage(depth, streak);
  // Der Abstieg läuft auf Zügen statt auf der Uhr: Nachdenken darf nichts
  // kosten, Fehlversuche schon. Der Spielraum über der Teilezahl schrumpft mit
  // der Tiefe — ab Ebene 12 hast du nur noch zwei Versuche gut.
  const game = new GameState(level, 30 * 60_000);
  const slack = Math.max(2, 6 - Math.floor(depth / 3));
  game.setMoveBudget(level.pieces.length + slack);
  // every 4th level from depth 4 on, part of the window starts locked — solve
  // the open part first to free it, one extra beat of tension on a run
  const isFrozenLevel = depth >= 4 && depth % 4 === 0;
  if (isFrozenLevel && maybeFreeze(game, `descent:v${variant}:d${depth}:frozen`)) {
    toast("🔒 Part of the window is locked — solve the rest first!");
  }
  mountGame(game, {
    onWin: (stars, ms) => {
      const st = descentState!;
      st.depth = depth + 1;
      st.streak += 1;
      st.shards += depth;
      store.recordDescent(depth);
      store.addShards(depth);
      scenery.pulse(0.35 + 0.08 * stars);
      const freshAch = syncAchievements();
      celebrate(freshAch);
      renderTopPills();

      // between-levels praise — a new record always lands; otherwise only now
      // and then, so it stays a treat and not noise
      let hype: string | undefined;
      let hypeStrong = false;
      const brokeRecord = depth > best && best > 0;
      if (brokeRecord && !st.sawRecord) {
        st.sawRecord = true;
        hype = "NEW RECORD!";
        hypeStrong = true;
      } else if (st.streak >= 3 && st.streak % 3 === 0) {
        hype = HYPE_WORDS[(depth + variant) % HYPE_WORDS.length];
      } else if (st.sawRecord && st.streak % 2 === 0) {
        hype = HYPE_WORDS[(depth + variant + 3) % HYPE_WORDS.length];
      }

      showOverlay({
        title: `Level ${depth} Cleared`,
        stars,
        sub: `Anselm's Mine · <b>${fmt(ms)}</b>${st.streak >= 2 ? ` · ${st.streak} in a row` : ""}`,
        rewards: [
          `✦ +${nf(depth)} light shards`,
          ...(freshAch.length ? [`🏅 ${freshAch[0]!.name} unlocked`] : []),
        ],
        mira: hype
          ? null
          : miraLine({
              solved: store.load().stats.solved,
              place: "descent",
              stars,
              streak: st.streak,
              depth,
            }),
        nextLabel: "Deeper ›",
        onNext: () => void playDescentLevel(),
        quitLabel: "Stop",
        onQuit: () => endDescent(depth),
        ...(hype ? { hype, hypeStrong } : {}),
      });
    },
    onUnlock: () => toast("🔓 Area unlocked!"),
    onTimeout: () => {
      descentState!.streak = 0;
      store.recordDescent(depth);
      celebrate(syncAchievements());
      renderTopPills();
      endDescent(depth);
    },
  });
}
function endDescent(reachedDepth?: number): void {
  const depth = reachedDepth ?? descentState?.depth ?? 0;
  const runShards = descentState?.shards ?? 0;
  const best = store.load().descent.bestDepth;
  descentState = null;
  showOverlay({
    title: depth > 0 ? "Out of Moves" : "Descent Ended",
    sub: `Level <b>${nf(depth)}</b>${depth >= best && depth > 0 ? " — new record! 🏆" : ""}`,
    rewards: runShards > 0 ? [`✦ +${nf(runShards)} light shards from this run`] : [],
    nextLabel: "New Run",
    onNext: startDescent,
    onQuit: () => setTab("descent"),
  });
}

// ── Kaskade ────────────────────────────────────────────────────────────────
// ── Bestenliste (Overlay, Clash-of-Clans-Aufbau) ──────────────────────────
let lbScope: "country" | "global" = "country";
let lbSeq = 0;

function lbRowEl(r: LeaderRow, rank: number, me: string, myName: string): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "lb-row";
  if (rank === 1) li.classList.add("top1");
  if (r.player_id === me) li.classList.add("me");
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : nf(rank);
  li.innerHTML =
    `<span class="lb-rank">${medal}</span>` +
    `<span class="lb-who"><span class="lb-flag">${flag(r.country)}</span><span class="lb-name"></span></span>` +
    `<span class="lb-score">${nf(r.score)} 🏆</span>`;
  li.querySelector(".lb-name")!.textContent = r.player_id === me ? myName || r.name || "You" : r.name || "Glazier";
  return li;
}

async function renderLeaderboard(): Promise<void> {
  const seq = ++lbSeq;
  const rows = $("lb-rows");
  const self = $("lb-self");
  const sub = $("lb-sub");
  const cc = detectCountry();

  $("lb-tab-country").classList.toggle("on", lbScope === "country");
  $("lb-tab-global").classList.toggle("on", lbScope === "global");
  sub.textContent =
    `Week ${isoWeek().split("-W")[1]}` +
    (lbScope === "country" ? ` · ${cc === "XX" ? "your country" : `${flag(cc)} ${countryName(cc)}`}` : " · worldwide");

  const data = await topCascade({ scope: lbScope, country: cc, limit: 100 });
  if (seq !== lbSeq) return; // a newer tab switch was faster

  if (data.length === 0 && !navigator.onLine) {
    rows.replaceChildren();
    const p = document.createElement("li");
    p.className = "lb-offline";
    p.textContent = "No connection — the leaderboard needs internet.";
    rows.append(p);
    self.hidden = true;
    return;
  }

  const me = playerId();
  const myName = store.playerName();
  rows.replaceChildren(...data.slice(0, 50).map((r, i) => lbRowEl(r, i + 1, me, myName)));

  const myIdx = data.findIndex((r) => r.player_id === me);
  if (myIdx >= 50) {
    self.hidden = false;
    self.replaceChildren(lbRowEl(data[myIdx]!, myIdx + 1, me, myName));
  } else if (myIdx === -1 && data.length > 0) {
    self.hidden = false;
    self.innerHTML = `<p class="muted" style="text-align:center;margin:0">Play a round to get on the list.</p>`;
  } else {
    self.hidden = true;
  }
}

function openLeaderboard(): void {
  lbScope = "country";
  $("lb-overlay").classList.add("show");
  void renderLeaderboard();
}
/** Merkt sich, was nach einem erfolgreichen Auffüllen im "keine Versuche
 *  mehr"-Dialog eigentlich ausgeführt werden sollte (Runde starten). */
let pendingCascadeStart: (() => void) | null = null;
let attemptsCountdownTimer = 0;

function renderCascadeAttemptsSub(): void {
  const a = store.cascadeAttempts();
  $("na-sub").innerHTML =
    a.count > 0
      ? "Wieder da! Du kannst jetzt loslegen."
      : `Nächster Versuch in <b>${fmt(a.msToNext)}</b>.`;
  const canPay = store.load().shards >= 15;
  const refillBtn = $<HTMLButtonElement>("na-refill");
  refillBtn.textContent = canPay ? "✦ 15 Splitter → voll auffüllen" : `✦ ${nf(store.load().shards)} / 15 Splitter`;
  refillBtn.disabled = !canPay;
}

/** Kaskaden-Versuche sind ein Kaskade-eigener Energie-Vorrat (siehe
 *  `KONZEPT-kaskade-oekonomie.md` §4a) — bremst endloses Neustarten-und-
 *  Splitter-farmen, ohne den reibungslosen "1 Tap → Brett"-Einstieg fürs
 *  normale 2-3-Runden-Spiel anzutasten (Vorrat reicht dafür locker). Gibt
 *  `true` zurück und lässt den Aufrufer sofort weitermachen, wenn noch
 *  etwas da ist; sonst öffnet sich der Auffüll-Dialog und `onProceed` läuft
 *  erst, wenn der Spieler dort wirklich aufgefüllt hat. */
function cascadeAttemptsGate(onProceed: () => void): boolean {
  if (store.cascadeAttempts().count > 0) return true;
  // andere Kaskade-Overlays weg, sonst liegen zwei Abdunkelungen übereinander
  // (v. a. relevant, wenn der Dialog aus "Play Again" heraus im Ergebnis-
  // Overlay ausgelöst wird)
  $("k-overlay").classList.remove("show");
  $("k-pause-overlay").classList.remove("show");
  pendingCascadeStart = onProceed;
  renderCascadeAttemptsSub();
  $("k-noattempts-overlay").classList.add("show");
  window.clearInterval(attemptsCountdownTimer);
  attemptsCountdownTimer = window.setInterval(renderCascadeAttemptsSub, 1000);
  return false;
}
function closeAttemptsGate(): void {
  $("k-noattempts-overlay").classList.remove("show");
  window.clearInterval(attemptsCountdownTimer);
  attemptsCountdownTimer = 0;
  pendingCascadeStart = null;
}
$("na-x").addEventListener("click", closeAttemptsGate);
$("k-noattempts-overlay").addEventListener("click", (e) => {
  if (e.target === $("k-noattempts-overlay")) closeAttemptsGate();
});
$("na-refill").addEventListener("click", () => {
  if (!store.spendShards(15)) return;
  store.refillCascadeAttempts();
  toast("Versuche aufgefüllt");
  renderTopPills();
  const go = pendingCascadeStart;
  closeAttemptsGate();
  go?.();
});
$("na-video").addEventListener("click", () => {
  // Echtes Ad-SDK ist ein eigener Integrationsschritt (Kontozugang, native
  // Konfiguration) -- bis dahin ein ehrlicher Platzhalter statt eines toten
  // Knopfs, analog zum bestehenden "📺 Watch video → Hint"-Stub im Shop.
  toast("Werbevideos kommen bald");
});

// ── Kaskaden-Fähigkeiten (in der Runde einsetzen) ───────────────────────────
function renderCascadeAbilities(): void {
  const a = store.load().cascadeAbilities;
  $("ka-shuffle-c").textContent = nf(a.shuffle);
  $("ka-clear-c").textContent = nf(a.clear);
  $("ka-time-c").textContent = nf(a.time);
  $<HTMLButtonElement>("ka-shuffle").disabled = a.shuffle <= 0;
  $<HTMLButtonElement>("ka-clear").disabled = a.clear <= 0;
  $<HTMLButtonElement>("ka-time").disabled = a.time <= 0;
}
function fireAbilityButton(kind: store.CascadeAbilityKind): void {
  const el = $(`ka-${kind}`);
  el.classList.remove("fire");
  void el.offsetWidth;
  el.classList.add("fire");
}
function useCascadeAbility(kind: store.CascadeAbilityKind): void {
  if (!cascadeGame || cascadeGame.isOver) return;
  if (!store.spendCascadeAbility(kind)) return; // nichts im Vorrat
  fireAbilityButton(kind);
  sfx.pickUp();
  if (kind === "shuffle") {
    cascadeGame.shuffleBelt();
    toast("Band gemischt");
  } else if (kind === "clear") {
    const pos = cascadeGame.clearMostBlockedCell();
    toast(pos ? "Zelle geräumt" : "Brett ist schon leer");
  } else {
    cascadeGame.addTime(10_000);
    toast("+10 Sekunden");
  }
  renderCascadeAbilities();
}
for (const kind of ["shuffle", "clear", "time"] as const) {
  $(`ka-${kind}`).addEventListener("click", () => useCascadeAbility(kind));
}

let cascadeToken: string | null = null;
function startCascade(): void {
  if (!cascadeAttemptsGate(startCascade)) return;
  store.spendCascadeAttempt();
  teardownGame();
  scenery.setTheme("garden");
  playMusic("cascade");
  cascadeRestart = startCascade;
  cascadeQuit = () => setTab("home");
  $("rs-scene").hidden = true;
  $("k-mult-col").hidden = false;
  $("k-best-wrap").hidden = false;
  $("k-best-wrap").classList.remove("burst");
  $("k-abilities").hidden = false;
  $("k-best-label").textContent = "👑 Highscore";
  $("k-score-label").textContent = "Score";
  $<HTMLElement>("k-crown-badge").hidden = true;
  $("k-crown-badge").classList.remove("pop");
  $("k-overlay").classList.remove("show");
  $("k-pause-overlay").classList.remove("show");
  $("k-score-txt").classList.remove("new-record");
  for (let i = 0; i < 3; i++) $(`k-life-${i}`).classList.remove("lost");
  // Runden-Token für die Bestenliste holen (fire-and-forget, hat 3:00 Zeit)
  cascadeToken = null;
  void startCascadeRun().then((t) => (cascadeToken = t));
  // Platz 1 der Wochenbestenliste — Ziel, auf das der Highscore-Slot umspringt,
  // sobald man den eigenen Highscore geknackt hat. `null` = noch nicht da
  // (Netz) oder Liste leer; dann bleibt der Slot nach dem Burst einfach weg.
  let lbTop1: number | null = null;
  void topCascade({ scope: "global", limit: 1 }).then((rows) => {
    lbTop1 = rows[0]?.score ?? null;
  });
  const game = new CascadeState(`kaskade-${Date.now()}`);
  cascadeGame = game;
  renderCascadeAbilities();
  const bestScore = store.load().cascade.bestScore;
  let newRecord = false;
  let lastMultTier = 1;
  // Nur neu zeichnen, wenn sich die Zielfigur ändert — nicht jeden Frame.
  let lastComboOfferIcon: string | null = null;
  let lastComboCardIcon: string | null = null;
  if (import.meta.env.DEV) (window as unknown as { __cascade: CascadeState }).__cascade = game;
  $<HTMLButtonElement>("k-combo-accept").onclick = () => {
    game.acceptCombo();
    sfx.toggleOn();
  };
  $<HTMLButtonElement>("k-combo-decline").onclick = () => {
    game.declineCombo();
    sfx.tap();
  };
  cascadeView = new CascadeView($<HTMLCanvasElement>("k-canvas"), $("k-wrap"), game, {
    onHud: (h) => {
      $("k-score-txt").textContent = nf(h.score);
      const multEl = $("k-mult");
      multEl.textContent = `×${xf(h.mult.toFixed(1))}`;
      const tier = Math.floor(h.mult);
      for (let t = 2; t <= 5; t++) multEl.classList.toggle(`tier-${t}`, tier === t || (t === 5 && tier > 5));
      if (tier > lastMultTier) {
        multEl.classList.remove("bump");
        void multEl.offsetWidth;
        multEl.classList.add("bump");
        multEl.classList.remove("flame");
        void multEl.offsetWidth;
        multEl.classList.add("flame");
        window.setTimeout(() => multEl.classList.remove("flame"), 2400);
      }
      lastMultTier = tier;
      const el = $("k-clock");
      $("k-clock-txt").textContent = fmt(h.ms);
      el.classList.toggle("warn", h.ms < 12_000);
      // Gefahr-Zustand "Brett wird eng" (Abschnitt 3 im Ökonomie-Konzept):
      // Panel pulsiert bereits selbst (siehe .board-wrap.danger in
      // cascade-view.ts), hier nur die zwei DOM-seitigen Hinweise dazu —
      // Warn-Icon neben der Uhr, plus ein Puls auf dem Klärfunke-Icon, aber
      // nur wenn davon auch wirklich einer im Vorrat ist (sonst zeigt der
      // Hinweis auf ein Werkzeug, das gar nicht einsetzbar ist).
      $("k-crowd-warn").hidden = !h.crowded;
      $("ka-clear").classList.toggle("suggest", h.crowded && !$<HTMLButtonElement>("ka-clear").disabled);
      // Highscore-Slot zeigt nur noch die Differenz, nicht die absolute Zahl —
      // "wie viel fehlt noch". Ohne eigenen Highscore (ganz erster Lauf) zählt
      // schon der erste Punkt als neuer Rekord, sonst erst das Erreichen/
      // Überholen des alten Bestwerts.
      const hasBest = bestScore > 0;
      if (!newRecord) {
        $("k-best").textContent = hasBest ? nf(Math.max(0, bestScore - h.score)) : "−";
        const beat = hasBest ? h.score >= bestScore : h.score > 0;
        if (beat) {
          newRecord = true;
          $("k-score-txt").classList.add("new-record");
          // Highscore-Anzeige springt kurz auf und verschwindet — danach
          // bleibt die Krone in Score-Größe neben dem Score stehen, und der
          // Slot zielt fortan auf Platz 1 der Bestenliste statt auf den
          // eigenen alten Highscore.
          const bestWrap = $("k-best-wrap");
          bestWrap.classList.add("burst");
          window.setTimeout(() => {
            bestWrap.classList.remove("burst");
            const crown = $<HTMLElement>("k-crown-badge");
            crown.hidden = false;
            crown.classList.remove("pop");
            void crown.offsetWidth;
            crown.classList.add("pop");
            $("k-best-label").textContent = "🏆 To #1";
            bestWrap.hidden = lbTop1 === null;
          }, 550);
        }
      } else if (lbTop1 !== null) {
        const toFirst = Math.max(0, lbTop1 - h.score);
        $("k-best").textContent = toFirst > 0 ? nf(toFirst) : "🏆";
      }
      for (let i = 0; i < 3; i++) $(`k-life-${i}`).classList.toggle("lost", i >= h.lives);

      // Die Feier (großer, wegfadender weißer Text mit "+15s") zeichnet die
      // View direkt aufs Brett — der Kasten hier zeigt nur noch die laufende
      // Aufgabe an und verschwindet sofort wieder, sobald keine mehr aktiv ist.
      const cEl = $("k-challenge");
      const bar = $("k-challenge-bar");
      const cicEmoji = $("k-challenge-icon");
      const cicPiece = $<HTMLCanvasElement>("k-challenge-piece");
      if (game.challenge) {
        cEl.hidden = false;
        cicEmoji.hidden = false;
        cicPiece.hidden = true;
        lastComboCardIcon = null;
        cicEmoji.textContent = CHALLENGE_ICON[game.challenge.kind] ?? "🎯";
        $("k-challenge-txt").textContent = game.challenge.label;
        const previewMs = game.challengePreviewRemainingMs();
        cEl.classList.toggle("preview", previewMs > 0);
        const remain = game.challengeRemainingMs();
        if (previewMs > 0) {
          // Ankündigung: großer Countdown statt Uhrzeit-Format, keine Leiste
          $("k-challenge-clock").textContent = String(Math.ceil(previewMs / 1000));
        } else {
          $("k-challenge-clock").textContent = fmt(remain);
          // Die Vorschau-Phase zehrt vom selben Fenster (siehe CHALLENGE_PREVIEW_MS
          // in cascade.ts) — der Balken wird aber erst NACH der Vorschau
          // überhaupt sichtbar. Ohne diesen Abzug würde er gleich beim ersten
          // Anzeigen schon bei ~73% starten statt bei 100%, also "in der Mitte"
          // statt ganz links.
          const visibleWindowMs = CHALLENGE_WINDOW_MS - CHALLENGE_PREVIEW_MS;
          const pct = Math.max(0, Math.min(100, (remain / visibleWindowMs) * 100));
          bar.style.width = `${pct}%`;
          bar.classList.toggle("low", remain < 5000);
        }
      } else if (game.comboOffer?.accepted) {
        // Angenommenes Kombi-Angebot: dieselbe Karte wie eine Challenge, nur
        // mit der Zielfigur statt Emoji und einem Stückzähler statt Text.
        const offer = game.comboOffer;
        cEl.hidden = false;
        cEl.classList.remove("preview");
        cicEmoji.hidden = true;
        cicPiece.hidden = false;
        if (lastComboCardIcon !== offer.shardName) {
          drawPieceIcon(cicPiece, offer.shardName);
          lastComboCardIcon = offer.shardName;
        }
        $("k-challenge-txt").textContent = `${offer.progress}/${offer.target} placed`;
        const remain = game.comboRemainingMs();
        $("k-challenge-clock").textContent = fmt(remain);
        const pct = Math.max(0, Math.min(100, (remain / Math.max(1, offer.windowMs)) * 100));
        bar.style.width = `${pct}%`;
        bar.classList.toggle("low", remain < 5000);
      } else {
        cEl.hidden = true;
        lastComboCardIcon = null;
      }

      // Kombi-Angebot, das noch unbeantwortet ist: eigene Karte mit Annehmen/
      // Ablehnen — läuft nebenher weiter, keine Pause fürs Spiel.
      const offerEl = $("k-combo-offer");
      if (game.comboOffer && !game.comboOffer.accepted) {
        const offer = game.comboOffer;
        offerEl.hidden = false;
        if (lastComboOfferIcon !== offer.shardName) {
          drawPieceIcon($<HTMLCanvasElement>("k-combo-icon"), offer.shardName);
          lastComboOfferIcon = offer.shardName;
        }
        $("k-combo-title").textContent = `${offer.target}× Combo!`;
        $("k-combo-reward").textContent = offer.rewardLabel;
        // Bedenkzeit-Countdown -- vorher unsichtbar, die Karte verschwand nach
        // 8s kommentarlos, ohne dass man sah, dass sie überhaupt abläuft.
        const decideRemain = game.comboDecisionRemainingMs();
        const decideBar = $<HTMLElement>("k-combo-offer-bar");
        decideBar.style.width = `${Math.max(0, Math.min(100, (decideRemain / COMBO_DECISION_MS) * 100))}%`;
        decideBar.classList.toggle("low", decideRemain < 2500);
      } else {
        offerEl.hidden = true;
        lastComboOfferIcon = null;
      }

      // Serie: solange die Kette läuft, bleibt oben ein flackerndes Abzeichen
      // stehen — nicht nur der kurze Einblend-Moment auf dem Brett. Nur die
      // Opacity wechselt (.active), nie `hidden` — die Zeile bleibt immer im
      // Layout reserviert, sonst springt das Brett beim Auftauchen der Kette.
      const streakEl = $("k-streak");
      streakEl.classList.toggle("active", h.chain >= 2);
      if (h.chain >= 2) streakEl.textContent = `🔥 ×${h.chain}`;
    },
    onEnd: (r) => {
      store.recordCascade(r.score, r.cleared);
      // Lichtsplitter fürs Budget (kein Story-Fortschritt) — belohnt jetzt
      // Spielweise (Clears/Challenges/Kombis/Perfects/Ketten), nicht mehr nur
      // den Score mit starrem Deckel (siehe KONZEPT-kaskade-oekonomie.md §1).
      const shards = r.shardsEarned;
      store.addShards(shards);
      const freshAch = syncAchievements();
      celebrate(freshAch);
      renderTopPills();
      // Score in die Wochenbestenliste — fire-and-forget, blockiert nichts.
      // Ein Fehlschlag war bisher komplett unsichtbar (kein Log, kein Hinweis) —
      // wirkte dann wie "die Bestenliste geht einfach nicht". Jetzt gibt's
      // wenigstens einen leisen Toast, wenn's tatsächlich einen Score gab, der
      // hätte ankommen sollen (0-Punkte-Läufe werden erst gar nicht versucht).
      void submitCascadeScore(r.score, r.cleared, store.playerName(), r.elapsedMs, cascadeToken).then(
        (ok) => {
          if (ok) {
            if ($("lb-overlay").classList.contains("show")) void renderLeaderboard();
          } else if (r.score > 0) {
            toast("⚠️ Score couldn't be added to the leaderboard this round");
          }
        },
      );
      $("k-overlay-title").textContent = r.livesLeft <= 0 ? "No Lives Left!" : "Time's Up!";
      $("k-result").innerHTML =
        `<b>${nf(r.score)}</b> points · ${nf(r.cleared)} lines` +
        ` · ✦ +${nf(shards)}` +
        (r.perfectClears ? ` · ${r.perfectClears}× perfect` : "") +
        (r.megaClears ? ` · 💥 ${r.megaClears}× Ultimate Clear` : "") +
        (r.bestChain >= 3 ? ` · 🔥 Chain ×${r.bestChain}` : "") +
        (newRecord ? ` · 🏆 new record!` : "") +
        (freshAch.length ? `<br><small>🏅 ${freshAch[0]!.name} unlocked</small>` : "");
      const ov = $("k-overlay");
      ov.classList.remove("show");
      void ov.offsetWidth;
      ov.classList.add("show");
      $<HTMLButtonElement>("k-quit").onclick = () => setTab("home");
      $<HTMLButtonElement>("k-again").onclick = startCascade;
      $("k-again").textContent = "Play Again";
    },
  });
  if (import.meta.env.DEV) (window as unknown as { __cascadeView: CascadeView }).__cascadeView = cascadeView;
  $("k-best").textContent = nf(bestScore);
  showScreen("kaskade");
  window.scrollTo(0, 0);
  maybeHintRotate();
}

/** Einmaliger Hinweis, dass Antippen eine Figur dreht — sonst findet das
 *  kaum jemand von allein. Feuert beim ersten Einstieg in irgendeinen
 *  Kaskade-Modus (Free Play oder Story-Level), danach nie wieder. */
function maybeHintRotate(): void {
  if (!store.markHintSeen("rotate-tip")) return;
  // erst nachdem ein eventueller Ziel-Toast (Story-Level, ~7s) durch ist —
  // sonst überschreiben sich die beiden auf dem allerersten Level
  window.setTimeout(() => toast("💡 Tap rotates a piece"), 7300);
}

// ── Story-Modus (Kaskade-Level mit Rettungsszene) ──────────────────────────
function renderRescueList(): void {
  const s = store.load();
  const list = $("rescue-list");
  list.replaceChildren(
    ...RESCUE_LEVELS.map((lvl, i) => {
      const prev = i === 0 ? null : RESCUE_LEVELS[i - 1]!;
      const unlocked = i === 0 || (!!prev && (s.rescue[prev.id]?.stars ?? 0) > 0);
      const stars = s.rescue[lvl.id]?.stars ?? 0;
      const row = document.createElement("button");
      row.className = `rescue-row${unlocked ? "" : " locked"}`;
      row.innerHTML =
        `<span class="rr-num">${i + 1}</span>` +
        `<span class="rr-name">${lvl.name}</span>` +
        `<span class="rr-stars">${[0, 1, 2].map((n) => `<span class="${n < stars ? "" : "off"}">⭐</span>`).join("")}</span>`;
      if (unlocked) row.addEventListener("click", () => startRescueLevel(lvl));
      return row;
    }),
  );
}

function openRescue(): void {
  scenery.setTheme("surge");
  renderRescueList();
  showScreen("rescue");
}

function startRescueLevel(level: RescueLevel): void {
  teardownGame();
  scenery.setTheme("garden");
  playMusic("cascade");
  cascadeRestart = () => startRescueLevel(level);
  cascadeQuit = openRescue;
  $("k-overlay").classList.remove("show");
  $("k-pause-overlay").classList.remove("show");
  $("k-score-txt").classList.remove("new-record");
  $("k-score-label").textContent = "Score";
  // Kombi-Angebote/-Karten gibt's nur im Free Play — falls eins vom letzten
  // Lauf noch offen/sichtbar war, hier sauber wegräumen.
  $("k-combo-offer").hidden = true;

  // Szene oben statt der Multiplikator-Zeile: Bedrohung + Held + ein Brocken
  // pro Reihen-Ziel. Jede geräumte Reihe lässt unten im Turm einen Brocken
  // verschwinden (siehe onHud) — das *ist* jetzt die Fortschrittsanzeige.
  $("rs-scene").hidden = false;
  $("k-mult-col").hidden = true;
  $("k-best-wrap").hidden = true;
  // Kaskaden-Fähigkeiten gehören zur Free-Play-Wirtschaft, nicht zum Story-Modus.
  $("k-abilities").hidden = true;
  $("k-best-wrap").classList.remove("burst");
  $<HTMLImageElement>("rs-hero").src = `ui/chars/${level.hero}.webp`;
  $("rs-blurb").textContent = level.blurb;
  const rubble = $("rs-rubble");
  rubble.replaceChildren(
    ...Array.from({ length: level.config.targetRows }, () => {
      const span = document.createElement("span");
      span.className = "rescue-chunk";
      span.textContent = "🪨";
      return span;
    }),
  );
  // Ziel-Abzeichen: die eine Zahl, die zählt — zählt runter auf 0, wie bei
  // Royal Match/Royal Kingdom. Plus einmal in Worten beim Start, damit von
  // Sekunde 1 an klar ist, was zu tun ist.
  const goalEl = $("rs-goal");
  goalEl.classList.remove("done");
  $("rs-goal-num").textContent = nf(level.config.targetRows);
  let lastGoalLeft = level.config.targetRows;
  window.setTimeout(() => toast(`🎯 Goal: clear ${nf(level.config.targetRows)} lines!`), 500);

  const game = new CascadeState(`rescue-${level.id}-${Date.now()}`, level.config);
  cascadeGame = game;
  let lastMultTier = 1;
  if (import.meta.env.DEV) (window as unknown as { __cascade: CascadeState }).__cascade = game;
  cascadeView = new CascadeView($<HTMLCanvasElement>("k-canvas"), $("k-wrap"), game, {
    onHud: (h) => {
      $("k-score-txt").textContent = nf(h.score);
      const multEl = $("k-mult");
      multEl.textContent = `×${xf(h.mult.toFixed(1))}`;
      const tier = Math.floor(h.mult);
      for (let t = 2; t <= 5; t++) multEl.classList.toggle(`tier-${t}`, tier === t || (t === 5 && tier > 5));
      if (tier > lastMultTier) {
        multEl.classList.remove("bump");
        void multEl.offsetWidth;
        multEl.classList.add("bump");
        multEl.classList.remove("flame");
        void multEl.offsetWidth;
        multEl.classList.add("flame");
        window.setTimeout(() => multEl.classList.remove("flame"), 2400);
      }
      lastMultTier = tier;
      const goalLeft = Math.max(0, level.config.targetRows - h.cleared);
      if (goalLeft !== lastGoalLeft) {
        const numEl = $("rs-goal-num");
        numEl.textContent = nf(goalLeft);
        numEl.classList.remove("bump");
        void numEl.offsetWidth;
        numEl.classList.add("bump");
        goalEl.classList.toggle("done", goalLeft === 0);
        lastGoalLeft = goalLeft;
      }
      // Die Bedrohung rückt näher, je mehr vom Scherben-Budget weg ist — wird
      // das Budget leer, bevor das Ziel steht, hat sie euch eingeholt (=
      // dieselbe Niederlage wie "keine Scherben mehr").
      const usedFrac = Math.min(1, 1 - h.shardsLeft / level.config.shardBudget);
      $("rs-threat").style.transform = `translateY(${Math.round(usedFrac * 58)}px)`;
      const el = $("k-clock");
      $("k-clock-txt").textContent = `🧊 ${nf(Math.max(0, h.shardsLeft))}`;
      el.classList.toggle("warn", h.shardsLeft <= 3);
      for (let i = 0; i < 3; i++) $(`k-life-${i}`).classList.toggle("lost", i >= h.lives);
      // keine Zwischenaufgaben im Level — das Ziel ist das Ziel
      $("k-challenge").hidden = true;

      const streakEl = $("k-streak");
      streakEl.classList.toggle("active", h.chain >= 2);
      if (h.chain >= 2) streakEl.textContent = `🔥 ×${h.chain}`;

      // ein Brocken pro geräumter Reihe verschwindet — der Held wird freier
      const chunks = rubble.children;
      for (let i = 0; i < chunks.length; i++) chunks[i]!.classList.toggle("gone", i < h.cleared);
    },
    onEnd: (r) => {
      const stars = !r.won
        ? 0
        : r.livesLeft >= level.config.lives
          ? 3
          : r.livesLeft >= Math.ceil(level.config.lives / 2)
            ? 2
            : 1;
      store.recordRescueLevel(level.id, stars, r.score);
      const shards = r.won ? Math.min(30, 8 + Math.floor(r.score / 100)) : 0;
      if (shards) store.addShards(shards);
      const freshAch = syncAchievements();
      celebrate(freshAch);
      renderTopPills();

      $("k-overlay-title").textContent = r.won
        ? "Freed!"
        : r.livesLeft <= 0
          ? "No Lives Left!"
          : "Out of Pieces!";
      $("k-result").innerHTML = r.won
        ? `${"⭐".repeat(stars)}${"☆".repeat(3 - stars)}<br><b>${nf(r.score)}</b> points · ${nf(r.cleared)} rows` +
          (shards ? ` · ✦ +${nf(shards)}` : "") +
          (freshAch.length ? `<br><small>🏅 ${freshAch[0]!.name} unlocked</small>` : "")
        : `<b>${nf(r.cleared)}</b> of ${nf(level.config.targetRows)} rows cleared — try again?`;
      const ov = $("k-overlay");
      ov.classList.remove("show");
      void ov.offsetWidth;
      ov.classList.add("show");
      const nextLevel = RESCUE_LEVELS[RESCUE_LEVELS.indexOf(level) + 1];
      $<HTMLButtonElement>("k-quit").onclick = openRescue;
      const goNext = r.won && nextLevel;
      $<HTMLButtonElement>("k-again").onclick = goNext ? () => startRescueLevel(nextLevel) : () => startRescueLevel(level);
      $("k-again").textContent = goNext ? "Next ›" : "Play Again";
    },
  });
  if (import.meta.env.DEV) (window as unknown as { __cascadeView: CascadeView }).__cascadeView = cascadeView;
  $("k-best").textContent = "–";
  showScreen("kaskade");
  window.scrollTo(0, 0);
  maybeHintRotate();
}

// ── Sammlung ───────────────────────────────────────────────────────────────
function renderCollection(): void {
  scenery.setTheme("collection");
  const s = store.load();
  // nur Zahlen, die aufs eine Ziel zeigen, ein Rekord sind oder Story-Tatsache
  // (KONZEPT §F) — Ø-Lösezeit belohnt Hetze und fliegt raus
  const allBeats = [...INTRO, ...BEATS];
  const memSeen = store.beatsSeen().filter((id) => allBeats.some((b) => b.id === id)).length;
  const stats: [string, string][] = [
    ["Light Collected", nf(s.shards)],
    ["Memories", `${nf(memSeen)} / ${nf(allBeats.length)}`],
    ["Shard Storm", nf(s.cascade.bestScore)],
    ["Achievements", `${nf(unlockedCount(s))} / ${nf(ACHIEVEMENTS.length)}`],
  ];
  $("stats").replaceChildren(
    ...stats.map(([label, val]) => {
      const d = document.createElement("div");
      d.className = "stat";
      d.innerHTML = `<b>${val}</b><small>${label}</small>`;
      return d;
    }),
  );
  renderShop();

  // Erinnerungen — die gespielten Story-Beats, nachlesbar
  const seen = new Set(store.beatsSeen());
  $("memories").replaceChildren(
    ...allBeats.map((b) => {
      const has = seen.has(b.id);
      const d = document.createElement("div");
      d.className = `ach${has ? " done" : " locked"}`;
      const body = has
        ? `<div class="t">${b.title}</div><div class="h">${b.lines.join(" ")}</div>`
        : `<div class="t">???</div><div class="h">Keep playing to unlock this memory.</div>`;
      const icon = has ? SPEAKERS[b.speaker]?.emoji || "🕯" : "·";
      d.innerHTML = `<div class="ic">${icon}</div><div>${body}</div>`;
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

interface ShopItem {
  icon: string;
  label: string;
  cost: number;
  buy: () => void;
  soon?: boolean;
  /** Zusätzliche Sperre über "genug Splitter?" hinaus (z. B. "eh schon voll"). */
  disabledWhen?: () => boolean;
}
const SHOP: ShopItem[] = [
  // Joker sind bewusst teuer — ein Tipp ~alle 4–5 Fenster, sonst per Video
  // (kommt später). Preise fallen mit der Stärke: Tipp > Zeit > Neu ordnen.
  { icon: "ui/hint.webp", label: "Hint ×1", cost: 40, buy: () => store.update((d) => void (d.jokers.hint += 1)) },
  { icon: "ui/hint.webp", label: "📺 Watch video → Hint", cost: 0, soon: true, buy: () => {} },
  { icon: "ui/time.webp", label: "More Time ×1", cost: 26, buy: () => store.update((d) => void (d.jokers.time += 1)) },
  { icon: "ui/solvent.webp", label: "Shuffle ×1", cost: 16, buy: () => store.update((d) => void (d.jokers.solvent += 1)) },
  {
    icon: "ui/life.webp",
    label: "Refill Hearts",
    cost: 30,
    buy: () => store.refillLives(),
    disabledWhen: () => store.load().lives.count >= store.MAX_LIVES,
  },
  // Kaskaden-Fähigkeiten (KONZEPT-kaskade-oekonomie.md §2) — Verbrauchsgut,
  // gedeckelt bei CASCADE_ABILITY_CAP pro Typ (siehe `disabledWhen`), damit
  // eine einzelne Grind-Session nie zu einem unfairen Dauervorteil in einer
  // einzelnen Runde wird. Weitblick ist der einzige Einmalkauf.
  {
    icon: "ui/solvent.webp",
    label: "🔀 Mischen ×3",
    cost: 15,
    buy: () => store.addCascadeAbility("shuffle", 3),
    disabledWhen: () => store.load().cascadeAbilities.shuffle >= store.CASCADE_ABILITY_CAP,
  },
  {
    icon: "💣",
    label: "Klärfunke ×2",
    cost: 20,
    buy: () => store.addCascadeAbility("clear", 2),
    disabledWhen: () => store.load().cascadeAbilities.clear >= store.CASCADE_ABILITY_CAP,
  },
  {
    icon: "ui/time.webp",
    label: "⏱️ Zeitphiole ×2",
    cost: 12,
    buy: () => store.addCascadeAbility("time", 2),
    disabledWhen: () => store.load().cascadeAbilities.time >= store.CASCADE_ABILITY_CAP,
  },
  {
    icon: "👁️",
    label: "Weitblick (dauerhaft)",
    cost: 25,
    buy: () => store.unlockForesight(),
    disabledWhen: () => store.load().cascadeAbilities.foresight,
  },
];

function renderShop(): void {
  const s = store.load();
  pillValue("shop-shards", nf(s.shards));
  $("shop").replaceChildren(
    ...SHOP.map((item) => {
      const row = document.createElement("div");
      row.className = "item";
      const btn = document.createElement("button");
      btn.className = "gold";
      const locked = item.disabledWhen?.() ?? false;
      btn.textContent = item.soon ? "soon" : locked ? "full" : `${item.cost} ✦`;
      btn.disabled = item.soon || locked || s.shards < item.cost;
      btn.addEventListener("click", () => {
        if (item.soon || item.disabledWhen?.()) return;
        if (store.spendShards(item.cost)) {
          item.buy();
          toast("Purchased");
          renderShop();
          renderTopPills();
        }
      });
      const iconHtml = item.icon.startsWith("ui/")
        ? `<img class="shop-ic" src="${item.icon}" alt="" />`
        : `<span class="shop-ic" style="display:grid;place-items:center;font-size:22px">${item.icon}</span>`;
      row.innerHTML = `<span class="lbl">${iconHtml}${item.label}</span>`;
      row.append(btn);
      return row;
    }),
  );
}

// ── Profil ─────────────────────────────────────────────────────────────────
/** Avatar options. The art lives at `ui/avatars/<id>.webp`; until the files are
 *  dropped in and `AVATAR_ART` flipped to true, the emoji stands in (kein 404). */
const AVATAR_ART = false;
const AVATARS: Array<{ id: string; emoji: string }> = [
  { id: "grin", emoji: "😄" },
  { id: "cool", emoji: "😎" },
  { id: "wow", emoji: "🤩" },
  { id: "wink", emoji: "😉" },
  { id: "joy", emoji: "😂" },
  { id: "smirk", emoji: "😏" },
  { id: "angel", emoji: "😇" },
  { id: "party", emoji: "🥳" },
];

/** Fill `host` with the avatar for `id` — the painted webp, or the emoji if it's not there yet. */
function paintAvatar(host: HTMLElement, id: string): void {
  const found = AVATARS.find((a) => a.id === id) ?? AVATARS[0]!;
  if (!AVATAR_ART) {
    host.textContent = found.emoji;
    return;
  }
  const img = document.createElement("img");
  img.alt = "";
  img.src = `ui/avatars/${found.id}.webp`;
  img.addEventListener("error", () => {
    host.textContent = found.emoji;
  });
  host.replaceChildren(img);
}

function renderHomeAvatar(): void {
  paintAvatar($("home-avatar"), store.avatarId());
}

function openProfile(): void {
  const s = store.load();
  paintAvatar($("pf-avatar"), store.avatarId());
  $("pf-name").textContent = store.playerName();
  $("pf-level").textContent = nf(store.playerLevel(s));
  $("pf-picker").hidden = true;

  const allB = [...INTRO, ...BEATS];
  const memSeen = store.beatsSeen().filter((id) => allB.some((b) => b.id === id)).length;
  const rows: Array<[string, string, string]> = [
    ["ui/collection.webp", "Windows lit", nf(store.panes(s))],
    ["ui/star.webp", "Stars collected", nf(store.totalStars(s))],
    ["ui/shard.webp", "Light collected", nf(s.shards)],
    ["ui/hint.webp", "Memories", `${nf(memSeen)} / ${nf(allB.length)}`],
    ["ui/solvent.webp", "No-undo streak", nf(s.stats.bestNoUndoStreak)],
    ["ui/descent.webp", "Anselm's Mine — deepest level", nf(s.descent.bestDepth)],
    ["ui/cascade.webp", "Shard Storm — record", nf(s.cascade.bestScore)],
    ["ui/daily.webp", "Longest daily streak", nf(s.daily.bestStreak)],
    ["ui/hint.webp", "Achievements", `${nf(unlockedCount(s))} / ${nf(ACHIEVEMENTS.length)}`],
  ];
  $("pf-stats").replaceChildren(
    ...rows.map(([icon, label, value]) => {
      const d = document.createElement("div");
      d.className = "pf-stat";
      d.innerHTML = `<img src="${icon}" alt="" /><span class="l">${label}</span><span class="v">${value}</span>`;
      return d;
    }),
  );

  const picker = $("pf-picker");
  const current = store.avatarId();
  picker.replaceChildren(
    ...AVATARS.map((a) => {
      const b = document.createElement("button");
      b.className = `pf-opt${a.id === current ? " sel" : ""}`;
      paintAvatar(b, a.id);
      b.addEventListener("click", () => {
        store.setAvatarId(a.id);
        sfx.pickUp();
        sfx.vibrate(8);
        renderHomeAvatar();
        openProfile();
      });
      return b;
    }),
  );

  $("profile-overlay").classList.add("show");
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
  toastTimer = window.setTimeout(() => el.classList.remove("show"), 6400);
}

// ── Wiring ─────────────────────────────────────────────────────────────────
for (const btn of document.querySelectorAll<HTMLButtonElement>("#tabbar button")) {
  btn.addEventListener("click", () => {
    if (!btn.classList.contains("on")) sfx.vibrate(10); // a tiny tick when the tab actually changes
    setTab(btn.dataset.tab as Tab);
  });
}
$("region-back").addEventListener("click", () => setTab("home"));
$("home-avatar").addEventListener("click", openProfile);
const closeProfile = (): void => $("profile-overlay").classList.remove("show");
$("pf-x").addEventListener("click", closeProfile);
$("profile-overlay").addEventListener("click", (e) => {
  if (e.target === $("profile-overlay")) closeProfile();
});
$("pf-edit").addEventListener("click", () => {
  const p = $("pf-picker");
  p.hidden = !p.hidden;
});
$("pf-name").addEventListener("click", () => {
  const next = window.prompt("Your name:", store.playerName());
  if (next && next.trim()) {
    store.setPlayerName(next);
    $("pf-name").textContent = store.playerName();
  }
});
renderHomeAvatar();

function doLeave(): void {
  if (mode === "campaign" && campaignAt) openRegion(regions.indexOf(campaignAt.region));
  else if (mode === "daily") setTab("daily");
  else if (descentState) endDescent(descentState.depth);
  else setTab("descent");
}
/** Fenster-id des gerade laufenden Kampagnen-Levels — für die Fehlschlag-Buchung. */
function currentCampaignLevelId(): string | null {
  if (mode !== "campaign" || !campaignAt) return null;
  return campaignAt.region.levels[campaignAt.index]?.id ?? null;
}

/**
 * Ein laufendes Kampagnen-Fenster aufgeben (Verlassen oder Neustart): kostet
 * genau so viel wie ein Timeout — ein Herz und die Serie. Sonst wäre „Pause →
 * Neustart" ein Gratis-Weg, jeden drohenden Fehlschlag zu annullieren.
 */
function abandonCampaignLevel(): void {
  store.spendLife();
  const id = currentCampaignLevelId();
  if (id) store.recordFail(id);
  else store.endAttempt();
  renderTopPills();
}

function leavePlay(): void {
  const g = activeGame;
  const inProgress = !!g && g.started && !g.isWon() && !g.failed;
  const resume = (): void => {
    hideOverlay();
    activeGame?.resume();
  };
  if (inProgress && mode === "campaign") {
    activeGame?.pause();
    const lostStreak = store.winStreak();
    showOverlay({
      title: "Leave Window?",
      sub:
        "Counts as a failed attempt: <b>1 heart</b> lost" +
        (lostStreak >= 2 ? `, streak ×${xf(store.winMultiplier(lostStreak))} lost` : "") +
        ".",
      nextLabel: "Leave Anyway",
      onNext: () => {
        abandonCampaignLevel();
        doLeave();
      },
      quitLabel: "Keep Playing",
      onQuit: resume,
    });
    return;
  }
  if (inProgress && mode === "descent") {
    activeGame?.pause();
    showOverlay({
      title: "Abort Descent?",
      sub: "The run ends here.",
      nextLabel: "Abort",
      onNext: doLeave,
      quitLabel: "Keep Playing",
      onQuit: resume,
    });
    return;
  }
  doLeave();
}
function restartLevel(): void {
  if (mode === "campaign" && campaignAt) {
    const at = campaignAt;
    const g = activeGame;
    const inProgress = !!g && g.started && !g.isWon() && !g.failed;
    if (inProgress) {
      g.pause();
      const lostStreak = store.winStreak();
      showOverlay({
        title: "Restart?",
        sub:
          "Counts as a failed attempt: <b>1 heart</b> lost" +
          (lostStreak >= 2 ? `, streak ×${xf(store.winMultiplier(lostStreak))} lost` : "") +
          ".",
        nextLabel: "Restart",
        onNext: () => {
          abandonCampaignLevel();
          void playCampaign(at.region, at.index);
        },
        quitLabel: "Keep Playing",
        onQuit: () => {
          hideOverlay();
          activeGame?.resume();
        },
      });
      return;
    }
    void playCampaign(at.region, at.index);
    return;
  }
  if (mode === "daily") void playDaily();
  else void playDescentLevel();
}
function restorePauseButtons(): void {
  $("ps-restart").hidden = false;
  $("ps-quit").hidden = false;
  $("ps-title").textContent = "Pause";
  $<HTMLButtonElement>("ps-resume").textContent = "Resume";
}
function openPause(): void {
  restorePauseButtons();
  renderSettingsToggles($("settings-toggles"));
  $("pause-overlay").classList.add("show");
  activeGame?.pause();
}
function closePause(): void {
  $("pause-overlay").classList.remove("show");
  restorePauseButtons();
  activeGame?.resume();
}
$("play-pause").addEventListener("click", openPause);
$("ps-resume").addEventListener("click", closePause);
$("ps-x").addEventListener("click", closePause);
$("home-settings").addEventListener("click", () => {
  renderSettingsToggles($("settings-toggles"));
  $("pause-overlay").classList.add("show");
  $("ps-restart").hidden = true;
  $("ps-quit").hidden = true;
  $("ps-title").textContent = "Settings";
  $<HTMLButtonElement>("ps-resume").textContent = "Close";
});
$("ps-restart").addEventListener("click", () => {
  $("pause-overlay").classList.remove("show");
  restartLevel();
});
$("ps-quit").addEventListener("click", () => {
  $("pause-overlay").classList.remove("show");
  leavePlay();
});
$("daily-play").addEventListener("click", playDaily);
$("descent-play").addEventListener("click", startDescent);
$("cascade-play").addEventListener("click", startCascade);
$("rescue-open").addEventListener("click", openRescue);
$("lb-open").addEventListener("click", openLeaderboard);
$("lb-x").addEventListener("click", () => $("lb-overlay").classList.remove("show"));
$("lb-overlay").addEventListener("click", (e) => {
  if (e.target === $("lb-overlay")) $("lb-overlay").classList.remove("show");
});
for (const id of ["lb-tab-country", "lb-tab-global"]) {
  $(id).addEventListener("click", () => {
    const next = $(id).dataset.scope as "country" | "global";
    if (next === lbScope) return;
    lbScope = next;
    void renderLeaderboard();
  });
}
// k-quit / k-again werden pro Runde in onEnd gesetzt (wegen eventueller Cutscene)
$<HTMLButtonElement>("k-quit").onclick = () => setTab("home");
$<HTMLButtonElement>("k-again").onclick = startCascade;
$("k-pause").addEventListener("click", () => {
  const ov = $("k-pause-overlay");
  const show = !ov.classList.contains("show");
  ov.classList.toggle("show", show);
  if (show) {
    renderSettingsToggles($("k-settings-toggles"));
    cascadeGame?.pause();
  } else {
    cascadeGame?.resume();
  }
});
function closeKPause(): void {
  $("k-pause-overlay").classList.remove("show");
  cascadeGame?.resume();
}
$("kp-resume").addEventListener("click", closeKPause);
$("kp-x").addEventListener("click", closeKPause);
$("kp-restart").addEventListener("click", () => {
  $("k-pause-overlay").classList.remove("show");
  cascadeRestart();
});
$("kp-quit").addEventListener("click", () => {
  $("k-pause-overlay").classList.remove("show");
  cascadeQuit();
});
$("jk-hint").addEventListener("click", () => useJoker("hint"));
$("jk-time").addEventListener("click", () => useJoker("time"));
$("jk-solvent").addEventListener("click", () => useJoker("solvent"));

window.setInterval(() => {
  if (!$("screen-home").hidden) renderTopPills();
}, 4000);

const talkarteEl = document.querySelector<HTMLElement>(".talkarte");
if (talkarteEl) {
  mountTalkarteFx({
    scroller: $("screen-home"),
    root: talkarteEl,
    light: lightFrac,
    visible: () => !$("screen-home").hidden,
  });
}

/** Beim allerersten Start die drei Intro-Szenen spielen, dann wie gewohnt. */
function maybePlayIntro(after: () => void): void {
  const seen = new Set(store.beatsSeen());
  const todo = INTRO.filter((b) => !seen.has(b.id));
  if (todo.length === 0) return after();
  playSequence(todo, after);
}

async function boot(): Promise<void> {
  try {
    manifest = (await (await fetch("levels/manifest.json")).json()) as Manifest;
    regions = buildRegions(manifest);

    // Reload / App-Kill mitten in einem Kampagnen-Fenster: nachträglich als
    // Fehlschlag verbuchen, sonst wäre „App wegwischen" ein Gratis-Neustart.
    const abandoned = store.takePendingAttempt();
    if (abandoned) {
      store.recordFail(abandoned);
      store.spendLife();
      window.setTimeout(() => toast("A window was left open — 1 heart and your streak lost."), 800);
    }

    refreshLight();
    renderHome();
    playMusic("menu");
    maybePlayIntro(() => {
      /* Home steht schon; die Cutscene lag nur davor */
    });
  } catch (err) {
    toast(`Level data couldn't be loaded (${(err as Error).message}).`);
  }
}
void boot();
