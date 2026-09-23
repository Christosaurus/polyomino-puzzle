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
 * Lautstärke läuft NICHT über `audio.volume` — iOS Safari bindet die
 * Lautstärke eines <audio>-Elements an den Hardware-Regler und ignoriert
 * `.volume`-Zuweisungen aus JS komplett (ein bekanntes, absichtliches
 * WebKit-Verhalten). Der Regler in den Einstellungen wirkte darum am
 * eigenen Desktop-Test, aber nicht auf dem iPhone. Stattdessen läuft jede
 * Kopie durch einen eigenen `GainNode` im geteilten AudioContext (siehe
 * `audio-core.ts`) — `GainNode.gain` ist von der Plattform-Einschränkung
 * nicht betroffen und funktioniert überall zuverlässig.
 *
 * Autoplay: ein `<audio>`-Element darf erst nach einer Nutzergeste laufen.
 * Das Freischalten macht `audio-core.ts`; hier wird nur der gemerkte Wunsch
 * gespielt, sobald es so weit ist. Lautstärkewechsel (Start/Stop/Ducken)
 * laufen als sanfte Fades, nie hart geschnitten.
 */

import { audioCtx, onAudioUnlock } from "./audio-core.js";

export type TrackId = "menu" | "play" | "cascade";

const SRC = "audio/theme.mp3";
const DUCK = 0.3; // Restlautstärke während einer Cutscene
const CROSSFADE_S = 1.7; // Überlappung am Loop-Punkt

// Grundlautstärke der Musik (unter den SFX) — per Regler in den Einstellungen
// einstellbar, startet bei 50 %, nicht bei voller Stärke.
let masterVolume = 0.5;

let tracks: [HTMLAudioElement, HTMLAudioElement] | null = null;
/** Ein GainNode pro Kopie, 1:1 zu `tracks` — steuert deren tatsächlich
 *  hörbare Lautstärke (siehe Datei-Kommentar oben). `null` nur, wenn der
 *  Browser gar kein WebAudio kann; dann fällt `setVol` auf `audio.volume`
 *  zurück (funktioniert überall außer eben iOS Safari). */
let trackGains: [GainNode, GainNode] | null = null;
let activeTrack: 0 | 1 = 0; // Index in `tracks` — welche Kopie gerade "vorne" ist
let crossfading = false;
let enabled = true;
let wanted: TrackId | null = null;
let ducked = false;
let fadeRaf = 0;
let stopTimer = 0;

function makeTrack(): HTMLAudioElement {
  const a = new Audio(SRC);
  a.loop = false; // der Loop läuft manuell per Crossfade, nicht hart
  a.volume = 1; // die eigentliche Lautstärke steuert der GainNode, siehe unten
  a.setAttribute("playsinline", "");
  a.addEventListener("timeupdate", onTimeUpdate);
  return a;
}

/** Lautstärke einer Kopie setzen — über den GainNode, wenn vorhanden (siehe
 *  Datei-Kommentar), sonst als Fallback direkt über `audio.volume`. */
function setVol(idx: 0 | 1, value: number): void {
  const v = Math.max(0, Math.min(1, value));
  if (trackGains) {
    trackGains[idx].gain.value = v;
  } else if (tracks) {
    tracks[idx].volume = v;
  }
}
function getVol(idx: 0 | 1): number {
  if (trackGains) return trackGains[idx].gain.value;
  return tracks ? tracks[idx].volume : 0;
}

function ensureTracks(): [HTMLAudioElement, HTMLAudioElement] {
  if (!tracks) {
    tracks = [makeTrack(), makeTrack()];
    const ac = audioCtx();
    if (ac) {
      try {
        trackGains = tracks.map((t) => {
          const src = ac.createMediaElementSource(t);
          const gain = ac.createGain();
          gain.gain.value = 0;
          src.connect(gain).connect(ac.destination);
          return gain;
        }) as [GainNode, GainNode];
      } catch {
        trackGains = null; // z. B. Safari-Eigenheiten — dann greift der volume-Fallback
      }
    }
    if (import.meta.env.DEV) {
      (window as unknown as { __music: HTMLAudioElement[] }).__music = tracks;
      (window as unknown as { __musicGains: GainNode[] | null }).__musicGains = trackGains;
    }
  }
  return tracks;
}

function targetVolume(): number {
  return ducked ? masterVolume * DUCK : masterVolume;
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
  const toIdx: 0 | 1 = fromIdx === 0 ? 1 : 0;
  const from = tracks[fromIdx]!;
  const to = tracks[toIdx]!;
  to.currentTime = 0;
  setVol(toIdx, 0);
  // Wenn die zweite Kopie aus irgendeinem Grund nicht anspringt (z. B. iOS
  // blockt den Autoplay einer noch nie direkt angetippten Kopie), lieber
  // einen harten Loop auf der auslaufenden Kopie fahren als in Stille zu
  // enden — das war der eigentliche "Musik loopt nicht"-Bug.
  let toOk = true;
  void to.play().catch(() => {
    toOk = false;
  });
  const target = targetVolume();
  const durMs = CROSSFADE_S * 1000;
  const start = performance.now();
  cancelAnimationFrame(fadeRaf);
  const step = (now: number): void => {
    const t = Math.min(1, (now - start) / durMs);
    if (toOk) {
      setVol(fromIdx, target * (1 - t));
      setVol(toIdx, target * t);
    } else {
      setVol(fromIdx, target); // nicht ausblenden — es kommt kein Ersatz
    }
    if (t < 1) {
      fadeRaf = requestAnimationFrame(step);
    } else if (toOk) {
      from.pause();
      from.currentTime = 0;
      activeTrack = toIdx;
      crossfading = false;
    } else {
      from.currentTime = 0; // harter Schnitt statt Verstummen
      crossfading = false;
    }
  };
  fadeRaf = requestAnimationFrame(step);
}

/** Sanft auf `target` fahren statt hart zu springen (Start/Stop/Ducken). */
function fadeTo(target: number, ms: number): void {
  if (!tracks || crossfading) return; // während der Loop-Überblendung nicht querschießen
  const idx = activeTrack as 0 | 1;
  cancelAnimationFrame(fadeRaf);
  const from = getVol(idx);
  const start = performance.now();
  const step = (now: number): void => {
    const t = Math.min(1, (now - start) / ms);
    setVol(idx, from + (target - from) * t);
    if (t < 1) fadeRaf = requestAnimationFrame(step);
  };
  fadeRaf = requestAnimationFrame(step);
}

/** Musik spielen. `id` bleibt für Aufrufkompatibilität, ändert nichts mehr. */
export function playMusic(id: TrackId): void {
  wanted = id;
  if (!enabled) return;
  window.clearTimeout(stopTimer);
  const [a, b] = ensureTracks();
  void a.play().catch(() => {
    /* Autoplay evtl. noch gesperrt — onAudioUnlock spielt es nach der ersten Geste */
  });
  fadeTo(targetVolume(), 1200);
  // Die zweite Kopie einmal kurz anspielen+pausieren, solange wir noch im
  // selben Geste-Kontext sind — sonst blockt iOS Safari später beim Crossfade
  // stumm den `.play()` der zweiten Kopie (die ja nie "direkt" angetippt
  // wurde) und die Musik verstummt beim Loop-Punkt, statt weiterzulaufen.
  if (b.paused) {
    void b
      .play()
      .then(() => b.pause())
      .catch(() => {
        /* auch ok — dann bleibt nur der normale Crossfade-Versuch */
      });
  }
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
  const a = tracks?.[activeTrack];
  if (a && !a.paused) fadeTo(targetVolume(), 500);
}

/** Lautstärke-Regler aus den Einstellungen (0..1) — läuft weich nach, wie jeder
 *  andere Lautstärkewechsel hier. */
export function setMusicVolume(value: number): void {
  masterVolume = Math.max(0, Math.min(1, value));
  // Nicht an `!paused` hängen — sonst wirkt der Regler tot, wenn die aktive
  // Kopie gerade (z. B. kurz nach dem Loop-Wechsel) pausiert ist. `fadeTo`
  // ist auch auf einer pausierten Kopie ungefährlich, sie startet nur mit
  // der richtigen Lautstärke, sobald sie wieder läuft.
  if (enabled) fadeTo(targetVolume(), 300);
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
    void tracks[activeTrack]?.play().catch(() => {
      /* egal */
    });
  }
});
