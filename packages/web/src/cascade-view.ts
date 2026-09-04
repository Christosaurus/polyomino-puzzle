/**
 * Canvas view for Kaskade: board on the left, conveyor belt on the right.
 * Drag shards off the belt (or the hold slot) onto the board.
 */

import { PENTOMINOES, type PentominoName } from "@polyomino/puzzle-core";
import { CascadeState, type Pos, type Shard } from "./cascade.js";
import { PIECE_COLORS, PIECE_NAMES, cssVar } from "./colors.js";
import { drawPieceBody, drawWell, roundRect } from "./render.js";
import { sfx } from "./sfx.js";

const TAP_MOVE_PX = 9;
const TAP_TIME_MS = 320;

interface Layout {
  cssWidth: number;
  cssHeight: number;
  boardX: number;
  boardY: number;
  cell: number;
  beltX: number;
  beltW: number;
  beltTop: number;
  beltH: number;
  holdY: number;
  holdSize: number;
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
      if (now - this.last > 260) {
        this.step(Math.min(0.05, (now - fbTs) / 1000));
        this.render();
      }
      fbTs = now;
      window.setTimeout(fb, 150);
    };
    window.setTimeout(fb, 150);
  }

  private kick = (): void => this.render();

  private step(dt: number): void {
    this.game.tick(dt);
    this.flash = this.flash.filter((f) => (f.t += dt) < 0.5);
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

  // ── Layout ───────────────────────────────────────────────────────────────
  private computeLayout(): Layout {
    const cssWidth = this.wrap.clientWidth || 320;
    const viewportH = window.visualViewport?.height ?? window.innerHeight;
    const pad = 12;

    const beltW = Math.max(46, Math.min(64, cssWidth * 0.17));
    const boardAreaW = cssWidth - beltW - pad * 3;
    const maxBoardH = Math.max(220, viewportH - 210);

    const cell = Math.max(
      18,
      Math.floor(Math.min(boardAreaW / this.game.cols, maxBoardH / this.game.rows, 46)),
    );
    const boardW = cell * this.game.cols;
    const boardH = cell * this.game.rows;
    const boardX = pad + (boardAreaW - boardW) / 2;
    const boardY = pad;

    const beltX = cssWidth - beltW - pad;
    const beltTop = pad;
    const holdSize = beltW;
    const beltH = boardH - holdSize - 8;
    const holdY = beltTop + beltH + 8;

    const cssHeight = boardH + pad * 2;

    return {
      cssWidth,
      cssHeight,
      boardX,
      boardY,
      cell,
      beltX,
      beltW,
      beltTop,
      beltH,
      holdY,
      holdSize,
    };
  }

  // ── Render ───────────────────────────────────────────────────────────────
  private render(): void {
    const L = this.computeLayout();
    this.layout = L;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    if (this.canvas.width !== Math.round(L.cssWidth * dpr)) this.canvas.width = Math.round(L.cssWidth * dpr);
    if (this.canvas.height !== Math.round(L.cssHeight * dpr)) this.canvas.height = Math.round(L.cssHeight * dpr);
    this.canvas.style.height = `${L.cssHeight}px`;
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, L.cssWidth, L.cssHeight);

    // board wells
    const wellFill = cssVar("--cell");
    for (let r = 0; r < this.game.rows; r++) {
      for (let c = 0; c < this.game.cols; c++) {
        drawWell(ctx, L.boardX + c * L.cell, L.boardY + r * L.cell, L.cell, wellFill);
      }
    }
    // board frame
    ctx.strokeStyle = cssVar("--board-edge");
    ctx.lineWidth = 3;
    roundRect(ctx, L.boardX - 3, L.boardY - 3, this.game.cols * L.cell + 6, this.game.rows * L.cell + 6, 10);
    ctx.stroke();

    // filled cells
    for (let r = 0; r < this.game.rows; r++) {
      for (let c = 0; c < this.game.cols; c++) {
        const v = this.game.board[r * this.game.cols + c];
        if (v && v > 0) {
          const name = PIECE_NAMES[v - 1]!;
          drawPieceBody(ctx, [[r, c]], L.boardX, L.boardY, L.cell, PIECE_COLORS[name], { depth: 0.16 });
        }
      }
    }
    // row-clear flash
    for (const f of this.flash) {
      ctx.save();
      ctx.globalAlpha = (1 - f.t / 0.5) * 0.9;
      ctx.fillStyle = "#fff6d8";
      ctx.fillRect(L.boardX, L.boardY + f.row * L.cell, this.game.cols * L.cell, L.cell);
      ctx.restore();
    }

    // belt track
    ctx.fillStyle = cssVar("--surface-2");
    roundRect(ctx, L.beltX, L.beltTop, L.beltW, L.beltH, 14);
    ctx.fill();
    ctx.strokeStyle = cssVar("--hairline");
    ctx.lineWidth = 1;
    ctx.stroke();

    const belt = this.beltMetrics(L);
    // faint band guides
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    for (let i = 1; i < 3; i++) {
      const y = L.beltTop + i * (L.beltH / 3);
      ctx.beginPath();
      ctx.moveTo(L.beltX + 6, y);
      ctx.lineTo(L.beltX + L.beltW - 6, y);
      ctx.stroke();
    }
    for (const s of this.game.belt) {
      if (this.drag && this.drag.shard.id === s.id) continue;
      this.drawShardCentered(s, L.beltX + L.beltW / 2, belt.cy(s.y), belt.shardCell);
    }

    // hold slot
    ctx.fillStyle = cssVar("--surface");
    roundRect(ctx, L.beltX, L.holdY, L.holdSize, L.holdSize, 14);
    ctx.fill();
    ctx.strokeStyle = cssVar("--hairline");
    ctx.stroke();
    ctx.fillStyle = cssVar("--ink-dim");
    ctx.font = `600 ${Math.round(L.holdSize * 0.16)}px "Hanken Grotesk", sans-serif`;
    ctx.textAlign = "center";
    if (this.game.hold && !(this.drag && this.drag.from === "hold")) {
      this.drawShardCentered(this.game.hold, L.beltX + L.holdSize / 2, L.holdY + L.holdSize / 2, L.holdSize * 0.28);
    } else if (!this.drag || this.drag.from !== "hold") {
      ctx.fillText("Halten", L.beltX + L.holdSize / 2, L.holdY + L.holdSize / 2 + 4);
    }
    ctx.textAlign = "left";

    // drag ghost
    if (this.drag) this.drawDrag(L);
  }

  private beltMetrics(L: Layout): { bandH: number; shardCell: number; cy: (y: number) => number } {
    const bandH = L.beltH / 3.2;
    const shardCell = Math.max(7, Math.min(bandH / 5.2, L.beltW / 5.2));
    return {
      bandH,
      shardCell,
      cy: (y: number) => L.beltTop + bandH / 2 + y * (L.beltH - bandH),
    };
  }

  private drawShardCentered(shard: Shard, cx: number, cy: number, cell: number): void {
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
    const h = (maxR - minR + 1) * cell;
    drawPieceBody(
      this.ctx,
      cells.map(([r, c]) => [r - minR, c - minC] as [number, number]),
      cx - w / 2,
      cy - h / 2,
      cell,
      PIECE_COLORS[shard.name],
      { depth: 0.2 },
    );
  }

  private drawDrag(L: Layout): void {
    const d = this.drag!;
    const snapped = this.snapped(L);
    if (snapped && this.overBoard(d.px, d.py, L)) {
      const ok = this.game.canPlace(d.shard, snapped);
      const cells = this.game.cells(d.shard).map(([r, c]) => [r + snapped.row, c + snapped.col] as [number, number]);
      drawPieceBody(this.ctx, cells, L.boardX, L.boardY, L.cell, PIECE_COLORS[d.shard.name], {
        alpha: ok ? 0.95 : 0.55,
        scale: 1.04,
        glow: ok ? 18 : 6,
        tint: ok ? undefined : "#ff4d4d",
      });
    } else {
      this.drawShardCentered(d.shard, d.px, d.py, L.cell);
    }
  }

  // ── Input ────────────────────────────────────────────────────────────────
  private pt(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  private overBoard(x: number, y: number, L: Layout): boolean {
    return (
      x >= L.boardX - L.cell * 0.5 &&
      y >= L.boardY - L.cell * 0.5 &&
      x < L.boardX + L.cell * (this.game.cols + 0.5) &&
      y < L.boardY + L.cell * (this.game.rows + 0.5)
    );
  }
  private boardCell(x: number, y: number, L: Layout): Pos {
    return {
      row: Math.round((y - L.boardY - L.cell / 2) / L.cell),
      col: Math.round((x - L.boardX - L.cell / 2) / L.cell),
    };
  }
  private snapped(L: Layout): Pos | null {
    const d = this.drag;
    if (!d || !this.overBoard(d.px, d.py, L)) return null;
    const t = this.boardCell(d.px, d.py, L);
    return { row: t.row - d.grabR, col: t.col - d.grabC };
  }

  private beltHit(x: number, y: number, L: Layout): Shard | null {
    if (x < L.beltX - 6 || x > L.beltX + L.beltW + 6) return null;
    const belt = this.beltMetrics(L);
    // nearest shard whose band contains y
    let best: Shard | null = null;
    let bestDist = belt.bandH * 0.62;
    for (const s of this.game.belt) {
      const dist = Math.abs(y - belt.cy(s.y));
      if (dist < bestDist) {
        bestDist = dist;
        best = s;
      }
    }
    if (best) return best;
    for (const s of this.game.belt) {
      const cy = belt.cy(s.y);
      if (x >= L.beltX && x <= L.beltX + L.beltW && y >= cy - belt.bandH / 2 && y <= cy + belt.bandH / 2) {
        return s;
      }
    }
    return null;
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.layout || this.game.isOver) return;
    const L = this.layout;
    const { x, y } = this.pt(e);
    this.game.start();

    let shard: Shard | null = null;
    let from: "belt" | "hold" = "belt";
    if (x >= L.beltX && y >= L.holdY && y <= L.holdY + L.holdSize && this.game.hold) {
      shard = this.game.hold;
      from = "hold";
    } else {
      shard = this.beltHit(x, y, L);
    }
    if (!shard) return;
    this.canvas.setPointerCapture(e.pointerId);

    const cells = this.game.cells(shard);
    let sr = 0;
    let sc = 0;
    for (const [r, c] of cells) {
      sr += r;
      sc += c;
    }
    this.drag = {
      shard,
      from,
      px: x,
      py: y,
      sx: x,
      sy: y,
      t0: performance.now(),
      moved: false,
      grabR: Math.round(sr / cells.length),
      grabC: Math.round(sc / cells.length),
    };
    if (from === "hold") this.game.takeHold();
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

    if (!d.moved && performance.now() - d.t0 < TAP_TIME_MS) {
      this.game.rotate(d.shard);
      if (d.from === "hold") this.game.hold = d.shard;
      sfx.pickUp();
      return;
    }

    const snapped = this.snapped(L);
    if (snapped) {
      const rows = this.game.place(d.shard, snapped);
      if (rows >= 0) {
        if (d.from === "belt") this.game.removeFromBelt(d.shard.id);
        sfx.place();
        navigator.vibrate?.(rows > 0 ? 24 : 8);
        for (const r of this.game.lastCleared) this.flash.push({ row: r, t: 0 });
        return;
      }
    }
    // didn't place — send to hold (or keep in hold)
    if (d.from === "belt") {
      this.game.toHold(d.shard);
      sfx.invalid();
    } else {
      this.game.hold = d.shard;
    }
  };
}
