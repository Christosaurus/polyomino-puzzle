/**
 * Tiny synthesized sound effects — no audio files. Created lazily on first use
 * (autoplay policies need a user gesture first) and silently no-ops if WebAudio
 * is unavailable or the player has muted.
 */

let ctx: AudioContext | null = null;
let muted = false;

function audio(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, durMs: number, type: OscillatorType, gain = 0.08, delayMs = 0): void {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delayMs / 1000;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(gain, t0 + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
  osc.connect(amp).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + durMs / 1000 + 0.02);
}

export const sfx = {
  pickUp(): void {
    tone(320, 70, "sine", 0.05);
  },
  place(): void {
    tone(180, 60, "triangle", 0.06);
    tone(360, 90, "sine", 0.05, 20);
  },
  invalid(): void {
    tone(140, 120, "sawtooth", 0.05);
  },
  win(): void {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 260, "sine", 0.07, i * 90));
  },
  setMuted(value: boolean): void {
    muted = value;
  },
  get muted(): boolean {
    return muted;
  },
};
