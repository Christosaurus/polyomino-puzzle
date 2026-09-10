/**
 * Ein einziger AudioContext für SFX und Musik + robustes Freischalten auf
 * Mobilgeräten.
 *
 * Zwei Hürden auf dem Handy:
 *  1. Autoplay-Politik: ein AudioContext läuft erst nach einer echten
 *     Nutzergeste, und `resume()` muss *innerhalb* des Gesten-Handlers laufen.
 *     Darum hängt hier ein Capture-Listener ganz vorne an `window` — er kommt
 *     vor jedem App-Handler dran und weckt den Context bei der allerersten
 *     Berührung.
 *  2. iOS-Klingelschalter: WebAudio bleibt stumm, solange nicht einmal ein
 *     `<audio>`/`<video>`-Element gespielt hat. Ein winziges stilles Loop-Audio
 *     beim ersten Tap schaltet den Media-Kanal frei.
 *
 * Safari deckelt außerdem die Zahl der AudioContexts (~4) — deshalb genau
 * einer, den sich `sfx.ts` und `music.ts` teilen.
 */

let ac: AudioContext | null = null;
let unlocked = false;
const waiting: Array<() => void> = [];

function create(): AudioContext | null {
  if (ac) return ac;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ac = new Ctor();
  } catch {
    return null;
  }
  return ac;
}

/** Der geteilte AudioContext (null, wenn WebAudio fehlt). Stößt `resume()` an. */
export function audioCtx(): AudioContext | null {
  const c = create();
  if (c && c.state === "suspended") void c.resume();
  return c;
}

/** Ist Audio schon durch eine Nutzergeste freigeschaltet? */
export function audioUnlocked(): boolean {
  return unlocked;
}

/** `fn` aufrufen, sobald Audio frei ist (sofort, wenn es das schon ist). */
export function onAudioUnlock(fn: () => void): void {
  if (unlocked) fn();
  else waiting.push(fn);
}

// ── stilles Loop-Audio gegen den iOS-Klingelschalter ───────────────────────
let silenceUrl = "";
function silentWav(): string {
  if (silenceUrl) return silenceUrl;
  const rate = 8000;
  const n = Math.floor(rate * 0.4);
  const b = new ArrayBuffer(44 + n * 2);
  const v = new DataView(b);
  const str = (o: number, s: string): void => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, n * 2, true); // Samples bleiben 0 = Stille
  silenceUrl = URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
  return silenceUrl;
}

let tag: HTMLAudioElement | null = null;
function openMediaChannel(): void {
  try {
    if (!tag) {
      tag = new Audio(silentWav());
      tag.loop = true;
      tag.volume = 0.0001;
      tag.setAttribute("playsinline", "");
    }
    void tag.play().catch(() => {
      /* egal — dann eben nur der AudioContext */
    });
  } catch {
    /* egal */
  }
}

function pump(): void {
  if (unlocked) {
    if (ac && ac.state === "suspended") void ac.resume();
    return;
  }
  const c = create();
  if (c) {
    void c.resume();
    try {
      const src = c.createBufferSource();
      src.buffer = c.createBuffer(1, 1, 22050);
      src.connect(c.destination);
      src.start(0);
    } catch {
      /* egal */
    }
  }
  openMediaChannel();

  const done = (): void => {
    if (unlocked) return;
    unlocked = true;
    for (const fn of waiting.splice(0)) {
      try {
        fn();
      } catch {
        /* egal */
      }
    }
  };
  if (!c || c.state === "running") done();
  else void c.resume().then(done, done);
}

const EVENTS = ["pointerdown", "touchstart", "touchend", "mousedown", "keydown", "click"] as const;
for (const ev of EVENTS) window.addEventListener(ev, pump, { capture: true, passive: true });

// iOS unterbricht den Context beim Weg-Tabben — beim Zurückkommen wecken.
document.addEventListener("visibilitychange", () => {
  if (ac && !document.hidden && unlocked && ac.state === "suspended") void ac.resume();
});
