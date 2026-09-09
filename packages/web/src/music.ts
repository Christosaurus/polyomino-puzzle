/**
 * Hintergrundmusik — ein Loop pro Kontext, mit Crossfade dazwischen.
 *
 * Läuft über WebAudio (nicht `<audio>`), damit Crossfade, „Ducking" während
 * einer Cutscene und ein sauberer Gapless-Loop möglich sind. Die Tracks liegen
 * als MP3 in `public/music/` und werden erst beim ersten Bedarf geladen; fehlt
 * eine Datei, passiert einfach nichts (kein 404-Krach).
 *
 * Autoplay: ein AudioContext darf erst nach einer Nutzergeste starten. Ein
 * `play()` davor merkt sich nur den Wunsch; die erste Geste löst ihn ein.
 */

export type TrackId = "menu" | "play" | "cascade";
const TRACKS: Record<TrackId, string> = {
  menu: "music/menu.mp3",
  play: "music/play.mp3",
  cascade: "music/cascade.mp3",
};

const MASTER = 0.32; // Grundlautstärke der Musik
const FADE_S = 1.4;
const DUCK = 0.28; // Restlautstärke während einer Cutscene

let ac: AudioContext | null = null;
let master: GainNode | null = null;
let duckGain: GainNode | null = null;
let enabled = true;
let wanted: TrackId | null = null; // was laufen soll, sobald möglich
let current: TrackId | null = null;
let currentSrc: AudioBufferSourceNode | null = null;
let currentGain: GainNode | null = null;
const buffers = new Map<TrackId, AudioBuffer | null>();

function ctx(): AudioContext | null {
  if (!enabled) return null;
  if (!ac) {
    try {
      ac = new (window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = MASTER;
      duckGain = ac.createGain();
      duckGain.gain.value = 1;
      master.connect(duckGain).connect(ac.destination);
    } catch {
      return null;
    }
  }
  if (ac.state === "suspended") void ac.resume();
  return ac;
}

async function load(id: TrackId): Promise<AudioBuffer | null> {
  if (buffers.has(id)) return buffers.get(id) ?? null;
  const a = ctx();
  if (!a) return null;
  try {
    const res = await fetch(TRACKS[id]);
    if (!res.ok) throw new Error("no track");
    const buf = await a.decodeAudioData(await res.arrayBuffer());
    buffers.set(id, buf);
    return buf;
  } catch {
    buffers.set(id, null); // nicht nochmal versuchen
    return null;
  }
}

function fade(g: GainNode, to: number, when: number, secs: number): void {
  const a = ac!;
  g.gain.cancelScheduledValues(when);
  g.gain.setValueAtTime(g.gain.value, when);
  g.gain.linearRampToValueAtTime(to, when + secs);
}

async function crossfadeTo(id: TrackId): Promise<void> {
  const a = ctx();
  if (!a || !master) return;
  const buf = await load(id);
  if (!buf) return;
  if (wanted !== id) return; // in der Zwischenzeit umentschieden

  const now = a.currentTime;
  const g = a.createGain();
  g.gain.value = 0;
  const src = a.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.connect(g).connect(master);
  src.start(now);
  fade(g, 1, now, FADE_S);

  const oldSrc = currentSrc;
  const oldGain = currentGain;
  if (oldSrc && oldGain) {
    fade(oldGain, 0, now, FADE_S);
    oldSrc.stop(now + FADE_S + 0.1);
  }
  currentSrc = src;
  currentGain = g;
  current = id;
}

/** Diesen Track spielen (Crossfade vom laufenden). Doppelaufrufe sind billig. */
export function playMusic(id: TrackId): void {
  wanted = id;
  if (current === id && currentSrc) return;
  if (!enabled) return;
  void crossfadeTo(id);
}

/** Musik ausblenden (z. B. beim kompletten Verlassen). */
export function stopMusic(): void {
  wanted = null;
  const a = ac;
  if (a && currentGain && currentSrc) {
    fade(currentGain, 0, a.currentTime, 0.6);
    currentSrc.stop(a.currentTime + 0.8);
  }
  currentSrc = null;
  currentGain = null;
  current = null;
}

/** Während einer Cutscene / Dialogszene leiser. */
export function duckMusic(on: boolean): void {
  const a = ac;
  if (!a || !duckGain) return;
  fade(duckGain, on ? DUCK : 1, a.currentTime, 0.5);
}

/** „Musik"-Schalter aus den Einstellungen. */
export function setMusicEnabled(value: boolean): void {
  enabled = value;
  if (!value) {
    stopMusic();
    if (ac && ac.state === "running") void ac.suspend();
  } else if (wanted || current) {
    void ctx();
    if (wanted) playMusic(wanted);
  }
}

// Erste Nutzergeste: AudioContext freischalten und den gemerkten Wunsch spielen.
function unlock(): void {
  window.removeEventListener("pointerdown", unlock);
  window.removeEventListener("keydown", unlock);
  window.removeEventListener("touchstart", unlock);
  if (enabled && wanted) playMusic(wanted);
  else void ctx();
}
window.addEventListener("pointerdown", unlock, { once: true });
window.addEventListener("keydown", unlock, { once: true });
window.addEventListener("touchstart", unlock, { once: true });

// Im Hintergrund pausieren, beim Zurückkommen weiter.
document.addEventListener("visibilitychange", () => {
  if (!ac) return;
  if (document.hidden) void ac.suspend();
  else if (enabled && current) void ac.resume();
});
