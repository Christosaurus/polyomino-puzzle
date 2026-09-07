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
let mode: "soot" | "crack" = "soot";
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
  if (goal === "soot") out.goal = "soot";
  else delete out.goal;

  const mech: NonNullable<Level["mechanics"]> = {};
  if (soot.size > 0) {
    mech.soot = [...soot].map((k) => k.split(",").map(Number) as Cell);
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
  const need = goal === "soot" ? piecesTouchingSoot(out) : out.pieces.length;
  $("budget-hint").textContent = `— mindestens ${need} nötig`;
  hint.textContent =
    Date.now() < flashUntil
      ? flashMsg
      : `${out.pieces.length} Teile · ${soot.size} Ruß · ${cracks.size} Risse` +
        (goal === "soot" ? ` · ${need} Teile reichen zum Reinigen` : "");
}

/** Wie viele Lösungsteile Ruß berühren — eine erreichbare Untergrenze fürs Budget. */
function piecesTouchingSoot(l: Level): number {
  const set = new Set(l.mechanics?.soot?.map(([r, c]) => cellKey(r, c)) ?? []);
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
$("clear").addEventListener("click", () => {
  soot = new Set();
  cracks = new Set();
  refresh();
});
function setMode(m: "soot" | "crack"): void {
  mode = m;
  $("m-soot").classList.toggle("on", m === "soot");
  $("m-crack").classList.toggle("on", m === "crack");
  $("mode-hint").textContent =
    m === "soot"
      ? "Auf eine Scheibe tippen, um sie zu verrußen."
      : "Nahe an eine Trennlinie tippen. Nur die blass markierten Kanten dürfen reißen — die anderen würden die Lösung zerschneiden.";
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
