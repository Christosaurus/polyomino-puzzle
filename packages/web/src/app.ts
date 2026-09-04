/**
 * App shell: bottom-tab navigation between Spielen (regions → levels), Täglich,
 * Abstieg, Kaskade and Sammlung; plus the shared play screen for the three
 * "fill the frame" modes and the Kaskade screen.
 */

import { type Level, parseLevel, rngFromSeed } from "@polyomino/puzzle-core";
import { ACHIEVEMENTS, syncAchievements, unlockedCount } from "./achievements.js";
import { CascadeState } from "./cascade.js";
import { CascadeView } from "./cascade-view.js";
import { GameState } from "./game.js";
import { dailyLevel, descentLevel } from "./levelgen.js";
import * as store from "./progress.js";
import type { JokerKind } from "./progress.js";
import { buildRegions, type Manifest, type Region } from "./regions.js";
import { Scenery, type SceneTheme } from "./scenery.js";
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
let cascadeGame: CascadeState | null = null;
let clockTimer = 0;
const scenery = new Scenery($<HTMLCanvasElement>("scenery"));

/** How lit the world is (0..1), from campaign stars. */
function lightFrac(): number {
  const max = (manifest?.levels.length ?? 15) * 3;
  return Math.min(1, store.totalStars(store.load()) / Math.max(1, max));
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
  pillValue("home-shards", String(s.shards));
  pillValue("play-lives", livesTxt);
  const rs = document.getElementById("region-stars");
  if (rs) pillValue("region-stars", String(store.totalStars(s)));
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
let descentState: { seed: string; depth: number } | null = null;
let activeGame: GameState | null = null;

function hideAllOverlays(): void {
  for (const id of ["play-overlay", "pause-overlay", "k-overlay", "k-pause-overlay"]) {
    document.getElementById(id)?.classList.remove("show");
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

function renderHome(): void {
  if (!manifest) return;
  refreshLight();
  scenery.setTheme("menu");
  renderTopPills();
  const s = store.load();
  const total = store.totalStars(s);
  const pct = Math.round(lightFrac() * 100);
  $("home-status").innerHTML =
    `Jeder Stern bringt ein Stück Welt zurück ins Licht. <b>Licht: ${pct}%</b>`;

  const host = $("regions");
  host.replaceChildren();
  regions.forEach((r, i) => {
    const locked = total < r.starsToUnlock;
    const { got, max } = regionStars(r);
    const complete = got >= max && max > 0;
    const station = document.createElement("div");
    station.className = `station${locked ? " locked" : complete ? " done" : " current"}`;
    station.dataset.region = r.id;
    station.innerHTML = `
      <div class="st-card">
        <div class="row">
          <div class="name">${r.name}</div>
          <div class="want">${
            locked
              ? `🔒 ${r.starsToUnlock}★`
              : `<b>★ ${got}</b> / ${max}${complete ? " ✓" : ""}`
          }</div>
        </div>
        <div class="muted">${locked ? `Noch ${r.starsToUnlock - total} Sterne bis hier.` : r.subtitle}</div>
        <div class="progress"><i style="width:${max ? (got / max) * 100 : 0}%"></i></div>
      </div>`;
    if (!locked) station.addEventListener("click", () => openRegion(i));
    host.append(station);
  });
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
  nextLabel: string;
  onNext: () => void;
  quitLabel?: string;
  onQuit: () => void;
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
    el.style.setProperty("--bd", `${(Math.random() * 0.15).toFixed(2)}s`);
    el.style.setProperty("--bt", `${(0.7 + Math.random() * 0.5).toFixed(2)}s`);
    host.append(el);
  }
}

function showOverlay(o: OverlayOpts): void {
  $("ov-title").textContent = o.title;
  const starsEl = $("ov-stars");
  starsEl.hidden = o.stars === undefined;
  [...starsEl.children].forEach((c, i) => c.classList.toggle("on", i < (o.stars ?? 0)));
  $("ov-sub").innerHTML = o.sub ?? "";
  $("ov-rewards").innerHTML = (o.rewards ?? []).map((r) => `<div>${r}</div>`).join("");
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

function startClock(game: GameState): void {
  if (clockTimer) window.clearInterval(clockTimer);
  const tick = (): void => {
    const ms = game.remainingMs();
    $("play-clock-txt").textContent = fmt(ms);
    $("play-clock").classList.toggle("warn", !game.isWon() && (ms < 15_000 || ms / game.limitMs < 0.2));
  };
  tick();
  clockTimer = window.setInterval(tick, 250);
}

function renderJokers(): void {
  const j = store.load().jokers;
  ($("jk-hint-c").textContent = String(j.hint));
  ($("jk-time-c").textContent = String(j.time));
  ($("jk-solvent-c").textContent = String(j.solvent));
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
  if (!activeGame || !gameView || activeGame.isWon() || activeGame.timedOut) return;
  if (kind === "hint" && !gameView.showHint()) {
    toast("Nichts mehr zu verraten");
    return;
  }
  if (!store.spendJoker(kind)) return;
  fireJokerButton(kind);
  sfx.pickUp();
  if (kind === "time") {
    activeGame.extendLimit(20_000);
    toast("+20 Sekunden");
  }
  if (kind === "solvent") {
    const n = activeGame.clearIncorrect();
    toast(n > 0 ? `${n} Teil${n > 1 ? "e" : ""} gelöst` : "Alles sitzt schon richtig");
  }
  renderJokers();
}

function mountGame(
  game: GameState,
  cb: { onWin: (s: number, ms: number) => void; onTimeout: () => void; onUnlock?: () => void },
): void {
  teardownGame();
  hideOverlay();
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
  const earned = store.recordLevel(levelId, stars, ms, usedUndo);
  lines.push(`✦ +${earned} Lichtsplitter`);
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
      lines.push(`✨ ${region.name} erwacht! Joker-Vorrat aufgefüllt, ✦ +25, Leben voll`);
      scenery.pulse();
    }
  }
  renderTopPills();
  return lines;
}

function livesGate(): boolean {
  if (store.lives().count > 0) return true;
  showScreen("play");
  showOverlay({
    title: "Keine Leben",
    sub: `Ein Leben kehrt in <b>${fmt(store.lives().msToNext)}</b> zurück.`,
    rewards: [`✦ ${store.load().shards} Splitter · 30 für ein Leben`],
    nextLabel: store.load().shards >= 30 ? "Leben kaufen (30 ✦)" : "Zurück",
    onNext: () => {
      if (store.spendShards(30)) {
        store.refillLives();
        toast("Leben aufgefüllt");
        if (mode === "campaign" && campaignAt) playCampaign(campaignAt.region, campaignAt.index);
        else if (mode === "descent") startDescent();
      } else {
        setTab("home");
      }
    },
    onQuit: () => setTab("home"),
  });
  return false;
}

// Campaign
async function playCampaign(region: Region, index: number): Promise<void> {
  mode = "campaign";
  campaignAt = { region, index };
  if (!livesGate()) return;
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
  mountGame(game, {
    onWin: (stars, ms) => {
      const rewards = collectStoryRewards(entry.id, stars, ms, game.usedUndo, region);
      const hasNext = index + 1 < region.levels.length;
      showOverlay({
        title: stars === 3 ? "Makellos!" : "Gelöst!",
        stars,
        sub: `Zeit <b>${fmt(ms)}</b>`,
        rewards,
        nextLabel: hasNext ? "Weiter ›" : "Region ✓",
        onNext: () => (hasNext ? playCampaign(region, index + 1) : openRegion(regions.indexOf(region))),
        onQuit: () => openRegion(regions.indexOf(region)),
      });
    },
    onTimeout: () => {
      store.spendLife();
      store.recordFail(entry.id);
      renderTopPills();
      const l = store.lives();
      showOverlay({
        title: "Das Licht flackert aus",
        sub:
          l.count > 0
            ? `Noch <b>${l.count}</b> Leben.`
            : `Kein Leben mehr — nächstes in <b>${fmt(l.msToNext)}</b>.`,
        nextLabel: l.count > 0 ? "Nochmal" : "Übersicht",
        onNext: () =>
          l.count > 0 ? playCampaign(region, index) : openRegion(regions.indexOf(region)),
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
      const earned = store.recordLevel(`daily:${day}`, stars, ms, game.usedUndo);
      const before = store.load().daily.streak;
      const after = store.recordDaily().daily.streak;
      store.addShards(5);
      const milestone = DAILY_MILESTONES.find((m) => m.days === after && after > before);
      if (milestone) store.addShards(milestone.shards);
      celebrate(syncAchievements());
      renderTopPills();
      showOverlay({
        title: "Gelöst!",
        stars,
        sub: `Zeit <b>${fmt(ms)}</b>`,
        rewards: [
          `✦ +${earned + 5} Lichtsplitter`,
          after > before ? `🔥 Streak ${after} Tage` : `🔥 Streak ${after}`,
          ...(milestone ? [`🏆 ${milestone.days}-Tage-Serie · ✦ +${milestone.shards}`] : []),
        ],
        nextLabel: "Fertig",
        onNext: () => setTab("daily"),
        onQuit: () => setTab("daily"),
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
  if (!livesGate()) return;
  descentState = { seed: `run-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, depth: 1 };
  void playDescentLevel();
}
async function playDescentLevel(): Promise<void> {
  mode = "descent";
  if (!descentState) return;
  const { seed, depth } = descentState;
  scenery.setTheme("workshop");
  toast("Fenster wird gebaut …");
  await yieldPaint();
  const level = descentLevel(depth, seed);
  if (!level) {
    endDescent();
    return;
  }
  $("screen-play").dataset.region = "descent";
  const best = store.load().descent.bestDepth;
  $("play-title-txt").textContent =
    depth > best && best > 0
      ? `Abstieg · Ebene ${depth} · 🏆 neue Bestmarke!`
      : `Abstieg · Ebene ${depth} · Rekord ${best}`;
  const base = new GameState(level);
  // early depths stay generous on time so the run opens with easy wins; the
  // squeeze tightens in as it goes
  const timeFactor = depth <= 3 ? 0.95 : Math.max(0.62, 0.95 - (depth - 3) * 0.03);
  const game = new GameState(level, Math.round(base.limitMs * timeFactor));
  // every 4th level from depth 4 on, part of the window starts locked — solve
  // the open part first to free it, one extra beat of tension on a run
  const isFrozenLevel = depth >= 4 && depth % 4 === 0;
  if (isFrozenLevel && maybeFreeze(game, `${seed}:d${depth}:frozen`)) {
    toast("🔒 Ein Teil des Fensters ist gesperrt — löse zuerst den Rest!");
  }
  mountGame(game, {
    onWin: (stars, ms) => {
      descentState!.depth = depth + 1;
      store.recordDescent(depth);
      store.addShards(depth);
      celebrate(syncAchievements());
      renderTopPills();
      showOverlay({
        title: `Ebene ${depth} geschafft`,
        stars,
        sub: `Zeit <b>${fmt(ms)}</b>`,
        rewards: [`✦ +${depth} Lichtsplitter`],
        nextLabel: "Tiefer ›",
        onNext: playDescentLevel,
        quitLabel: "Aufhören",
        onQuit: () => endDescent(depth),
      });
    },
    onUnlock: () => toast("🔓 Bereich freigeschaltet!"),
    onTimeout: () => {
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
    title: "Abstieg beendet",
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
  $("cascade-best").textContent = String(s.cascade.bestScore);
  $("cascade-cleared").textContent = String(s.cascade.bestCleared);
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
      $("k-score-txt").textContent = String(h.score);
      $("k-mult").textContent = `×${h.mult.toFixed(1)}`;
      $("k-cleared").textContent = String(h.cleared);
      const el = $("k-clock");
      el.textContent = fmt(h.ms);
      el.classList.toggle("warn", h.ms < 12_000);
      if (h.score > bestScore) {
        newRecord = true;
        $("k-score-txt").classList.add("new-record");
      }
      for (let i = 0; i < 3; i++) $(`k-life-${i}`).classList.toggle("lost", i >= h.lives);

      if (game.consumeChallengeWin()) {
        challengeWonUntil = performance.now() + 1800;
        sfx.win();
        toast(`⚡ Herausforderung gemeistert — +${Math.round(15)} Sekunden!`);
      }
      const cEl = $("k-challenge");
      if (game.challenge) {
        const left = game.challenge.target - game.challenge.progress;
        cEl.hidden = false;
        cEl.classList.remove("won");
        $("k-challenge-txt").textContent = `Räume ${left} Reihe${left === 1 ? "" : "n"} für +15s`;
        $("k-challenge-clock").textContent = fmt(game.challengeRemainingMs());
      } else if (performance.now() < challengeWonUntil) {
        cEl.hidden = false;
        cEl.classList.add("won");
        $("k-challenge-txt").textContent = "Geschafft! +15 Sekunden";
        $("k-challenge-clock").textContent = "";
      } else {
        cEl.hidden = true;
      }
    },
    onEnd: (r) => {
      store.recordCascade(r.score, r.cleared);
      celebrate(syncAchievements());
      $("k-overlay-title").textContent = r.livesLeft <= 0 ? "Keine Leben mehr!" : "Zeit um!";
      $("k-result").innerHTML =
        `<b>${r.score}</b> Punkte · ${r.cleared} Reihen` +
        (r.perfectClears ? ` · ${r.perfectClears}× perfekt` : "") +
        (newRecord ? ` · 🏆 neue Bestmarke!` : "");
      const ov = $("k-overlay");
      ov.classList.remove("show");
      void ov.offsetWidth;
      ov.classList.add("show");
    },
  });
  $("k-best").textContent = String(bestScore);
  showScreen("kaskade");
  window.scrollTo(0, 0);
}

// ── Sammlung ───────────────────────────────────────────────────────────────
function renderCollection(): void {
  scenery.setTheme("collection");
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
  renderShop();
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

const SHOP: Array<{ label: string; cost: number; buy: () => void }> = [
  { label: "💡 Tipp ×1", cost: 12, buy: () => store.update((d) => void (d.jokers.hint += 1)) },
  { label: "⏱ +20 Sek. ×1", cost: 10, buy: () => store.update((d) => void (d.jokers.time += 1)) },
  { label: "🧪 Lösen ×1", cost: 12, buy: () => store.update((d) => void (d.jokers.solvent += 1)) },
  { label: "❤ Leben auffüllen", cost: 30, buy: () => store.refillLives() },
];

function renderShop(): void {
  const s = store.load();
  pillValue("shop-shards", String(s.shards));
  $("shop").replaceChildren(
    ...SHOP.map((item) => {
      const row = document.createElement("div");
      row.className = "item";
      const btn = document.createElement("button");
      btn.className = "gold";
      btn.textContent = `${item.cost} ✦`;
      btn.disabled = s.shards < item.cost;
      if (item.label.startsWith("❤") && s.lives.count >= store.MAX_LIVES) btn.disabled = true;
      btn.addEventListener("click", () => {
        if (store.spendShards(item.cost)) {
          item.buy();
          toast("Gekauft");
          renderShop();
          renderTopPills();
        }
      });
      row.innerHTML = `<span class="lbl">${item.label}</span>`;
      row.append(btn);
      return row;
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

function doLeave(): void {
  if (mode === "campaign" && campaignAt) openRegion(regions.indexOf(campaignAt.region));
  else if (mode === "daily") setTab("daily");
  else if (descentState) endDescent(descentState.depth);
  else setTab("descent");
}
function leavePlay(): void {
  const g = activeGame;
  const inProgress = !!g && g.started && !g.isWon() && !g.timedOut;
  const resume = (): void => {
    hideOverlay();
    activeGame?.resume();
  };
  if (inProgress && mode === "campaign") {
    activeGame?.pause();
    showOverlay({
      title: "Level verlassen?",
      sub: "Du verlierst <b>1 Leben</b> und den Fortschritt in diesem Fenster.",
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
$("k-quit").addEventListener("click", () => setTab("cascade"));
$("k-again").addEventListener("click", startCascade);
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
