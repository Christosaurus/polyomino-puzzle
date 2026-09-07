/**
 * The level data model — the JSON that ships in the app bundle and that the
 * generator CLI writes out.
 *
 * Design notes (from the architecture review):
 *   - `schemaVersion` from day one, so the format can evolve.
 *   - The full solution is stored, not just the piece list: hints can then work
 *     off the stored solution without running the solver on-device, and QA can
 *     check every level.
 *   - The shape is stored as ASCII rows plus an origin — compact, diff-friendly,
 *     and any silhouette works (not just rectangles).
 *   - `allowReflection` per level, even though the game currently always allows
 *     it, so individual levels can tighten the rule later.
 */

import { type Cell, cellKey } from "./cells.js";
import type { PentominoName } from "./pentomino.js";
import { Shape } from "./shape.js";

export const LEVEL_SCHEMA_VERSION = 1 as const;

export interface LevelShape {
  /** Board row of the shape's top-left bounding-box corner. Usually 0. */
  originRow: number;
  /** Board column of the shape's top-left bounding-box corner. Usually 0. */
  originCol: number;
  /** One string per row; `#` is a target cell, `.` is empty. */
  rows: string[];
}

export interface LevelPlacement {
  pieceId: PentominoName;
  /** Absolute `[row, col]` cells, in the same frame as `shape` (origin included). */
  cells: Array<[number, number]>;
}

export interface LevelMeta {
  generatorVersion: string;
  /** Seed string that produced this level. */
  seed: string;
  /** How many solutions the uniqueness check searched for (the solver's `solutionLimit`). */
  solutionCountChecked: number;
  /** Distinct solutions found, up to the shape's symmetry. 1 for a clean level. */
  distinctSolutions: number;
  /** Solver search nodes for the uniqueness check — a difficulty sub-signal. */
  solverNodes: number;
  /** ISO-8601 date the level was generated. */
  createdAt: string;
}

/**
 * What "won" means. Absent = `"cover"`, the classic fill-the-silhouette.
 *
 * `"soot"` levels are won as soon as every sooty pane is covered — the rest of
 * the shape may stay open and spare pieces may go unused. That single change
 * turns one puzzle into a different kind of thinking (see the concept doc §D),
 * and it is why a level needs a *reachable* solution rather than a unique one.
 */
export type LevelGoal = "cover" | "soot";

/** Optional obstacles laid over the board. Absent = a plain packing puzzle. */
export interface LevelMechanics {
  /**
   * Sooty panes, absolute `[row, col]` in the same frame as `shape` and
   * `solution`. Covering one cleans it.
   */
  soot?: Array<[number, number]>;
  /**
   * If set, the soot **creeps**: every this-many placements, if any sooty pane
   * is still uncovered, the stain grows onto one adjacent clean pane. Leaving
   * soot alone loses you the window; covering it fast contains it. This is what
   * turns "cover N cells" into a race (see the concept doc §D — the creeping
   * dark). Absent or 0 = static soot.
   */
  sootSpread?: number;
  /**
   * Iced panes, absolute `[row, col]`. A piece may only cover an iced pane if
   * one of its orthogonal neighbours is already covered — the light has to
   * reach it. You build inward from the edges. Removing the neighbour re-freezes
   * it. Every iced pane must border a non-iced pane so it is reachable at all.
   */
  ice?: Array<[number, number]>;
  /**
   * Cracks in the lead: each entry is a pair of orthogonally adjacent cells,
   * and **no single piece may span that edge**. The silhouette is unchanged —
   * the board is partitioned from the inside, which is a very different
   * constraint from simply removing cells.
   *
   * Safe to author on top of a finished packing: crack only edges the solution
   * does not already cross and that solution stays valid by construction, so
   * no solver work is needed to keep the level solvable.
   */
  cracks?: Array<[[number, number], [number, number]]>;
}

export interface Level {
  schemaVersion: typeof LEVEL_SCHEMA_VERSION;
  id: string;
  /** Difficulty bucket 1–5, or 0 if not yet scored. */
  difficulty: number;
  shape: LevelShape;
  /** The multiset of pieces the player is given. */
  pieces: PentominoName[];
  allowReflection: boolean;
  /** A complete solution: every piece placed, together tiling the shape exactly. */
  solution: LevelPlacement[];
  /** Win condition. Absent = `"cover"`. */
  goal?: LevelGoal;
  /** Placements allowed, instead of a clock. Absent = the clock runs. */
  moveBudget?: number;
  mechanics?: LevelMechanics;
  meta: LevelMeta;
}

/** Encode a `Shape` (plus board origin) as `LevelShape` ASCII rows. */
export function shapeToLevelShape(shape: Shape, originRow = 0, originCol = 0): LevelShape {
  return { originRow, originCol, rows: shape.toAscii().split("\n") };
}

/** Rebuild the `Shape` from a `LevelShape` (origin is dropped — `Shape` is origin-free). */
export function levelShapeToShape(levelShape: LevelShape): Shape {
  return Shape.fromAscii(levelShape.rows.join("\n"));
}

/** The target `Shape` of a level. */
export function levelShape(level: Level): Shape {
  return levelShapeToShape(level.shape);
}

export interface BuildLevelInput {
  id: string;
  shape: Shape;
  originRow?: number;
  originCol?: number;
  pieces: readonly PentominoName[];
  allowReflection: boolean;
  /** Solution placements in the shape's own frame (origin 0,0). */
  solution: ReadonlyArray<{ pieceId: PentominoName; cells: ReadonlyArray<Cell> }>;
  difficulty?: number;
  meta: LevelMeta;
}

/**
 * Assemble a `Level`, shifting the solution into the board frame by the origin.
 * Does not validate — call `validateLevel` on the result.
 */
export function buildLevel(input: BuildLevelInput): Level {
  const originRow = input.originRow ?? 0;
  const originCol = input.originCol ?? 0;
  return {
    schemaVersion: LEVEL_SCHEMA_VERSION,
    id: input.id,
    difficulty: input.difficulty ?? 0,
    shape: shapeToLevelShape(input.shape, originRow, originCol),
    pieces: [...input.pieces],
    allowReflection: input.allowReflection,
    solution: input.solution.map((p) => ({
      pieceId: p.pieceId,
      cells: p.cells.map(([r, c]): [number, number] => [r + originRow, c + originCol]),
    })),
    meta: input.meta,
  };
}

/**
 * Structural and semantic checks. Returns a list of problems; an empty list means
 * the level is internally consistent (shape parses, solution tiles it exactly,
 * pieces match the solution).
 */
export function validateLevel(level: unknown): string[] {
  const errors: string[] = [];
  const l = level as Partial<Level>;

  if (l.schemaVersion !== LEVEL_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${LEVEL_SCHEMA_VERSION}, got ${String(l.schemaVersion)}`);
    return errors;
  }
  if (typeof l.id !== "string" || l.id === "") errors.push("id must be a non-empty string");
  if (!l.shape || !Array.isArray(l.shape.rows) || l.shape.rows.length === 0) {
    errors.push("shape.rows must be a non-empty array");
    return errors;
  }
  if (!Array.isArray(l.pieces) || l.pieces.length === 0) errors.push("pieces must be non-empty");
  if (!Array.isArray(l.solution) || l.solution.length === 0) {
    errors.push("solution must be non-empty");
    return errors;
  }

  let shape: Shape;
  try {
    shape = levelShapeToShape(l.shape);
  } catch (e) {
    errors.push(`shape does not parse: ${(e as Error).message}`);
    return errors;
  }

  const { originRow, originCol } = l.shape;
  const shapeCells = new Set(
    shape.cells.map(([r, c]) => `${r + originRow},${c + originCol}`),
  );

  // Solution must cover every shape cell exactly once.
  const covered = new Map<string, number>();
  for (const placement of l.solution) {
    for (const [r, c] of placement.cells) {
      const key = `${r},${c}`;
      if (!shapeCells.has(key)) errors.push(`solution cell ${key} (${placement.pieceId}) is outside the shape`);
      covered.set(key, (covered.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of covered) {
    if (count > 1) errors.push(`solution covers cell ${key} ${count} times`);
  }
  for (const key of shapeCells) {
    if (!covered.has(key)) errors.push(`solution leaves cell ${key} empty`);
  }

  // The solution's pieces must be exactly the level's piece multiset.
  const wanted = [...(l.pieces ?? [])].sort();
  const got = l.solution.map((p) => p.pieceId).sort();
  if (JSON.stringify(wanted) !== JSON.stringify(got)) {
    errors.push(`pieces ${JSON.stringify(wanted)} != solution pieces ${JSON.stringify(got)}`);
  }

  // Each solution piece must be a connected group of the right size (5).
  for (const placement of l.solution) {
    if (placement.cells.length !== 5) {
      errors.push(`piece ${placement.pieceId} has ${placement.cells.length} cells, expected 5`);
    }
  }

  if (typeof l.difficulty !== "number" || l.difficulty < 0 || l.difficulty > 5) {
    errors.push(`difficulty must be 0–5, got ${String(l.difficulty)}`);
  }

  if (l.goal !== undefined && l.goal !== "cover" && l.goal !== "soot") {
    errors.push(`goal must be "cover" or "soot", got ${String(l.goal)}`);
  }
  if (l.moveBudget !== undefined) {
    if (typeof l.moveBudget !== "number" || l.moveBudget < 1) {
      errors.push(`moveBudget must be a positive number, got ${String(l.moveBudget)}`);
    }
  }
  const spread = l.mechanics?.sootSpread;
  if (spread !== undefined) {
    if (typeof spread !== "number" || spread < 1) {
      errors.push(`mechanics.sootSpread must be a positive number, got ${String(spread)}`);
    }
    if (!l.mechanics?.soot?.length) errors.push("mechanics.sootSpread needs soot to spread from");
  }
  const soot = l.mechanics?.soot;
  if (soot !== undefined) {
    if (!Array.isArray(soot)) {
      errors.push("mechanics.soot must be an array");
    } else {
      if (soot.length === 0) errors.push("mechanics.soot is empty — omit it instead");
      for (const cell of soot) {
        const key = `${cell[0]},${cell[1]}`;
        if (!shapeCells.has(key)) errors.push(`soot cell ${key} is outside the shape`);
      }
      // a soot goal without soot can never be met
      if (l.goal === "soot" && soot.length === 0) errors.push('goal "soot" needs soot cells');
    }
  } else if (l.goal === "soot") {
    errors.push('goal "soot" needs mechanics.soot');
  }

  const cracks = l.mechanics?.cracks;
  if (cracks !== undefined) {
    if (!Array.isArray(cracks)) {
      errors.push("mechanics.cracks must be an array");
    } else {
      for (const [a, b] of cracks) {
        const ka = `${a[0]},${a[1]}`;
        const kb = `${b[0]},${b[1]}`;
        if (!shapeCells.has(ka)) errors.push(`crack cell ${ka} is outside the shape`);
        if (!shapeCells.has(kb)) errors.push(`crack cell ${kb} is outside the shape`);
        if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1) {
          errors.push(`crack ${ka}|${kb} is not between two adjacent cells`);
        }
      }
      // Ein Riss, den die Lösung kreuzt, macht das Level unlösbar.
      const cracked = new Set(
        cracks.map(([a, b]) => [`${a[0]},${a[1]}`, `${b[0]},${b[1]}`].sort().join("|")),
      );
      for (const placement of l.solution) {
        for (const [r, c] of placement.cells) {
          for (const [dr, dc] of [
            [0, 1],
            [1, 0],
          ] as const) {
            const other = `${r + dr},${c + dc}`;
            if (!placement.cells.some(([pr, pc]) => `${pr},${pc}` === other)) continue;
            const key = [`${r},${c}`, other].sort().join("|");
            if (cracked.has(key)) {
              errors.push(`solution piece ${placement.pieceId} crosses crack ${key}`);
            }
          }
        }
      }
    }
  }
  const ice = l.mechanics?.ice;
  if (ice !== undefined) {
    if (!Array.isArray(ice)) {
      errors.push("mechanics.ice must be an array");
    } else {
      const iceSet = new Set(ice.map(([r, c]) => `${r},${c}`));
      for (const [r, c] of ice) {
        if (!shapeCells.has(`${r},${c}`)) errors.push(`ice cell ${r},${c} is outside the shape`);
        // muss an eine nicht-vereiste Scheibe grenzen, sonst nie auftaubar
        const thawable = ([
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as const).some(([dr, dc]) => {
          const k = `${r + dr},${c + dc}`;
          return shapeCells.has(k) && !iceSet.has(k);
        });
        if (!thawable) errors.push(`ice cell ${r},${c} is locked in by ice — no free neighbour`);
      }
      // es muss eine Reihenfolge geben, in der die Lösung das Eis respektiert
      if (iceSet.size > 0 && !solutionRespectsIce(l.solution, iceSet)) {
        errors.push("no placement order of the solution satisfies the ice");
      }
    }
  }
  void cellKey; // reserved for a future stricter piece-shape check

  return errors;
}

/**
 * Greedy: can the solution's pieces be placed in *some* order such that every
 * iced cell has an orthogonal neighbour covered by an *already-placed* piece at
 * the moment it goes down? (The piece's own cells don't count — the light has
 * to reach the ice from outside.) Repeatedly place any piece whose ice cells
 * are all satisfiable, until all are placed or none can be.
 */
function solutionRespectsIce(
  solution: LevelPlacement[],
  iceSet: Set<string>,
): boolean {
  const covered = new Set<string>();
  const remaining = solution.map((p) => p.cells.map(([r, c]) => `${r},${c}`));
  let placedSomething = true;
  while (remaining.length > 0 && placedSomething) {
    placedSomething = false;
    for (let i = 0; i < remaining.length; i++) {
      const cells = remaining[i]!;
      const ok = cells.every((key) => {
        if (!iceSet.has(key)) return true;
        const [r, c] = key.split(",").map(Number) as [number, number];
        return ([
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as const).some(([dr, dc]) => {
          const n = `${r + dr},${c + dc}`;
          return covered.has(n);
        });
      });
      if (ok) {
        for (const key of cells) covered.add(key);
        remaining.splice(i, 1);
        placedSomething = true;
        break;
      }
    }
  }
  return remaining.length === 0;
}

/** Pretty-printed JSON, stable key order. */
export function serializeLevel(level: Level): string {
  return JSON.stringify(level, null, 2);
}

/** Parse and validate. Throws with the collected errors if invalid. */
export function parseLevel(json: string): Level {
  const data = JSON.parse(json) as unknown;
  const errors = validateLevel(data);
  if (errors.length > 0) {
    throw new Error(`Invalid level:\n  - ${errors.join("\n  - ")}`);
  }
  return data as Level;
}
