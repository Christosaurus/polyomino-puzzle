/**
 * Canvas view: board + tray rendering, pointer gestures, and the juice —
 * placement pop, invalid-drop shake, and the win celebration with confetti.
 *
 * Gestures:
 *   - tap a tray piece      → rotate it (cycles all orientations, mirrors included)
 *   - drag a tray piece     → place it on the board
 *   - drag a placed piece   → move it
 *   - tap a placed piece    → send it back to the tray
 */

import { PIECE_COLORS, shade } from "./colors.js";
import { Confetti } from "./confetti.js";
import type { GameState, PieceState, Pos } from "./game.js";
import { sfx } from "./sfx.js";

const TAP_MOVE_PX = 9;
const TAP_TIME_MS = 350;
const PLACE_ANIM_MS = 260;
const SHAKE_MS = 380;

interface BoardLayout {
  x: number;
  y: number;
  cell: number;
}
interface TraySlot {
  piece: PieceState;
  x: number;
  y: number;
  size: number;
  cell: number;
}
interface Layout {
  cssWidth: number;
  cssHeight: number;
  board: BoardLayout;
  tray: TraySlot[];
}
interface DragState {
  piece: PieceState;
  fromTray: boolean;
  originPos: Pos | null;
  grabRow: number;
  grabCol: number;
  pointerX: number;
  pointerY: number;
  startX: number;
  startY: number;
  startTime: number;
  moved: boolean;
}

export interface GameViewCallbacks {
  onWin: (stars: number, ms: number) => void;
}

export class GameView {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly wrap: HTMLElement;
  private game: GameState;
  private cb: GameViewCallbacks;

  private drag: DragState | null = null;
  private layout: Layout | null = null;
  private raf = 0;
  private lastTs = 0;
  private running = false;

  private placeAnims = new Map<string, number>(); // pieceKey → elapsed ms
  private shake: { key: string; t: number } | null = null;
  private winT = -1; // -1 = not won, else seconds since win
  private winFired = false;
  private confetti = new Confetti();

  constructor(
    canvas: HTMLCanvasElement,
    wrap: HTMLElement,
    game: GameState,
    cb: GameViewCallbacks,
  ) {
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

  setGame(game: GameState): void {
    this.game = game;
    this.drag = null;
    this.placeAnims.clear();
    this.shake = null;
    this.winT = -1;
    this.winFired = false;
    this.confetti.clear();
    this.kick();
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

  // ── Animation loop ────────────────────────────────────────────────────────
  private start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTs = performance.now();
    const loop = (ts: number): void => {
      if (!this.running) return;
      const dt = Math.min(0.05, (ts - this.lastTs) / 1000);
      this.lastTs = ts;
      this.tick(dt);
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    // Belt-and-braces: if rAF is starved (tab not painting) keep animating anyway.
    let fallbackTs = performance.now();
    const fallback = (): void => {
      if (!this.running) return;
      const now = performance.now();
      if (now - this.lastTs > 260) {
        const dt = Math.min(0.05, (now - fallbackTs) / 1000);
        this.tick(dt);
        this.render();
      }
      fallbackTs = now;
      window.setTimeout(fallback, 200);
    };
    window.setTimeout(fallback, 200);
  }

  /** Force an immediate redraw (used on resize / setGame). */
  private kick = (): void => {
    this.render();
  };

  private tick(dt: number): void {
    for (const [key, t] of this.placeAnims) {
      const next = t + dt * 1000;
      if (next >= PLACE_ANIM_MS) this.placeAnims.delete(key);
      else this.placeAnims.set(key, next);
    }
    if (this.shake) {
      this.shake.t += dt * 1000;
      if (this.shake.t >= SHAKE_MS) this.shake = null;
    }
    if (this.winT >= 0) this.winT += dt;
    else if (this.game.isWon()) this.triggerWin();
  }

  /** Start the win celebration. Safe to call once; fired straight from the
   *  winning move so it never waits on the animation loop. */
  private triggerWin(): void {
    if (this.winT >= 0) return;
    this.winT = 0;
    this.game.finish();
    const layout = this.layout ?? this.computeLayout();
    this.confetti.burst(
      layout.cssWidth / 2,
      layout.board.y + (layout.board.cell * this.game.shape.rows) / 2,
    );
    sfx.win();
    if (!this.winFired) {
      this.winFired = true;
      this.cb.onWin(this.game.starRating(), this.game.elapsedMs());
    }
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  private computeLayout(): Layout {
    const cssWidth = this.wrap.clientWidth || 320;
    const { rows, cols } = this.game.shape;
    const pad = 14;

    const viewportH = window.visualViewport?.height ?? window.innerHeight;
    const maxCanvasHeight = Math.max(240, viewportH - 150);

    const trayCell = Math.max(9, Math.min(18, Math.floor(cssWidth / 27)));
    const slotSize = trayCell * 6;
    const perRow = Math.max(1, Math.floor((cssWidth - pad) / slotSize));
    const trayRows = Math.ceil(this.game.pieces.length / perRow);
    const trayHeight = trayRows * slotSize + pad;

    const maxBoardHeight = maxCanvasHeight - trayHeight - pad * 2;
    const boardCell = Math.max(
      12,
      Math.floor(Math.min((cssWidth - pad * 2) / cols, maxBoardHeight / rows)),
    );
    const boardW = boardCell * cols;
    const board: BoardLayout = { x: Math.floor((cssWidth - boardW) / 2), y: pad, cell: boardCell };

    const trayTop = board.y + boardCell * rows + pad + 4;
    const unplaced = this.game.pieces.filter((p) => !p.pos && p !== this.drag?.piece);
    const tray: TraySlot[] = unplaced.map((piece, i) => {
      const r = Math.floor(i / perRow);
      const c = i % perRow;
      const usedRow = Math.min(perRow, unplaced.length - r * perRow);
      const startX = (cssWidth - usedRow * slotSize) / 2;
      return { piece, x: startX + c * slotSize, y: trayTop + r * slotSize, size: slotSize, cell: trayCell };
    });

    const cssHeight = trayTop + trayRows * slotSize + pad;
    return { cssWidth, cssHeight, board, tray };
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  private render(): void {
    const layout = this.computeLayout();
    this.layout = layout;

    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = Math.round(layout.cssWidth * dpr);
    const h = Math.round(layout.cssHeight * dpr);
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.canvas.style.height = `${layout.cssHeight}px`;

    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, layout.cssWidth, layout.cssHeight);

    this.drawBoardPanel(layout.board);

    const winPulse = this.winT >= 0 ? 1 + 0.05 * Math.sin(this.winT * 6) : 1;
    for (const piece of this.game.pieces) {
      if (piece.pos && piece !== this.drag?.piece) {
        this.drawPiece(this.game.cellsAt(piece, piece.pos), layout.board, PIECE_COLORS[piece.name], {
          scale: this.pieceScale(piece.key) * winPulse,
          shakeKey: piece.key,
          lift: this.placeAnims.has(piece.key) ? 6 : 2,
        });
      }
    }

    for (const slot of layout.tray) this.drawTraySlot(slot);
    if (this.drag) this.drawDrag(layout);

    // confetti integrates + draws here so it uses the live transform
    if (this.confetti.active) this.confetti.step(ctx, 1 / 60);
  }

  private pieceScale(key: string): number {
    const t = this.placeAnims.get(key);
    if (t === undefined) return 1;
    const p = t / PLACE_ANIM_MS;
    return 1 + 0.16 * Math.sin(p * Math.PI) * (1 - p);
  }

  private drawBoardPanel(board: BoardLayout): void {
    const ctx = this.ctx;
    const { cell } = board;
    const inShape = (r: number, c: number): boolean => this.game.shape.has(r, c);

    // cell wells
    for (const [r, c] of this.game.shape.cells) {
      const x = board.x + c * cell;
      const y = board.y + r * cell;
      this.roundRect(x + 1.5, y + 1.5, cell - 3, cell - 3, Math.min(7, cell * 0.16));
      ctx.fillStyle = this.cssVar("--cell");
      ctx.fill();
    }

    // outer boundary
    ctx.strokeStyle = this.cssVar("--board-edge");
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const [r, c] of this.game.shape.cells) {
      const x = board.x + c * cell;
      const y = board.y + r * cell;
      if (!inShape(r - 1, c)) this.seg(x, y, x + cell, y);
      if (!inShape(r + 1, c)) this.seg(x, y + cell, x + cell, y + cell);
      if (!inShape(r, c - 1)) this.seg(x, y, x, y + cell);
      if (!inShape(r, c + 1)) this.seg(x + cell, y, x + cell, y + cell);
    }
    ctx.stroke();
  }

  private drawPiece(
    cells: Array<[number, number]>,
    board: BoardLayout,
    color: string,
    opts: { alpha?: number; scale?: number; lift?: number; shakeKey?: string; tint?: string } = {},
  ): void {
    const ctx = this.ctx;
    const { cell } = board;
    const alpha = opts.alpha ?? 1;
    const scale = opts.scale ?? 1;
    const lift = opts.lift ?? 0;

    let cr = 0;
    let cc = 0;
    for (const [r, c] of cells) {
      cr += r;
      cc += c;
    }
    cr /= cells.length;
    cc /= cells.length;
    const cx = board.x + (cc + 0.5) * cell;
    const cy = board.y + (cr + 0.5) * cell;

    let shakeX = 0;
    if (opts.shakeKey && this.shake?.key === opts.shakeKey) {
      const p = this.shake.t / SHAKE_MS;
      shakeX = Math.sin(p * 34) * 7 * (1 - p);
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx + shakeX, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);

    const rad = Math.min(9, cell * 0.2);
    const light = shade(color, 0.22);
    const dark = shade(color, -0.16);

    if (lift > 0) {
      ctx.shadowColor = "rgba(0,0,0,0.28)";
      ctx.shadowBlur = lift * 2;
      ctx.shadowOffsetY = lift;
    }
    const inSet = new Set(cells.map(([r, c]) => `${r},${c}`));
    // one filled rounded rect per cell, gradient top→bottom
    for (const [r, c] of cells) {
      const x = board.x + c * cell;
      const y = board.y + r * cell;
      const grad = ctx.createLinearGradient(0, y, 0, y + cell);
      grad.addColorStop(0, light);
      grad.addColorStop(1, opts.tint ?? color);
      this.roundRect(x + 1.5, y + 1.5, cell - 3, cell - 3, rad);
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // crisp inner boundary
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (const [r, c] of cells) {
      const x = board.x + c * cell;
      const y = board.y + r * cell;
      if (!inSet.has(`${r - 1},${c}`)) this.seg(x + 1.5, y + 1.5, x + cell - 1.5, y + 1.5);
      if (!inSet.has(`${r + 1},${c}`)) this.seg(x + 1.5, y + cell - 1.5, x + cell - 1.5, y + cell - 1.5);
      if (!inSet.has(`${r},${c - 1}`)) this.seg(x + 1.5, y + 1.5, x + 1.5, y + cell - 1.5);
      if (!inSet.has(`${r},${c + 1}`)) this.seg(x + cell - 1.5, y + 1.5, x + cell - 1.5, y + cell - 1.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawTraySlot(slot: TraySlot): void {
    const cells = this.game.localCells(slot.piece);
    let maxR = 0;
    let maxC = 0;
    for (const [r, c] of cells) {
      if (r > maxR) maxR = r;
      if (c > maxC) maxC = c;
    }
    const ox = slot.x + (slot.size - (maxC + 1) * slot.cell) / 2;
    const oy = slot.y + (slot.size - (maxR + 1) * slot.cell) / 2;
    this.drawPiece(
      cells.map(([r, c]) => [r, c] as [number, number]),
      { x: ox, y: oy, cell: slot.cell },
      PIECE_COLORS[slot.piece.name],
      { lift: 3 },
    );
  }

  private drawDrag(layout: Layout): void {
    const drag = this.drag!;
    const snapped = this.snappedPos(drag, layout);
    if (snapped && this.overBoard(drag.pointerX, drag.pointerY, layout)) {
      const ok = this.game.canPlace(drag.piece, snapped);
      this.drawPiece(this.game.cellsAt(drag.piece, snapped), layout.board, PIECE_COLORS[drag.piece.name], {
        alpha: ok ? 0.92 : 0.55,
        scale: 1.04,
        lift: 10,
        tint: ok ? undefined : "#ef4444",
      });
    } else {
      const cell = layout.board.cell;
      const cells = this.game.localCells(drag.piece);
      let cr = 0;
      let cc = 0;
      for (const [r, c] of cells) {
        cr += r;
        cc += c;
      }
      cr /= cells.length;
      cc /= cells.length;
      const originX = drag.pointerX - (cc + 0.5) * cell;
      const originY = drag.pointerY - (cr + 0.5) * cell;
      this.drawPiece(
        cells.map(([r, c]) => [r, c] as [number, number]),
        { x: originX, y: originY, cell },
        PIECE_COLORS[drag.piece.name],
        { alpha: 0.9, scale: 1.06, lift: 12 },
      );
    }
  }

  // ── Canvas helpers ───────────────────────────────────────────────────────
  private seg(x1: number, y1: number, x2: number, y2: number): void {
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private cssVarCache = new Map<string, string>();
  private cssVar(name: string): string {
    const hit = this.cssVarCache.get(name);
    if (hit) return hit;
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
    this.cssVarCache.set(name, v);
    return v;
  }

  // ── Pointer handling ─────────────────────────────────────────────────────
  private pointer(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private overBoard(x: number, y: number, layout: Layout): boolean {
    const b = layout.board;
    return (
      x >= b.x - b.cell * 0.5 &&
      y >= b.y - b.cell * 0.5 &&
      x < b.x + b.cell * (this.game.shape.cols + 0.5) &&
      y < b.y + b.cell * (this.game.shape.rows + 0.5)
    );
  }

  private boardCell(x: number, y: number, layout: Layout): Pos {
    const b = layout.board;
    return { row: Math.round((y - b.y - b.cell / 2) / b.cell), col: Math.round((x - b.x - b.cell / 2) / b.cell) };
  }

  private snappedPos(drag: DragState, layout: Layout): Pos | null {
    if (!this.overBoard(drag.pointerX, drag.pointerY, layout)) return null;
    const t = this.boardCell(drag.pointerX, drag.pointerY, layout);
    return { row: t.row - drag.grabRow, col: t.col - drag.grabCol };
  }

  private hitTest(x: number, y: number, layout: Layout): { piece: PieceState; fromTray: boolean } | null {
    if (this.overBoard(x, y, layout)) {
      const at = this.boardCell(x, y, layout);
      for (const piece of this.game.pieces) {
        if (!piece.pos) continue;
        for (const [r, c] of this.game.cellsAt(piece, piece.pos)) {
          if (r === at.row && c === at.col) return { piece, fromTray: false };
        }
      }
    }
    for (const slot of layout.tray) {
      if (x >= slot.x && x < slot.x + slot.size && y >= slot.y && y < slot.y + slot.size) {
        return { piece: slot.piece, fromTray: true };
      }
    }
    return null;
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.layout || this.game.isWon()) return;
    const { x, y } = this.pointer(e);
    const hit = this.hitTest(x, y, this.layout);
    if (!hit) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.game.markStarted();

    const local = this.game.localCells(hit.piece);
    let grabRow: number;
    let grabCol: number;
    if (!hit.fromTray && hit.piece.pos) {
      const at = this.boardCell(x, y, this.layout);
      grabRow = at.row - hit.piece.pos.row;
      grabCol = at.col - hit.piece.pos.col;
    } else {
      let cr = 0;
      let cc = 0;
      for (const [r, c] of local) {
        cr += r;
        cc += c;
      }
      grabRow = Math.round(cr / local.length);
      grabCol = Math.round(cc / local.length);
    }

    this.drag = {
      piece: hit.piece,
      fromTray: hit.fromTray,
      originPos: hit.piece.pos ? { ...hit.piece.pos } : null,
      grabRow,
      grabCol,
      pointerX: x,
      pointerY: y,
      startX: x,
      startY: y,
      startTime: performance.now(),
      moved: false,
    };
    if (!hit.fromTray) this.game.removeToTray(hit.piece);
    sfx.pickUp();
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.drag) return;
    const { x, y } = this.pointer(e);
    this.drag.pointerX = x;
    this.drag.pointerY = y;
    if (Math.hypot(x - this.drag.startX, y - this.drag.startY) > TAP_MOVE_PX) this.drag.moved = true;
  };

  private onUp = (e: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || !this.layout) return;
    this.drag = null;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);

    const isTap = !drag.moved && performance.now() - drag.startTime < TAP_TIME_MS;

    if (isTap) {
      if (drag.fromTray) {
        this.game.nextOrientation(drag.piece);
        sfx.pickUp();
      }
      // tap on a placed piece: it's already back in the tray
      return;
    }

    const snapped = this.snappedPos(drag, this.layout);
    if (snapped && this.game.place(drag.piece, snapped)) {
      this.placeAnims.set(drag.piece.key, 0);
      sfx.place();
      navigator.vibrate?.(8);
      if (this.game.isWon()) this.triggerWin();
    } else if (drag.originPos && this.game.canPlace(drag.piece, drag.originPos)) {
      this.game.place(drag.piece, drag.originPos);
      this.shake = { key: drag.piece.key, t: 0 };
      sfx.invalid();
    } else {
      this.shake = { key: drag.piece.key, t: 0 };
      sfx.invalid();
    }
  };
}
