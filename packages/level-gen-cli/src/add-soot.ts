/**
 * Fügt handkuratierte **Ruß-Fenster** zur Kampagne hinzu — additiv.
 *
 * Anders als `main.ts` wird hier nichts neu nummeriert: die vorhandenen
 * `level_XXX` behalten ihre IDs, damit gesammelte Sterne erhalten bleiben. Die
 * neuen Level heißen `soot_XX` und werden an gewählten Stellen in die Manifest-
 * Liste eingefügt.
 *
 * Der Ablauf ist der Hybrid aus dem Konzept (§D): **der Generator baut die
 * Packung, der Autor legt die Mechanik darüber.** Weil ein Ruß-Level nur
 * verlangt, dass jede verrußte Scheibe bedeckt wird, ist die vollständige
 * Lösung immer *eine* gültige Antwort — Lösbarkeit ist damit geschenkt, ohne
 * dass irgendwas auf Eindeutigkeit geprüft werden muss.
 *
 *   npm run build -w @polyomino/level-gen-cli
 *   node packages/level-gen-cli/dist/add-soot.js
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  generateLevel,
  type Level,
  rngFromSeed,
  serializeLevel,
  validateLevel,
} from "@polyomino/puzzle-core";
import { SHAPE_CATALOG } from "./shapes.js";

const OUT = join(process.cwd(), "packages", "web", "public", "levels");

type Cell = [number, number];
type Pattern = "streak" | "corner" | "specks" | "rim";

interface Recipe {
  id: string;
  shapeLabel: string;
  pattern: Pattern;
  difficulty: number;
  /** Wohin in der Manifest-Liste (Index), damit das Level in der Region landet, in die es gehört. */
  insertAt: number;
  slack: number;
}

/**
 * Vier Fenster, die dieselbe Mechanik in vier Schritten erzählen
 * (Einführung → Ausbau → Wendung → Prüfung, KONZEPT-lumen.md §I).
 */
const RECIPES: Recipe[] = [
  { id: "soot_01", shapeLabel: "rect-3x5", pattern: "corner", difficulty: 1, insertAt: 3, slack: 3 },
  { id: "soot_02", shapeLabel: "rect-4x5", pattern: "streak", difficulty: 1, insertAt: 6, slack: 3 },
  { id: "soot_03", shapeLabel: "rect-5x6", pattern: "specks", difficulty: 2, insertAt: 9, slack: 2 },
  { id: "soot_04", shapeLabel: "rect-5x8", pattern: "rim", difficulty: 2, insertAt: 12, slack: 2 },
];

function sootFor(pattern: Pattern, cells: Cell[], nth: number): Cell[] {
  const rows = Math.max(...cells.map((c) => c[0])) + 1;
  const cols = Math.max(...cells.map((c) => c[1])) + 1;
  const has = new Set(cells.map(([r, c]) => `${r},${c}`));
  const keep = (r: number, c: number): boolean => has.has(`${r},${c}`);

  switch (pattern) {
    case "corner": {
      // Die dunkle Ecke des Fensters — kompakt, ein, zwei Teile reichen.
      const out: Cell[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (r + c <= 2 + (nth % 2) && keep(r, c)) out.push([r, c]);
        }
      }
      return out;
    }
    case "streak": {
      // Ein Schmierstreifen quer durchs Glas — zwingt zu einer Linie.
      const out: Cell[] = [];
      for (let c = 0; c < cols; c++) {
        const r = Math.min(rows - 1, Math.floor((c * (rows - 1)) / Math.max(1, cols - 1)));
        if (keep(r, c)) out.push([r, c]);
      }
      return out;
    }
    case "specks": {
      // Verstreute Flecken — man muss sich über das ganze Fenster verteilen.
      const out: Cell[] = [];
      for (const [r, c] of cells) {
        if ((r * 5 + c * 3 + nth) % 7 === 0) out.push([r, c]);
      }
      return out;
    }
    case "rim": {
      // Ruß am Rand — die Mitte darf offen bleiben, das fühlt sich neu an.
      return cells.filter(
        ([r, c]) => !keep(r - 1, c) || !keep(r + 1, c) || !keep(r, c - 1) || !keep(r, c + 1),
      );
    }
  }
}

/** Wie viele Teile der bekannten Lösung Ruß berühren — eine erreichbare Obergrenze. */
function piecesTouchingSoot(level: Level, soot: Cell[]): number {
  const set = new Set(soot.map(([r, c]) => `${r},${c}`));
  let n = 0;
  for (const p of level.solution) {
    if (p.cells.some(([r, c]) => set.has(`${r},${c}`))) n += 1;
  }
  return n;
}

function build(recipe: Recipe): Level {
  const entry = SHAPE_CATALOG.find((s) => s.label === recipe.shapeLabel);
  if (!entry) throw new Error(`unknown shape ${recipe.shapeLabel}`);

  for (let attempt = 0; attempt < 40; attempt++) {
    const seed = `soot:${recipe.id}:${attempt}`;
    const res = generateLevel({
      shape: entry.shape,
      rng: rngFromSeed(seed),
      seed,
      maxAttempts: 200,
      maxSolverNodes: 400_000,
      now: () => new Date("2026-01-01T00:00:00Z"),
    });
    const level = res.level;
    if (!level) continue;

    const { originRow, originCol } = level.shape;
    const shapeCells: Cell[] = [];
    level.shape.rows.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        if (ch === "#") shapeCells.push([r, c]);
      });
    });
    const local = sootFor(recipe.pattern, shapeCells, attempt);
    const soot: Cell[] = local.map(([r, c]) => [r + originRow, c + originCol]);
    if (soot.length < 3) continue;

    // Der Reiz entsteht nur, wenn ein Teil der Teile ungenutzt bleiben darf —
    // deckt der Ruß ohnehin jedes Lösungsteil, ist es wieder das alte Spiel.
    const need = piecesTouchingSoot(level, soot);
    const frac = need / level.pieces.length;
    if (frac < 0.35 || frac > 0.8) continue;

    level.id = recipe.id;
    level.difficulty = recipe.difficulty;
    level.goal = "soot";
    level.mechanics = { soot };
    level.moveBudget = need + recipe.slack;

    const errors = validateLevel(level);
    if (errors.length > 0) throw new Error(`${recipe.id}: ${errors.join("; ")}`);
    console.log(
      `${recipe.id}  ${recipe.shapeLabel.padEnd(9)} ${recipe.pattern.padEnd(7)} ` +
        `soot ${String(soot.length).padStart(2)}  ${need}/${level.pieces.length} Teile nötig  ` +
        `Budget ${level.moveBudget}`,
    );
    return level;
  }
  throw new Error(`${recipe.id}: no level matched the recipe in 40 attempts`);
}

const manifestPath = join(OUT, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  levels: Array<Record<string, unknown>>;
  [k: string]: unknown;
};

// erst alle bauen, dann schreiben — ein Fehlschlag soll nichts halb hinterlassen
const built = RECIPES.map((r) => ({ recipe: r, level: build(r) }));

manifest.levels = manifest.levels.filter((l) => !String(l.id).startsWith("soot_"));
for (const { recipe, level } of built) {
  writeFileSync(join(OUT, `${level.id}.json`), `${serializeLevel(level)}\n`);
  manifest.levels.splice(recipe.insertAt, 0, {
    id: level.id,
    difficulty: level.difficulty,
    pieces: level.pieces.join(""),
    rows: level.shape.rows.length,
    cols: level.shape.rows[0]?.length ?? 0,
    goal: "soot",
    soot: level.mechanics?.soot?.length ?? 0,
    moveBudget: level.moveBudget,
  });
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\n${built.length} Ruß-Fenster geschrieben, Manifest hat jetzt ${manifest.levels.length} Level.`);
