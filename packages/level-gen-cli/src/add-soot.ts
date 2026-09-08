/**
 * Fügt handkuratierte **Mechanik-Fenster** zur Kampagne hinzu — additiv:
 * Ruß (`soot_XX`), Risse (`crack_XX`) und Eis (`ice_XX`).
 *
 * Anders als `main.ts` wird hier nichts neu nummeriert: die vorhandenen
 * `level_XXX` behalten ihre IDs, damit gesammelte Sterne erhalten bleiben. Die
 * neuen Level werden an gewählten Stellen in die Manifest-Liste eingefügt.
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
type SootPattern = "streak" | "corner" | "specks" | "rim";
type Pattern = SootPattern | "cracks" | "ice" | "candle" | "boss" | "chain";

interface Recipe {
  id: string;
  shapeLabel: string;
  pattern: Pattern;
  difficulty: number;
  /** Wohin in der Manifest-Liste (Index), damit das Level in der Region landet, in die es gehört. */
  insertAt: number;
  slack: number;
  /** Alle N Züge kriecht der Ruß eine Scheibe weiter (0 = statisch). */
  spread?: number;
}

/**
 * Vier Fenster, die dieselbe Mechanik in vier Schritten erzählen
 * (Einführung → Ausbau → Wendung → Prüfung, KONZEPT-lumen.md §I).
 */
const RECIPES: Recipe[] = [
  // 1 Einführung: statischer Ruß, viel Luft — "so wird gereinigt".
  { id: "soot_01", shapeLabel: "rect-3x5", pattern: "corner", difficulty: 1, insertAt: 3, slack: 3 },
  // 2 Ausbau: jetzt kriecht er. Alle 3 Züge eine Scheibe.
  { id: "soot_02", shapeLabel: "rect-4x5", pattern: "streak", difficulty: 2, insertAt: 6, slack: 4, spread: 3 },
  // 3 Wendung: kriecht schneller, verstreut — man muss sich entscheiden, wo zuerst.
  { id: "soot_03", shapeLabel: "rect-5x6", pattern: "specks", difficulty: 3, insertAt: 9, slack: 3, spread: 2 },
  // 4 Prüfung: kriecht + knappes Budget. Kein Zug darf daneben.
  { id: "soot_04", shapeLabel: "rect-5x8", pattern: "rim", difficulty: 3, insertAt: 12, slack: 2, spread: 2 },
  // Risse — Akt II, die Werkstatt. Hier fällt auf, dass geschnitten wurde.
  { id: "crack_01", shapeLabel: "rect-4x5", pattern: "cracks", difficulty: 3, insertAt: 16, slack: 3 },
  { id: "crack_02", shapeLabel: "rect-5x6", pattern: "cracks", difficulty: 3, insertAt: 19, slack: 3 },
  { id: "crack_03", shapeLabel: "rect-5x8", pattern: "cracks", difficulty: 4, insertAt: 24, slack: 2 },
  // Eis — Akt III, der Farbhof. Vereiste Scheiben, die erst auftauen, wenn das
  // Licht sie erreicht: man muss von den Rändern nach innen bauen.
  { id: "ice_01", shapeLabel: "rect-4x5", pattern: "ice", difficulty: 4, insertAt: 26, slack: 3 },
  { id: "ice_02", shapeLabel: "rect-5x6", pattern: "ice", difficulty: 4, insertAt: 30, slack: 3 },
  { id: "ice_03", shapeLabel: "rect-5x8", pattern: "ice", difficulty: 5, insertAt: 34, slack: 2 },
  // Kerze — Endspiel. Eine Scheibe muss zuletzt gedeckt werden: man hält ein
  // Teil bis zum letzten Zug zurück. Farbhof, kurz vors Finale.
  { id: "candle_01", shapeLabel: "rect-4x5", pattern: "candle", difficulty: 4, insertAt: 32, slack: 3 },
  { id: "candle_02", shapeLabel: "rect-5x6", pattern: "candle", difficulty: 5, insertAt: 37, slack: 2 },
  // Kette — Akt II, die Werkstatt. Zwei Scheiben, die dasselbe Teil decken
  // muss. Man muss ein Teil setzen können, bevor man sieht, was es verbindet.
  { id: "chain_01", shapeLabel: "rect-4x5", pattern: "chain", difficulty: 2, insertAt: 15, slack: 3 },
  { id: "chain_02", shapeLabel: "rect-5x6", pattern: "chain", difficulty: 3, insertAt: 22, slack: 3 },
  // Das letzte Fenster — der Boss. Groß, geschnitten (Risse) und mit der Kerze
  // ganz zum Schluss. Alles, was Anselm gelernt hat, auf einmal.
  { id: "boss_01", shapeLabel: "rect-5x9", pattern: "boss", difficulty: 5, insertAt: 42, slack: 4 },
];

function sootFor(pattern: SootPattern, cells: Cell[], nth: number): Cell[] {
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

/**
 * Risse auf eine fertige Packung legen — **nur** auf Kanten, die kein
 * Lösungsteil ohnehin schon überspannt. Damit bleibt die gespeicherte Lösung
 * per Konstruktion gültig; es muss nichts nachgerechnet werden.
 *
 * Bevorzugt werden Kanten im Inneren (beide Zellen ringsum von Brett umgeben),
 * weil ein Riss am Rand meist gar keine Platzierung verhindert und sich
 * deshalb wie Deko anfühlt.
 */
function cracksFor(
  level: Level,
  shapeCells: Cell[],
  want: number,
  nth: number,
): Array<[Cell, Cell]> {
  const inShape = new Set(shapeCells.map(([r, c]) => `${r},${c}`));
  const spannedBySolution = new Set<string>();
  for (const p of level.solution) {
    const own = new Set(p.cells.map(([r, c]) => `${r},${c}`));
    for (const [r, c] of p.cells) {
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
      ] as const) {
        if (own.has(`${r + dr},${c + dc}`)) {
          spannedBySolution.add([`${r},${c}`, `${r + dr},${c + dc}`].sort().join("|"));
        }
      }
    }
  }

  const interior = ([r, c]: Cell): boolean =>
    inShape.has(`${r - 1},${c}`) &&
    inShape.has(`${r + 1},${c}`) &&
    inShape.has(`${r},${c - 1}`) &&
    inShape.has(`${r},${c + 1}`);

  const candidates: Array<[Cell, Cell]> = [];
  for (const [r, c] of shapeCells) {
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
    ] as const) {
      const nb: Cell = [r + dr, c + dc];
      if (!inShape.has(`${nb[0]},${nb[1]}`)) continue;
      const key = [`${r},${c}`, `${nb[0]},${nb[1]}`].sort().join("|");
      if (spannedBySolution.has(key)) continue; // würde die Lösung zerschneiden
      if (!interior([r, c]) && !interior(nb)) continue; // Randkanten bringen nichts
      candidates.push([[r, c], nb]);
    }
  }
  if (candidates.length === 0) return [];

  // gestreut auswählen, damit die Risse nicht als Bündel an einer Stelle sitzen
  const step = Math.max(1, Math.floor(candidates.length / want));
  const out: Array<[Cell, Cell]> = [];
  for (let i = 0; i < want; i++) {
    const pick = candidates[(nth + i * step) % candidates.length];
    if (pick && !out.includes(pick)) out.push(pick);
  }
  return out;
}

/**
 * Eis auf eine fertige Packung legen: die Zellen eines oder zweier Lösungsteile
 * nahe der Fenstermitte vereisen. So taut das Eis erst auf, wenn die Teile
 * ringsum liegen — man baut von den Rändern nach innen.
 *
 * Randregel: jede Eiszelle braucht mindestens einen nicht-vereisten Nachbarn,
 * sonst wäre sie nie erreichbar. Passt das gewählte Teil nicht, `[]` → nächster
 * Versuch. Die eigentliche Reihenfolge-Prüfung macht `validateLevel`.
 */
function iceFor(level: Level, shapeCells: Cell[], nth: number): Cell[] {
  const inShape = new Set(shapeCells.map(([r, c]) => `${r},${c}`));
  const rows = Math.max(...shapeCells.map((c) => c[0])) + 1;
  const cols = Math.max(...shapeCells.map((c) => c[1])) + 1;
  const cr = (rows - 1) / 2;
  const cc = (cols - 1) / 2;

  const ranked = level.solution
    .map((p) => {
      const local = p.cells.map(
        ([r, c]): Cell => [r - level.shape.originRow, c - level.shape.originCol],
      );
      const mr = local.reduce((s, [r]) => s + r, 0) / local.length;
      const mc = local.reduce((s, [, c]) => s + c, 0) / local.length;
      return { local, d: Math.hypot(mr - cr, mc - cc) };
    })
    .sort((a, b) => a.d - b.d);
  if (ranked.length < 3) return [];

  const take = level.solution.length >= 6 ? 2 : 1;
  const start = nth % Math.max(1, ranked.length - take - 1);
  const chosen = ranked.slice(start, start + take);

  const out: Cell[] = [];
  for (const p of chosen) for (const cell of p.local) out.push(cell);
  const iceSet = new Set(out.map(([r, c]) => `${r},${c}`));
  for (const [r, c] of out) {
    const free = ([
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const).some(([dr, dc]) => {
      const k = `${r + dr},${c + dc}`;
      return inShape.has(k) && !iceSet.has(k);
    });
    if (!free) return [];
  }
  return out;
}

/**
 * Kerze: eine Zelle des Lösungsteils nahe der Fenstermitte. Dieses Teil ist
 * gut vernetzt — man will es früh legen, muss es aber bis zuletzt zurückhalten.
 * Das ist der ganze Reiz. Ein einzelnes Kerzen-Teil ist per Konstruktion
 * lösbar (alle anderen zuerst, dann dieses).
 */
function candleFor(level: Level, shapeCells: Cell[], nth: number): Cell[] {
  const rows = Math.max(...shapeCells.map((c) => c[0])) + 1;
  const cols = Math.max(...shapeCells.map((c) => c[1])) + 1;
  const cr = (rows - 1) / 2;
  const cc = (cols - 1) / 2;
  const ranked = level.solution
    .map((p) => {
      const local = p.cells.map(
        ([r, c]): Cell => [r - level.shape.originRow, c - level.shape.originCol],
      );
      const mr = local.reduce((s, [r]) => s + r, 0) / local.length;
      const mc = local.reduce((s, [, c]) => s + c, 0) / local.length;
      return { local, d: Math.hypot(mr - cr, mc - cc) };
    })
    .sort((a, b) => a.d - b.d);
  if (ranked.length < 3) return [];
  const piece = ranked[nth % Math.min(2, ranked.length)]!;
  // die Kerzen-Zelle: die dem Fensterzentrum nächste Zelle dieses Teils
  const cell = [...piece.local].sort(
    (a, b) => Math.hypot(a[0] - cr, a[1] - cc) - Math.hypot(b[0] - cr, b[1] - cc),
  )[0]!;
  return [cell];
}

/**
 * Kette: die zwei am weitesten auseinander liegenden Zellen desselben
 * Lösungsteils. Weit auseinander = die Bindung ist nicht offensichtlich, man
 * muss das Teil vor sich sehen. Per Konstruktion lösbar, weil beide Zellen
 * ohnehin von einem Teil gedeckt werden.
 */
function chainFor(level: Level, nth: number): Array<[Cell, Cell]> {
  const { originRow, originCol } = level.shape;
  const ranked = level.solution
    .map((p) => {
      const local = p.cells.map(([r, c]): Cell => [r - originRow, c - originCol]);
      let best: [Cell, Cell] = [local[0]!, local[0]!];
      let far = -1;
      for (let i = 0; i < local.length; i++)
        for (let j = i + 1; j < local.length; j++) {
          const d = Math.abs(local[i]![0] - local[j]![0]) + Math.abs(local[i]![1] - local[j]![1]);
          if (d > far) {
            far = d;
            best = [local[i]!, local[j]!];
          }
        }
      return { pair: best, far };
    })
    .sort((a, b) => b.far - a.far);
  const pick = ranked[nth % Math.min(2, ranked.length)];
  if (!pick || pick.far < 2) return [];
  return [pick.pair];
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
    if (recipe.pattern === "cracks") {
      const want = Math.min(5, 2 + Math.floor(level.pieces.length / 3));
      const local = cracksFor(level, shapeCells, want, attempt);
      if (local.length < 2) continue;
      const cracks: Array<[Cell, Cell]> = local.map(([a, b]) => [
        [a[0] + originRow, a[1] + originCol],
        [b[0] + originRow, b[1] + originCol],
      ]);
      level.id = recipe.id;
      level.difficulty = recipe.difficulty;
      level.mechanics = { cracks };
      level.moveBudget = level.pieces.length + recipe.slack;
      const errs = validateLevel(level);
      if (errs.length > 0) throw new Error(`${recipe.id}: ${errs.join("; ")}`);
      console.log(
        `${recipe.id} ${recipe.shapeLabel.padEnd(9)} cracks  ${String(cracks.length).padStart(2)} Risse` +
          `                    Budget ${level.moveBudget}`,
      );
      return level;
    }

    if (recipe.pattern === "ice") {
      const localIce = iceFor(level, shapeCells, attempt);
      if (localIce.length < 3) continue;
      const ice: Cell[] = localIce.map(([r, c]) => [r + originRow, c + originCol]);
      level.id = recipe.id;
      level.difficulty = recipe.difficulty;
      level.mechanics = { ice };
      level.moveBudget = level.pieces.length + recipe.slack;
      const errs = validateLevel(level);
      if (errs.length > 0) continue; // Eis-Reihenfolge unlösbar → nächster Versuch
      console.log(
        `${recipe.id}   ${recipe.shapeLabel.padEnd(9)} ice     ${String(ice.length).padStart(2)} Scheiben vereist` +
          `             Budget ${level.moveBudget}`,
      );
      return level;
    }

    if (recipe.pattern === "boss") {
      // Risse zerteilen das Fenster, die Kerze schließt es. Zusammen: das
      // schwerste Fenster im Spiel, das letzte, das du mit Anselm baust.
      const wantCracks = 3;
      const local = cracksFor(level, shapeCells, wantCracks, attempt);
      if (local.length < 2) continue;
      const localC = candleFor(level, shapeCells, attempt);
      if (localC.length === 0) continue;
      // die Kerze darf nicht auf einer Riss-Kante hängen — das Kerzen-Teil
      // muss frei bis zuletzt platzierbar bleiben
      const crackCells = new Set(local.flat().map(([r, c]) => `${r},${c}`));
      if (localC.some(([r, c]) => crackCells.has(`${r},${c}`))) continue;
      level.id = recipe.id;
      level.difficulty = recipe.difficulty;
      level.mechanics = {
        cracks: local.map(([a, b]) => [
          [a[0] + originRow, a[1] + originCol],
          [b[0] + originRow, b[1] + originCol],
        ]),
        candle: localC.map(([r, c]) => [r + originRow, c + originCol]),
      };
      level.moveBudget = level.pieces.length + recipe.slack;
      const errs = validateLevel(level);
      if (errs.length > 0) continue;
      console.log(
        `${recipe.id}   ${recipe.shapeLabel.padEnd(9)} boss    ${local.length} Risse + Kerze` +
          `           Budget ${level.moveBudget}`,
      );
      return level;
    }

    if (recipe.pattern === "chain") {
      const local = chainFor(level, attempt);
      if (local.length === 0) continue;
      level.id = recipe.id;
      level.difficulty = recipe.difficulty;
      level.mechanics = {
        chains: local.map(([a, b]) => [
          [a[0] + originRow, a[1] + originCol],
          [b[0] + originRow, b[1] + originCol],
        ]),
      };
      level.moveBudget = level.pieces.length + recipe.slack;
      const errs = validateLevel(level);
      if (errs.length > 0) continue;
      const [a, b] = local[0]!;
      console.log(
        `${recipe.id} ${recipe.shapeLabel.padEnd(9)} chain   ${a[0]},${a[1]} — ${b[0]},${b[1]}` +
          `           Budget ${level.moveBudget}`,
      );
      return level;
    }

    if (recipe.pattern === "candle") {
      const localC = candleFor(level, shapeCells, attempt);
      if (localC.length === 0) continue;
      const cand: Cell[] = localC.map(([r, c]) => [r + originRow, c + originCol]);
      level.id = recipe.id;
      level.difficulty = recipe.difficulty;
      level.mechanics = { candle: cand };
      level.moveBudget = level.pieces.length + recipe.slack;
      const errs = validateLevel(level);
      if (errs.length > 0) continue;
      console.log(
        `${recipe.id} ${recipe.shapeLabel.padEnd(9)} candle  Kerze bei ${cand[0]![0]},${cand[0]![1]}` +
          `            Budget ${level.moveBudget}`,
      );
      return level;
    }

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
    level.mechanics = recipe.spread ? { soot, sootSpread: recipe.spread } : { soot };
    // kriecht der Ruß, braucht es Luft: das Budget deckt auch die Scheiben,
    // die noch dazukommen, bevor man alle erreicht
    const spreadExtra = recipe.spread ? Math.ceil((level.pieces.length + recipe.slack) / recipe.spread) : 0;
    level.moveBudget = need + recipe.slack + spreadExtra;

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

manifest.levels = manifest.levels.filter(
  (l) =>
    !String(l.id).startsWith("soot_") &&
    !String(l.id).startsWith("crack_") &&
    !String(l.id).startsWith("ice_") &&
    !String(l.id).startsWith("candle_") &&
    !String(l.id).startsWith("chain_") &&
    !String(l.id).startsWith("boss_"),
);
for (const { recipe, level } of built) {
  writeFileSync(join(OUT, `${level.id}.json`), `${serializeLevel(level)}\n`);
  manifest.levels.splice(recipe.insertAt, 0, {
    id: level.id,
    difficulty: level.difficulty,
    pieces: level.pieces.join(""),
    rows: level.shape.rows.length,
    cols: level.shape.rows[0]?.length ?? 0,
    ...(level.goal ? { goal: level.goal } : {}),
    ...(level.mechanics?.soot ? { soot: level.mechanics.soot.length } : {}),
    ...(level.mechanics?.cracks ? { cracks: level.mechanics.cracks.length } : {}),
    ...(level.mechanics?.ice ? { ice: level.mechanics.ice.length } : {}),
    ...(level.mechanics?.candle ? { candle: level.mechanics.candle.length } : {}),
    ...(level.mechanics?.chains ? { chains: level.mechanics.chains.length } : {}),
    moveBudget: level.moveBudget,
  });
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\n${built.length} Ruß-Fenster geschrieben, Manifest hat jetzt ${manifest.levels.length} Level.`);
