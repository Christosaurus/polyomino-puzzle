/**
 * Runtime state for one window (campaign / daily / descent).
 *
 * Pure geometry — no solver. A move is legal when the piece's cells all sit
 * inside the target shape and none overlap another placed piece.
 *
 * Two things vary per level and both default to the classic behaviour:
 * - **Goal**: cover the whole silhouette, or just clean every sooty pane.
 * - **Pressure**: a move budget, or the clock.
 */

import {
  type Cell,
  type Level,
  type LevelGoal,
  levelShape,
  PENTOMINOES,
  type PentominoName,
  type Rng,
  type Shape,
} from "@polyomino/puzzle-core";

export interface Pos {
  row: number;
  col: number;
}

export interface PieceState {
  key: string;
  name: PentominoName;
  orientationIndex: number;
  pos: Pos | null;
}

/** Kanäle zwischen zwei Nachbarzellen, richtungsunabhängig. */
function edgeKey(a: [number, number], b: [number, number]): string {
  return [`${a[0]},${a[1]}`, `${b[0]},${b[1]}`].sort().join("|");
}

function limitMsFor(level: Level): number {
  const pieces = level.pieces.length;
  const secs = (25 + pieces * 10) * (0.8 + level.difficulty * 0.14);
  return Math.round(secs) * 1000;
}

export class GameState {
  readonly level: Level;
  readonly shape: Shape;
  readonly pieces: PieceState[];
  limitMs: number;
  usedUndo = false;

  private readonly shapeCells: Set<string>;
  /** Piece name → its solution cells in the shape frame, sorted. */
  private readonly solutionCells = new Map<PentominoName, Array<[number, number]>>();
  private startedAt: number | null = null;
  private endedAt: number | null = null;
  private pausedAt: number | null = null;
  private pausedTotal = 0;
  private frozenCells: Set<string> | null = null;
  private frozenUnlocked = true;
  private justUnlocked = false;
  /** null = kein Zugbudget, es zählt die Uhr (Altverhalten). */
  private moveBudget: number | null = null;
  private movesUsed = 0;
  /** Verrußte Scheiben (Brett-Frame). Bedecken reinigt sie. */
  private readonly soot: Set<string>;
  /** Gerissene Kanten als `"r,c|r,c"` (sortiert). Kein Teil darf sie überspannen. */
  private readonly cracks: Set<string>;

  constructor(level: Level, limitMsOverride?: number) {
    this.level = level;
    this.shape = levelShape(level);
    this.limitMs = limitMsOverride ?? limitMsFor(level);
    this.shapeCells = new Set(this.shape.cells.map(([r, c]) => `${r},${c}`));
    this.pieces = level.pieces.map((name, i) => ({
      key: `${name}#${i}`,
      name,
      orientationIndex: 0,
      pos: null,
    }));
    const { originRow, originCol } = level.shape;
    for (const s of level.solution) {
      this.solutionCells.set(
        s.pieceId,
        s.cells
          .map(([r, c]): [number, number] => [r - originRow, c - originCol])
          .sort((a, b) => a[0] - b[0] || a[1] - b[1]),
      );
    }
    this.soot = new Set(
      (level.mechanics?.soot ?? []).map(([r, c]) => `${r - originRow},${c - originCol}`),
    );
    this.cracks = new Set(
      (level.mechanics?.cracks ?? []).map(([a, b]) =>
        edgeKey(
          [a[0] - originRow, a[1] - originCol],
          [b[0] - originRow, b[1] - originCol],
        ),
      ),
    );
    if (level.moveBudget !== undefined) this.setMoveBudget(level.moveBudget);
  }

  // ── Risse ─────────────────────────────────────────────────────────────────
  get hasCracks(): boolean {
    return this.cracks.size > 0;
  }
  /** Läuft zwischen diesen beiden Nachbarzellen ein Riss? */
  isCracked(a: [number, number], b: [number, number]): boolean {
    return this.cracks.has(edgeKey(a, b));
  }
  /** Jede gerissene Kante einmal, für die Darstellung. */
  crackEdges(): Array<[[number, number], [number, number]]> {
    return [...this.cracks].map((key) => {
      const [a, b] = key.split("|");
      const [ar, ac] = a!.split(",").map(Number) as [number, number];
      const [br, bc] = b!.split(",").map(Number) as [number, number];
      return [
        [ar, ac],
        [br, bc],
      ];
    });
  }

  // ── Ruß ───────────────────────────────────────────────────────────────────
  get goal(): LevelGoal {
    return this.level.goal ?? "cover";
  }
  isSooty(row: number, col: number): boolean {
    return this.soot.has(`${row},${col}`);
  }
  /** Liegt auf dieser Scheibe ein platziertes Teil? */
  isCovered(row: number, col: number): boolean {
    return this.occupied().has(`${row},${col}`);
  }
  get sootTotal(): number {
    return this.soot.size;
  }
  /** Wie viele verrußte Scheiben schon bedeckt sind. */
  get sootCleared(): number {
    if (this.soot.size === 0) return 0;
    const covered = this.occupied();
    let n = 0;
    for (const key of this.soot) if (covered.has(key)) n += 1;
    return n;
  }

  /** Add time (joker). */
  extendLimit(ms: number): void {
    this.limitMs += ms;
  }

  // ── Zugbudget ─────────────────────────────────────────────────────────────
  /**
   * Statt einer Uhr: eine feste Zahl Platzierungen. Zeitdruck bestraft
   * Nachdenken — ein Zugbudget belohnt es und erzeugt trotzdem die sichtbare
   * Anspannung, von der der Kernloop lebt (KONZEPT-lumen.md §D).
   *
   * Ein Teil zurückzunehmen erstattet den Zug **nicht**, sonst wäre das Budget
   * bedeutungslos. Es liegt aber über der Teilezahl, du hast also Luft für ein
   * paar Fehlversuche — Ausprobieren bleibt erlaubt, nur nicht unbegrenzt.
   */
  setMoveBudget(moves: number | null): void {
    this.moveBudget = moves === null ? null : Math.max(this.pieces.length, Math.round(moves));
  }
  /** Joker: ein paar Züge mehr. No-op ohne Budget. */
  extendMoves(n: number): void {
    if (this.moveBudget !== null) this.moveBudget += n;
  }
  get hasMoveBudget(): boolean {
    return this.moveBudget !== null;
  }
  get movesLeft(): number {
    return this.moveBudget === null ? Infinity : Math.max(0, this.moveBudget - this.movesUsed);
  }
  get outOfMoves(): boolean {
    return this.moveBudget !== null && this.movesUsed >= this.moveBudget;
  }

  /** Descent/Daily twist: lock part of the board until the rest is solved. */
  setFrozenZone(cells: Set<string> | null): void {
    this.frozenCells = cells && cells.size > 0 ? cells : null;
    this.frozenUnlocked = this.frozenCells === null;
  }
  /**
   * Pick a frozen zone made of whole solution pieces (never a raw geometric
   * split) — freezing must land exactly on piece boundaries, otherwise a
   * piece straddling the line could never be placed (blocked while locked)
   * yet is required to unlock (needed to cover its share of the open area),
   * deadlocking the level. Needs at least 3 pieces so both sides are
   * non-trivial. Returns whether a twist was actually applied.
   */
  applyFrozenTwist(rng: Rng): boolean {
    const names = rng.shuffle([...this.solutionCells.keys()]);
    if (names.length < 3) return false;
    const total = this.shape.size;
    const frozen = new Set<string>();
    let frozenCount = 0;
    let frozenPieces = 0;
    for (const name of names) {
      if (frozenPieces > 0 && frozenPieces >= names.length - 1) break; // keep at least one open piece
      const cells = this.solutionCells.get(name)!;
      const nextFrac = (frozenCount + cells.length) / total;
      if (frozenPieces > 0 && nextFrac > 0.65) break;
      for (const [r, c] of cells) frozen.add(`${r},${c}`);
      frozenCount += cells.length;
      frozenPieces += 1;
      if (frozenCount / total >= 0.35 && rng.next() < 0.5) break;
    }
    if (frozenPieces === 0 || frozenPieces >= names.length) return false;
    this.setFrozenZone(frozen);
    return true;
  }
  get hasFrozenZone(): boolean {
    return this.frozenCells !== null;
  }
  get isFrozenUnlocked(): boolean {
    return this.frozenUnlocked;
  }
  isFrozen(r: number, c: number): boolean {
    return !this.frozenUnlocked && (this.frozenCells?.has(`${r},${c}`) ?? false);
  }
  /** True once, right after the frozen zone opens — consume it to celebrate. */
  consumeUnlock(): boolean {
    const v = this.justUnlocked;
    this.justUnlocked = false;
    return v;
  }
  private checkUnlock(): void {
    if (this.frozenUnlocked || !this.frozenCells) return;
    const occ = this.occupied();
    for (const key of this.shapeCells) {
      if (this.frozenCells.has(key)) continue;
      if (!occ.has(key)) return; // an open cell is still unfilled
    }
    this.frozenUnlocked = true;
    this.justUnlocked = true;
  }

  /** A piece that is either unplaced or sitting somewhere other than its solution spot. */
  firstUnsolved(): { piece: PieceState; cells: Array<[number, number]> } | null {
    for (const piece of this.pieces) {
      const target = this.solutionCells.get(piece.name);
      if (!target) continue;
      if (!this.frozenUnlocked && target.some(([r, c]) => this.isFrozen(r, c))) continue;
      const here = piece.pos
        ? this.cellsAt(piece, piece.pos)
            .map(([r, c]): [number, number] => [r, c])
            .sort((a, b) => a[0] - b[0] || a[1] - b[1])
        : null;
      const matches =
        here !== null && here.every(([r, c], i) => r === target[i]![0] && c === target[i]![1]);
      if (!matches) return { piece, cells: target };
    }
    return null;
  }

  /** Solvent joker: pull every incorrectly placed piece back to the tray. Returns how many. */
  clearIncorrect(): number {
    let n = 0;
    for (const piece of this.pieces) {
      if (!piece.pos) continue;
      const here = this.cellsAt(piece, piece.pos)
        .map(([r, c]): [number, number] => [r, c])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      // Bei einem Ruß-Ziel gibt es keine eine richtige Lösung — ein Teil ist
      // richtig, sobald es Ruß deckt. Nach der gespeicherten Lösung zu gehen
      // würde gültige Spielzüge bestrafen.
      const ok =
        this.goal === "soot"
          ? here.some(([r, c]) => this.isSooty(r, c))
          : (() => {
              const target = this.solutionCells.get(piece.name);
              return !!target && here.every(([r, c], i) => r === target[i]![0] && c === target[i]![1]);
            })();
      if (!ok) {
        piece.pos = null;
        n += 1;
      }
    }
    return n;
  }

  markStarted(): void {
    if (this.startedAt === null) this.startedAt = performance.now();
  }
  get started(): boolean {
    return this.startedAt !== null;
  }

  pause(): void {
    if (this.pausedAt === null && this.startedAt !== null && this.endedAt === null) {
      this.pausedAt = performance.now();
    }
  }
  resume(): void {
    if (this.pausedAt !== null) {
      this.pausedTotal += performance.now() - this.pausedAt;
      this.pausedAt = null;
    }
  }

  elapsedMs(): number {
    if (this.startedAt === null) return 0;
    const end = this.endedAt ?? this.pausedAt ?? performance.now();
    return end - this.startedAt - this.pausedTotal;
  }
  remainingMs(): number {
    return Math.max(0, this.limitMs - this.elapsedMs());
  }
  /** Der Lauf ist gescheitert — Züge alle (mit Budget) oder Zeit um (ohne). */
  get failed(): boolean {
    if (this.isWon() || !this.started) return false;
    return this.moveBudget === null ? this.remainingMs() <= 0 : this.outOfMoves;
  }

  /** 3 Sterne für viel Rest — Züge, wenn es ein Budget gibt, sonst Zeit. */
  starRating(): number {
    if (this.failed) return 0;
    const frac =
      this.moveBudget === null
        ? this.remainingMs() / this.limitMs
        : // die Teilezahl ist der Boden: darunter geht es gar nicht
          (this.moveBudget - this.movesUsed) / Math.max(1, this.moveBudget - this.pieces.length);
    if (frac >= 0.55) return 3;
    if (frac >= 0.2) return 2;
    return 1;
  }

  orientationCount(name: PentominoName): number {
    return PENTOMINOES[name].orientations.length;
  }
  localCells(piece: PieceState): readonly Cell[] {
    const o = PENTOMINOES[piece.name].orientations;
    return o[piece.orientationIndex % o.length]!;
  }
  cellsAt(piece: PieceState, pos: Pos): Array<[number, number]> {
    return this.localCells(piece).map(([r, c]) => [r + pos.row, c + pos.col]);
  }

  private occupied(exceptKey?: string): Set<string> {
    const out = new Set<string>();
    for (const p of this.pieces) {
      if (!p.pos || p.key === exceptKey) continue;
      for (const [r, c] of this.cellsAt(p, p.pos)) out.add(`${r},${c}`);
    }
    return out;
  }

  canPlace(piece: PieceState, pos: Pos): boolean {
    const blocked = this.occupied(piece.key);
    const cells = this.cellsAt(piece, pos);
    for (const [r, c] of cells) {
      const key = `${r},${c}`;
      if (!this.shapeCells.has(key) || blocked.has(key)) return false;
      if (this.isFrozen(r, c)) return false;
    }
    // Ein Riss trennt das Glas: dasselbe Teil darf nicht auf beiden Seiten
    // liegen. Zwei verschiedene Teile dürfen sich über den Riss hinweg
    // berühren — er ist keine Wand, sondern eine Bruchkante.
    if (this.cracks.size > 0) {
      const own = new Set(cells.map(([r, c]) => `${r},${c}`));
      for (const [r, c] of cells) {
        for (const [dr, dc] of [
          [0, 1],
          [1, 0],
        ] as const) {
          const nb: [number, number] = [r + dr, c + dc];
          if (!own.has(`${nb[0]},${nb[1]}`)) continue;
          if (this.cracks.has(edgeKey([r, c], nb))) return false;
        }
      }
    }
    return true;
  }

  place(piece: PieceState, pos: Pos): boolean {
    if (!this.canPlace(piece, pos)) return false;
    // dasselbe Teil aufs selbe Feld zurückzulegen ist kein neuer Zug —
    // sonst kostet schon ein verrutschter Finger Budget
    const samePlace = piece.pos && piece.pos.row === pos.row && piece.pos.col === pos.col;
    if (!samePlace) this.movesUsed += 1;
    piece.pos = { ...pos };
    this.checkUnlock();
    return true;
  }
  removeToTray(piece: PieceState): void {
    if (piece.pos) this.usedUndo = true;
    piece.pos = null;
  }
  nextOrientation(piece: PieceState): void {
    piece.orientationIndex = (piece.orientationIndex + 1) % this.orientationCount(piece.name);
    if (piece.pos && !this.canPlace(piece, piece.pos)) {
      piece.pos = null;
      this.usedUndo = true;
    }
  }

  get placedCount(): number {
    return this.pieces.filter((p) => p.pos).length;
  }
  /**
   * Bei `goal: "soot"` reicht es, jede verrußte Scheibe zu bedecken — der Rest
   * darf offen bleiben, überzählige Teile dürfen liegenbleiben. Sonst gilt wie
   * bisher: die Silhouette muss vollständig gedeckt sein.
   */
  isWon(): boolean {
    if (this.goal === "soot") return this.soot.size > 0 && this.sootCleared === this.soot.size;
    return this.occupied().size === this.shape.size;
  }
  finish(): void {
    if (this.endedAt === null) this.endedAt = performance.now();
  }
  reset(): void {
    for (const p of this.pieces) {
      p.pos = null;
      p.orientationIndex = 0;
    }
    this.startedAt = null;
    this.endedAt = null;
    this.pausedAt = null;
    this.pausedTotal = 0;
    this.usedUndo = false;
    this.justUnlocked = false;
    this.movesUsed = 0;
    if (this.frozenCells) this.frozenUnlocked = false;
  }
}
