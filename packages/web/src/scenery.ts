/**
 * The living backdrop. One canvas behind everything, drawn as layered scenery
 * whose mood is driven by a single `light` value (0 = deep night, 1 = warm
 * dawn). As the player earns stars the world visibly wakes up: the sky warms,
 * the sun rises, stars fade, hills green, and the village windows light one by
 * one.
 */

interface Hill {
  amp: number;
  base: number;
  phase: number;
  nightColor: [number, number, number];
  dayColor: [number, number, number];
}
interface House {
  x: number;
  w: number;
  h: number;
  roof: number;
  windows: number;
}
interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  ph: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const mix = (a: [number, number, number], b: [number, number, number], t: number): string =>
  `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(
    lerp(a[2], b[2], t),
  )})`;

export class Scenery {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private light = 0;
  private shown = 0; // eased toward `light`
  private w = 0;
  private h = 0;
  private raf = 0;

  private stars: Array<{ x: number; y: number; r: number; ph: number }> = [];
  private hills: Hill[] = [];
  private houses: House[] = [];
  private motes: Mote[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.seed();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    const loop = (): void => {
      this.shown += (this.light - this.shown) * 0.04;
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  setLight(v: number): void {
    this.light = Math.max(0, Math.min(1, v));
  }

  private seed(): void {
    for (let i = 0; i < 90; i++) {
      this.stars.push({ x: Math.random(), y: Math.random() * 0.55, r: Math.random() * 1.4 + 0.3, ph: Math.random() * 6 });
    }
    this.hills = [
      { amp: 0.04, base: 0.62, phase: 1.1, nightColor: [26, 30, 54], dayColor: [150, 189, 150] },
      { amp: 0.06, base: 0.72, phase: 3.4, nightColor: [20, 24, 44], dayColor: [110, 165, 120] },
      { amp: 0.09, base: 0.85, phase: 0.4, nightColor: [14, 17, 32], dayColor: [72, 120, 92] },
    ];
    for (let i = 0; i < 7; i++) {
      this.houses.push({
        x: 0.12 + i * 0.11 + Math.random() * 0.02,
        w: 0.05 + Math.random() * 0.03,
        h: 0.05 + Math.random() * 0.05,
        roof: 0.02 + Math.random() * 0.02,
        windows: 1 + Math.floor(Math.random() * 3),
      });
    }
    for (let i = 0; i < 26; i++) {
      this.motes.push({
        x: Math.random(),
        y: Math.random(),
        vx: (Math.random() - 0.5) * 0.00006,
        vy: -Math.random() * 0.00008 - 0.00002,
        r: Math.random() * 1.6 + 0.6,
        ph: Math.random() * 6,
      });
    }
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

  private hillY(hill: Hill, xNorm: number): number {
    return (hill.base + Math.sin(xNorm * 6.28 + hill.phase) * hill.amp) * this.h;
  }

  private draw(): void {
    const { ctx, w, h } = this;
    const t = this.shown;
    const now = performance.now() / 1000;

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, mix([8, 10, 24], [255, 214, 170], t));
    sky.addColorStop(0.45, mix([12, 16, 34], [255, 170, 120], t));
    sky.addColorStop(1, mix([16, 20, 40], [126, 176, 214], t));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // stars
    if (t < 0.85) {
      ctx.fillStyle = "#fff";
      for (const s of this.stars) {
        const tw = 0.5 + 0.5 * Math.sin(now * 1.5 + s.ph);
        ctx.globalAlpha = (1 - t / 0.85) * 0.8 * tw;
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r, 0, 6.28);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // sun / moon
    const sunX = w * 0.78;
    const sunY = lerp(h * 0.78, h * 0.2, Math.min(1, t / 0.9));
    const sunR = w * 0.06;
    const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 5);
    glow.addColorStop(0, mix([220, 226, 245], [255, 224, 150], t) + "");
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.4 * t;
    const rg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 6);
    rg.addColorStop(0, mix([200, 210, 240], [255, 220, 140], t));
    rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    void glow;
    ctx.fillStyle = mix([214, 220, 240], [255, 233, 170], t);
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, 6.28);
    ctx.fill();

    // hills
    this.hills.forEach((hill) => {
      ctx.fillStyle = mix(hill.nightColor, hill.dayColor, t);
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 12) ctx.lineTo(x, this.hillY(hill, x / w));
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    });

    // village on the middle hill
    const villageBase = this.hillY(this.hills[1]!, 0.5);
    for (const house of this.houses) {
      const hx = house.x * w;
      const hw = house.w * w;
      const hh = house.h * h;
      const hy = this.hillY(this.hills[1]!, house.x) - hh;
      ctx.fillStyle = mix([18, 22, 40], [120, 96, 84], t);
      ctx.fillRect(hx, hy, hw, hh);
      ctx.fillStyle = mix([12, 15, 30], [150, 70, 60], t);
      ctx.beginPath();
      ctx.moveTo(hx - hw * 0.12, hy);
      ctx.lineTo(hx + hw / 2, hy - house.roof * h);
      ctx.lineTo(hx + hw * 1.12, hy);
      ctx.closePath();
      ctx.fill();
      // windows light up with `t`
      const lit = Math.floor(house.windows * Math.min(1, t * 1.4));
      for (let wi = 0; wi < house.windows; wi++) {
        const wx = hx + hw * (0.2 + wi * 0.3);
        const wy = hy + hh * 0.3;
        const on = wi < lit;
        ctx.fillStyle = on ? "#ffd98a" : "rgba(255,255,255,0.06)";
        if (on) {
          ctx.shadowColor = "#ffcf6b";
          ctx.shadowBlur = 8;
        }
        ctx.fillRect(wx, wy, hw * 0.16, hh * 0.22);
        ctx.shadowBlur = 0;
      }
    }
    void villageBase;

    // foreground hill (content sits above this)
    ctx.fillStyle = mix([9, 11, 22], [58, 92, 70], t);
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 12) ctx.lineTo(x, this.hillY(this.hills[2]!, x / w));
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // light motes drifting up
    for (const m of this.motes) {
      m.x += m.vx * 16;
      m.y += m.vy * 16;
      if (m.y < -0.02) {
        m.y = 1.02;
        m.x = Math.random();
      }
      const fl = 0.4 + 0.6 * Math.sin(now * 2 + m.ph);
      ctx.globalAlpha = (0.15 + 0.5 * t) * fl;
      ctx.fillStyle = mix([170, 190, 255], [255, 214, 140], t);
      ctx.beginPath();
      ctx.arc(m.x * w, m.y * h, m.r, 0, 6.28);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // gentle top-down darkening so UI text stays readable
    const veil = ctx.createLinearGradient(0, 0, 0, h);
    veil.addColorStop(0, `rgba(6,8,18,${0.5 - 0.2 * t})`);
    veil.addColorStop(0.5, `rgba(6,8,18,${0.28 - 0.14 * t})`);
    veil.addColorStop(1, `rgba(6,8,18,${0.55 - 0.15 * t})`);
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, w, h);
  }
}
