/**
 * Canvas view for a "fill the frame" level: 2.5-D board + tray, pointer
 * gestures, and the feel — placement pop, invalid shake, confetti + light bloom
 * on a win, a dimming pulse when the clock runs out.
 */

import { Confetti } from "./confetti.js";
import { PIECE_COLORS, cssVar } from "./colors.js";
import type { GameState, PieceState, Pos } from "./game.js";
import { drawPieceBody, drawWell, strokeCellOutline } from "./render.js";
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
  /** Slot width — sized to fit a 5-wide piece. */
  size: number;
  /** Row pitch / hit height — tighter than the width; pieces are rarely 5 tall. */
  rowH: number;
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
  onTimeout: () => void;
  onUnlock?: () => void;
  /** Fired the instant the board is solved — before the ~2.4s hold. */
  onSolved?: () => void;
}

export class GameView {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly wrap: HTMLElement;
  private game: GameState;
  private cb: GameViewCallbacks;

  private drag: DragState | null = null;
  private layout: Layout | null = null;
  private running = false;
  private raf = 0;
  private lastTs = 0;

  private placeAnims = new Map<string, number>();
  private shake: { key: string; t: number } | null = null;
  private winT = -1;
  /** `performance.now()` when the solve happened — wall-clock, so the hold
   *  survives frame throttling (backgrounded tab, a janky frame, …). */
  private winAt = 0;
  private winFired = false;
  private winTimer = 0;
  private winStars = 0;
  /** Big celebratory star particles on a solve. */
  private stars: Array<{
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
  }> = [];
  /** How long the solved board stays up, gloating, before the overlay. */
  private static readonly WIN_HOLD_MS = 2400;
  private timeoutFired = false;
  private confetti = new Confetti();
  private hintCells: Array<[number, number]> = [];
  private hintUntil = 0;
  /** Ruß, der gerade weggewischt wurde — kurzes Aufleuchten pro Scheibe. */
  private sootFlash: Array<{ r: number; c: number; t: number }> = [];
  /** Ruß, der gerade dazugekrochen ist — dunkler Puls. */
  private spreadFlash: Array<{ r: number; c: number; t: number }> = [];
  /** Bereits gereinigte Scheiben, damit jede nur einmal aufleuchtet. */
  private sootLit = new Set<string>();
  private nowMs = 0;
  private unlockFlashT = -1;

  constructor(canvas: HTMLCanvasElement, wrap: HTMLElement, game: GameState, cb: GameViewCallbacks) {
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
    this.winAt = 0;
    this.winFired = false;
    if (this.winTimer) window.clearTimeout(this.winTimer);
    this.winTimer = 0;
    this.winStars = 0;
    this.stars = [];
    this.timeoutFired = false;
    this.confetti.clear();
    this.hintCells = [];
    this.hintUntil = 0;
    this.unlockFlashT = -1;
    this.sootFlash = [];
    this.spreadFlash = [];
    this.sootLit.clear();
    this.kick();
  }

  /** Joker: glow the solution cells of the first unsolved piece. Returns false if there's nothing to hint. */
  showHint(): boolean {
    const target = this.game.firstUnsolved();
    if (!target) return false;
    this.hintCells = target.cells;
    this.hintUntil = performance.now() + 4500;
    sfx.pickUp();
    return true;
  }

  destroy(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.winTimer) window.clearTimeout(this.winTimer);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointercancel", this.onUp);
    window.removeEventListener("resize", this.kick);
    window.visualViewport?.removeEventListener("resize", this.kick);
  }

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
    let fbTs = performance.now();
    const fb = (): void => {
      if (!this.running) return;
      const now = performance.now();
      if (now - this.lastTs > 260) {
        this.tick(Math.min(0.05, (now - fbTs) / 1000));
        this.render();
      }
      fbTs = now;
      window.setTimeout(fb, 200);
    };
    window.setTimeout(fb, 200);
  }

  private kick = (): void => this.render();

  private tick(dt: number): void {
    this.nowMs = performance.now();
    for (const [key, t] of this.placeAnims) {
      const next = t + dt * 1000;
      if (next >= PLACE_ANIM_MS) this.placeAnims.delete(key);
      else this.placeAnims.set(key, next);
    }
    if (this.shake) {
      this.shake.t += dt * 1000;
      if (this.shake.t >= SHAKE_MS) this.shake = null;
    }
    if (this.unlockFlashT >= 0) {
      this.unlockFlashT += dt;
      if (this.unlockFlashT > 0.9) this.unlockFlashT = -1;
    }
    this.sootFlash = this.sootFlash.filter((f) => (f.t += dt) < 0.5);
    this.spreadFlash = this.spreadFlash.filter((f) => (f.t += dt) < 0.7);
    // frisch gekrochener Ruß — dunkler, unheilvoller Puls
    for (const key of this.game.consumeSpread()) {
      const [r, c] = key.split(",").map(Number) as [number, number];
      this.spreadFlash.push({ r, c, t: 0 });
      sfx.invalid();
    }
    // Den Deckungszustand pollen statt am Platzieren zu hängen: so leuchtet es
    // auch, wenn ein Teil weggenommen und woanders hingelegt wird.
    if (this.game.sootTotal > 0) {
      let lit = 0;
      for (const [r, c] of this.game.shape.cells) {
        if (!this.game.isSooty(r, c) || !this.game.isCovered(r, c)) continue;
        lit += 1;
        if (!this.sootLit.has(`${r},${c}`)) {
          this.sootLit.add(`${r},${c}`);
          this.sootFlash.push({ r, c, t: 0 });
        }
      }
      // wieder freigelegte Scheiben dürfen erneut aufleuchten
      if (lit < this.sootLit.size) {
        for (const key of [...this.sootLit]) {
          const [r, c] = key.split(",").map(Number) as [number, number];
          if (!this.game.isCovered(r, c)) this.sootLit.delete(key);
        }
      }
    }
    if (this.game.consumeUnlock()) {
      this.unlockFlashT = 0;
      sfx.win();
      this.cb.onUnlock?.();
    }
    for (const s of this.stars) {
      s.t += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 320 * dt;
      s.vx *= 1 - dt * 1.1;
      s.rot += s.spin * dt;
    }
    if (this.stars.length) this.stars = this.stars.filter((s) => s.t < s.max);

    if (this.winT >= 0) {
      this.winT += dt;
      // a second wave partway through so the celebration doesn't fizzle early
      if (!this.winFired && this.winT > 0.9 && this.stars.length < 8 && this.layout) {
        this.spawnWinStars(this.layout, Math.max(10, 6 + this.winStars * 4));
      }
      if (!this.winFired && performance.now() - this.winAt > GameView.WIN_HOLD_MS) {
        this.fireWin();
      }
      return;
    }
    if (this.game.isWon()) this.triggerWin();
    else if (this.game.failed && !this.timeoutFired) {
      this.timeoutFired = true;
      this.game.finish();
      sfx.invalid();
      this.cb.onTimeout();
    }
  }

  private triggerWin(): void {
    if (this.winT >= 0) return;
    this.winT = 0;
    this.winAt = performance.now();
    this.game.finish();
    this.winStars = this.game.starRating();
    const l = this.layout ?? this.computeLayout();
    this.confetti.burst(l.cssWidth / 2, l.board.y + (l.board.cell * this.game.shape.rows) / 2);
    this.spawnWinStars(l, 18 + this.winStars * 6);
    sfx.win();
    sfx.vibrate(30);
    this.cb.onSolved?.(); // kick the full-screen star shower right away
    // the overlay (cb.onWin) is fired from fireWin() after the board has had
    // ~2.4s to bask. tick() fires it, but a hard timer is the backstop so the
    // result always shows even if the rAF loop is throttled or dies.
    this.winTimer = window.setTimeout(() => this.fireWin(), GameView.WIN_HOLD_MS + 120);
  }

  private fireWin(): void {
    if (this.winFired) return;
    this.winFired = true;
    if (this.winTimer) window.clearTimeout(this.winTimer);
    this.winTimer = 0;
    this.cb.onWin(this.winStars, this.game.elapsedMs());
  }

  /** A big radial burst of stars from the middle of the solved board. */
  private spawnWinStars(l: Layout, n: number): void {
    const cx = l.board.x + (l.board.cell * this.game.shape.cols) / 2;
    const cy = l.board.y + (l.board.cell * this.game.shape.rows) / 2;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const sp = 110 + Math.random() * 300;
      this.stars.push({
        x: cx + (Math.random() - 0.5) * l.board.cell,
        y: cy + (Math.random() - 0.5) * l.board.cell,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 110,
        t: 0,
        max: 0.9 + Math.random() * 0.8,
        color: "#ffffff",
        size: 6 + Math.random() * 10,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 10,
      });
    }
  }

  private drawStarShape(x: number, y: number, r: number, rot: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = rot + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? r : r * 0.42;
      const px = x + Math.cos(a) * rad;
      const py = y + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  private computeLayout(): Layout {
    const cssWidth = this.wrap.clientWidth || 320;
    const { rows, cols } = this.game.shape;
    const pad = 12;
    const viewportH = window.visualViewport?.height ?? window.innerHeight;

    // The real vertical budget for the canvas: the viewport minus where the
    // canvas starts and the fixed chrome below it (joker foot + its margins +
    // the screen's bottom padding + the board-wrap's own padding/border). Every
    // term here is independent of the canvas height, so it can't feed back on
    // itself — unlike measuring the foot's *position*, which moves when the
    // canvas resizes. The old fixed guess was ~100px too generous and clipped
    // the tray off the bottom.
    const rawTop = this.canvas.getBoundingClientRect().top;
    const canvasTop = rawTop > 40 ? rawTop : 160;
    const footH =
      document.querySelector<HTMLElement>(".play-foot .jokers")?.getBoundingClientRect().height ?? 76;
    const budget = Math.max(240, viewportH - canvasTop - footH - 44);

    const n = this.game.pieces.length;

    // Tray sizing — pack the pieces tight so the board gets the room.
    // A pentomino is ≤5 cells wide and (unrotated) ≤3 tall, so the slot is
    // deliberately much wider than it is tall. We try every column count and
    // keep whichever lets the tray pieces be biggest while the whole tray
    // still fits in its slice of the budget.
    const SLOT_W = 5.2;
    const SLOT_H = 4.0;
    const trayMax = budget * 0.4;
    const cellCap = Math.min(17, Math.max(10, Math.floor(cssWidth / 22)));

    let perRow = n;
    let trayRows = 1;
    let trayCell = 8;
    for (let pr = Math.min(n, 5); pr >= 1; pr--) {
      const tr = Math.ceil(n / pr);
      const byWidth = (cssWidth - pad) / (pr * SLOT_W);
      const byHeight = trayMax / (tr * SLOT_H);
      const cell = Math.floor(Math.min(byWidth, byHeight, cellCap));
      if (cell >= 8 && cell > trayCell) {
        trayCell = cell;
        perRow = pr;
        trayRows = tr;
      }
    }

    const slotSize = trayCell * SLOT_W;
    const rowH = trayCell * SLOT_H;
    const trayBlock = trayRows * rowH + pad;

    const boardBudget = budget - trayBlock - pad;
    const boardCell = Math.max(
      12,
      Math.floor(Math.min((cssWidth - pad * 2) / cols, boardBudget / rows)),
    );
    const boardW = boardCell * cols;
    const boardBlock = boardCell * rows;
    const board: BoardLayout = { x: Math.floor((cssWidth - boardW) / 2), y: pad, cell: boardCell };

    const trayTop = board.y + boardBlock + pad;
    const unplaced = this.game.pieces.filter((p) => !p.pos && p !== this.drag?.piece);
    const tray: TraySlot[] = unplaced.map((piece, i) => {
      const r = Math.floor(i / perRow);
      const c = i % perRow;
      const usedRow = Math.min(perRow, unplaced.length - r * perRow);
      const startX = (cssWidth - usedRow * slotSize) / 2;
      return {
        piece,
        x: startX + c * slotSize,
        y: trayTop + r * rowH,
        size: slotSize,
        rowH,
        cell: trayCell,
      };
    });

    // the panel hugs its content; CSS centres the whole panel in the leftover
    // vertical space (see `.screen.play .board-wrap`)
    const cssHeight = trayTop + trayRows * rowH + pad;
    return { cssWidth, cssHeight, board, tray };
  }

  /**
   * Verrußte Scheiben: eine warm-schwarze, körnige Schicht in der Mulde. Muss
   * auf einen Blick als „schmutzig" lesbar sein, auch bei 20 px Zellgröße —
   * deshalb dunkler Kern, heller Rand, ein paar Flusen.
   */
  private drawSoot(b: BoardLayout): void {
    if (this.game.sootTotal === 0) return;
    const ctx = this.ctx;
    const R = b.cell * 0.34;
    for (const [r, c] of this.game.shape.cells) {
      if (!this.game.isSooty(r, c) || this.game.isCovered(r, c)) continue;
      const cx = b.x + (c + 0.5) * b.cell;
      const cy = b.y + (r + 0.5) * b.cell;
      ctx.save();
      const g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.25);
      g.addColorStop(0, "#100a1e");
      g.addColorStop(0.7, "#241a33");
      g.addColorStop(1, "rgba(36, 26, 51, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.25, 0, 6.28);
      ctx.fill();
      // Flusen — deterministisch aus der Zelle, damit sie nicht flackern
      ctx.fillStyle = "rgba(150, 130, 175, 0.5)";
      for (let i = 0; i < 4; i++) {
        const a = ((r * 7 + c * 13 + i * 97) % 360) * (Math.PI / 180);
        const d = R * (0.35 + ((i * 37 + r + c) % 10) / 22);
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, Math.max(0.8, b.cell * 0.035), 0, 6.28);
        ctx.fill();
      }
      ctx.restore();
    }
    // frisch gereinigt → kurzer heller Blitz
    for (const f of this.sootFlash) {
      const p = f.t / 0.5;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.max(0, 1 - p) * 0.9;
      const cx = b.x + (f.c + 0.5) * b.cell;
      const cy = b.y + (f.r + 0.5) * b.cell;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, b.cell * (0.4 + p * 0.6));
      g.addColorStop(0, "rgba(255, 240, 200, 0.95)");
      g.addColorStop(1, "rgba(255, 240, 200, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, b.cell * (0.4 + p * 0.6), 0, 6.28);
      ctx.fill();
      ctx.restore();
    }
    // frisch dazugekrochen → dunkle Welle, die aus der Nachbarscheibe greift
    for (const f of this.spreadFlash) {
      const p = f.t / 0.7;
      const cx = b.x + (f.c + 0.5) * b.cell;
      const cy = b.y + (f.r + 0.5) * b.cell;
      ctx.save();
      ctx.globalAlpha = Math.sin(Math.min(1, p) * Math.PI) * 0.85;
      const rad = b.cell * (0.15 + p * 0.6);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, "#05030d");
      g.addColorStop(1, "rgba(5, 3, 13, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, 6.28);
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * Risse: eine gezackte helle Linie auf der Trennkante, mit dunklem Kern
   * darunter, damit sie auch über einem gesetzten Teil sichtbar bleibt. Der
   * Zickzack ist aus den Zellkoordinaten abgeleitet, also stabil zwischen
   * Frames — sonst würde die Linie flimmern.
   */
  private drawCracks(b: BoardLayout): void {
    if (!this.game.hasCracks) return;
    const ctx = this.ctx;
    for (const [a, bb] of this.game.crackEdges()) {
      // gleiche Zeile = Zellen nebeneinander = die Bruchkante läuft senkrecht
      const vertical = a[0] === bb[0];
      const r = Math.max(a[0], bb[0]);
      const c = Math.max(a[1], bb[1]);
      const x = b.x + c * b.cell;
      const y = b.y + r * b.cell;
      const len = b.cell;
      const amp = Math.max(1.5, b.cell * 0.07);
      const steps = 6;

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const pass of [0, 1]) {
        // erst dunkler Grund, dann heller Kern — liest sich als Spalt im Glas
        ctx.strokeStyle = pass === 0 ? "rgba(8, 5, 22, 0.9)" : "rgba(190, 210, 255, 0.95)";
        ctx.lineWidth = pass === 0 ? Math.max(3, b.cell * 0.14) : Math.max(1.4, b.cell * 0.06);
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const off = (i % 2 === 0 ? 1 : -1) * amp * (i === 0 || i === steps ? 0 : 1);
          const px = vertical ? x + off : b.x + c * b.cell + t * len;
          const py = vertical ? b.y + r * b.cell + t * len : y + off;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /**
   * Eis: eine milchig-blaue Scheibe mit Reifkanten. Sobald ein Nachbar bedeckt
   * ist (die Scheibe also auftaubar wäre), bekommt sie einen warmen Schimmer —
   * ein Hinweis, wo das Licht als Nächstes hinkann.
   */
  private drawIce(b: BoardLayout): void {
    if (!this.game.hasIce) return;
    const ctx = this.ctx;
    const covered = (r: number, c: number) =>
      this.game.shape.has(r, c) && this.game.isCovered(r, c);
    for (const [r, c] of this.game.shape.cells) {
      if (!this.game.isIced(r, c) || this.game.isCovered(r, c)) continue;
      const x = b.x + c * b.cell;
      const y = b.y + r * b.cell;
      const thawable =
        covered(r - 1, c) || covered(r + 1, c) || covered(r, c - 1) || covered(r, c + 1);
      ctx.save();
      const g = ctx.createLinearGradient(x, y, x + b.cell, y + b.cell);
      g.addColorStop(0, "rgba(198, 226, 255, 0.82)");
      g.addColorStop(1, "rgba(120, 160, 220, 0.72)");
      ctx.fillStyle = g;
      ctx.fillRect(x + 1, y + 1, b.cell - 2, b.cell - 2);
      // Reif-Kristalle — deterministisch aus der Zelle
      ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      ctx.lineWidth = Math.max(1, b.cell * 0.03);
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = ((r * 11 + c * 17 + i * 71) % 360) * (Math.PI / 180);
        const cx = x + b.cell / 2;
        const cy = y + b.cell / 2;
        const d = b.cell * 0.32;
        ctx.moveTo(cx - Math.cos(a) * d, cy - Math.sin(a) * d);
        ctx.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
      }
      ctx.stroke();
      if (thawable) {
        const pulse = 0.5 + 0.5 * Math.sin(this.nowMs / 260);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.25 + 0.35 * pulse;
        const gg = ctx.createRadialGradient(
          x + b.cell / 2,
          y + b.cell / 2,
          0,
          x + b.cell / 2,
          y + b.cell / 2,
          b.cell * 0.7,
        );
        gg.addColorStop(0, "rgba(255, 226, 170, 0.9)");
        gg.addColorStop(1, "rgba(255, 226, 170, 0)");
        ctx.fillStyle = gg;
        ctx.fillRect(x, y, b.cell, b.cell);
      }
      ctx.restore();
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
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

    const b = layout.board;
    const wellFill = cssVar("--cell");
    for (const [r, c] of this.game.shape.cells) {
      drawWell(ctx, b.x + c * b.cell, b.y + r * b.cell, b.cell, wellFill);
    }
    this.drawSoot(b);
    if (this.game.hasFrozenZone && !this.game.isFrozenUnlocked) {
      ctx.save();
      ctx.fillStyle = "rgba(10, 8, 30, 0.62)";
      for (const [r, c] of this.game.shape.cells) {
        if (!this.game.isFrozen(r, c)) continue;
        const x = b.x + c * b.cell;
        const y = b.y + r * b.cell;
        ctx.fillRect(x + 1, y + 1, b.cell - 2, b.cell - 2);
      }
      ctx.font = `${Math.round(b.cell * 0.42)}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = 0.85;
      for (const [r, c] of this.game.shape.cells) {
        if (!this.game.isFrozen(r, c)) continue;
        // only draw the lock once per frozen "island cluster" cell — cheap
        // enough to just draw on cells whose left+top neighbours aren't frozen
        if (this.game.isFrozen(r - 1, c) || this.game.isFrozen(r, c - 1)) continue;
        ctx.fillText("🔒", b.x + c * b.cell + b.cell / 2, b.y + r * b.cell + b.cell / 2);
      }
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    if (this.unlockFlashT >= 0) {
      const p = this.unlockFlashT / 0.9;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p) * 0.8;
      ctx.fillStyle = cssVar("--lumen");
      for (const [r, c] of this.game.shape.cells) {
        ctx.fillRect(b.x + c * b.cell, b.y + r * b.cell, b.cell, b.cell);
      }
      ctx.restore();
    }
    strokeCellOutline(
      ctx,
      (r, c) => this.game.shape.has(r, c),
      this.game.shape.cells,
      b.x,
      b.y,
      b.cell,
      cssVar("--board-edge"),
      3,
    );

    // hint glow
    if (this.hintCells.length && this.nowMs < this.hintUntil) {
      const pulse = 0.45 + 0.4 * Math.sin(this.nowMs / 180);
      ctx.save();
      ctx.strokeStyle = cssVar("--lumen");
      ctx.shadowColor = cssVar("--lumen");
      ctx.shadowBlur = 16 * pulse + 6;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.6 + 0.4 * pulse;
      const inSet = new Set(this.hintCells.map(([r, c]) => `${r},${c}`));
      ctx.beginPath();
      for (const [r, c] of this.hintCells) {
        const x = b.x + c * b.cell;
        const y = b.y + r * b.cell;
        if (!inSet.has(`${r - 1},${c}`)) {
          ctx.moveTo(x + 3, y + 3);
          ctx.lineTo(x + b.cell - 3, y + 3);
        }
        if (!inSet.has(`${r + 1},${c}`)) {
          ctx.moveTo(x + 3, y + b.cell - 3);
          ctx.lineTo(x + b.cell - 3, y + b.cell - 3);
        }
        if (!inSet.has(`${r},${c - 1}`)) {
          ctx.moveTo(x + 3, y + 3);
          ctx.lineTo(x + 3, y + b.cell - 3);
        }
        if (!inSet.has(`${r},${c + 1}`)) {
          ctx.moveTo(x + b.cell - 3, y + 3);
          ctx.lineTo(x + b.cell - 3, y + b.cell - 3);
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    const winPulse = this.winT >= 0 ? 1 + 0.045 * Math.sin(this.winT * 6) : 1;
    for (const piece of this.game.pieces) {
      if (piece.pos && piece !== this.drag?.piece) {
        this.drawPiece(this.game.cellsAt(piece, piece.pos), b, PIECE_COLORS[piece.name], {
          scale: this.pieceScale(piece.key) * winPulse,
          glow: this.winT >= 0 ? 14 : this.placeAnims.has(piece.key) ? 12 : 0,
          shakeKey: piece.key,
        });
      }
    }

    for (const slot of layout.tray) {
      const cells = this.game.localCells(slot.piece);
      let maxR = 0;
      let maxC = 0;
      for (const [r, c] of cells) {
        if (r > maxR) maxR = r;
        if (c > maxC) maxC = c;
      }
      const ox = slot.x + (slot.size - (maxC + 1) * slot.cell) / 2;
      const oy = slot.y + (slot.rowH - (maxR + 1) * slot.cell) / 2;
      drawPieceBody(
        ctx,
        cells.map(([r, c]) => [r, c] as [number, number]),
        ox,
        oy,
        slot.cell,
        PIECE_COLORS[slot.piece.name],
        { depth: 0.2 },
      );
    }

    // über den Teilen, damit die Bruchkante sichtbar bleibt, wenn beidseitig
    // etwas liegt — sonst wüsste man nach dem Setzen nicht mehr, wo sie war
    this.drawCracks(b);
    this.drawIce(b);

    if (this.drag) this.drawDrag(layout);
    if (this.confetti.active) this.confetti.step(ctx, 1 / 60);

    // win: one bright expanding ring from the board centre, then the star shower
    if (this.winT >= 0 && this.winT < 0.6) {
      const p = this.winT / 0.6;
      const cx = b.x + (b.cell * this.game.shape.cols) / 2;
      const cy = b.y + (b.cell * this.game.shape.rows) / 2;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(255,240,200,${(1 - p) * 0.8})`;
      ctx.lineWidth = 6 * (1 - p) + 1;
      ctx.beginPath();
      ctx.arc(cx, cy, p * b.cell * this.game.shape.cols * 0.9, 0, 6.28);
      ctx.stroke();
      ctx.restore();
    }
    if (this.stars.length) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const s of this.stars) {
        const k = 1 - s.t / s.max;
        ctx.globalAlpha = Math.max(0, k);
        ctx.fillStyle = s.color;
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 12 * k;
        this.drawStarShape(s.x, s.y, s.size * (0.5 + k * 0.8), s.rot);
      }
      ctx.restore();
    }
  }

  private pieceScale(key: string): number {
    const t = this.placeAnims.get(key);
    if (t === undefined) return 1;
    const p = t / PLACE_ANIM_MS;
    return 1 + 0.16 * Math.sin(p * Math.PI) * (1 - p);
  }

  private drawPiece(
    cells: Array<[number, number]>,
    b: BoardLayout,
    color: string,
    opts: {
      scale?: number;
      glow?: number;
      alpha?: number;
      tint?: string;
      shakeKey?: string;
      selected?: boolean;
    } = {},
  ): void {
    let shakeX = 0;
    if (opts.shakeKey && this.shake?.key === opts.shakeKey) {
      const p = this.shake.t / SHAKE_MS;
      shakeX = Math.sin(p * 34) * 7 * (1 - p);
    }
    this.ctx.save();
    this.ctx.translate(shakeX, 0);
    drawPieceBody(this.ctx, cells, b.x, b.y, b.cell, color, {
      scale: opts.scale,
      glow: opts.glow,
      alpha: opts.alpha,
      tint: opts.tint,
      selected: opts.selected,
    });
    this.ctx.restore();
  }

  private drawDrag(layout: Layout): void {
    const drag = this.drag!;
    const snapped = this.snappedPos(drag, layout);
    if (snapped && this.overBoard(drag.pointerX, drag.pointerY, layout)) {
      const ok = this.game.canPlace(drag.piece, snapped);
      this.drawPiece(this.game.cellsAt(drag.piece, snapped), layout.board, PIECE_COLORS[drag.piece.name], {
        scale: 1.05,
        glow: ok ? 18 : 6,
        alpha: ok ? 0.95 : 0.6,
        tint: ok ? undefined : "#ff4d4d",
        selected: ok,
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
      drawPieceBody(
        this.ctx,
        cells.map(([r, c]) => [r, c] as [number, number]),
        drag.pointerX - (cc + 0.5) * cell,
        drag.pointerY - (cr + 0.5) * cell,
        cell,
        PIECE_COLORS[drag.piece.name],
        { alpha: 0.92, scale: 1.08, glow: 14, depth: 0.24, selected: true },
      );
    }
  }

  // ── Pointer ──────────────────────────────────────────────────────────────
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
    return {
      row: Math.round((y - b.y - b.cell / 2) / b.cell),
      col: Math.round((x - b.x - b.cell / 2) / b.cell),
    };
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
      if (x >= slot.x && x < slot.x + slot.size && y >= slot.y && y < slot.y + slot.rowH) {
        return { piece: slot.piece, fromTray: true };
      }
    }
    return null;
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.layout || this.game.isWon() || this.game.failed) return;
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
    sfx.vibrate(8); // a tiny tick when a shape is picked up
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
      return;
    }

    const snapped = this.snappedPos(drag, this.layout);
    if (snapped && this.game.place(drag.piece, snapped)) {
      this.placeAnims.set(drag.piece.key, 0);
      sfx.place();
      sfx.vibrate(8);
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
