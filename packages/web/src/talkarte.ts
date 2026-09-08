/**
 * Die Talkarte lebendig machen: sanfter Parallax (die gemalte Karte scrollt
 * langsamer als die Stationen davor) plus eine dünne Effekt-Ebene darüber —
 * glimmende Fenster, Glühwürmchen, ein paar Vögel und Schmetterlinge. Alles in
 * Bild-Bruchteilen verankert, damit es mit der Malerei mitwandert; Tag wie
 * Nacht sichtbar, nur unterschiedlich gewichtet.
 */

type FxOpts = {
  /** Der scrollbare Startbildschirm. */
  scroller: HTMLElement;
  /** Der Container mit `<img>` + `<canvas class="talkarte-fx">`. */
  root: HTMLElement;
  /** 0 (Nacht) … 1 (heller Tag) — steuert Gewichtung der Effekte. */
  light: () => number;
  /** Ob der Startbildschirm gerade sichtbar ist (sonst pausiert die Schleife). */
  visible: () => boolean;
};

const PARALLAX = 0.4; // 0 = mitgescrollt, 1 = stünde still

/** Fensterpunkte im Bild (Bruchteile), an denen es warm glimmt. */
const LAMPS: Array<{ x: number; y: number; warm: number }> = [
  { x: 0.32, y: 0.62, warm: 1 },
  { x: 0.66, y: 0.64, warm: 1 },
  { x: 0.2, y: 0.83, warm: 1 },
  { x: 0.78, y: 0.86, warm: 1 },
  { x: 0.5, y: 0.93, warm: 1 },
  { x: 0.4, y: 0.44, warm: 0.35 }, // Werkstatt-Dämmerung
  { x: 0.72, y: 0.42, warm: 0.3 },
  { x: 0.5, y: 0.05, warm: 0.5 }, // der ferne Lichtpunkt ganz oben
];

interface Firefly {
  x: number;
  y: number;
  ph: number;
  sp: number;
}
interface Bird {
  x: number;
  y: number;
  sp: number;
  ph: number;
}
interface Fly {
  x: number;
  y: number;
  ph: number;
}

export function mountTalkarteFx(opts: FxOpts): void {
  const canvas = opts.root.querySelector<HTMLCanvasElement>(".talkarte-fx");
  const img = opts.root.querySelector<HTMLImageElement>("img");
  if (!canvas || !img) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── Parallax ────────────────────────────────────────────────────────────
  const onScroll = (): void => {
    opts.root.style.transform = `translateY(${opts.scroller.scrollTop * PARALLAX}px)`;
  };
  opts.scroller.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // ── Effekt-Ebene ────────────────────────────────────────────────────────
  let w = 0;
  let h = 0;
  const resize = (): void => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = img.clientWidth || opts.root.clientWidth;
    h = img.clientHeight || w * 2.68;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  if (img.complete) resize();
  img.addEventListener("load", resize);
  window.addEventListener("resize", resize);

  const rnd = seedRng(20260908);
  const fireflies: Firefly[] = Array.from({ length: 18 }, () => ({
    x: rnd(),
    y: 0.4 + rnd() * 0.58,
    ph: rnd() * 6.28,
    sp: 0.4 + rnd() * 0.9,
  }));
  const birds: Bird[] = Array.from({ length: 3 }, (_, i) => ({
    x: rnd(),
    y: 0.05 + i * 0.05 + rnd() * 0.03,
    sp: 0.015 + rnd() * 0.02,
    ph: rnd() * 6.28,
  }));
  const flies: Fly[] = Array.from({ length: 3 }, () => ({
    x: 0.15 + rnd() * 0.7,
    y: 0.6 + rnd() * 0.3,
    ph: rnd() * 6.28,
  }));

  let raf = 0;
  let last = performance.now();
  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame);
    if (!opts.visible() || document.hidden || w === 0) return;
    const dt = Math.min(64, now - last);
    last = now;
    const t = now / 1000;
    const day = opts.light();
    ctx.clearRect(0, 0, w, h);

    // glimmende Fenster — warm, atmen leicht; nachts stärker
    for (let i = 0; i < LAMPS.length; i++) {
      const l = LAMPS[i]!;
      const pulse = 0.72 + 0.28 * Math.sin(t * 1.3 + i * 1.7);
      const strength = l.warm * (0.45 + 0.55 * (1 - day)) * pulse;
      const R = w * (0.06 + 0.02 * l.warm);
      const gx = l.x * w;
      const gy = l.y * h;
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, R);
      g.addColorStop(0, `rgba(255, 214, 140, ${0.5 * strength})`);
      g.addColorStop(0.5, `rgba(255, 180, 90, ${0.18 * strength})`);
      g.addColorStop(1, "rgba(255, 180, 90, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(gx, gy, R, 0, 6.28);
      ctx.fill();
    }

    if (reduced) return; // Punkte statisch lassen: Fenster reichen

    // Glühwürmchen — treiben langsam nach oben, im ganzen Bild, unten dichter
    for (let i = 0; i < fireflies.length; i++) {
      const f = fireflies[i]!;
      f.y -= (0.00001 * f.sp * dt) / 1;
      if (f.y < 0.02) {
        f.y = 0.98;
        f.x = rnd();
      }
      const fx = (f.x + Math.sin(t * 0.3 * f.sp + f.ph) * 0.015) * w;
      const fy = f.y * h;
      const blink = 0.25 + 0.75 * Math.abs(Math.sin(t * 2 * f.sp + f.ph));
      ctx.globalAlpha = blink * (0.5 + 0.4 * (1 - f.y)) * (0.7 + 0.3 * day);
      ctx.fillStyle = "#ffe79c";
      ctx.shadowColor = "#ffcf6b";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(fx, fy, 1.9, 0, 6.28);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // Schmetterlinge — nur wenn es hell genug ist, im Gartendrittel
    if (day > 0.25) {
      for (let i = 0; i < flies.length; i++) {
        const fl = flies[i]!;
        const bx = (fl.x + Math.sin(t * 0.5 + fl.ph) * 0.05) * w;
        const by = (fl.y + Math.sin(t * 0.8 + fl.ph * 2) * 0.03) * h;
        const wing = 2.5 + Math.abs(Math.sin(t * 9 + fl.ph)) * 4;
        ctx.globalAlpha = 0.7 * Math.min(1, (day - 0.25) * 2);
        ctx.fillStyle = i % 2 ? "#ff9ecb" : "#ffd36b";
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(bx + s * wing * 0.5, by, wing, wing * 1.3, s * 0.5, 0, 6.28);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    // Vögel — gleiten durchs obere Drittel, mehr am Tag
    const birdAlpha = 0.35 + 0.4 * day;
    ctx.strokeStyle = `rgba(40, 44, 66, ${birdAlpha})`;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i]!;
      const bx = (((b.x + t * b.sp + i * 0.3) % 1.3) - 0.15) * w;
      const by = b.y * h + Math.sin(t * 0.7 + b.ph) * 8;
      const flap = Math.sin(t * 6 + b.ph + i) * 5;
      ctx.beginPath();
      ctx.moveTo(bx - 8, by + flap);
      ctx.quadraticCurveTo(bx, by - 4, bx, by);
      ctx.quadraticCurveTo(bx, by - 4, bx + 8, by + flap);
      ctx.stroke();
    }
  };
  raf = requestAnimationFrame(frame);
  void raf;
}

/** kleiner deterministischer PRNG, damit die Effekte zwischen Reloads gleich starten */
function seedRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
