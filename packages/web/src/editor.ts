/**
 * Level-Werkstatt — ein reines Entwicklungswerkzeug, erreichbar unter
 * `/editor.html` im Dev-Server. Nicht Teil des Spiels und nicht im Build.
 *
 * Es setzt den Hybrid aus dem Konzept (§D) in eine Oberfläche um: **der
 * Generator baut die Packung, der Autor legt die Mechanik darüber.** Damit ist
 * Lösbarkeit geschenkt und muss nie nachgerechnet werden.
 *
 * Die wichtigste Aufgabe der Oberfläche ist, unlösbare Level unmöglich zu
 * machen: Risse dürfen nur auf Kanten, die kein Lösungsteil überspannt, und
 * genau die werden sichtbar markiert. Der Autor sieht also, wo er schneiden
 * darf, statt es raten und hinterher am Validator scheitern zu müssen.
 */

import {
  generateLevel,
  type Level,
  type LevelGoal,
  rngFromSeed,
  serializeLevel,
  validateLevel,
} from "@polyomino/puzzle-core";
import { PIECE_COLORS, cssVar } from "./colors.js";
import { drawPieceBody, drawWell } from "./render.js";
import { SHAPES } from "./shapes.js";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

type Cell = [number, number];
const cellKey = (r: number, c: number): string => `${r},${c}`;
const edgeKey = (a: Cell, b: Cell): string =>
  [cellKey(a[0], a[1]), cellKey(b[0], b[1])].sort().join("|");

let level: Level | null = null;
let soot = new Set<string>();
let cracks = new Set<string>();
let ice = new Set<string>();
let candle = new Set<string>();
let chains: Array<[string, string]> = [];
let chainPending: string | null = null;
let wander: string[] = [];
let seals = new Map<string, string>();
let stuck = new Set<string>();
let doubles: Array<[string, string]> = [];
let doublePending: string | null = null;
let mode:
  | "soot"
  | "crack"
  | "ice"
  | "candle"
  | "chain"
  | "wander"
  | "seal"
  | "stuck"
  | "double" = "soot";
/** Kanten, die kein Lösungsteil überspannt — nur die dürfen reißen. */
let legalEdges = new Set<string>();

const canvas = $<HTMLCanvasElement>("board");
const ctx = canvas.getContext("2d")!;

// ── Silhouetten-Auswahl ─────────────────────────────────────────────────────
const shapeSel = $<HTMLSelectElement>("shape");
SHAPES.forEach((s, i) => {
  const o = document.createElement("option");
  o.value = String(i);
  o.textContent = `${s.shape.rows}×${s.shape.cols} · ${s.cells} Zellen · ${s.cells / 5} Teile`;
  shapeSel.append(o);
});
// Nicht mit dem 2×5-Rechteck starten: für zwei Pentominos gibt es praktisch nie
// eine eindeutige Packung, der Generator liefert dort fast immer nichts.
shapeSel.value = String(Math.max(0, SHAPES.findIndex((s) => s.cells >= 15)));

// ── Erzeugen ────────────────────────────────────────────────────────────────
function generate(): void {
  const entry = SHAPES[Number(shapeSel.value)];
  if (!entry) return;
  const seed = $<HTMLInputElement>("seed").value || "werkstatt";
  const res = generateLevel({
    shape: entry.shape,
    rng: rngFromSeed(seed),
    seed,
    maxAttempts: 200,
    maxSolverNodes: 400_000,
    now: () => new Date(),
  });
  if (!res.level) {
    setErrors(["Für diese Silhouette und diesen Seed kam kein Level heraus — anderen Seed probieren."]);
    return;
  }
  level = res.level;
  soot = new Set();
  cracks = new Set();
  ice = new Set();
  candle = new Set();
  chains = [];
  chainPending = null;
  wander = [];
  seals = new Map();
  stuck = new Set();
  doubles = [];
  doublePending = null;
  computeLegalEdges();
  // Erzeugen ist ein Neuanfang: mit der Mechanik muss auch das Ziel zurück,
  // sonst steht "nur den Ruß reinigen" über einem Fenster ohne Ruß.
  $<HTMLSelectElement>("goal").value = "cover";
  $<HTMLInputElement>("budget").value = String(level.pieces.length + 3);
  refresh();
}

/**
 * Eine Kante darf reißen, wenn kein Lösungsteil sie ohnehin überspannt und sie
 * nicht am Rand liegt — am Rand verbietet ein Riss meist gar keine Platzierung
 * und wäre bloß Deko.
 */
function computeLegalEdges(): void {
  legalEdges = new Set();
  if (!level) return;
  const inShape = new Set<string>();
  const { originRow, originCol } = level.shape;
  level.shape.rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === "#") inShape.add(cellKey(r + originRow, c + originCol));
    });
  });
  const spanned = new Set<string>();
  for (const p of level.solution) {
    const own = new Set(p.cells.map(([r, c]) => cellKey(r, c)));
    for (const [r, c] of p.cells) {
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
      ] as const) {
        if (own.has(cellKey(r + dr, c + dc))) spanned.add(edgeKey([r, c], [r + dr, c + dc]));
      }
    }
  }
  const interior = (r: number, c: number): boolean =>
    inShape.has(cellKey(r - 1, c)) &&
    inShape.has(cellKey(r + 1, c)) &&
    inShape.has(cellKey(r, c - 1)) &&
    inShape.has(cellKey(r, c + 1));

  for (const key of inShape) {
    const [r, c] = key.split(",").map(Number) as Cell;
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
    ] as const) {
      const nr = r + dr;
      const nc = c + dc;
      if (!inShape.has(cellKey(nr, nc))) continue;
      const ek = edgeKey([r, c], [nr, nc]);
      if (spanned.has(ek)) continue;
      if (!interior(r, c) && !interior(nr, nc)) continue;
      legalEdges.add(ek);
    }
  }
}

// ── Zeichnen ────────────────────────────────────────────────────────────────
interface Geom {
  x: number;
  y: number;
  cell: number;
  originRow: number;
  originCol: number;
}
let geom: Geom | null = null;

function draw(): void {
  if (!level) return;
  const rows = level.shape.rows.length;
  const cols = level.shape.rows[0]?.length ?? 1;
  const pad = 16;
  const cssW = canvas.clientWidth || 600;
  const cell = Math.floor(Math.min((cssW - pad * 2) / cols, 64));
  const cssH = rows * cell + pad * 2;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.height = `${cssH}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const { originRow, originCol } = level.shape;
  const x = Math.round((cssW - cols * cell) / 2);
  const y = pad;
  geom = { x, y, cell, originRow, originCol };

  const shapeCells: Cell[] = [];
  level.shape.rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === "#") shapeCells.push([r, c]);
    });
  });

  const wellFill = cssVar("--cell");
  for (const [r, c] of shapeCells) {
    drawWell(ctx, x + c * cell, y + r * cell, cell, wellFill);
  }

  // die Packung blass darunter — sie zeigt, welche Teile wo liegen, und macht
  // damit sichtbar, welcher Ruß welches Teil erzwingt
  for (const p of level.solution) {
    drawPieceBody(
      ctx,
      p.cells.map(([r, c]): [number, number] => [r - originRow, c - originCol]),
      x,
      y,
      cell,
      PIECE_COLORS[p.pieceId],
      { alpha: 0.3 },
    );
  }

  // Ruß
  for (const key of soot) {
    const [ar, ac] = key.split(",").map(Number) as Cell;
    const cx = x + (ac - originCol + 0.5) * cell;
    const cy = y + (ar - originRow + 0.5) * cell;
    ctx.save();
    const g = ctx.createRadialGradient(cx, cy, cell * 0.06, cx, cy, cell * 0.42);
    g.addColorStop(0, "#0d0818");
    g.addColorStop(0.7, "#241a33");
    g.addColorStop(1, "rgba(36,26,51,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.42, 0, 6.28);
    ctx.fill();
    ctx.restore();
  }

  // Eis
  for (const key of ice) {
    const [ar, ac] = key.split(",").map(Number) as Cell;
    const ix = x + (ac - originCol) * cell;
    const iy = y + (ar - originRow) * cell;
    ctx.save();
    const g = ctx.createLinearGradient(ix, iy, ix + cell, iy + cell);
    g.addColorStop(0, "rgba(198,226,255,0.82)");
    g.addColorStop(1, "rgba(120,160,220,0.72)");
    ctx.fillStyle = g;
    ctx.fillRect(ix + 1, iy + 1, cell - 2, cell - 2);
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = Math.max(1, cell * 0.03);
    ctx.beginPath();
    ctx.moveTo(ix + cell * 0.2, iy + cell * 0.5);
    ctx.lineTo(ix + cell * 0.8, iy + cell * 0.5);
    ctx.moveTo(ix + cell * 0.5, iy + cell * 0.2);
    ctx.lineTo(ix + cell * 0.5, iy + cell * 0.8);
    ctx.stroke();
    ctx.restore();
  }

  // Ketten
  for (const [a, b] of chains) {
    const [ar, ac] = a.split(",").map(Number) as Cell;
    const [br, bc] = b.split(",").map(Number) as Cell;
    const ax = x + (ac - originCol + 0.5) * cell;
    const ay = y + (ar - originRow + 0.5) * cell;
    const bx = x + (bc - originCol + 0.5) * cell;
    const by = y + (br - originRow + 0.5) * cell;
    ctx.save();
    ctx.strokeStyle = "rgba(255,180,59,0.9)";
    ctx.lineWidth = Math.max(2, cell * 0.08);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.fillStyle = "#ffd36b";
    for (const [px, py] of [
      [ax, ay],
      [bx, by],
    ] as const) {
      ctx.beginPath();
      ctx.arc(px, py, cell * 0.13, 0, 6.28);
      ctx.fill();
    }
    ctx.restore();
  }
  if (chainPending) {
    const [pr, pc] = chainPending.split(",").map(Number) as Cell;
    ctx.save();
    ctx.strokeStyle = "rgba(255,211,107,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(
      x + (pc - originCol + 0.5) * cell,
      y + (pr - originRow + 0.5) * cell,
      cell * 0.3,
      0,
      6.28,
    );
    ctx.stroke();
    ctx.restore();
  }

  // Doppelscheiben: F (vorne) → 2 (hinten)
  for (const [f, bk] of doubles) {
    for (const [k, lbl] of [
      [f, "F"],
      [bk, "2"],
    ] as const) {
      const [dr, dc] = k.split(",").map(Number) as Cell;
      const px = x + (dc - originCol + 0.5) * cell;
      const py = y + (dr - originRow + 0.5) * cell;
      ctx.save();
      ctx.strokeStyle = "rgba(200,235,255,0.8)";
      ctx.lineWidth = 2;
      ctx.strokeRect(px - cell * 0.34, py - cell * 0.34, cell * 0.68, cell * 0.68);
      ctx.fillStyle = "#dbe8ff";
      ctx.font = `700 ${Math.round(cell * 0.3)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(lbl, px, py);
      ctx.restore();
    }
    // Verbindung
    const [fr, fc] = f.split(",").map(Number) as Cell;
    const [br2, bc2] = bk.split(",").map(Number) as Cell;
    ctx.save();
    ctx.strokeStyle = "rgba(150,190,240,0.5)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x + (fc - originCol + 0.5) * cell, y + (fr - originRow + 0.5) * cell);
    ctx.lineTo(x + (bc2 - originCol + 0.5) * cell, y + (br2 - originRow + 0.5) * cell);
    ctx.stroke();
    ctx.restore();
  }

  // Feste Splitter
  for (const key of stuck) {
    const [sr, sc] = key.split(",").map(Number) as Cell;
    const cx = x + (sc - originCol + 0.5) * cell;
    const cy = y + (sr - originRow + 0.5) * cell;
    ctx.save();
    ctx.fillStyle = "rgba(8,5,18,0.85)";
    ctx.fillRect(x + (sc - originCol) * cell + 1, y + (sr - originRow) * cell + 1, cell - 2, cell - 2);
    ctx.fillStyle = "#3a3350";
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * 6.28;
      const rr = i % 2 === 0 ? cell * 0.32 : cell * 0.14;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Farbsiegel
  for (const [key, name] of seals) {
    const [sr, sc] = key.split(",").map(Number) as Cell;
    const cx = x + (sc - originCol + 0.5) * cell;
    const cy = y + (sr - originRow + 0.5) * cell;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    const R = cell * 0.24;
    ctx.fillStyle = PIECE_COLORS[name as keyof typeof PIECE_COLORS] ?? "#fff";
    ctx.fillRect(-R, -R, R * 2, R * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.strokeRect(-R, -R, R * 2, R * 2);
    ctx.restore();
    ctx.fillStyle = "#fff";
    ctx.font = `${Math.round(cell * 0.28)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, cx, cy);
  }

  // Wanderscherbe: nummerierter Gang
  if (wander.length > 0) {
    ctx.save();
    ctx.strokeStyle = "rgba(122,107,168,0.8)";
    ctx.lineWidth = Math.max(2, cell * 0.06);
    ctx.lineCap = "round";
    ctx.beginPath();
    wander.forEach((k, i) => {
      const [wr, wc] = k.split(",").map(Number) as Cell;
      const px = x + (wc - originCol + 0.5) * cell;
      const py = y + (wr - originRow + 0.5) * cell;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    wander.forEach((k, i) => {
      const [wr, wc] = k.split(",").map(Number) as Cell;
      const px = x + (wc - originCol + 0.5) * cell;
      const py = y + (wr - originRow + 0.5) * cell;
      ctx.fillStyle = i === 0 ? "#a875ff" : "#2a1f47";
      ctx.beginPath();
      ctx.arc(px, py, cell * 0.18, 0, 6.28);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `${Math.round(cell * 0.22)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), px, py);
    });
    ctx.restore();
  }

  // Kerze
  for (const key of candle) {
    const [ar, ac] = key.split(",").map(Number) as Cell;
    const cx = x + (ac - originCol + 0.5) * cell;
    const cy = y + (ar - originRow + 0.5) * cell;
    ctx.save();
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, cell * 0.5);
    halo.addColorStop(0, "rgba(255,224,150,0.6)");
    halo.addColorStop(1, "rgba(255,224,150,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.5, 0, 6.28);
    ctx.fill();
    ctx.fillStyle = "#ffd36b";
    ctx.beginPath();
    ctx.moveTo(cx, cy + cell * 0.12);
    ctx.quadraticCurveTo(cx - cell * 0.1, cy - cell * 0.05, cx, cy - cell * 0.22);
    ctx.quadraticCurveTo(cx + cell * 0.1, cy - cell * 0.05, cx, cy + cell * 0.12);
    ctx.fill();
    ctx.restore();
  }

  // erlaubte Schnittkanten andeuten, solange der Riss-Modus aktiv ist
  if (mode === "crack") {
    for (const ek of legalEdges) {
      if (cracks.has(ek)) continue;
      strokeEdge(ek, "rgba(140,160,255,0.25)", Math.max(1, cell * 0.04), false);
    }
  }
  for (const ek of cracks) {
    strokeEdge(ek, "rgba(8,5,22,0.9)", Math.max(3, cell * 0.14), true);
    strokeEdge(ek, "rgba(190,210,255,0.95)", Math.max(1.4, cell * 0.06), true);
  }
}

function strokeEdge(ek: string, colour: string, width: number, zig: boolean): void {
  if (!geom) return;
  const [a, b] = ek.split("|");
  const [ar, ac] = a!.split(",").map(Number) as Cell;
  const [br, bc] = b!.split(",").map(Number) as Cell;
  const { x, y, cell, originRow, originCol } = geom;
  const vertical = ar === br; // nebeneinander → senkrechte Bruchkante
  const r = Math.max(ar, br) - originRow;
  const c = Math.max(ac, bc) - originCol;
  const amp = zig ? Math.max(1.5, cell * 0.07) : 0;
  const steps = 6;

  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const off = (i % 2 === 0 ? 1 : -1) * amp * (i === 0 || i === steps ? 0 : 1);
    const px = vertical ? x + c * cell + off : x + c * cell + t * cell;
    const py = vertical ? y + r * cell + t * cell : y + r * cell + off;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
}

// ── Klicken ─────────────────────────────────────────────────────────────────
canvas.addEventListener("pointerdown", (e) => {
  if (!level || !geom) return;
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const { x, y, cell, originRow, originCol } = geom;
  const fc = (px - x) / cell;
  const fr = (py - y) / cell;
  const r = Math.floor(fr);
  const c = Math.floor(fc);
  const abs: Cell = [r + originRow, c + originCol];
  if (!inShape(abs)) return;

  if (mode === "soot") {
    const key = cellKey(abs[0], abs[1]);
    if (soot.has(key)) soot.delete(key);
    else soot.add(key);
    refresh();
    return;
  }

  if (mode === "candle") {
    const key = cellKey(abs[0], abs[1]);
    if (candle.has(key)) candle.delete(key);
    else candle.add(key);
    refresh();
    return;
  }

  if (mode === "stuck") {
    const key = cellKey(abs[0], abs[1]);
    if (stuck.has(key)) stuck.delete(key);
    else stuck.add(key);
    refresh();
    return;
  }

  if (mode === "double") {
    const key = cellKey(abs[0], abs[1]);
    const hit = doubles.findIndex(([f, b]) => f === key || b === key);
    if (hit >= 0 && !doublePending) {
      doubles.splice(hit, 1);
      refresh();
      return;
    }
    if (!doublePending) doublePending = key;
    else if (doublePending === key) doublePending = null;
    else {
      doubles.push([doublePending, key]);
      doublePending = null;
    }
    refresh();
    return;
  }

  if (mode === "seal") {
    const key = cellKey(abs[0], abs[1]);
    if (seals.has(key)) {
      seals.delete(key);
    } else {
      const owner = level.solution.find((p) =>
        p.cells.some(([r, c]) => cellKey(r, c) === key),
      );
      if (owner) seals.set(key, owner.pieceId);
    }
    refresh();
    return;
  }

  if (mode === "wander") {
    const key = cellKey(abs[0], abs[1]);
    const at = wander.indexOf(key);
    if (at >= 0) {
      // ab hier abschneiden
      wander = wander.slice(0, at);
    } else if (
      wander.length === 0 ||
      (() => {
        const [lr, lc] = wander[wander.length - 1]!.split(",").map(Number) as Cell;
        return Math.abs(lr - abs[0]) + Math.abs(lc - abs[1]) === 1;
      })()
    ) {
      wander.push(key);
    } else {
      flash("Die Scherbe wandert Schritt für Schritt — nur eine Nachbarscheibe.");
    }
    refresh();
    return;
  }

  if (mode === "chain") {
    const key = cellKey(abs[0], abs[1]);
    // auf ein vorhandenes Kettenende tippen → Kette löschen
    const hit = chains.findIndex(([a, b]) => a === key || b === key);
    if (hit >= 0 && !chainPending) {
      chains.splice(hit, 1);
      refresh();
      return;
    }
    if (!chainPending) {
      chainPending = key;
    } else if (chainPending === key) {
      chainPending = null;
    } else {
      chains.push([chainPending, key]);
      chainPending = null;
    }
    refresh();
    return;
  }

  if (mode === "ice") {
    const key = cellKey(abs[0], abs[1]);
    if (ice.has(key)) {
      ice.delete(key);
    } else {
      const next = new Set(ice);
      next.add(key);
      const lockedIn = [...next].find((k) => {
        const [r, c] = k.split(",").map(Number) as Cell;
        const free = ([[-1, 0], [1, 0], [0, -1], [0, 1]] as const).some(([dr, dc]) => {
          const nk: Cell = [r + dr, c + dc];
          return inShape(nk) && !next.has(cellKey(nk[0], nk[1]));
        });
        return !free;
      });
      if (lockedIn) {
        flash("Diese Scheibe wäre von Eis eingeschlossen — sie braucht einen freien Nachbarn.");
        refresh();
        return;
      }
      ice.add(key);
    }
    refresh();
    return;
  }

  // Riss: die nächstgelegene Kante dieser Zelle nehmen
  const dx = fc - c;
  const dy = fr - r;
  const nb: Cell =
    Math.min(dx, 1 - dx) < Math.min(dy, 1 - dy)
      ? [abs[0], abs[1] + (dx < 0.5 ? -1 : 1)]
      : [abs[0] + (dy < 0.5 ? -1 : 1), abs[1]];
  if (!inShape(nb)) return;
  const ek = edgeKey(abs, nb);
  if (cracks.has(ek)) cracks.delete(ek);
  else if (legalEdges.has(ek)) cracks.add(ek);
  else flash("Diese Kante würde die Lösung zerschneiden — dort geht kein Riss.");
  refresh();
});

function inShape([r, c]: Cell): boolean {
  if (!level) return false;
  const { originRow, originCol } = level.shape;
  const row = level.shape.rows[r - originRow];
  return row?.[c - originCol] === "#";
}

// ── Ausgabe & Prüfung ───────────────────────────────────────────────────────
function build(): Level | null {
  if (!level) return null;
  const out: Level = structuredClone(level);
  out.id = $<HTMLInputElement>("id").value.trim() || "unbenannt";
  out.difficulty = Number($<HTMLInputElement>("diff").value) || 1;
  const goal = $<HTMLSelectElement>("goal").value as LevelGoal;
  if (goal === "soot" || goal === "moth") out.goal = goal;
  else delete out.goal;

  const mech: NonNullable<Level["mechanics"]> = {};
  if (soot.size > 0) {
    // dieselbe Malfläche — als Ruß oder Motten, je nach Ziel
    const cells = [...soot].map((k) => k.split(",").map(Number) as Cell);
    if (goal === "moth") mech.moths = cells;
    else mech.soot = cells;
  }
  if (cracks.size > 0) {
    mech.cracks = [...cracks].map((ek) => {
      const [a, b] = ek.split("|");
      return [
        a!.split(",").map(Number) as Cell,
        b!.split(",").map(Number) as Cell,
      ];
    });
  }
  if (ice.size > 0) {
    mech.ice = [...ice].map((k) => k.split(",").map(Number) as Cell);
  }
  if (candle.size > 0) {
    mech.candle = [...candle].map((k) => k.split(",").map(Number) as Cell);
  }
  if (chains.length > 0) {
    mech.chains = chains.map(([a, b]) => [
      a.split(",").map(Number) as Cell,
      b.split(",").map(Number) as Cell,
    ]);
  }
  if (wander.length > 0) {
    mech.wander = wander.map((k) => k.split(",").map(Number) as Cell);
  }
  if (seals.size > 0) {
    mech.seals = [...seals].map(([k, name]) => [k.split(",").map(Number) as Cell, name]);
  }
  if (stuck.size > 0) {
    mech.stuck = [...stuck].map((k) => k.split(",").map(Number) as Cell);
  }
  if (doubles.length > 0) {
    mech.double = doubles.map(([f, b]) => [
      f.split(",").map(Number) as Cell,
      b.split(",").map(Number) as Cell,
    ]);
  }
  if (Object.keys(mech).length > 0) out.mechanics = mech;
  else delete out.mechanics;

  const budget = Number($<HTMLInputElement>("budget").value);
  if (budget > 0) out.moveBudget = budget;
  else delete out.moveBudget;
  return out;
}

let flashUntil = 0;
let flashMsg = "";
function flash(msg: string): void {
  flashMsg = msg;
  flashUntil = Date.now() + 2500;
}

function setErrors(errs: string[]): void {
  const el = $("errors");
  if (errs.length === 0) {
    el.className = "errors ok";
    el.textContent = "✓ gültig";
  } else {
    el.className = "errors bad";
    el.textContent = errs.map((e) => `• ${e}`).join("\n");
  }
}

function refresh(): void {
  draw();
  const out = build();
  const hint = $("hint");
  if (!out) {
    hint.textContent = "Erst ein Fenster erzeugen.";
    $<HTMLTextAreaElement>("json").value = "";
    return;
  }
  const errs = validateLevel(out);
  setErrors(errs);
  $<HTMLTextAreaElement>("json").value = serializeLevel(out);

  const goal = $<HTMLSelectElement>("goal").value;
  const partial = goal === "soot" || goal === "moth";
  const need = partial ? piecesTouchingSoot(out) : out.pieces.length;
  $("budget-hint").textContent = `— mindestens ${need} nötig`;
  hint.textContent =
    Date.now() < flashUntil
      ? flashMsg
      : `${out.pieces.length} Teile · ${soot.size} ${goal === "moth" ? "Motten" : "Ruß"} · ${cracks.size} Risse · ${ice.size} Eis · ${candle.size} Kerze · ${chains.length} Kette · Gang ${wander.length} · ${seals.size} Siegel · ${stuck.size} Splitter · ${doubles.length} Doppel` +
        (partial ? ` · ${need} Teile reichen` : "");
}

/** Wie viele Lösungsteile die Zielzellen berühren — eine Untergrenze fürs Budget. */
function piecesTouchingSoot(l: Level): number {
  const set = new Set(
    (l.mechanics?.soot ?? l.mechanics?.moths ?? []).map(([r, c]) => cellKey(r, c)),
  );
  if (set.size === 0) return l.pieces.length;
  let n = 0;
  for (const p of l.solution) {
    if (p.cells.some(([r, c]) => set.has(cellKey(r, c)))) n += 1;
  }
  return n;
}

// ── Verdrahtung ─────────────────────────────────────────────────────────────
$("gen").addEventListener("click", generate);
for (const id of ["id", "goal", "diff", "budget"]) {
  $(id).addEventListener("input", refresh);
}
$("m-soot").addEventListener("click", () => setMode("soot"));
$("m-crack").addEventListener("click", () => setMode("crack"));
$("m-ice").addEventListener("click", () => setMode("ice"));
$("m-candle").addEventListener("click", () => setMode("candle"));
$("m-chain").addEventListener("click", () => setMode("chain"));
$("m-wander").addEventListener("click", () => setMode("wander"));
$("m-seal").addEventListener("click", () => setMode("seal"));
$("m-stuck").addEventListener("click", () => setMode("stuck"));
$("m-double").addEventListener("click", () => setMode("double"));
$("clear").addEventListener("click", () => {
  soot = new Set();
  cracks = new Set();
  ice = new Set();
  candle = new Set();
  chains = [];
  chainPending = null;
  wander = [];
  seals = new Map();
  stuck = new Set();
  doubles = [];
  doublePending = null;
  refresh();
});
function setMode(
  m:
    | "soot"
    | "crack"
    | "ice"
    | "candle"
    | "chain"
    | "wander"
    | "seal"
    | "stuck"
    | "double",
): void {
  mode = m;
  chainPending = null;
  doublePending = null;
  $("m-soot").classList.toggle("on", m === "soot");
  $("m-crack").classList.toggle("on", m === "crack");
  $("m-ice").classList.toggle("on", m === "ice");
  $("m-candle").classList.toggle("on", m === "candle");
  $("m-chain").classList.toggle("on", m === "chain");
  $("m-wander").classList.toggle("on", m === "wander");
  $("m-seal").classList.toggle("on", m === "seal");
  $("m-stuck").classList.toggle("on", m === "stuck");
  $("m-double").classList.toggle("on", m === "double");
  $("mode-hint").textContent =
    m === "soot"
      ? "Auf eine Scheibe tippen, um sie zu verrußen."
      : m === "crack"
        ? "Nahe an eine Trennlinie tippen. Nur die blass markierten Kanten dürfen reißen — die anderen würden die Lösung zerschneiden."
        : m === "ice"
          ? "Auf eine Scheibe tippen, um sie zu vereisen. Eis taut erst, wenn ein Nachbar bedeckt ist — jede Eiszelle braucht mindestens einen freien Nachbarn."
          : m === "candle"
            ? "Auf eine Scheibe tippen, um eine Kerze zu setzen. Die Kerze muss zuletzt gedeckt werden — alle Kerzen in einem Lösungsteil."
            : m === "chain"
              ? "Zwei Scheiben nacheinander antippen, um sie zu verketten — dasselbe Teil muss dann beide decken. Auf ein Kettenende tippen löscht die Kette. Beide Enden müssen im selben Lösungsteil liegen."
              : m === "wander"
                ? "Scheiben der Reihe nach antippen — das ist der Gang der Wanderscherbe (jeder Schritt eine Nachbarscheibe). Auf eine nummerierte Scheibe tippen schneidet den Gang dort ab. Kurz halten (3–5)."
                : m === "seal"
                  ? "Auf eine Scheibe tippen versiegelt sie mit dem Teil, das sie in der Lösung deckt — nur dieses Teil darf dann dahin. Nochmal tippen entfernt das Siegel."
                  : m === "stuck"
                    ? "Auf eine Scheibe tippen rammt einen festen Splitter hinein — nie deckbar. Nur an Scheiben sinnvoll, die die Lösung nicht braucht (der Validator meckert sonst)."
                    : "Erst die vordere, dann die hintere Scheibe antippen — die hintere geht erst, wenn die vordere bedeckt ist. Auf ein Ende tippen löscht das Paar. Am besten zwei benachbarte Scheiben aus verschiedenen Teilen.";
  refresh();
}

$("copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText($<HTMLTextAreaElement>("json").value);
  flash("JSON kopiert.");
  refresh();
});
$("download").addEventListener("click", () => {
  const out = build();
  if (!out) return;
  const blob = new Blob([`${serializeLevel(out)}\n`], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${out.id}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
window.addEventListener("resize", draw);

setMode("soot");
generate();
