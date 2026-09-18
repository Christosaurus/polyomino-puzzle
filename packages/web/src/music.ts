/**
 * Hintergrundmusik — ein einzelner Loop-Track (`audio/theme.mp3`), der
 * App-weit überall gleich läuft (Start, Fenster, Kaskade, ...). `TrackId`
 * bleibt aus Kompatibilität mit den bestehenden Aufrufstellen erhalten,
 * wirkt sich aber nicht mehr auf die Musik selbst aus — es gibt nur noch
 * einen Track, keine Energie-Stufen pro Screen mehr.
 *
 * Der Loop-Punkt selbst ist kein hartes `loop=true` (das gibt bei MP3s oft
 * einen hörbaren Schnitt), sondern ein Crossfade zwischen zwei Kopien
 * desselben Tracks: kurz bevor die aktive Kopie endet, startet die andere
 * schon leise von vorne, während die erste ausklingt — der Schnitt fällt
 * unter die Überblendung, man hört ihn nicht.
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
const CROSSFADE_S = 1.7; // Überlappung am Loop-Punkt

let tracks: [HTMLAudioElement, HTMLAudioElement] | null = null;
let activeTrack = 0; // Index in `tracks` — welche Kopie gerade "vorne" ist
let crossfading = false;
let enabled = true;
let wanted: TrackId | null = null;
let ducked = false;
let fadeRaf = 0;
let stopTimer = 0;

function makeTrack(): HTMLAudioElement {
  const a = new Audio(SRC);
  a.loop = false; // der Loop läuft manuell per Crossfade, nicht hart
  a.volume = 0;
  a.setAttribute("playsinline", "");
  a.addEventListener("timeupdate", onTimeUpdate);
  return a;
}

function ensureTracks(): [HTMLAudioElement, HTMLAudioElement] {
  if (!tracks) {
    tracks = [makeTrack(), makeTrack()];
    if (import.meta.env.DEV) (window as unknown as { __music: HTMLAudioElement[] }).__music = tracks;
  }
  return tracks;
}

function active(): HTMLAudioElement | null {
  return tracks ? tracks[activeTrack]! : null;
}

function targetVolume(): number {
  return ducked ? MASTER * DUCK : MASTER;
}

/** Kurz vorm Ende der aktiven Kopie die andere leise anwerfen und überblenden. */
function onTimeUpdate(e: Event): void {
  if (!tracks || !enabled || !wanted || crossfading) return;
  const a = e.currentTarget as HTMLAudioElement;
  if (a !== tracks[activeTrack]) return; // nur die aktive Kopie stößt den nächsten Loop an
  if (!a.duration || !isFinite(a.duration)) return;
  if (a.duration - a.currentTime > CROSSFADE_S) return;
  crossfading = true;
  const fromIdx = activeTrack;
  const toIdx = fromIdx === 0 ? 1 : 0;
  const from = tracks[fromIdx]!;
  const to = tracks[toIdx]!;
  to.currentTime = 0;
  to.volume = 0;
  void to.play().catch(() => {
    /* egal — dann bleibt's eben bei der auslaufenden Kopie */
  });
  const target = targetVolume();
  const durMs = CROSSFADE_S * 1000;
  const start = performance.now();
  cancelAnimationFrame(fadeRaf);
  const step = (now: number): void => {
    const t = Math.min(1, (now - start) / durMs);
    from.volume = Math.max(0, Math.min(1, target * (1 - t)));
    to.volume = Math.max(0, Math.min(1, target * t));
    if (t < 1) {
      fadeRaf = requestAnimationFrame(step);
    } else {
      from.pause();
      from.currentTime = 0;
      activeTrack = toIdx;
      crossfading = false;
    }
  };
  fadeRaf = requestAnimationFrame(step);
}

/** Sanft auf `target` fahren statt hart zu springen (Start/Stop/Ducken). */
function fadeTo(target: number, ms: number): void {
  const a = active();
  if (!a || crossfading) return; // während der Loop-Überblendung nicht querschießen
  cancelAnimationFrame(fadeRaf);
  const from = a.volume;
  const start = performance.now();
  const step = (now: number): void => {
    const t = Math.min(1, (now - start) / ms);
    // Gleitkomma-Rundung kann das Ergebnis hauchdünn über/unter [0, 1]
    // schieben (z. B. -0.0000005 bei target=0) — der `volume`-Setter wirft
    // dann eine IndexSizeError, darum hart geklemmt.
    a.volume = Math.max(0, Math.min(1, from + (target - from) * t));
    if (t < 1) fadeRaf = requestAnimationFrame(step);
  };
  fadeRaf = requestAnimationFrame(step);
}

/** Musik spielen. `id` bleibt für Aufrufkompatibilität, ändert nichts mehr. */
export function playMusic(id: TrackId): void {
  wanted = id;
  if (!enabled) return;
  window.clearTimeout(stopTimer);
  const [a] = ensureTracks();
  void a.play().catch(() => {
    /* Autoplay evtl. noch gesperrt — onAudioUnlock spielt es nach der ersten Geste */
  });
  fadeTo(targetVolume(), 1200);
}

/** Musik ganz ausblenden (z. B. beim kompletten Verlassen). */
export function stopMusic(): void {
  wanted = null;
  if (!tracks) return;
  fadeTo(0, 600);
  window.clearTimeout(stopTimer);
  const [a, b] = tracks;
  stopTimer = window.setTimeout(() => {
    a.pause();
    b.pause();
  }, 650);
}

/** Während einer Cutscene / Dialogszene leiser. */
export function duckMusic(on: boolean): void {
  ducked = on;
  const a = active();
  if (a && !a.paused) fadeTo(targetVolume(), 500);
}

/** „Musik"-Schalter aus den Einstellungen — sanft, nie hart geschnitten. */
export function setMusicEnabled(value: boolean): void {
  if (value === enabled) return;
  enabled = value;
  if (!value) {
    fadeTo(0, 450);
    window.clearTimeout(stopTimer);
    const ts = tracks;
    stopTimer = window.setTimeout(() => {
      ts?.[0].pause();
      ts?.[1].pause();
    }, 500);
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
  if (!tracks) return;
  if (document.hidden) {
    tracks[0].pause();
    tracks[1].pause();
  } else if (enabled && wanted) {
    void active()?.play().catch(() => {
      /* egal */
    });
  }
});
