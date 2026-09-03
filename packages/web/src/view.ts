/**
 * Canvas view: draws the board and tray, and turns pointer gestures into moves.
 *
 * Gestures:
 *   - tap a tray piece      → rotate it (cycles all orientations, mirrors included)
 *   - drag a tray piece     → place it on the board
 *   - drag a placed piece   → move it
 *   - tap a placed piece    → send it back to the tray
 */

import { PIECE_COLORS } from "./colors.js";
import type { GameState, PieceState, Pos } from "./game.js";

const TAP_MOVE_PX = 9;
const TAP_TIME_MS = 350;

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

export class GameView {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly wrap: HTMLElement;
  private game: GameState;
  private drag: DragState | null = null;
  private layout: Layout | null = null;
  private frame = 0;
  private lastWidth = -1;
  private onWin: () => void;

  constructor(canvas: HTMLCanvasElement, wrap: HTMLElement, game: GameState, onWin: () => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.wrap = wrap;
    this.game = game;
    this.onWin = onWin;

    this.canvas.addEventListener("pointerdown", this.handleDown);
    this.canvas.addEventListener("pointermove", this.handleMove);
    this.canvas.addEventListener("pointerup", this.handleUp);
    this.canvas.addEventListener("pointercancel", this.handleUp);

    this.resizeObserver.observe(wrap);
    this.schedule();
  }

  setGame(game: GameState): void {
    this.game = game;
    this.drag = null;
    this.schedule();
  }

  destroy(): void {
    if (this.frame) clearTimeout(this.frame);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("pointerdown", this.handleDown);
    this.canvas.removeEventListener("pointermove", this.handleMove);
    this.canvas.removeEventListener("pointerup", this.handleUp);
    this.canvas.removeEventListener("pointercancel", this.handleUp);
  }

  // Only react to width changes — resizing the canvas changes the wrapper's
  // height, which would otherwise feed back into the observer forever.
  private resizeObserver = new ResizeObserver(() => {
    if (this.wrap.clientWidth !== this.lastWidth) this.schedule();
  });

  private schedule(): void {
    if (this.frame) return;
    // setTimeout, not requestAnimationFrame: rAF is starved when the tab isn't
    // painting, and this board only redraws on discrete events anyway.
    this.frame = window.setTimeout(() => {
      this.frame = 0;
      this.render();
    }, 0);
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  private computeLayout(): Layout {
    const cssWidth = this.wrap.clientWidth || 320;
    const { rows, cols } = this.game.shape;
    const pad = 14;

    const maxBoardHeight = Math.min(window.innerHeight * 0.52, 460);
    const boardCell = Math.max(
      14,
      Math.floor(Math.min((cssWidth - pad * 2) / cols, maxBoardHeight / rows)),
    );
    const boardW = boardCell * cols;
    const board: BoardLayout = { x: Math.floor((cssWidth - boardW) / 2), y: pad, cell: boardCell };

    // Tray
    const trayTop = board.y + boardCell * rows + pad;
    const trayCell = Math.max(9, Math.floor(cssWidth / 30));
    const slotSize = trayCell * 6;
    const perRow = Math.max(1, Math.floor((cssWidth - pad) / slotSize));
    const unplaced = this.game.pieces.filter((p) => !p.pos && p !== this.drag?.piece);

    const tray: TraySlot[] = unplaced.map((piece, i) => {
      const r = Math.floor(i / perRow);
      const c = i % perRow;
      const usedRow = Math.min(perRow, unplaced.length - r * perRow);
      const rowWidth = usedRow * slotSize;
      const startX = (cssWidth - rowWidth) / 2;
      return {
        piece,
        x: startX + c * slotSize,
        y: trayTop + r * slotSize,
        size: slotSize,
        cell: trayCell,
      };
    });

    const trayRows = Math.max(1, Math.ceil(unplaced.length / perRow));
    const cssHeight = trayTop + trayRows * slotSize + pad;

    return { cssWidth, cssHeight, board, tray };
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  private render(): void {
    const layout = this.computeLayout();
    this.layout = layout;
    this.lastWidth = layout.cssWidth;

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(layout.cssWidth * dpr);
    this.canvas.height = Math.round(layout.cssHeight * dpr);
    this.canvas.style.height = `${layout.cssHeight}px`;

    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, layout.cssWidth, layout.cssHeight);

    this.drawBoard(layout.board);

    for (const piece of this.game.pieces) {
      if (piece.pos && piece !== this.drag?.piece) {
        this.drawPieceCells(
          this.game.cellsAt(piece, piece.pos),
          layout.board,
          PIECE_COLORS[piece.name],
          1,
        );
      }
    }

    for (const slot of layout.tray) this.drawTraySlot(slot);

    if (this.drag) this.drawDragGhost(layout);

    this.updateWinOverlay();
  }

  private drawBoard(board: BoardLayout): void {
    const ctx = this.ctx;
    const { cell } = board;
    const inShape = (r: number, c: number): boolean => this.game.shape.has(r, c);

    ctx.fillStyle = this.cssVar("--line");
    for (const [r, c] of this.game.shape.cells) {
      const x = board.x + c * cell;
      const y = board.y + r * cell;
      ctx.globalAlpha = 0.28;
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = this.cssVar("--fg");
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const [r, c] of this.game.shape.cells) {
      const x = board.x + c * cell;
      const y = board.y + r * cell;
      if (!inShape(r - 1, c)) this.edge(x, y, x + cell, y);
      if (!inShape(r + 1, c)) this.edge(x, y + cell, x + cell, y + cell);
      if (!inShape(r, c - 1)) this.edge(x, y, x, y + cell);
      if (!inShape(r, c + 1)) this.edge(x + cell, y, x + cell, y + cell);
    }
    ctx.globalAlpha = 0.55;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private edge(x1: number, y1: number, x2: number, y2: number): void {
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
  }

  private drawPieceCells(
    cells: Array<[number, number]>,
    board: BoardLayout,
    color: string,
    alpha: number,
  ): void {
    const ctx = this.ctx;
    const { cell } = board;
    const inSet = new Set(cells.map(([r, c]) => `${r},${c}`));

    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (const [r, c] of cells) {
      ctx.fillRect(board.x + c * cell + 1, board.y + r * cell + 1, cell - 2, cell - 2);
    }

    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [r, c] of cells) {
      const x = board.x + c * cell;
      const y = board.y + r * cell;
      if (!inSet.has(`${r - 1},${c}`)) this.edge(x, y, x + cell, y);
      if (!inSet.has(`${r + 1},${c}`)) this.edge(x, y + cell, x + cell, y + cell);
      if (!inSet.has(`${r},${c - 1}`)) this.edge(x, y, x, y + cell);
      if (!inSet.has(`${r},${c + 1}`)) this.edge(x + cell, y, x + cell, y + cell);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawTraySlot(slot: TraySlot): void {
    const ctx = this.ctx;
    const cells = this.game.localCells(slot.piece);
    let maxR = 0;
    let maxC = 0;
    for (const [r, c] of cells) {
      if (r > maxR) maxR = r;
      if (c > maxC) maxC = c;
    }
    const pieceW = (maxC + 1) * slot.cell;
    const pieceH = (maxR + 1) * slot.cell;
    const ox = slot.x + (slot.size - pieceW) / 2;
    const oy = slot.y + (slot.size - pieceH) / 2;

    const inSet = new Set(cells.map(([r, c]) => `${r},${c}`));
    ctx.fillStyle = PIECE_COLORS[slot.piece.name];
    for (const [r, c] of cells) {
      ctx.fillRect(ox + c * slot.cell + 1, oy + r * slot.cell + 1, slot.cell - 2, slot.cell - 2);
    }
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const [r, c] of cells) {
      const x = ox + c * slot.cell;
      const y = oy + r * slot.cell;
      if (!inSet.has(`${r - 1},${c}`)) this.edge(x, y, x + slot.cell, y);
      if (!inSet.has(`${r + 1},${c}`)) this.edge(x, y + slot.cell, x + slot.cell, y + slot.cell);
      if (!inSet.has(`${r},${c - 1}`)) this.edge(x, y, x, y + slot.cell);
      if (!inSet.has(`${r},${c + 1}`)) this.edge(x + slot.cell, y, x + slot.cell, y + slot.cell);
    }
    ctx.stroke();
  }

  private drawDragGhost(layout: Layout): void {
    const drag = this.drag!;
    const snapped = this.snappedPos(drag, layout);
    if (snapped && this.overBoard(drag.pointerX, drag.pointerY, layout)) {
      const ok = this.game.canPlace(drag.piece, snapped);
      this.drawPieceCells(
        this.game.cellsAt(drag.piece, snapped),
        layout.board,
        ok ? PIECE_COLORS[drag.piece.name] : "#ef4444",
        ok ? 0.85 : 0.5,
      );
    } else {
      // floating, centred on the finger
      const ctx = this.ctx;
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
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = PIECE_COLORS[drag.piece.name];
      for (const [r, c] of cells) {
        ctx.fillRect(
          drag.pointerX + (c - cc) * cell + 1,
          drag.pointerY + (r - cr) * cell + 1,
          cell - 2,
          cell - 2,
        );
      }
      ctx.globalAlpha = 1;
    }
  }

  private updateWinOverlay(): void {
    const won = this.game.isWon();
    const el = document.getElementById("won");
    el?.classList.toggle("show", won);
  }

  private cssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
  }

  // ── Hit testing & pointer handling ────────────────────────────────────────
  private pointerPos(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private overBoard(x: number, y: number, layout: Layout): boolean {
    const b = layout.board;
    return (
      x >= b.x &&
      y >= b.y &&
      x < b.x + b.cell * this.game.shape.cols &&
      y < b.y + b.cell * this.game.shape.rows
    );
  }

  private boardCellAt(x: number, y: number, layout: Layout): Pos {
    const b = layout.board;
    return { row: Math.floor((y - b.y) / b.cell), col: Math.floor((x - b.x) / b.cell) };
  }

  private snappedPos(drag: DragState, layout: Layout): Pos | null {
    if (!this.overBoard(drag.pointerX, drag.pointerY, layout)) return null;
    const target = this.boardCellAt(drag.pointerX, drag.pointerY, layout);
    return { row: target.row - drag.grabRow, col: target.col - drag.grabCol };
  }

  private hitTest(x: number, y: number, layout: Layout): { piece: PieceState; fromTray: boolean } | null {
    // placed pieces first (they sit on the board)
    if (this.overBoard(x, y, layout)) {
      const at = this.boardCellAt(x, y, layout);
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

  private handleDown = (e: PointerEvent): void => {
    if (!this.layout || this.game.isWon()) return;
    const { x, y } = this.pointerPos(e);
    const hit = this.hitTest(x, y, this.layout);
    if (!hit) return;
    this.canvas.setPointerCapture(e.pointerId);

    const local = this.game.localCells(hit.piece);
    let grabRow = local[0]![0];
    let grabCol = local[0]![1];
    if (!hit.fromTray && hit.piece.pos) {
      const at = this.boardCellAt(x, y, this.layout);
      grabRow = at.row - hit.piece.pos.row;
      grabCol = at.col - hit.piece.pos.col;
    } else {
      // grab near the centre so the piece sits under the finger
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
    this.schedule();
  };

  private handleMove = (e: PointerEvent): void => {
    if (!this.drag) return;
    const { x, y } = this.pointerPos(e);
    this.drag.pointerX = x;
    this.drag.pointerY = y;
    if (Math.hypot(x - this.drag.startX, y - this.drag.startY) > TAP_MOVE_PX) this.drag.moved = true;
    this.schedule();
  };

  private handleUp = (e: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || !this.layout) return;
    this.drag = null;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);

    const isTap =
      !drag.moved && performance.now() - drag.startTime < TAP_TIME_MS;

    if (isTap) {
      if (drag.fromTray) {
        this.game.nextOrientation(drag.piece);
      } else {
        // tapped a placed piece → leave it in the tray (already removed)
      }
    } else {
      const snapped = this.snappedPos(drag, this.layout);
      if (snapped && this.game.place(drag.piece, snapped)) {
        // placed
      } else if (drag.originPos && this.game.canPlace(drag.piece, drag.originPos)) {
        this.game.place(drag.piece, drag.originPos);
      }
      // otherwise it stays in the tray
    }

    this.schedule();
    if (this.game.isWon()) this.onWin();
  };
}
