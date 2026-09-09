/**
 * Kleine synthetisierte Soundeffekte — keine Dateien. Der AudioContext wird
 * erst bei der ersten Nutzung erzeugt (Autoplay braucht eine Geste) und macht
 * still nichts, wenn WebAudio fehlt oder der Ton aus ist.
 */

let ctx: AudioContext | null = null;
let muted = false;
let haptics = true;
let bus: GainNode | null = null;

function audio(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      bus = ctx.createGain();
      bus.gain.value = 0.9;
      bus.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Ein Ton mit weicher Attack + exponentiellem Ausklang. */
function tone(
  freq: number,
  durMs: number,
  type: OscillatorType,
  gain = 0.08,
  delayMs = 0,
  glideTo?: number,
): void {
  const ac = audio();
  if (!ac || !bus) return;
  const t0 = ac.currentTime + delayMs / 1000;
  const t1 = t0 + durMs / 1000;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t1);
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(gain, t0 + 0.006);
  amp.gain.exponentialRampToValueAtTime(0.0001, t1);
  osc.connect(amp).connect(bus);
  osc.start(t0);
  osc.stop(t1 + 0.02);
}

/** Kurzes gefiltertes Rauschen — „Klick" / „Tock". */
function noise(durMs: number, gain: number, hz: number, delayMs = 0): void {
  const ac = audio();
  if (!ac || !bus) return;
  const t0 = ac.currentTime + delayMs / 1000;
  const len = Math.max(1, Math.floor((ac.sampleRate * durMs) / 1000));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const flt = ac.createBiquadFilter();
  flt.type = "bandpass";
  flt.frequency.value = hz;
  flt.Q.value = 0.8;
  const amp = ac.createGain();
  amp.gain.value = gain;
  src.connect(flt).connect(amp).connect(bus);
  src.start(t0);
}

const CHIME = [523.25, 587.33, 659.25, 783.99, 880, 1046.5]; // C-Dur-Fragment

export const sfx = {
  /** Teil aus dem Fach greifen. */
  pickUp(): void {
    tone(300, 60, "sine", 0.045, 0, 380);
  },
  /** Teil setzen — ein sattes Tock + kleiner Funke. */
  place(): void {
    noise(45, 0.05, 220);
    tone(150, 55, "triangle", 0.06);
    tone(420, 90, "sine", 0.04, 25);
  },
  /** Zug geht nicht. */
  invalid(): void {
    tone(150, 130, "sawtooth", 0.045, 0, 110);
  },
  /** Reihe(n) in Kaskade geräumt — Tonhöhe steigt mit der Zahl. */
  rowClear(rows = 1): void {
    const base = 440 * Math.pow(1.19, Math.min(4, rows) - 1);
    tone(base, 90, "triangle", 0.06);
    tone(base * 1.5, 130, "sine", 0.05, 40);
    if (rows >= 2) tone(base * 2, 160, "sine", 0.04, 80);
  },
  /** Serie/Multiplikator steigt — kleines aufsteigendes Glöckchen. */
  streak(step = 1): void {
    const i = Math.min(CHIME.length - 1, step);
    tone(CHIME[i]!, 140, "sine", 0.05);
    tone(CHIME[i]! * 2, 180, "sine", 0.03, 50);
  },
  /** Fenster gelöst. `tier` 1–4 macht den Jubel größer. */
  win(tier = 1): void {
    const notes = CHIME.slice(0, Math.min(CHIME.length, 3 + tier));
    notes.forEach((f, i) => tone(f, 260, "sine", 0.06, i * 80));
    if (tier >= 3) tone(CHIME[0]! / 2, 500, "triangle", 0.05, notes.length * 80);
  },
  /** Meilenstein / Region / Finale — eine kleine Fanfare. */
  milestone(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone(f, 320, "triangle", 0.06, i * 110);
      tone(f * 2, 320, "sine", 0.025, i * 110);
    });
  },
  /** Fehlschlag — Zeit um / Flamme aus. Fällt ab. */
  fail(): void {
    tone(300, 420, "sawtooth", 0.05, 0, 90);
    tone(150, 500, "sine", 0.04, 60, 70);
  },
  /** Winziger UI-Tap (Knöpfe, Tabs). */
  tap(): void {
    tone(560, 28, "sine", 0.03);
  },

  setMuted(value: boolean): void {
    muted = value;
  },
  get muted(): boolean {
    return muted;
  },
  setHaptics(value: boolean): void {
    haptics = value;
  },
  vibrate(ms: number): void {
    if (haptics) navigator.vibrate?.(ms);
  },
};
