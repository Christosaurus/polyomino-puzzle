/**
 * Kaskade view: a large board on the left, a wide conveyor belt on the right.
 * Drag shards off the belt (or the hold slot) onto the board with one finger.
 */

import { PIECE_COLORS, PIECE_NAMES, cssVar } from "./colors.js";
import { CascadeState, type Pos, type Shard } from "./cascade.js";
import { drawPieceBody, drawWell, roundRect } from "./render.js";
import { sfx } from "./sfx.js";

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
  onHud: (s: { score: number; mult: number; cleared: number; ms: number }) => void;
}

export class CascadeView {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private wrap: HTMLElement;
  private game: CascadeState;
  private cb: CascadeCallbacks;

  private layout: Layout | null = null;
  private drag: Drag | null = null;
  private running = false;
  private raf = 0;
  private last = 0;
  private flash: { row: number; t: number }[] = [];
  private ended = false;

  constructor(canvas: HTMLCanvasElement, wrap: HTMLElement, game: CascadeState, cb: CascadeCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.wrap = wrap;
    this.game = game;
    this.cb = cb;
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

  private kick = (): void => this.render();

  private step(dt: number): void {
    this.game.tick(dt);
    this.flash = this.flash.filter((f) => (f.t += dt) < 0.55);
    if (this.game.isOver && !this.ended) {
      this.ended = true;
      this.game.finish();
      sfx.win();
      this.cb.onEnd(this.game.result());
    }
    this.cb.onHud({
      score: Math.round(this.game.score),
      mult: this.game.multiplier,
      cleared: this.game.cleared,
      ms: this.game.remainingMs(),
    });
  }

  // ── Layout — the board is as big as the width allows ────────────────────
  private computeLayout(): Layout {
    const cssW = this.wrap.clientWidth || 340;
    const viewportH = window.visualViewport?.height ?? window.innerHeight;
    const pad = 10;

    const beltW = Math.round(Math.max(70, Math.min(100, cssW * 0.24)));
    const boardAreaW = cssW - beltW - pad * 3;
    const maxH = Math.max(320, viewportH - 184);

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
    const holdSize = beltW;
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

  // ── Render ───────────────────────────────────────────────────────────────
  private render(): void {
    const L = this.computeLayout();
    this.layout = L;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = Math.round(L.cssW * dpr);
    const h = Math.round(L.cssH * dpr);
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.canvas.style.height = `${L.cssH}px`;
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, L.cssW, L.cssH);

    // board wells
    const wellFill = cssVar("--cell");
    for (let r = 0; r < this.game.rows; r++) {
      for (let c = 0; c < this.game.cols; c++) {
        drawWell(ctx, L.boardX + c * L.cell, L.boardY + r * L.cell, L.cell, wellFill);
      }
    }
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

    // filled cells
    for (let r = 0; r < this.game.rows; r++) {
      for (let c = 0; c < this.game.cols; c++) {
        const v = this.game.board[r * this.game.cols + c];
        if (v && v > 0) {
          drawPieceBody(ctx, [[r, c]], L.boardX, L.boardY, L.cell, PIECE_COLORS[PIECE_NAMES[v - 1]!]);
        }
      }
    }
    for (const f of this.flash) {
      ctx.save();
      ctx.globalAlpha = (1 - f.t / 0.55) * 0.95;
      ctx.fillStyle = "#fff6d8";
      ctx.fillRect(L.boardX, L.boardY + f.row * L.cell, this.game.cols * L.cell, L.cell);
      ctx.restore();
    }

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

  private drawShard(shard: Shard, cx: number, cy: number, cell: number): void {
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
      PIECE_COLORS[shard.name],
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
      drawPieceBody(this.ctx, cells, L.boardX, L.boardY, L.cell, PIECE_COLORS[d.shard.name], {
        alpha: ok ? 0.96 : 0.55,
        scale: 1.03,
        glow: ok ? 20 : 6,
        tint: ok ? undefined : "#ff4d4d",
      });
    } else {
      // big, follows the finger
      this.drawShard(d.shard, d.px, d.py - L.cell * 0.3, L.cell * 1.05);
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
        navigator.vibrate?.(rows > 0 ? 24 : 8);
        for (const r of this.game.lastCleared) this.flash.push({ row: r, t: 0 });
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
