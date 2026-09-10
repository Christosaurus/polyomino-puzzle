/**
 * Hintergrundmusik — **komplett synthetisiert**, keine Dateien.
 *
 * Statt fertiger MP3s läuft hier ein kleiner generativer Loop: ein warmes
 * Flächen-Pad auf einer endlosen Am–F–C–G-Folge, darüber ein Glöckchen-Arp aus
 * der A-Moll-Pentatonik, ein weicher Bass und — je nach Kontext — etwas
 * Rhythmus. Nichts wiederholt sich hörbar exakt, weil Oktave und Timing der
 * Arp-Noten leicht streuen.
 *
 * Drei „Tracks" sind nur drei Energie-Stufen derselben Musik:
 *   menu    — ruhig, sparsam. Browsing.
 *   play    — fließender, ein Puls dazu. Konzentration.
 *   cascade — treibend, Kick + Hi-Hat. Arcade.
 *
 * Autoplay: ein AudioContext darf erst nach einer Nutzergeste laufen. Ein
 * `playMusic()` davor merkt sich nur den Wunsch; die erste Geste löst ihn ein.
 * Der „Musik"-Schalter blendet sanft aus/ein statt hart zu schneiden.
 */

export type TrackId = "menu" | "play" | "cascade";

const MASTER = 0.22; // Grundlautstärke der Musik (unter den SFX)
const DUCK = 0.3; // Restlautstärke während einer Cutscene
const BPM = 84;
const BEAT = 60 / BPM; // Sekunden pro Viertel
const LOOKAHEAD_MS = 40;
const SCHEDULE_AHEAD = 0.18; // so weit im Voraus werden Noten gelegt

/** Am – F – C – G, je vier Schläge. Endlos hörbar, „poppig". */
const PROG: number[][] = [
  [220.0, 261.63, 329.63], // Am
  [174.61, 220.0, 261.63], // F
  [261.63, 329.63, 392.0], // C
  [196.0, 246.94, 293.66], // G
];
/** A-Moll-Pentatonik über zwei Oktaven — die Melodie-Vorratskammer. */
const PENTA = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];

/** Energie pro Track: steuert Arp-Dichte und Rhythmus-Ebene. */
const ENERGY: Record<TrackId, number> = { menu: 0.34, play: 0.64, cascade: 1 };

let ac: AudioContext | null = null;
let master: GainNode | null = null;
let duckGain: GainNode | null = null;
let padBus: GainNode | null = null;
let arpBus: GainNode | null = null;
let bassBus: GainNode | null = null;
let percBus: GainNode | null = null;

let enabled = true;
let wanted: TrackId | null = null;
let current: TrackId | null = null;
let energyNow = ENERGY.menu;
let timer = 0;
let beat = 0; // fortlaufender Viertel-Zähler
let nextNoteTime = 0;
let padChordAt = -1; // bei welchem Takt zuletzt ein Pad-Akkord gelegt wurde

function build(): AudioContext | null {
  if (!enabled) return null;
  if (ac) {
    if (ac.state === "suspended") void ac.resume();
    return ac;
  }
  try {
    ac = new (window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  } catch {
    return null;
  }
  master = ac.createGain();
  master.gain.value = MASTER;
  duckGain = ac.createGain();
  duckGain.gain.value = 1;
  master.connect(duckGain).connect(ac.destination);

  // Pad: leicht gedämpft, damit es hinter allem sitzt
  const padFilter = ac.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 1300;
  padBus = ac.createGain();
  padBus.gain.value = 0.5;
  padBus.connect(padFilter).connect(master);

  // Arp: mit einem Feedback-Delay für Tiefe
  arpBus = ac.createGain();
  arpBus.gain.value = 0.34;
  const delay = ac.createDelay(1);
  delay.delayTime.value = BEAT * 0.75;
  const fb = ac.createGain();
  fb.gain.value = 0.32;
  const dampen = ac.createBiquadFilter();
  dampen.type = "lowpass";
  dampen.frequency.value = 2600;
  arpBus.connect(master); // trocken
  arpBus.connect(delay);
  delay.connect(dampen).connect(fb).connect(delay);
  dampen.connect(master); // Echo-Fahne

  bassBus = ac.createGain();
  bassBus.gain.value = 0.5;
  bassBus.connect(master);

  percBus = ac.createGain();
  percBus.gain.value = 0.5;
  percBus.connect(master);

  return ac;
}

/** Ein Ton mit weicher Hüllkurve. */
function voice(
  bus: GainNode,
  freq: number,
  t: number,
  dur: number,
  type: OscillatorType,
  gain: number,
  detune = 0,
): void {
  const a = ac!;
  const osc = a.createOscillator();
  const amp = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = detune;
  const atk = Math.min(0.12, dur * 0.3);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(gain, t + atk);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp).connect(bus);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** Kurzer Rausch-Impuls — Hi-Hat / Kick-Anschlag. */
function hit(t: number, dur: number, gain: number, hz: number, hp: boolean): void {
  const a = ac!;
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const flt = a.createBiquadFilter();
  flt.type = hp ? "highpass" : "lowpass";
  flt.frequency.value = hz;
  const amp = a.createGain();
  amp.gain.value = gain;
  src.connect(flt).connect(amp).connect(percBus!);
  src.start(t);
}

/** Legt alle Stimmen für einen Viertel-Schlag `b` zur Zeit `t`. */
function scheduleBeat(b: number, t: number): void {
  const chordIdx = Math.floor(b / 4) % PROG.length;
  const chord = PROG[chordIdx]!;
  const inBar = b % 4;
  const e = energyNow;

  // ── Pad: ein neuer Akkord zu jedem Taktanfang, lang liegend ──
  if (inBar === 0 && padChordAt !== chordIdx + Math.floor(b / 16) * 100) {
    padChordAt = chordIdx + Math.floor(b / 16) * 100;
    for (let i = 0; i < chord.length; i++) {
      voice(padBus!, chord[i]! / 2, t, BEAT * 4.4, "sawtooth", 0.05, i === 0 ? -6 : 5);
      voice(padBus!, chord[i]! / 2, t, BEAT * 4.4, "sine", 0.05, 0);
    }
  }

  // ── Bass: Grundton, Dichte nach Energie ──
  const root = chord[0]! / 2;
  if (inBar === 0 || (e > 0.5 && inBar === 2) || (e > 0.85 && inBar % 1 === 0)) {
    const bf = e > 0.85 && inBar % 2 === 1 ? root * 1.5 : root;
    voice(bassBus!, bf, t, e > 0.85 ? BEAT * 0.9 : BEAT * 1.8, "triangle", 0.16);
  }

  // ── Arp: Glöckchen aus der Pentatonik ──
  const subdiv = e > 0.85 ? 2 : e > 0.5 ? 1 : b % 2 === 0 ? 1 : 0;
  for (let s = 0; s < subdiv; s++) {
    const st = t + (s * BEAT) / subdiv + (Math.random() - 0.5) * 0.012;
    // bevorzugt Akkordtöne, ab und zu ein Nachbarton
    const pick =
      Math.random() < 0.7
        ? chord[Math.floor(Math.random() * chord.length)]! * (Math.random() < 0.5 ? 2 : 1)
        : PENTA[Math.floor(Math.random() * PENTA.length)]!;
    const g = 0.09 * (0.7 + 0.3 * e) * (s === 0 ? 1 : 0.7);
    voice(arpBus!, pick, st, BEAT * 1.1, "triangle", g);
  }

  // ── Rhythmus-Ebene: erst ab „play" ein Puls, ab „cascade" Kick + HiHat ──
  if (e > 0.5) {
    voice(percBus!, root, t, 0.14, "sine", 0.05 * e); // weicher Puls auf der Eins jedes Schlags
  }
  if (e > 0.85) {
    if (inBar === 0 || inBar === 2) hit(t, 0.16, 0.5, 130, false); // Kick
    hit(t + BEAT / 2, 0.03, 0.14, 8000, true); // Offbeat-HiHat
  }
}

function tick(): void {
  const a = ac;
  if (!a || !enabled || !wanted) return;
  // sanft zur Ziel-Energie des aktuellen Tracks gleiten
  const target = current ? ENERGY[current] : ENERGY.menu;
  energyNow += (target - energyNow) * 0.06;

  while (nextNoteTime < a.currentTime + SCHEDULE_AHEAD) {
    scheduleBeat(beat, nextNoteTime);
    beat += 1;
    nextNoteTime += BEAT;
  }
}

function startClock(): void {
  const a = build();
  if (!a || timer) return;
  nextNoteTime = a.currentTime + 0.08;
  timer = window.setInterval(tick, LOOKAHEAD_MS);
}

function stopClock(): void {
  if (timer) window.clearInterval(timer);
  timer = 0;
}

/** Diesen Track (= diese Energie-Stufe) spielen. Doppelaufrufe sind billig. */
export function playMusic(id: TrackId): void {
  wanted = id;
  current = id;
  if (!enabled) return;
  const a = build();
  if (!a) return; // noch keine Geste — der Wunsch ist gemerkt
  if (master) {
    master.gain.cancelScheduledValues(a.currentTime);
    master.gain.setValueAtTime(master.gain.value, a.currentTime);
    master.gain.linearRampToValueAtTime(MASTER, a.currentTime + 1.2);
  }
  startClock();
}

/** Musik ganz ausblenden (z. B. beim kompletten Verlassen). */
export function stopMusic(): void {
  wanted = null;
  current = null;
  const a = ac;
  if (a && master) {
    master.gain.cancelScheduledValues(a.currentTime);
    master.gain.setValueAtTime(master.gain.value, a.currentTime);
    master.gain.linearRampToValueAtTime(0.0001, a.currentTime + 0.6);
  }
  window.setTimeout(stopClock, 700);
}

/** Während einer Cutscene / Dialogszene leiser. */
export function duckMusic(on: boolean): void {
  const a = ac;
  if (!a || !duckGain) return;
  duckGain.gain.cancelScheduledValues(a.currentTime);
  duckGain.gain.setValueAtTime(duckGain.gain.value, a.currentTime);
  duckGain.gain.linearRampToValueAtTime(on ? DUCK : 1, a.currentTime + 0.5);
}

/** „Musik"-Schalter aus den Einstellungen — sanft, nie hart geschnitten. */
export function setMusicEnabled(value: boolean): void {
  if (value === enabled) return;
  enabled = value;
  const a = ac;
  if (!value) {
    if (a && master) {
      master.gain.cancelScheduledValues(a.currentTime);
      master.gain.setValueAtTime(master.gain.value, a.currentTime);
      master.gain.linearRampToValueAtTime(0.0001, a.currentTime + 0.45);
    }
    window.setTimeout(() => {
      stopClock();
      if (ac && ac.state === "running" && !enabled) void ac.suspend();
    }, 500);
  } else if (wanted) {
    playMusic(wanted);
  }
}

// Erste Nutzergeste: AudioContext freischalten und den gemerkten Wunsch spielen.
function unlock(): void {
  window.removeEventListener("pointerdown", unlock);
  window.removeEventListener("keydown", unlock);
  window.removeEventListener("touchstart", unlock);
  if (enabled && wanted) playMusic(wanted);
}
window.addEventListener("pointerdown", unlock, { once: true });
window.addEventListener("keydown", unlock, { once: true });
window.addEventListener("touchstart", unlock, { once: true });

// Im Hintergrund pausieren, beim Zurückkommen weiter.
document.addEventListener("visibilitychange", () => {
  if (!ac) return;
  if (document.hidden) {
    stopClock();
    void ac.suspend();
  } else if (enabled && wanted) {
    void ac.resume().then(startClock);
  }
});
