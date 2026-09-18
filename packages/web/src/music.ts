/**
 * Hintergrundmusik — ein einzelner Loop-Track (`audio/theme.mp3`), der
 * App-weit überall gleich läuft (Start, Fenster, Kaskade, ...). `TrackId`
 * bleibt aus Kompatibilität mit den bestehenden Aufrufstellen erhalten,
 * wirkt sich aber nicht mehr auf die Musik selbst aus — es gibt nur noch
 * einen Track, keine Energie-Stufen pro Screen mehr.
 *
 * Autoplay: ein `<audio>`-Element darf erst nach einer Nutzergeste laufen.
 * Das Freischalten macht `audio-core.ts`; hier wird nur der gemerkte Wunsch
 * gespielt, sobald es so weit ist. Lautstärkewechsel (Start/Stop/Ducken)
 * laufen als sanfte Fades, nie hart geschnitten.
 */

import { onAudioUnlock } from "./audio-core.js";

export type TrackId = "menu" | "play" | "cascade";

const SRC = "audio/theme.mp3";
const MASTER = 0.35; // Grundlautstärke der Musik (unter den SFX)
const DUCK = 0.3; // Restlautstärke während einer Cutscene

let el: HTMLAudioElement | null = null;
let enabled = true;
let wanted: TrackId | null = null;
let ducked = false;
let fadeRaf = 0;
let stopTimer = 0;

function ensureEl(): HTMLAudioElement {
  if (!el) {
    el = new Audio(SRC);
    el.loop = true;
    el.volume = 0;
    el.setAttribute("playsinline", "");
    if (import.meta.env.DEV) (window as unknown as { __music: HTMLAudioElement }).__music = el;
  }
  return el;
}

/** Sanft auf `target` fahren statt hart zu springen. */
function fadeTo(target: number, ms: number): void {
  if (!el) return;
  cancelAnimationFrame(fadeRaf);
  const a = el;
  const from = a.volume;
  const start = performance.now();
  const step = (now: number): void => {
    const t = Math.min(1, (now - start) / ms);
    a.volume = from + (target - from) * t;
    if (t < 1) fadeRaf = requestAnimationFrame(step);
  };
  fadeRaf = requestAnimationFrame(step);
}

function targetVolume(): number {
  return ducked ? MASTER * DUCK : MASTER;
}

/** Musik spielen. `id` bleibt für Aufrufkompatibilität, ändert nichts mehr. */
export function playMusic(id: TrackId): void {
  wanted = id;
  if (!enabled) return;
  window.clearTimeout(stopTimer);
  const a = ensureEl();
  void a.play().catch(() => {
    /* Autoplay evtl. noch gesperrt — onAudioUnlock spielt es nach der ersten Geste */
  });
  fadeTo(targetVolume(), 1200);
}

/** Musik ganz ausblenden (z. B. beim kompletten Verlassen). */
export function stopMusic(): void {
  wanted = null;
  if (!el) return;
  fadeTo(0, 600);
  window.clearTimeout(stopTimer);
  stopTimer = window.setTimeout(() => el?.pause(), 650);
}

/** Während einer Cutscene / Dialogszene leiser. */
export function duckMusic(on: boolean): void {
  ducked = on;
  if (el && !el.paused) fadeTo(targetVolume(), 500);
}

/** „Musik"-Schalter aus den Einstellungen — sanft, nie hart geschnitten. */
export function setMusicEnabled(value: boolean): void {
  if (value === enabled) return;
  enabled = value;
  if (!value) {
    fadeTo(0, 450);
    window.clearTimeout(stopTimer);
    stopTimer = window.setTimeout(() => el?.pause(), 500);
  } else if (wanted) {
    playMusic(wanted);
  }
}

// Sobald Audio freigeschaltet ist (erste Geste): den gemerkten Wunsch spielen.
onAudioUnlock(() => {
  if (enabled && wanted) playMusic(wanted);
});

// Im Hintergrund pausieren, beim Zurückkommen weiter.
document.addEventListener("visibilitychange", () => {
  if (!el) return;
  if (document.hidden) {
    el.pause();
  } else if (enabled && wanted) {
    void el.play().catch(() => {
      /* egal */
    });
  }
});
