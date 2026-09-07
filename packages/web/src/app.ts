/**
 * App shell: bottom-tab navigation between Spielen (regions → levels), Täglich,
 * Abstieg, Kaskade and Sammlung; plus the shared play screen for the three
 * "fill the frame" modes and the Kaskade screen.
 */

import { type Level, parseLevel, rngFromSeed } from "@polyomino/puzzle-core";
import { ACHIEVEMENTS, syncAchievements, unlockedCount } from "./achievements.js";
import { BEATS, type Beat, beatAfter, SPEAKERS } from "./beats.js";
import { CascadeState } from "./cascade.js";
import { CascadeView } from "./cascade-view.js";
import { GameState } from "./game.js";
import { dailyLevel, descentDifficulty, descentLevel, levelSignature } from "./levelgen.js";
import * as store from "./progress.js";
import type { JokerKind } from "./progress.js";
import { buildRegions, type Manifest, type Region } from "./regions.js";
import { Scenery, type SceneTheme } from "./scenery.js";
import { sfx } from "./sfx.js";
import { miraLine, type StoryPlace } from "./story.js";
import { GameView } from "./view.js";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const fmt = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
/** Zahlen im Spiel immer mit Tausenderpunkt — "12.345" statt "12345". */
const nf = (n: number): string => Math.round(n).toLocaleString("de-DE");

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
let cascadeGame: CascadeState | null = null;
let clockTimer = 0;
const scenery = new Scenery($<HTMLCanvasElement>("scenery"));

/** How lit the world is (0..1), from campaign stars. */
function lightFrac(): number {
  // an *jedem* erhellten Fenster wird das Tal heller — nicht nur an Kampagnen-
  // sternen. „Voll" bei etwa allen Kampagnen-Fenstern plus ein bisschen mehr.
  const full = Math.max(20, (manifest?.levels.length ?? 30) + 12);
  return Math.min(1, store.panes(store.load()) / full);
}
function refreshLight(): void {
  // steep early curve so the first region visibly warms the world
  scenery.setLight(0.14 + 0.86 * Math.pow(lightFrac(), 0.6));
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
    title: "Keine Herzen",
    sub: `Ein Herz kommt in <b>${fmt(l.msToNext)}</b> zurück.`,
    rewards: [
      "📺 Werbe-Block ansehen → +1 Herz  (bald)",
      canPay ? "✦ 30 Splitter → Herzen voll" : `✦ ${store.load().shards} / 30 Splitter`,
    ],
    nextLabel: canPay ? "Herzen kaufen (30 ✦)" : "Zurück",
    onNext: () => {
      if (store.spendShards(30)) {
        store.refillLives();
        toast("Herzen aufgefüllt");
        renderTopPills();
        onBuy();
      } else {
        setTab("home");
      }
    },
    quitLabel: "Zurück",
    onQuit: () => setTab("home"),
  });
  return false;
}

// ── Settings (sound / music / haptics) ─────────────────────────────────────
interface Settings {
  sound: boolean;
  music: boolean;
  haptics: boolean;
}
function loadSettings(): Settings {
  try {
    return { sound: true, music: true, haptics: true, ...JSON.parse(localStorage.getItem("lumen.settings") ?? "{}") };
  } catch {
    return { sound: true, music: true, haptics: true };
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
}
let settings = loadSettings();
saveSettings(settings);

function renderSettingsToggles(host: HTMLElement): void {
  const rows: Array<[keyof Settings, string, string]> = [
    ["sound", "🔊", "Ton"],
    ["music", "🎵", "Musik"],
    ["haptics", "📳", "Haptik"],
  ];
  host.replaceChildren(
    ...rows.map(([key, icon, label]) => {
      const row = document.createElement("div");
      row.className = "toggle-row";
      row.innerHTML = `<span>${icon} ${label}</span>`;
      const seg = document.createElement("div");
      seg.className = "seg";
      for (const on of [false, true]) {
        const b = document.createElement("button");
        b.textContent = on ? "An" : "Aus";
        if (settings[key] === on) {
          b.classList.add("on");
          if (!on) b.classList.add("off-on");
        }
        b.addEventListener("click", () => {
          settings = { ...settings, [key]: on };
          saveSettings(settings);
          renderSettingsToggles(host);
        });
        seg.append(b);
      }
      row.append(seg);
      return row;
    }),
  );
}

let mode: "campaign" | "daily" | "descent" = "campaign";
let campaignAt: { region: Region; index: number } | null = null;
let descentState:
  | { variant: number; depth: number; streak: number; sawRecord: boolean; recent: string[] }
  | null = null;
let activeGame: GameState | null = null;

/** Short bursts of praise for the between-levels moment, rotated (never RNG). */
const HYPE_WORDS = [
  "Wow!",
  "Wahnsinn!",
  "Stark!",
  "Grandios!",
  "Weiter so!",
  "Unaufhaltsam!",
  "Fantastisch!",
  "Bärenstark!",
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
  if (tab === "cascade") renderCascade();
  if (tab === "collection") renderCollection();
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
}

// ── Home / regions ─────────────────────────────────────────────────────────
function regionStars(r: Region): { got: number; max: number } {
  const s = store.load();
  const got = r.levels.reduce((n, l) => n + (s.levels[l.id]?.stars ?? 0), 0);
  return { got, max: r.levels.length * 3 };
}

/** Erste offene, noch nicht abgeschlossene Region + erstes ungelöste Fenster darin. */
function currentCampaignTarget(): { region: Region; index: number; regionIndex: number } | null {
  const s = store.load();
  const panes = store.panes(s);
  for (let ri = 0; ri < regions.length; ri++) {
    const r = regions[ri]!;
    if (panes < r.panesToUnlock) break;
    const next = r.levels.findIndex((l) => !s.levels[l.id]);
    if (next !== -1) return { region: r, index: next, regionIndex: ri };
  }
  // alles gelöst → letztes offene Fenster der letzten offenen Region
  for (let ri = regions.length - 1; ri >= 0; ri--) {
    const r = regions[ri]!;
    if (panes >= r.panesToUnlock) return { region: r, index: 0, regionIndex: ri };
  }
  return null;
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
  if (!manifest) return;
  refreshLight();
  scenery.setTheme("menu");
  renderTopPills();
  const s = store.load();
  const panes = store.panes(s);
  const pct = Math.round(lightFrac() * 100);
  $("home-status").innerHTML =
    `<b>${panes}</b> Fenster erhellt · das Tal ist zu <b>${pct}%</b> im Licht.`;

  // ── Der eine Knopf: weiter im Lichtpfad ──
  const target = currentCampaignTarget();
  const hero = $<HTMLButtonElement>("home-play");
  if (target) {
    hero.hidden = false;
    hero.textContent = `Weiter · ${target.region.name} ${target.index + 1}`;
    hero.onclick = () => void playCampaign(target.region, target.index);
  } else {
    hero.hidden = true;
  }

  // ── Der Pfad: Regionen mit den Seitenmodi als Orte dazwischen ──
  const host = $("regions");
  host.replaceChildren();

  const regionStation = (r: Region, i: number): HTMLElement => {
    const locked = panes < r.panesToUnlock;
    const { got, max } = regionStars(r);
    const complete = got >= max && max > 0;
    const station = document.createElement("div");
    station.className = `station${locked ? " locked" : complete ? " done" : " current"}`;
    station.dataset.region = r.id;
    const prevUnlock = regions[i - 1]?.panesToUnlock ?? 0;
    const lanternFill = locked
      ? Math.round(((panes - prevUnlock) / Math.max(1, r.panesToUnlock - prevUnlock)) * 100)
      : 100;
    station.innerHTML = `
      <div class="st-card">
        <div class="row">
          <div class="name">${r.name}</div>
          <div class="want">${
            locked
              ? `🏮 ${panes} / ${r.panesToUnlock}`
              : `<b>★ ${got}</b> / ${max}${complete ? " ✓" : ""}`
          }</div>
        </div>
        <div class="muted">${
          locked
            ? `Die Laterne füllt sich — noch ${r.panesToUnlock - panes} Fenster (jeder Modus zählt).`
            : r.subtitle
        }</div>
        <div class="progress"><i style="width:${locked ? lanternFill : max ? (got / max) * 100 : 0}%"></i></div>
      </div>`;
    if (!locked) station.addEventListener("click", () => openRegion(i));
    return station;
  };

  const dailyDone = s.daily.lastDayDone === store.todayKey();
  const daily = sideStation(
    "#ffc23b",
    "🌅",
    "Das Tagesfenster",
    dailyDone ? "erledigt ✓" : `🔥 ${s.daily.streak}`,
    dailyDone ? "Morgen wartet das nächste." : "Ein Fenster für heute — für alle gleich.",
    () => setTab("daily"),
  );
  const descent = sideStation(
    "#45c1ff",
    "🕯",
    "Anselms Stollen",
    `Ebene ${s.descent.bestDepth}`,
    "Tief hinab. Jedes Fenster erhellt die Laterne.",
    () => setTab("descent"),
  );
  const cascade = sideStation(
    "#a875ff",
    "⚡",
    "Der Scherbenregen",
    nf(s.cascade.bestScore),
    "2½ Minuten. Fang die Splitter, bevor sie weg sind.",
    () => setTab("cascade"),
  );

  // Reihenfolge: Region → Ort → Region → Ort → Region → Ort
  host.append(regionStation(regions[0]!, 0));
  host.append(daily);
  if (regions[1]) host.append(regionStation(regions[1], 1));
  host.append(descent);
  if (regions[2]) host.append(regionStation(regions[2], 2));
  host.append(cascade);

  // auf die aktuelle Region scrollen
  if (target) {
    const nodes = host.children;
    const idx = target.regionIndex === 0 ? 0 : target.regionIndex === 1 ? 2 : 4;
    (nodes[idx] as HTMLElement | undefined)?.scrollIntoView({ block: "center", behavior: "auto" });
  }
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
function winStarBurst(): void {
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
  for (const [ox, oy] of origins) {
    const n = 26;
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 130 + Math.random() * 560;
      ps.push({
        x: ox! + (Math.random() - 0.5) * 40,
        y: oy! + (Math.random() - 0.5) * 40,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        t: 0,
        max: 1.2 + Math.random() * 1.4,
        size: 5 + Math.random() * 16,
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

/** Miras Portrait — das gemalte Bild, solange es da ist, sonst ihre Laterne. */
function paintMira(host: HTMLElement): void {
  if (host.querySelector("img")) return; // schon gesetzt
  const img = document.createElement("img");
  img.alt = "Mira";
  img.src = "ui/chars/mira.webp";
  img.addEventListener("error", () => {
    host.textContent = "🏮";
  });
  host.replaceChildren(img);
}

// ── Story-Beat / Cutscene ──────────────────────────────────────────────────
let pendingBeat: Beat | null = null;

/** Nach einem Sieg merken: fällt jetzt ein Beat? Wird beim „Weiter" gespielt. */
function queueBeat(panesBefore: number, panesAfter: number): void {
  const b = beatAfter(panesBefore, panesAfter);
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

/** Spielt einen Beat als DOM-Cutscene, Zeile für Zeile, dann `done()`. */
function playCutscene(beat: Beat, done: () => void): void {
  const sp = SPEAKERS[beat.speaker];
  const scene = $("cutscene");
  const portrait = $("cs-portrait");
  if (sp.img) {
    const img = document.createElement("img");
    img.alt = "";
    img.src = sp.img;
    img.addEventListener("error", () => (portrait.textContent = sp.emoji));
    portrait.replaceChildren(img);
  } else {
    portrait.textContent = sp.emoji;
  }
  $("cs-name").textContent = sp.name;

  hideOverlay();
  scene.hidden = false;
  scene.classList.add("show");

  let line = 0;
  let typing = false;
  const linesEl = $("cs-lines");
  const tapEl = $("cs-tap");

  const type = (text: string): void => {
    typing = true;
    tapEl.classList.add("busy");
    linesEl.textContent = "";
    let i = 0;
    const step = (): void => {
      linesEl.textContent = text.slice(0, (i += 2));
      if (i < text.length) {
        window.setTimeout(step, 14);
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
    scene.classList.remove("show");
    scene.hidden = true;
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
  quit.textContent = o.quitLabel ?? "Übersicht";
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
      txt.innerHTML = `${left}<i>Züge</i>`;
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
  ($("jk-hint-c").textContent = String(j.hint));
  ($("jk-time-c").textContent = String(j.time));
  ($("jk-solvent-c").textContent = String(j.solvent));
  $("jk-time-l").textContent = activeGame?.hasMoveBudget ? "+3 Züge" : "+20s";
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
  if (kind === "hint" && !gameView.showHint()) {
    toast("Nichts mehr zu verraten");
    return;
  }
  if (!store.spendJoker(kind)) return;
  fireJokerButton(kind);
  sfx.pickUp();
  if (kind === "time") {
    // derselbe Joker, die passende Währung: Züge, wo es ein Budget gibt
    if (activeGame.hasMoveBudget) {
      activeGame.extendMoves(3);
      toast("+3 Züge");
    } else {
      activeGame.extendLimit(20_000);
      toast("+20 Sekunden");
    }
  }
  if (kind === "solvent") {
    const n = activeGame.clearIncorrect();
    toast(n > 0 ? `${n} Teil${n > 1 ? "e" : ""} gelöst` : "Alles sitzt schon richtig");
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
  },
): void {
  teardownGame();
  hideOverlay();
  cb.onSolved ??= winStarBurst; // every solve gets the full-screen star shower
  // Der Streifen zeigt entweder die Abstiegs-Stufe oder das Level-Ziel
  $("play-stage").hidden = mode !== "descent" && game.goal === "cover";
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
}

function celebrate(freshly: ReturnType<typeof syncAchievements>): void {
  for (const a of freshly) toast(`Erfolg freigeschaltet: ${a.name}`);
}

/** Collect the reward lines for a story-level win, applying side effects. */
function collectStoryRewards(levelId: string, stars: number, ms: number, usedUndo: boolean, region?: Region): string[] {
  const lines: string[] = [];
  const panesBefore = store.panes();
  const earned = store.recordLevel(levelId, stars, ms, usedUndo);
  if (store.panes() > panesBefore) lines.push("🏮 +1 Fenster erhellt");
  lines.push(`✦ +${earned} Lichtsplitter`);
  // schaltet dieses Fenster eine Region auf? dann sagen
  const nextLocked = regions.find((r) => store.panes() === r.panesToUnlock);
  if (nextLocked) lines.push(`✨ ${nextLocked.name} — die Laterne ist an!`);
  refreshLight();
  scenery.pulse(0.3 + 0.1 * stars); // the world visibly brightens a touch with every win
  celebrate(syncAchievements());
  for (const m of store.claimMilestones()) {
    lines.push(`🏆 Meilenstein ${m.threshold}★ · ✦ +${m.shards}, Joker +2`);
    scenery.pulse();
  }
  if (region) {
    const { got, max } = regionStars(region);
    if (got >= max && store.grantRegionReward(region.id)) {
      lines.push(`✨ ${region.name} erwacht! Joker-Vorrat aufgefüllt, ✦ +25`);
      scenery.pulse();
    }
  }
  renderTopPills();
  return lines;
}

// Campaign
async function playCampaign(region: Region, index: number): Promise<void> {
  mode = "campaign";
  campaignAt = { region, index };
  if (!livesGate(() => void playCampaign(region, index))) return;
  const entry = region.levels[index];
  if (!entry) return;
  scenery.setTheme(REGION_THEME[region.id] ?? "menu");
  $("screen-play").dataset.region = region.id;
  $("play-title-txt").textContent = `${region.name} · ${index + 1} / ${region.levels.length}`;
  let level: Level;
  try {
    level = parseLevel(await (await fetch(`levels/${entry.id}.json`)).text());
  } catch {
    return;
  }
  const game = new GameState(level);
  const assisted = store.pity(entry.id);
  // vor dem Sieg lesen — `recordLevel` setzt den Zähler zurück
  const struggled = (store.load().levels[entry.id]?.fails ?? 0) > 0;
  introduceMechanic(game);
  mountGame(game, {
    onWin: (stars, ms) => {
      const panesBefore = store.panes();
      const rewards = collectStoryRewards(entry.id, stars, ms, game.usedUndo, region);
      queueBeat(panesBefore, store.panes());
      const hasNext = index + 1 < region.levels.length;
      const goNext = (): void =>
        void (hasNext ? playCampaign(region, index + 1) : openRegion(regions.indexOf(region)));
      const goBack = (): void => openRegion(regions.indexOf(region));
      showOverlay({
        title: stars === 3 ? "Makellos!" : "Gelöst!",
        stars,
        sub: `Zeit <b>${fmt(ms)}</b>`,
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
        nextLabel: hasNext ? "Weiter ›" : "Region ✓",
        onNext: throughBeat(goNext),
        onQuit: throughBeat(goBack),
      });
    },
    onTimeout: () => {
      // Story-Modus: ein Fehlschlag kostet ein Herz (bewusste Verknappung).
      store.spendLife();
      const fails = store.recordFail(entry.id);
      renderTopPills();
      const l = store.lives();
      showOverlay({
        title: "Das Licht flackert aus",
        sub:
          l.count > 0
            ? `Noch <b>${l.count}</b> ${l.count === 1 ? "Herz" : "Herzen"}.` +
              (fails >= 2 ? " Beim nächsten Versuch hilft dir Mira." : "")
            : `Keine Herzen mehr — nächstes in <b>${fmt(l.msToNext)}</b>.`,
        nextLabel: l.count > 0 ? "Nochmal" : "Übersicht",
        onNext: () =>
          l.count > 0 ? playCampaign(region, index) : openRegion(regions.indexOf(region)),
        quitLabel: "Übersicht",
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
    toast("Diese Stelle ist knifflig — mehr Zeit & ein Tipp gratis 💡");
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
  $("daily-best").textContent = String(s.daily.bestStreak);
  const done = s.daily.lastDayDone === store.todayKey();
  const playBtn = $<HTMLButtonElement>("daily-play");
  playBtn.textContent = done ? "Heute erledigt ✓" : "Heute spielen";
  playBtn.disabled = done;
  $("daily-note").textContent = done
    ? "Geschafft — komm morgen für das nächste Fenster wieder."
    : isWeeklyChallengeDay()
    ? "🔒 Wochen-Herausforderung: ein Teil des Fensters startet gesperrt."
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
  scenery.setTheme("garden");
  $("screen-play").dataset.region = "daily";
  $("play-title-txt").textContent = isWeeklyChallengeDay() ? "Tägliche Scherbe · 🔒 Woche" : "Tägliche Scherbe";
  const game = new GameState(level);
  if (isWeeklyChallengeDay() && maybeFreeze(game, `daily:${day}:frozen`)) {
    toast("🔒 Wochen-Herausforderung: löse zuerst den offenen Teil!");
  }
  mountGame(game, {
    onWin: (stars, ms) => {
      const panesBefore = store.panes();
      const earned = store.recordLevel(`daily:${day}`, stars, ms, game.usedUndo);
      const litPane = store.panes() > panesBefore;
      const before = store.load().daily.streak;
      const after = store.recordDaily().daily.streak;
      store.addShards(5);
      const milestone = DAILY_MILESTONES.find((m) => m.days === after && after > before);
      if (milestone) store.addShards(milestone.shards);
      refreshLight();
      queueBeat(panesBefore, store.panes());
      const nowLit = regions.find((r) => store.panes() === r.panesToUnlock);
      if (nowLit) toast(`✨ ${nowLit.name} — die Laterne ist an!`);
      celebrate(syncAchievements());
      renderTopPills();
      showOverlay({
        title: "Gelöst!",
        stars,
        sub: `Zeit <b>${fmt(ms)}</b>`,
        rewards: [
          ...(litPane ? ["🏮 +1 Fenster erhellt"] : []),
          `✦ +${earned + 5} Lichtsplitter`,
          after > before ? `🔥 Streak ${after} Tage` : `🔥 Streak ${after}`,
          ...(milestone ? [`🏆 ${milestone.days}-Tage-Serie · ✦ +${milestone.shards}`] : []),
        ],
        mira: pendingBeat ? null : miraLine({ solved: store.load().stats.solved, place: "daily", stars }),
        nextLabel: "Fertig",
        onNext: throughBeat(() => setTab("daily")),
        onQuit: throughBeat(() => setTab("daily")),
      });
      if (milestone) scenery.pulse();
    },
    onTimeout: () =>
      showOverlay({
        title: "Das Licht flackert aus",
        sub: "Das Tagesrätsel bleibt — versuch es nochmal.",
        nextLabel: "Nochmal",
        onNext: playDaily,
        onQuit: () => setTab("daily"),
      }),
    onUnlock: () => toast("🔓 Bereich freigeschaltet!"),
  });
}

// Descent
function renderDescent(): void {
  scenery.setTheme("workshop");
  const s = store.load();
  $("descent-best").textContent = `Ebene ${s.descent.bestDepth}`;
  $("descent-runs").textContent = String(s.descent.runs);
}
function startDescent(): void {
  mode = "descent";
  descentState = {
    variant: store.beginDescentRun(),
    depth: 1,
    streak: 0,
    sawRecord: false,
    recent: [],
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
  if (game.hasIce && !seen.includes("tut-ice")) {
    store.markBeatSeen("tut-ice");
    toast("❄ Vereiste Scheiben tauen erst, wenn Licht sie erreicht — bau von außen nach innen.");
  } else if (game.hasCracks && !seen.includes("tut-cracks")) {
    store.markBeatSeen("tut-cracks");
    toast("✂ Risse im Glas: kein Teil darf über eine Bruchkante liegen.");
  }
}

function renderGoalStrip(game: GameState): boolean {
  if (game.goal !== "soot") return false;
  const bar = $("play-stage");
  bar.hidden = false;
  const done = game.sootCleared;
  const total = game.sootTotal;
  // kriecht der Ruß und ist noch offen → Warnlampe an
  const creeping = game.sootSpreads && done < total;
  bar.classList.toggle("hot", creeping);
  bar.innerHTML =
    `<span class="ps-lvl">Ruß${game.sootSpreads ? " 🕯" : ""}</span>` +
    `<span class="ps-bar"><i style="width:${Math.round((done / total) * 100)}%"></i></span>` +
    `<span class="ps-note">${done} / ${total}${creeping ? " · kriecht" : ""}</span>`;
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
    `<span class="ps-lvl">Ebene ${depth}</span>` +
    `<span class="ps-pips">${pips}</span>` +
    `<span class="ps-note">${hot ? `${streak}× in Folge 🔥` : `Stufe ${stage}`}</span>`;
}

async function playDescentLevel(): Promise<void> {
  mode = "descent";
  if (!descentState) return;
  const { variant, depth, streak, recent } = descentState;
  scenery.setTheme("workshop");
  toast("Fenster wird gebaut …");
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
      ? `Abstieg · Ebene ${depth} · 🏆 neue Bestmarke!`
      : `Abstieg · Ebene ${depth} · Rekord ${best}`;
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
    toast("🔒 Ein Teil des Fensters ist gesperrt — löse zuerst den Rest!");
  }
  mountGame(game, {
    onWin: (stars, ms) => {
      const st = descentState!;
      const panesBefore = store.panes();
      st.depth = depth + 1;
      st.streak += 1;
      store.recordDescent(depth); // +1 Fenster erhellt
      store.addShards(depth);
      scenery.pulse(0.35 + 0.08 * stars); // the workshop brightens with every clear
      refreshLight();
      queueBeat(panesBefore, store.panes());
      const nowLit = regions.find((r) => store.panes() === r.panesToUnlock);
      celebrate(syncAchievements());
      renderTopPills();

      // between-levels praise — a new record always lands; otherwise only now
      // and then, so it stays a treat and not noise
      let hype: string | undefined;
      let hypeStrong = false;
      const brokeRecord = depth > best && best > 0;
      if (brokeRecord && !st.sawRecord) {
        st.sawRecord = true;
        hype = "NEUER REKORD!";
        hypeStrong = true;
      } else if (st.streak >= 3 && st.streak % 3 === 0) {
        hype = HYPE_WORDS[(depth + variant) % HYPE_WORDS.length];
      } else if (st.sawRecord && st.streak % 2 === 0) {
        hype = HYPE_WORDS[(depth + variant + 3) % HYPE_WORDS.length];
      }

      showOverlay({
        title: `Ebene ${depth} geschafft`,
        stars,
        sub: `Zeit <b>${fmt(ms)}</b>${st.streak >= 2 ? ` · ${st.streak} in Folge` : ""}`,
        rewards: [
          "🏮 +1 Fenster erhellt",
          `✦ +${depth} Lichtsplitter`,
          ...(nowLit ? [`✨ ${nowLit.name} — die Laterne ist an!`] : []),
        ],
        // bei einem Hype-Wort oder Beat schweigt Mira — eine Sache pro Screen
        mira:
          hype || pendingBeat
            ? null
            : miraLine({
                solved: store.load().stats.solved,
                place: "descent",
                stars,
                streak: st.streak,
                depth,
              }),
        nextLabel: "Tiefer ›",
        onNext: throughBeat(() => void playDescentLevel()),
        quitLabel: "Aufhören",
        onQuit: throughBeat(() => endDescent(depth)),
        ...(hype && !pendingBeat ? { hype, hypeStrong } : {}),
      });
    },
    onUnlock: () => toast("🔓 Bereich freigeschaltet!"),
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
  const best = store.load().descent.bestDepth;
  descentState = null;
  showOverlay({
    title: depth > 0 ? "Züge alle" : "Abstieg beendet",
    sub: `Ebene <b>${depth}</b>${depth >= best && depth > 0 ? " — neue Bestmarke! 🏆" : ""}`,
    rewards: [`✦ +${depth} Lichtsplitter gesammelt`],
    nextLabel: "Neuer Lauf",
    onNext: startDescent,
    onQuit: () => setTab("descent"),
  });
}

// ── Kaskade ────────────────────────────────────────────────────────────────
function renderCascade(): void {
  scenery.setTheme("surge");
  const s = store.load();
  $("cascade-best").textContent = nf(s.cascade.bestScore);
  $("cascade-cleared").textContent = nf(s.cascade.bestCleared);
}
function startCascade(): void {
  teardownGame();
  scenery.setTheme("garden");
  $("k-overlay").classList.remove("show");
  $("k-pause-overlay").classList.remove("show");
  $("k-score-txt").classList.remove("new-record");
  for (let i = 0; i < 3; i++) $(`k-life-${i}`).classList.remove("lost");
  const game = new CascadeState(`kaskade-${Date.now()}`);
  cascadeGame = game;
  const bestScore = store.load().cascade.bestScore;
  let newRecord = false;
  let challengeWonUntil = 0;
  if (import.meta.env.DEV) (window as unknown as { __cascade: CascadeState }).__cascade = game;
  cascadeView = new CascadeView($<HTMLCanvasElement>("k-canvas"), $("k-wrap"), game, {
    onHud: (h) => {
      $("k-score-txt").textContent = nf(h.score);
      $("k-mult").textContent = `×${h.mult.toFixed(1)}`;
      $("k-cleared").textContent = nf(h.cleared);
      const el = $("k-clock");
      el.textContent = fmt(h.ms);
      el.classList.toggle("warn", h.ms < 12_000);
      if (h.score > bestScore) {
        newRecord = true;
        $("k-score-txt").classList.add("new-record");
      }
      for (let i = 0; i < 3; i++) $(`k-life-${i}`).classList.toggle("lost", i >= h.lives);

      if (game.consumeChallengeWin()) {
        challengeWonUntil = performance.now() + 2000;
        sfx.win();
        toast(h.lives < 3 ? "🎯 Aufgabe geschafft — Leben zurück! ❤" : "🎯 Aufgabe geschafft — Bonuspunkte!");
      }
      const cEl = $("k-challenge");
      if (game.challenge) {
        cEl.hidden = false;
        cEl.classList.remove("won");
        $("k-wrap").classList.add("has-challenge");
        $("k-challenge-txt").textContent = game.challenge.label;
        $("k-challenge-clock").textContent = fmt(game.challengeRemainingMs());
      } else if (performance.now() < challengeWonUntil) {
        cEl.hidden = false;
        cEl.classList.add("won");
        $("k-wrap").classList.add("has-challenge");
        $("k-challenge-txt").textContent = "Aufgabe geschafft!";
        $("k-challenge-clock").textContent = "";
      } else {
        cEl.hidden = true;
        $("k-wrap").classList.remove("has-challenge");
      }
    },
    onEnd: (r) => {
      const panesBefore = store.panes();
      store.recordCascade(r.score, r.cleared);
      const lit = store.panes() - panesBefore;
      refreshLight();
      queueBeat(panesBefore, store.panes());
      const nowLit = regions.find((rg) => store.panes() >= rg.panesToUnlock && panesBefore < rg.panesToUnlock);
      if (nowLit && !pendingBeat) toast(`✨ ${nowLit.name} — die Laterne ist an!`);
      celebrate(syncAchievements());
      $("k-overlay-title").textContent = r.livesLeft <= 0 ? "Keine Leben mehr!" : "Zeit um!";
      $("k-result").innerHTML =
        `<b>${nf(r.score)}</b> Punkte · ${nf(r.cleared)} Reihen` +
        (lit > 0 ? ` · 🏮 +${lit} Fenster` : "") +
        (r.perfectClears ? ` · ${r.perfectClears}× perfekt` : "") +
        (newRecord ? ` · 🏆 neue Bestmarke!` : "");
      const ov = $("k-overlay");
      ov.classList.remove("show");
      void ov.offsetWidth;
      ov.classList.add("show");
      // ein Beat, sobald der Spieler das Kaskade-Fenster schließt
      if (pendingBeat) {
        const b = pendingBeat;
        pendingBeat = null;
        const play = (go: () => void) => () => {
          ov.classList.remove("show");
          playCutscene(b, go);
        };
        $<HTMLButtonElement>("k-quit").onclick = play(() => setTab("cascade"));
        $<HTMLButtonElement>("k-again").onclick = play(startCascade);
      } else {
        $<HTMLButtonElement>("k-quit").onclick = () => setTab("cascade");
        $<HTMLButtonElement>("k-again").onclick = startCascade;
      }
    },
  });
  $("k-best").textContent = nf(bestScore);
  showScreen("kaskade");
  window.scrollTo(0, 0);
}

// ── Sammlung ───────────────────────────────────────────────────────────────
function renderCollection(): void {
  scenery.setTheme("collection");
  const s = store.load();
  const avg = s.stats.solved ? s.stats.totalMs / s.stats.solved : 0;
  const stats: [string, string][] = [
    ["Fenster erhellt", nf(store.panes(s))],
    ["Sterne", nf(store.totalStars(s))],
    ["Ø Zeit", s.stats.solved ? fmt(avg) : "–"],
    ["Abstieg", `Ebene ${s.descent.bestDepth}`],
    ["Kaskade", nf(s.cascade.bestScore)],
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
  renderShop();

  // Erinnerungen — die gespielten Story-Beats, nachlesbar
  const seen = new Set(store.beatsSeen());
  $("memories").replaceChildren(
    ...BEATS.map((b) => {
      const has = seen.has(b.id);
      const d = document.createElement("div");
      d.className = `ach${has ? " done" : " locked"}`;
      const body = has
        ? `<div class="t">${b.title}</div><div class="h">${b.lines.join(" ")}</div>`
        : `<div class="t">???</div><div class="h">Spiele weiter, um diese Erinnerung zu wecken.</div>`;
      d.innerHTML = `<div class="ic">${has ? "🕯" : "·"}</div><div>${body}</div>`;
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

const SHOP: Array<{ icon: string; label: string; cost: number; buy: () => void }> = [
  { icon: "ui/hint.webp", label: "Tipp ×1", cost: 12, buy: () => store.update((d) => void (d.jokers.hint += 1)) },
  { icon: "ui/time.webp", label: "+20 Sek. ×1", cost: 10, buy: () => store.update((d) => void (d.jokers.time += 1)) },
  { icon: "ui/solvent.webp", label: "Lösen ×1", cost: 12, buy: () => store.update((d) => void (d.jokers.solvent += 1)) },
  { icon: "ui/life.webp", label: "Herzen auffüllen", cost: 30, buy: () => store.refillLives() },
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
      btn.textContent = `${item.cost} ✦`;
      btn.disabled =
        s.shards < item.cost ||
        (item.icon === "ui/life.webp" && s.lives.count >= store.MAX_LIVES);
      btn.addEventListener("click", () => {
        if (store.spendShards(item.cost)) {
          item.buy();
          toast("Gekauft");
          renderShop();
          renderTopPills();
        }
      });
      row.innerHTML = `<span class="lbl"><img class="shop-ic" src="${item.icon}" alt="" />${item.label}</span>`;
      row.append(btn);
      return row;
    }),
  );
}

// ── Profil ─────────────────────────────────────────────────────────────────
/** Avatar options. The art lives at `ui/avatars/<id>.webp`; until a file is
 *  dropped in, the emoji is the fallback so the picker still works. */
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

  const avg = s.stats.solved ? s.stats.totalMs / s.stats.solved : 0;
  const rows: Array<[string, string, string]> = [
    ["ui/collection.webp", "Fenster erhellt", nf(store.panes(s))],
    ["ui/star.webp", "Sterne gesammelt", nf(store.totalStars(s))],
    ["ui/time.webp", "Ø Lösezeit", s.stats.solved ? fmt(avg) : "–"],
    ["ui/solvent.webp", "Ohne Zurücknehmen", String(s.stats.bestNoUndoStreak)],
    ["ui/descent.webp", "Abstieg — tiefste Ebene", String(s.descent.bestDepth)],
    ["ui/cascade.webp", "Kaskade — Rekord", nf(s.cascade.bestScore)],
    ["ui/daily.webp", "Längster Tages-Streak", String(s.daily.bestStreak)],
    ["ui/hint.webp", "Erfolge", `${unlockedCount(s)} / ${ACHIEVEMENTS.length}`],
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
  const next = window.prompt("Dein Name:", store.playerName());
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
function leavePlay(): void {
  const g = activeGame;
  const inProgress = !!g && g.started && !g.isWon() && !g.failed;
  const resume = (): void => {
    hideOverlay();
    activeGame?.resume();
  };
  if (inProgress && mode === "campaign") {
    activeGame?.pause();
    showOverlay({
      title: "Level verlassen?",
      sub: "Du verlierst <b>1 Herz</b> und den Fortschritt in diesem Fenster.",
      nextLabel: "Trotzdem raus",
      onNext: () => {
        store.spendLife();
        renderTopPills();
        doLeave();
      },
      quitLabel: "Weiterspielen",
      onQuit: resume,
    });
    return;
  }
  if (inProgress && mode === "descent") {
    activeGame?.pause();
    showOverlay({
      title: "Abstieg abbrechen?",
      sub: "Der Lauf endet hier.",
      nextLabel: "Abbrechen",
      onNext: doLeave,
      quitLabel: "Weiterspielen",
      onQuit: resume,
    });
    return;
  }
  doLeave();
}
function restartLevel(): void {
  if (mode === "campaign" && campaignAt) void playCampaign(campaignAt.region, campaignAt.index);
  else if (mode === "daily") void playDaily();
  else void playDescentLevel();
}
function restorePauseButtons(): void {
  $("ps-restart").hidden = false;
  $("ps-quit").hidden = false;
  $("ps-title").textContent = "Pause";
  $<HTMLButtonElement>("ps-resume").textContent = "Weiter spielen";
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
  $("ps-title").textContent = "Einstellungen";
  $<HTMLButtonElement>("ps-resume").textContent = "Schließen";
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
// k-quit / k-again werden pro Runde in onEnd gesetzt (wegen eventueller Cutscene)
$<HTMLButtonElement>("k-quit").onclick = () => setTab("cascade");
$<HTMLButtonElement>("k-again").onclick = startCascade;
$("k-pause").addEventListener("click", () => {
  const ov = $("k-pause-overlay");
  const show = !ov.classList.contains("show");
  ov.classList.toggle("show", show);
  if (show) cascadeGame?.pause();
  else cascadeGame?.resume();
});
function closeKPause(): void {
  $("k-pause-overlay").classList.remove("show");
  cascadeGame?.resume();
}
$("kp-resume").addEventListener("click", closeKPause);
$("kp-x").addEventListener("click", closeKPause);
$("kp-restart").addEventListener("click", () => {
  $("k-pause-overlay").classList.remove("show");
  startCascade();
});
$("kp-quit").addEventListener("click", () => {
  $("k-pause-overlay").classList.remove("show");
  setTab("cascade");
});
$("jk-hint").addEventListener("click", () => useJoker("hint"));
$("jk-time").addEventListener("click", () => useJoker("time"));
$("jk-solvent").addEventListener("click", () => useJoker("solvent"));

window.setInterval(() => {
  if (!$("screen-home").hidden) renderTopPills();
}, 4000);

async function boot(): Promise<void> {
  try {
    manifest = (await (await fetch("levels/manifest.json")).json()) as Manifest;
    regions = buildRegions(manifest);
    refreshLight();
    renderHome();
  } catch (err) {
    $("home-status").textContent = `Levels konnten nicht geladen werden (${(err as Error).message}).`;
  }
}
void boot();
