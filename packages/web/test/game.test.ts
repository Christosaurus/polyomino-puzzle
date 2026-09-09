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

afterEach(() => vi.restoreAllMocks());

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
