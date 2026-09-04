/**
 * The living backdrop. One canvas behind everything.
 *
 * `light` (0..1) is the mood — deep shadow to warm dawn — and drives every
 * layer. `theme` swaps the scene: the menu village, or a garden that still lies
 * in shadow (birds, bees, flowers that open as the light returns).
 */

export type SceneTheme = "menu" | "garden" | "workshop" | "courtyard";

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): string =>
  `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(
    lerp(a[2], b[2], t),
  )})`;
const rnd = (seed: () => number, a: number, b: number): number => a + seed() * (b - a);

/** small deterministic PRNG so the scene is stable across redraws */
function mulberry(seedNum: number): () => number {
  let s = seedNum >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Star {
  x: number;
  y: number;
  r: number;
  ph: number;
}
interface Firefly {
  x: number;
  y: number;
  ph: number;
  sp: number;
}
interface Flower {
  x: number;
  y: number;
  color: RGB;
  scale: number;
  open: number;
}
interface Bird {
  x: number;
  y: number;
  sp: number;
  ph: number;
}
interface House {
  x: number;
  w: number;
  h: number;
  roof: number;
  windows: number;
}

export class Scenery {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private light = 0;
  private shown = 0;
  private theme: SceneTheme = "menu";
  private themeT = 0; // eased toward theme index
  private w = 0;
  private h = 0;
  private raf = 0;
  private flash = 0;

  private stars: Star[] = [];
  private houses: House[] = [];
  private flowers: Flower[] = [];
  private fireflies: Firefly[] = [];
  private birds: Bird[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.seed();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    const loop = (): void => {
      this.shown += (this.light - this.shown) * 0.04;
      this.themeT += (this.themeIndex() - this.themeT) * 0.14;
      if (this.flash > 0) this.flash -= 0.02;
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  setLight(v: number): void {
    this.light = Math.max(0, Math.min(1, v));
  }
  setTheme(t: SceneTheme): void {
    this.theme = t;
  }
  /** brief bright bloom, for milestone / region moments */
  pulse(): void {
    this.flash = 1;
  }
  private themeIndex(): number {
    return this.theme === "menu" ? 0 : 1;
  }

  private seed(): void {
    const r = mulberry(20260904);
    for (let i = 0; i < 90; i++)
      this.stars.push({ x: r(), y: r() * 0.55, r: r() * 1.4 + 0.3, ph: r() * 6 });
    for (let i = 0; i < 7; i++)
      this.houses.push({
        x: 0.1 + i * 0.115 + r() * 0.02,
        w: 0.05 + r() * 0.03,
        h: 0.05 + r() * 0.05,
        roof: 0.02 + r() * 0.02,
        windows: 1 + Math.floor(r() * 3),
      });
    const palette: RGB[] = [
      [255, 120, 150],
      [255, 190, 90],
      [180, 130, 255],
      [255, 240, 130],
      [130, 200, 255],
    ];
    for (let i = 0; i < 16; i++)
      this.flowers.push({
        x: rnd(r, 0.05, 0.95),
        y: rnd(r, 0.78, 0.97),
        color: palette[Math.floor(r() * palette.length)]!,
        scale: rnd(r, 0.7, 1.3),
        open: r(),
      });
    for (let i = 0; i < 30; i++)
      this.fireflies.push({ x: r(), y: rnd(r, 0.3, 0.95), ph: r() * 6, sp: rnd(r, 0.4, 1) });
    for (let i = 0; i < 3; i++)
      this.birds.push({ x: r(), y: rnd(r, 0.12, 0.34), sp: rnd(r, 0.02, 0.05), ph: r() * 6 });
  }

  private resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private draw(): void {
    const gardenMix = Math.max(0, Math.min(1, this.themeT));
    if (gardenMix < 0.5) this.drawMenu(1 - gardenMix * 2);
    else this.drawGarden((gardenMix - 0.5) * 2);
    if (this.flash > 0) {
      const f = this.flash * this.flash;
      const g = this.ctx.createRadialGradient(
        this.w / 2,
        this.h * 0.4,
        0,
        this.w / 2,
        this.h * 0.4,
        this.w,
      );
      g.addColorStop(0, `rgba(255,236,180,${0.5 * f})`);
      g.addColorStop(1, "rgba(255,236,180,0)");
      this.ctx.fillStyle = g;
      this.ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  // ── Menu: the village ────────────────────────────────────────────────────
  private drawMenu(alpha: number): void {
    const { ctx, w, h } = this;
    const t = this.shown;
    const now = performance.now() / 1000;
    ctx.globalAlpha = alpha;

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, mix([8, 10, 24], [255, 214, 170], t));
    sky.addColorStop(0.45, mix([12, 16, 34], [255, 170, 120], t));
    sky.addColorStop(1, mix([16, 20, 40], [126, 176, 214], t));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    if (t < 0.85) {
      ctx.fillStyle = "#fff";
      for (const s of this.stars) {
        ctx.globalAlpha = alpha * (1 - t / 0.85) * 0.8 * (0.5 + 0.5 * Math.sin(now * 1.5 + s.ph));
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r, 0, 6.28);
        ctx.fill();
      }
      ctx.globalAlpha = alpha;
    }

    const sunX = w * 0.78;
    const sunY = lerp(h * 0.8, h * 0.2, Math.min(1, t / 0.9));
    const rg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, w * 0.4);
    rg.addColorStop(0, mix([200, 210, 240], [255, 220, 140], t));
    rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = alpha * (0.3 + 0.4 * t);
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = mix([214, 220, 240], [255, 233, 170], t);
    ctx.beginPath();
    ctx.arc(sunX, sunY, w * 0.055, 0, 6.28);
    ctx.fill();

    const hills: Array<{ b: number; a: number; p: number; n: RGB; d: RGB }> = [
      { b: 0.64, a: 0.04, p: 1.1, n: [26, 30, 54], d: [150, 189, 150] },
      { b: 0.74, a: 0.06, p: 3.4, n: [20, 24, 44], d: [110, 165, 120] },
      { b: 0.87, a: 0.09, p: 0.4, n: [14, 17, 32], d: [72, 120, 92] },
    ];
    const hillY = (hi: (typeof hills)[number], xn: number): number =>
      (hi.b + Math.sin(xn * 6.28 + hi.p) * hi.a) * h;
    hills.forEach((hi) => {
      ctx.fillStyle = mix(hi.n, hi.d, t);
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 12) ctx.lineTo(x, hillY(hi, x / w));
      ctx.lineTo(w, h);
      ctx.fill();
    });

    for (const ho of this.houses) {
      const hx = ho.x * w;
      const hw = ho.w * w;
      const hh = ho.h * h;
      const hy = hillY(hills[1]!, ho.x) - hh;
      ctx.fillStyle = mix([18, 22, 40], [120, 96, 84], t);
      ctx.fillRect(hx, hy, hw, hh);
      ctx.fillStyle = mix([12, 15, 30], [150, 70, 60], t);
      ctx.beginPath();
      ctx.moveTo(hx - hw * 0.12, hy);
      ctx.lineTo(hx + hw / 2, hy - ho.roof * h);
      ctx.lineTo(hx + hw * 1.12, hy);
      ctx.fill();
      const lit = Math.floor(ho.windows * Math.min(1, t * 1.4));
      for (let wi = 0; wi < ho.windows; wi++) {
        const on = wi < lit;
        ctx.fillStyle = on ? "#ffd98a" : "rgba(255,255,255,0.06)";
        if (on) {
          ctx.shadowColor = "#ffcf6b";
          ctx.shadowBlur = 8;
        }
        ctx.fillRect(hx + hw * (0.2 + wi * 0.3), hy + hh * 0.3, hw * 0.16, hh * 0.22);
        ctx.shadowBlur = 0;
      }
    }

    ctx.fillStyle = mix([9, 11, 22], [58, 92, 70], t);
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 12) ctx.lineTo(x, hillY(hills[2]!, x / w));
    ctx.lineTo(w, h);
    ctx.fill();

    this.veil(alpha);
    ctx.globalAlpha = 1;
  }

  // ── Garden in shadow ─────────────────────────────────────────────────────
  private drawGarden(alpha: number): void {
    const { ctx, w, h } = this;
    // the garden is always clearly visible (moonlit); `light` only adds warmth
    const t = 0.34 + 0.66 * this.shown;
    const now = performance.now() / 1000;
    ctx.globalAlpha = alpha;

    // moonlit dusk sky — the garden is shadowed, never pitch black
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, mix([28, 40, 66], [120, 170, 210], t));
    sky.addColorStop(0.5, mix([34, 46, 60], [210, 205, 175], t));
    sky.addColorStop(1, mix([26, 44, 40], [150, 195, 125], t));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // moon (fades as the sun/light takes over)
    if (t < 0.7) {
      const mx = w * 0.8;
      const my = h * 0.16;
      const mg = ctx.createRadialGradient(mx, my, 0, mx, my, w * 0.18);
      mg.addColorStop(0, `rgba(220,230,255,${(1 - t / 0.7) * 0.5})`);
      mg.addColorStop(1, "rgba(220,230,255,0)");
      ctx.fillStyle = mg;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = alpha * (1 - t / 0.7);
      ctx.fillStyle = "#e8eeff";
      ctx.beginPath();
      ctx.arc(mx, my, w * 0.05, 0, 6.28);
      ctx.fill();
      ctx.globalAlpha = alpha;
    }

    // a few stars
    ctx.fillStyle = "#dfe6ff";
    for (let i = 0; i < 40; i++) {
      const s = this.stars[i]!;
      ctx.globalAlpha = alpha * (1 - t) * 0.7 * (0.4 + 0.6 * Math.sin(now * 1.5 + s.ph));
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h * 0.7, s.r * 0.9, 0, 6.28);
      ctx.fill();
    }
    ctx.globalAlpha = alpha;

    // god-ray from top-right
    ctx.save();
    ctx.globalAlpha = alpha * (0.12 + 0.28 * t);
    const ray = ctx.createLinearGradient(w, 0, w * 0.3, h);
    ray.addColorStop(0, "rgba(255,240,200,0.9)");
    ray.addColorStop(1, "rgba(255,240,200,0)");
    ctx.fillStyle = ray;
    ctx.beginPath();
    ctx.moveTo(w * 0.55, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, h * 0.5);
    ctx.lineTo(w * 0.2, h);
    ctx.lineTo(w * 0.05, h);
    ctx.fill();
    ctx.restore();

    // ground
    const groundY = h * 0.74;
    ctx.fillStyle = mix([26, 46, 36], [70, 130, 74], t);
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, groundY + Math.sin(0) * 10);
    for (let x = 0; x <= w; x += 16) ctx.lineTo(x, groundY + Math.sin(x / w * 6) * 12);
    ctx.lineTo(w, h);
    ctx.fill();

    // big tree, left — canopy reaches into the upper frame
    const tx = w * 0.1;
    const ty = groundY;
    ctx.strokeStyle = mix([28, 22, 18], [90, 62, 44], t);
    ctx.lineWidth = w * 0.035;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx - w * 0.04, ty - h * 0.2, tx + w * 0.02, ty - h * 0.4);
    ctx.stroke();
    ctx.lineWidth = w * 0.014;
    for (const [ex, ey] of [
      [-0.09, -0.5],
      [0.12, -0.46],
      [0.03, -0.56],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(tx + 0.02 * w, ty - h * 0.4);
      ctx.quadraticCurveTo(tx + ex * 0.5 * w, ty + ey * 0.5 * h, tx + ex * w, ty + ey * h);
      ctx.stroke();
    }
    const canopy = mix([30, 58, 38], [92, 160, 86], t);
    const canopyLit = mix([44, 74, 48], [150, 210, 120], t);
    for (const [dx, dy, rr, lit] of [
      [-0.09, -0.5, 0.13, 0],
      [0.03, -0.58, 0.15, 1],
      [0.14, -0.48, 0.12, 1],
      [0.06, -0.4, 0.13, 0],
      [-0.03, -0.44, 0.11, 0],
      [0.18, -0.36, 0.08, 1],
    ] as const) {
      ctx.fillStyle = lit ? canopyLit : canopy;
      ctx.beginPath();
      ctx.arc(tx + dx * w, ty + dy * h, rr * w, 0, 6.28);
      ctx.fill();
    }

    // grass tufts
    ctx.strokeStyle = mix([18, 34, 24], [90, 160, 86], t);
    ctx.lineWidth = 2;
    for (let i = 0; i < 40; i++) {
      const gx = (i / 40) * w + Math.sin(i) * 6;
      const gy = groundY + Math.sin((gx / w) * 6) * 12 + 6;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.quadraticCurveTo(gx + 3, gy - 12, gx + 6, gy - 14);
      ctx.stroke();
    }

    // flowers — open with the light
    for (const fl of this.flowers) {
      const fx = fl.x * w;
      const fy = groundY + Math.sin(fl.x * 6) * 12 + fl.y * 0 + (fl.y - 0.85) * h * 0.15;
      const open = Math.min(1, t * 1.3 + fl.open * 0.3);
      ctx.strokeStyle = mix([20, 40, 26], [70, 140, 70], t);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fx, fy + 16);
      ctx.lineTo(fx, fy);
      ctx.stroke();
      const pr = 4 * fl.scale * (0.4 + 0.6 * open);
      ctx.fillStyle = `rgba(${fl.color[0]},${fl.color[1]},${fl.color[2]},${0.5 + 0.5 * open})`;
      for (let p = 0; p < 5; p++) {
        const ang = (p / 5) * 6.28 + now * 0.05;
        ctx.beginPath();
        ctx.arc(fx + Math.cos(ang) * pr, fy + Math.sin(ang) * pr, pr * 0.8, 0, 6.28);
        ctx.fill();
      }
      ctx.fillStyle = mix([120, 90, 40], [255, 220, 120], t);
      ctx.beginPath();
      ctx.arc(fx, fy, pr * 0.6, 0, 6.28);
      ctx.fill();
    }

    // fireflies — plentiful even in shadow, across the whole frame
    const fcount = Math.floor(20 + 12 * t);
    for (let i = 0; i < fcount; i++) {
      const f = this.fireflies[i % this.fireflies.length]!;
      const fx = ((f.x + now * 0.01 * f.sp + i * 0.11) % 1) * w;
      const fy = (((f.y + i * 0.03) % 0.98) + Math.sin(now * f.sp + f.ph) * 0.03) * h;
      const bl = 0.25 + 0.75 * Math.abs(Math.sin(now * 2 * f.sp + f.ph));
      ctx.globalAlpha = alpha * bl * (0.55 + 0.45 * t);
      ctx.fillStyle = "#ffe9a0";
      ctx.shadowColor = "#ffcf6b";
      ctx.shadowBlur = 9;
      ctx.beginPath();
      ctx.arc(fx, fy, 2.1, 0, 6.28);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = alpha;

    // birds gliding through the upper sky
    ctx.strokeStyle = mix([54, 58, 78], [50, 55, 78], t);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    for (let bi = 0; bi < 5; bi++) {
      const b = this.birds[bi % this.birds.length]!;
      const bx = (((b.x + now * b.sp + bi * 0.27) % 1.3) - 0.15) * w;
      const by = (0.08 + (bi % 3) * 0.07) * h + Math.sin(now * 0.6 + b.ph + bi) * 10;
      const flap = Math.sin(now * 5 + b.ph + bi * 2) * 6;
      ctx.beginPath();
      ctx.moveTo(bx - 10, by + flap);
      ctx.quadraticCurveTo(bx, by - 5, bx, by);
      ctx.quadraticCurveTo(bx, by - 5, bx + 10, by + flap);
      ctx.stroke();
    }

    // a couple of butterflies fluttering mid-frame
    for (let k = 0; k < 2; k++) {
      const bx = (0.3 + 0.4 * k + 0.12 * Math.sin(now * 0.5 + k * 3)) * w;
      const by = (0.4 + 0.15 * Math.sin(now * 0.8 + k * 2) + 0.1 * k) * h;
      const wing = Math.abs(Math.sin(now * 9 + k)) * 6 + 3;
      ctx.fillStyle = k === 0 ? mix([120, 80, 140], [255, 150, 200], t) : mix([90, 120, 60], [255, 210, 120], t);
      ctx.globalAlpha = alpha * 0.9;
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(bx + sgn * wing * 0.6, by, wing, wing * 1.3, sgn * 0.5, 0, 6.28);
        ctx.fill();
      }
      ctx.globalAlpha = alpha;
    }

    this.veil(alpha * 0.5);
    ctx.globalAlpha = 1;
  }

  private veil(alpha: number): void {
    const { ctx, w, h } = this;
    const t = this.shown;
    const v = ctx.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, `rgba(6,8,18,${(0.5 - 0.22 * t) * alpha})`);
    v.addColorStop(0.5, `rgba(6,8,18,${(0.24 - 0.12 * t) * alpha})`);
    v.addColorStop(1, `rgba(6,8,18,${(0.55 - 0.16 * t) * alpha})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }
}
