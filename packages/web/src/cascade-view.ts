/**
 * Kaskade view: a large board on the left, a wide conveyor belt on the right.
 * Drag shards off the belt (or the hold slot) onto the board with one finger.
 */

import { cssVar } from "./colors.js";
import { CascadeState, type Pos, type Shard } from "./cascade.js";
import { boardGrid, drawPieceBody, roundRect } from "./render.js";
import { sfx } from "./sfx.js";
import { shardByColorIndex, shardDef } from "./shards.js";

const TAP_MOVE_PX = 10;
const TAP_TIME_MS = 300;

interface Layout {
  cssW: number;
  cssH: number;
  boardX: number;
  boardY: number;
  cell: number;
  beltX: number;
  beltW: number;
  beltTop: number;
  beltH: number;
  holdY: number;
  holdSize: number;
  bandH: number;
  shardCell: number;
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  max: number;
  color: string;
  size: number;
  rot: number;
  spin: number;
}
interface Drag {
  shard: Shard;
  from: "belt" | "hold";
  px: number;
  py: number;
  sx: number;
  sy: number;
  t0: number;
  moved: boolean;
  grabR: number;
  grabC: number;
}

export interface CascadeCallbacks {
  onEnd: (result: ReturnType<CascadeState["result"]>) => void;
  onHud: (s: { score: number; mult: number; cleared: number; ms: number; lives: number }) => void;
}

export class CascadeView {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private wrap: HTMLElement;
  private game: CascadeState;
  private cb: CascadeCallbacks;

  private layout: Layout | null = null;
  /** `computeLayout` erzwingt einen Reflow (DOM-Reads). Nur neu rechnen, wenn
   *  sich Viewport oder Challenge-Band ändern — nicht pro Frame. */
  private layoutDirty = true;
  private drag: Drag | null = null;
  private running = false;
  private raf = 0;
  private last = 0;
  private flash: { row: number; t: number }[] = [];
  private sparks: Spark[] = [];
  /** short-lived "+N" score pops */
  private pops: { x: number; y: number; t: number; text: string; color: string }[] = [];
  private placePop: { r: number; c: number; t: number } | null = null;
  private ended = false;
  /** alle Brettzellen als [r,c] — für das gecachte Leer-Raster (einmal gebaut) */
  private readonly gridCells: ReadonlyArray<readonly [number, number]>;

  constructor(canvas: HTMLCanvasElement, wrap: HTMLElement, game: CascadeState, cb: CascadeCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.wrap = wrap;
    this.game = game;
    this.cb = cb;
    const cells: [number, number][] = [];
    for (let r = 0; r < game.rows; r++) for (let c = 0; c < game.cols; c++) cells.push([r, c]);
    this.gridCells = cells;
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    window.addEventListener("resize", this.kick);
    window.visualViewport?.addEventListener("resize", this.kick);
    this.start();
  }

  destroy(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointercancel", this.onUp);
    window.removeEventListener("resize", this.kick);
    window.visualViewport?.removeEventListener("resize", this.kick);
  }

  private start(): void {
    this.running = true;
    this.last = performance.now();
    const loop = (ts: number): void => {
      if (!this.running) return;
      const dt = Math.min(0.05, (ts - this.last) / 1000);
      this.last = ts;
      this.step(dt);
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    let fbTs = performance.now();
    const fb = (): void => {
      if (!this.running) return;
      const now = performance.now();
      if (now - this.last > 240) {
        this.step(Math.min(0.05, (now - fbTs) / 1000));
        this.render();
      }
      fbTs = now;
      window.setTimeout(fb, 140);
    };
    window.setTimeout(fb, 140);
  }

  private kick = (): void => {
    this.layoutDirty = true;
    this.render();
  };

  private step(dt: number): void {
    this.game.tick(dt);
    this.flash = this.flash.filter((f) => (f.t += dt) < 0.5);
    for (const s of this.sparks) {
      s.t += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 260 * dt; // gentle gravity
      s.vx *= 1 - dt * 1.5;
      s.rot += s.spin * dt;
    }
    this.sparks = this.sparks.filter((s) => s.t < s.max);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 0.8);
    if (this.placePop && (this.placePop.t += dt) > 0.28) this.placePop = null;

    const clear = this.game.consumeFreshClear();
    if (clear && this.layout) {
      const L = this.layout;
      for (const r of clear.rows) {
        this.flash.push({ row: r, t: 0 });
        this.spawnRowBurst(r, L);
      }
      if (clear.rows.length > 0) sfx.rowClear(clear.rows.length);
      if (clear.gain >= 12 && clear.rows.length > 0) {
        this.pops.push({
          x: L.boardX + (this.game.cols * L.cell) / 2,
          y: L.boardY + (clear.rows[0]! + 0.2) * L.cell,
          t: 0,
          text: `+${clear.gain.toLocaleString("de-DE")}`,
          color: cssVar("--gold"),
        });
      }
      sfx.vibrate(24);
    }
    if (this.game.isOver && !this.ended) {
      this.ended = true;
      this.game.finish();
      if (this.game.lives <= 0) sfx.fail();
      else sfx.win(2);
      this.cb.onEnd(this.game.result());
    }
    this.cb.onHud({
      score: Math.round(this.game.score),
      mult: this.game.multiplier,
      cleared: this.game.cleared,
      ms: this.game.remainingMs(),
      lives: this.game.lives,
    });
  }

  // ── Layout — the board is as big as the width allows ────────────────────
  private computeLayout(): Layout {
    const cssW = this.wrap.clientWidth || 340;
    // Wrap noch nicht vermessen → nächsten Frame erneut rechnen
    if (!this.wrap.clientWidth) this.layoutDirty = true;
    const viewportH = window.visualViewport?.height ?? window.innerHeight;
    const pad = 10;

    // narrower and with a smaller hold slot than before — a leaner, more
    // elongated conveyor with a longer visible travel path
    const beltW = Math.round(Math.max(62, Math.min(90, cssW * 0.21)));
    const boardAreaW = cssW - beltW - pad * 3;
    // the challenge banner reserves a band above the board (see #k-wrap.has-challenge)
    const chalBand = this.wrap.classList.contains("has-challenge") ? 46 : 0;
    const maxH = Math.max(320, viewportH - 216 - chalBand); // hud rows + lives strip + pad + banner

    const cell = Math.max(
      22,
      Math.floor(Math.min(boardAreaW / this.game.cols, maxH / this.game.rows)),
    );
    const boardW = cell * this.game.cols;
    const boardH = cell * this.game.rows;
    const boardX = pad + (boardAreaW - boardW) / 2;
    const boardY = pad;

    const beltX = cssW - beltW - pad;
    const beltTop = pad;
    const holdSize = Math.round(beltW * 0.8);
    const beltH = boardH - holdSize - 10;
    const holdY = beltTop + beltH + 10;

    const cssH = boardH + pad * 2;
    const bandH = beltH / 3.15;
    const shardCell = Math.max(11, Math.min(bandH / 4.2, beltW / 4.2));

    return {
      cssW,
      cssH,
      boardX,
      boardY,
      cell,
      beltX,
      beltW,
      beltTop,
      beltH,
      holdY,
      holdSize,
      bandH,
      shardCell,
    };
  }

  /** Screen y for each belt shard, sorted, with a guaranteed minimum gap. */
  private beltRows(L: Layout): Array<{ shard: Shard; cy: number }> {
    const rawCy = (y: number) =>
      L.beltTop + L.bandH / 2 + Math.max(0, Math.min(1, y)) * (L.beltH - L.bandH);
    const sorted = [...this.game.belt].sort((a, b) => a.y - b.y);
    let last = -Infinity;
    return sorted.map((shard) => {
      const cy = Math.max(rawCy(shard.y), last + L.bandH);
      last = cy;
      return { shard, cy };
    });
  }

  /** A burst of little four-point stars along a row that just cleared. */
  private spawnRowBurst(row: number, L: Layout): void {
    const gold = cssVar("--gold");
    const y = L.boardY + (row + 0.5) * L.cell;
    const n = 20;
    for (let i = 0; i < n; i++) {
      const x = L.boardX + ((i + 0.5) / n) * this.game.cols * L.cell + (Math.random() - 0.5) * L.cell;
      const ang = Math.random() * Math.PI * 2;
      const sp = 70 + Math.random() * 220;
      this.sparks.push({
        x,
        y: y + (Math.random() - 0.5) * L.cell * 0.6,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 60,
        t: 0,
        max: 0.45 + Math.random() * 0.45,
        color: i % 3 === 0 ? "#ffffff" : i % 3 === 1 ? gold : "#ffe08a",
        size: 3 + Math.random() * 4.5,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 14,
      });
    }
  }

  private drawStar(x: number, y: number, r: number, rot: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = rot + (i * Math.PI) / 4;
      const rad = i % 2 === 0 ? r : r * 0.4;
      const px = x + Math.cos(a) * rad;
      const py = y + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  // ── Render ───────────────────────────────────────────────────────────────
  private render(): void {
    if (this.layoutDirty || !this.layout) {
      this.layoutDirty = false;
      this.layout = this.computeLayout();
    }
    const L = this.layout;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(L.cssW * dpr);
    const h = Math.round(L.cssH * dpr);
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.canvas.style.height = `${L.cssH}px`;
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, L.cssW, L.cssH);

    // leeres Brett-Raster: einmal gebaut, danach nur noch als Bild geblittet
    const grid = boardGrid(this.gridCells, L.cell, dpr, cssVar("--cell"));
    ctx.drawImage(grid.canvas, L.boardX, L.boardY, grid.w, grid.h);
    ctx.strokeStyle = cssVar("--board-edge");
    ctx.lineWidth = 3;
    roundRect(
      ctx,
      L.boardX - 3,
      L.boardY - 3,
      this.game.cols * L.cell + 6,
      this.game.rows * L.cell + 6,
      12,
    );
    ctx.stroke();

    // filled cells — the just-placed piece gets a quick pop
    for (let r = 0; r < this.game.rows; r++) {
      for (let c = 0; c < this.game.cols; c++) {
        const v = this.game.board[r * this.game.cols + c];
        if (v && v > 0) {
          const pp = this.placePop;
          let opts: { scale: number; glow: number } | undefined;
          if (pp && r === pp.r && c >= pp.c && c < pp.c + 4 && r < pp.r + 3) {
            opts = { scale: 1 + 0.14 * Math.sin((pp.t / 0.28) * Math.PI), glow: 10 };
          }
          drawPieceBody(ctx, [[r, c]], L.boardX, L.boardY, L.cell, shardByColorIndex(v).color, opts);
        }
      }
    }

    // a cleared row: a bright bar sweeping outward, then it's gone
    for (const f of this.flash) {
      const p = f.t / 0.5;
      const y = L.boardY + f.row * L.cell;
      const w = this.game.cols * L.cell;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createLinearGradient(L.boardX, y, L.boardX + w, y);
      const a = (1 - p) * 0.9;
      g.addColorStop(0, `rgba(255,255,255,0)`);
      g.addColorStop(0.5, `rgba(255,240,190,${a})`);
      g.addColorStop(1, `rgba(255,255,255,0)`);
      ctx.fillStyle = g;
      const bh = L.cell * (1 + p * 0.6);
      ctx.fillRect(L.boardX, y - (bh - L.cell) / 2, w, bh);
      ctx.restore();
    }

    // star sparks from row clears — „lighter" gibt schon Glühen, kein shadowBlur
    if (this.sparks.length) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const s of this.sparks) {
        const k = 1 - s.t / s.max;
        ctx.globalAlpha = Math.max(0, k);
        ctx.fillStyle = s.color;
        this.drawStar(s.x, s.y, s.size * (0.5 + k * 0.7), s.rot);
      }
      ctx.restore();
    }

    // "+N" score pops
    for (const pop of this.pops) {
      const k = pop.t / 0.8;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.fillStyle = pop.color;
      ctx.font = `800 ${Math.round(L.cell * 0.6)}px "Baloo 2", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 4;
      ctx.fillText(pop.text, pop.x, pop.y - k * L.cell * 1.4);
      ctx.restore();
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    // belt
    ctx.fillStyle = cssVar("--surface-2");
    roundRect(ctx, L.beltX, L.beltTop, L.beltW, L.beltH, 16);
    ctx.fill();
    ctx.strokeStyle = cssVar("--hairline");
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    for (let i = 1; i < 3; i++) {
      const y = L.beltTop + i * (L.beltH / 3);
      ctx.beginPath();
      ctx.moveTo(L.beltX + 8, y);
      ctx.lineTo(L.beltX + L.beltW - 8, y);
      ctx.stroke();
    }
    for (const { shard, cy } of this.beltRows(L)) {
      if (this.drag && this.drag.shard.id === shard.id) continue;
      this.drawShard(shard, L.beltX + L.beltW / 2, cy, L.shardCell);
    }

    // hold slot
    ctx.fillStyle = cssVar("--surface");
    roundRect(ctx, L.beltX, L.holdY, L.holdSize, L.holdSize, 16);
    ctx.fill();
    ctx.strokeStyle = cssVar("--hairline");
    ctx.stroke();
    if (this.game.hold && !(this.drag && this.drag.from === "hold")) {
      this.drawShard(this.game.hold, L.beltX + L.holdSize / 2, L.holdY + L.holdSize / 2, L.holdSize * 0.3);
    } else if (!(this.drag && this.drag.from === "hold")) {
      ctx.fillStyle = cssVar("--ink-dim");
      ctx.font = `700 ${Math.round(L.holdSize * 0.15)}px "Hanken Grotesk", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Halten", L.beltX + L.holdSize / 2, L.holdY + L.holdSize / 2);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }

    if (this.drag) this.drawDrag(L);
  }

  private drawShard(shard: Shard, cx: number, cy: number, cell: number, selected = false): void {
    const cells = this.game.cells(shard);
    let maxR = 0;
    let maxC = 0;
    let minR = 9;
    let minC = 9;
    for (const [r, c] of cells) {
      maxR = Math.max(maxR, r);
      maxC = Math.max(maxC, c);
      minR = Math.min(minR, r);
      minC = Math.min(minC, c);
    }
    const w = (maxC - minC + 1) * cell;
    const hh = (maxR - minR + 1) * cell;
    drawPieceBody(
      this.ctx,
      cells.map(([r, c]) => [r - minR, c - minC] as [number, number]),
      cx - w / 2,
      cy - hh / 2,
      cell,
      shardDef(shard.name).color,
      selected ? { selected: true } : undefined,
    );
  }

  private drawDrag(L: Layout): void {
    const d = this.drag!;
    const snap = this.snappedFor(d, L);
    if (this.overBoard(d.px, d.py, L)) {
      const ok = this.game.canPlace(d.shard, snap);
      const cells = this.game
        .cells(d.shard)
        .map(([r, c]) => [r + snap.row, c + snap.col] as [number, number]);
      drawPieceBody(this.ctx, cells, L.boardX, L.boardY, L.cell, shardDef(d.shard.name).color, {
        alpha: ok ? 0.96 : 0.55,
        scale: 1.03,
        glow: ok ? 20 : 6,
        tint: ok ? undefined : "#ff4d4d",
        selected: ok,
      });
    } else {
      // big, follows the finger
      this.drawShard(d.shard, d.px, d.py - L.cell * 0.3, L.cell * 1.05, true);
    }
  }

  // ── Input ────────────────────────────────────────────────────────────────
  private pt(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  private overBoard(x: number, y: number, L: Layout): boolean {
    return (
      x >= L.boardX - L.cell * 0.6 &&
      y >= L.boardY - L.cell * 0.6 &&
      x < L.boardX + L.cell * (this.game.cols + 0.6) &&
      y < L.boardY + L.cell * (this.game.rows + 0.6)
    );
  }
  private boardCell(x: number, y: number, L: Layout): Pos {
    return {
      row: Math.round((y - L.boardY - L.cell / 2) / L.cell),
      col: Math.round((x - L.boardX - L.cell / 2) / L.cell),
    };
  }
  private snappedFor(d: Drag, L: Layout): Pos {
    const t = this.boardCell(d.px, d.py, L);
    return { row: t.row - d.grabR, col: t.col - d.grabC };
  }

  private centroid(shard: Shard): { r: number; c: number } {
    const cells = this.game.cells(shard);
    let sr = 0;
    let sc = 0;
    for (const [r, c] of cells) {
      sr += r;
      sc += c;
    }
    return { r: Math.round(sr / cells.length), c: Math.round(sc / cells.length) };
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.layout || this.game.isOver || this.game.isPaused) return;
    const L = this.layout;
    const { x, y } = this.pt(e);
    this.game.start();

    let shard: Shard | null = null;
    let from: "belt" | "hold" = "belt";

    // hold slot?
    if (
      this.game.hold &&
      x >= L.beltX - 20 &&
      y >= L.holdY - 12 &&
      y <= L.holdY + L.holdSize + 12
    ) {
      shard = this.game.hold;
      from = "hold";
    } else if (x >= L.beltX - 28) {
      // anywhere in (or just left of) the belt column → nearest shard
      const rows = this.beltRows(L);
      let best = Infinity;
      for (const row of rows) {
        const dist = Math.abs(y - row.cy);
        if (dist < best) {
          best = dist;
          shard = row.shard;
        }
      }
    }
    if (!shard) return;

    this.canvas.setPointerCapture(e.pointerId);
    const cen = this.centroid(shard);
    this.drag = {
      shard,
      from,
      px: x,
      py: y,
      sx: x,
      sy: y,
      t0: performance.now(),
      moved: false,
      grabR: cen.r,
      grabC: cen.c,
    };
    sfx.pickUp();
    sfx.vibrate(8); // a tiny tick when a shard is picked up
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.drag) return;
    const { x, y } = this.pt(e);
    this.drag.px = x;
    this.drag.py = y;
    if (Math.hypot(x - this.drag.sx, y - this.drag.sy) > TAP_MOVE_PX) this.drag.moved = true;
  };

  private onUp = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || !this.layout) return;
    this.drag = null;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    const L = this.layout;

    // tap → rotate the shard in place
    if (!d.moved && performance.now() - d.t0 < TAP_TIME_MS) {
      this.game.rotate(d.shard);
      sfx.pickUp();
      return;
    }

    if (this.overBoard(d.px, d.py, L)) {
      const snap = this.snappedFor(d, L);
      const rows = this.game.place(d.shard, snap);
      if (rows >= 0) {
        if (d.from === "belt") this.game.removeFromBelt(d.shard.id);
        else this.game.hold = null;
        sfx.place();
        sfx.vibrate(8);
        this.placePop = { r: snap.row, c: snap.col, t: 0 };
        // the burst / flash / "+N" pop are spawned in step() via consumeFreshClear
        return;
      }
    }
    // couldn't place → send to hold (from belt) or keep in hold
    if (d.from === "belt") {
      this.game.toHold(d.shard);
      sfx.invalid();
    }
  };
}
