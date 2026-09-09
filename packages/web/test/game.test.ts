import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseLevel } from "@polyomino/puzzle-core";
import { GameState } from "../src/game.js";

const RAW = readFileSync(
  fileURLToPath(new URL("../public/levels/level_001.json", import.meta.url)),
  "utf8",
);
const level = () => parseLevel(RAW);
const candleRaw = readFileSync(
  fileURLToPath(new URL("../public/levels/candle_01.json", import.meta.url)),
  "utf8",
);
const readLevel = (id: string) =>
  readFileSync(fileURLToPath(new URL(`../public/levels/${id}.json`, import.meta.url)), "utf8");

afterEach(() => vi.restoreAllMocks());

/** Legt das Lösungsteil `pieceId` an seine Lösungsposition. */
function placeSolutionPiece(g: any, pieceId: string): boolean {
  const entry = g.level.solution.find((s: any) => s.pieceId === pieceId);
  const target = new Set(entry.cells.map(([r, c]: [number, number]) => `${r},${c}`));
  const piece = g.pieces.find((p: any) => p.name === pieceId && !p.pos);
  if (!piece) return false;
  for (let o = 0; o < g.orientationCount(piece.name); o++) {
    piece.orientationIndex = o;
    for (const [tr, tc] of entry.cells) {
      for (const [lr, lc] of g.localCells(piece)) {
        const pos = { row: tr - lr, col: tc - lc };
        const at = g.cellsAt(piece, pos).map(([r, c]: [number, number]) => `${r},${c}`);
        if (at.length === target.size && at.every((k: string) => target.has(k))) {
          return g.place(piece, pos);
        }
      }
    }
  }
  return false;
}

describe("GameState — Pausen-Budget (Exploit 3)", () => {
  it("kurze Pausen sind gratis, lange zählen über 40 s als verstrichene Zeit", () => {
    let t = 0;
    vi.spyOn(performance, "now").mockImplementation(() => t);

    const g = new GameState(level(), 120_000);
    g.markStarted(); // t = 0
    t = 10_000;
    g.pause();
    t = 25_000; // 15 s pausiert — unter Budget
    g.resume();
    t = 30_000;
    expect(g.elapsedMs()).toBe(30_000 - 15_000); // 15 s

    // Marathon-Pause: 5 Minuten
    g.pause(); // pausedAt = 30_000
    t = 30_000 + 5 * 60_000;
    g.resume();
    // Budget ist 40 s, davon 15 s schon verbraucht → nur weitere 25 s gutgeschrieben
    t += 1_000;
    expect(g.elapsedMs()).toBe(t - 40_000);
  });

  it("elapsedMs friert während der Pause ein (kein Timeout mitten in der Pause)", () => {
    let t = 0;
    vi.spyOn(performance, "now").mockImplementation(() => t);
    const g = new GameState(level(), 60_000);
    g.markStarted();
    t = 5_000;
    g.pause();
    const frozen = g.elapsedMs();
    t = 5_000 + 3 * 60_000;
    expect(g.elapsedMs()).toBe(frozen);
    expect(g.failed).toBe(false);
  });
});

describe("GameState — Kerze (Exploit 9)", () => {
  /** Das Lösungsteil, das die (erste) Kerzenzelle deckt. */
  function candlePieceId(g: any): string {
    const [cr, cc] = g.level.mechanics.candle[0];
    return g.level.solution.find((s: any) =>
      s.cells.some(([r, c]: [number, number]) => r === cr && c === cc),
    ).pieceId;
  }

  it("das Kerzenteil zu früh legen → die Flamme ist aus, Fenster verloren", () => {
    const g = new GameState(parseLevel(candleRaw));
    g.markStarted();
    const candleId = candlePieceId(g);
    expect(placeSolutionPiece(g, candleId)).toBe(true); // erlaubt — aber tödlich
    expect(g.candleOut).toBe(true);
    expect(g.failed).toBe(true);
    expect(g.isWon()).toBe(false);
  });

  it("alle anderen zuerst, das Kerzenteil zuletzt → gewonnen, Flamme brennt bis zum Schluss", () => {
    const g = new GameState(parseLevel(candleRaw));
    g.markStarted();
    const candleId = candlePieceId(g);
    for (const s of g.level.solution) {
      if (s.pieceId === candleId) continue;
      expect(placeSolutionPiece(g, s.pieceId)).toBe(true);
      expect(g.candleOut).toBe(false); // nie zu früh
    }
    expect(g.candleReady).toBe(true); // jetzt darf sie gedeckt werden
    expect(placeSolutionPiece(g, candleId)).toBe(true);
    expect(g.candleOut).toBe(false);
    expect(g.isWon()).toBe(true);
  });
});

describe("GameState — Wanderscherbe (Exploit 9): Pfad deckt fast das ganze Fenster", () => {
  for (const id of ["wander_01", "wander_02"]) {
    it(`${id}: Scherbe ist bis kurz vor Schluss auf dem Brett, und es gibt eine Lösungsreihenfolge`, () => {
      const raw = readLevel(id);
      const probe = new GameState(parseLevel(raw));
      const pieceCount = probe.pieces.length;
      const pathLen = (JSON.parse(raw).mechanics.wander as unknown[]).length;
      // Pfad läuft über fast das ganze Fenster — nicht mehr „nach 2 Zügen weg"
      expect(pathLen).toBe(pieceCount - 1);

      // irgendeine Reihenfolge der Lösungsteile schlägt die Scherbe
      const ids: string[] = probe.level.solution.map((s: any) => s.pieceId);
      const perms: string[][] = [];
      const permute = (rest: string[], acc: string[]): void => {
        if (!rest.length) return void perms.push(acc);
        for (let i = 0; i < rest.length; i++) {
          permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, rest[i]!]);
        }
      };
      permute(ids, []);
      const beats = perms.some((order) => {
        const g = new GameState(parseLevel(raw));
        g.markStarted();
        return order.every((pid) => placeSolutionPiece(g, pid)) && g.isWon();
      });
      expect(beats).toBe(true);
    });
  }
});
