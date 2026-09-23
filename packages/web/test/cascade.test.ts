import { describe, expect, it } from "vitest";
import { CascadeState, type LevelConfig } from "../src/cascade.js";

describe("Kaskade — Rundenlängen-Deckel (Abschnitt 4b im Ökonomie-Konzept)", () => {
  it("deckelt die Summe aller Zeit-Boni einer Runde bei 90s, egal wie oft addTime() aufgerufen wird", () => {
    const game = new CascadeState("cap-test-1");
    const before = game.remainingMs();
    for (let i = 0; i < 20; i++) game.addTime(10_000); // 200s Rohsumme, weit über dem Deckel
    expect(game.remainingMs() - before).toBe(90_000);
  });

  it("bleibt unterhalb des Deckels exakt additiv", () => {
    const game = new CascadeState("cap-test-2");
    const before = game.remainingMs();
    game.addTime(30_000);
    game.addTime(20_000);
    expect(game.remainingMs() - before).toBe(50_000);
  });

  it("addTime() im Level-Modus ist ein No-Op (keine Uhr, gegen die man Zeit gewinnen könnte)", () => {
    const level: LevelConfig = { rows: 4, cols: 4, lives: 3, shardBudget: 20, targetRows: 2 };
    const game = new CascadeState("cap-test-level", level);
    game.addTime(30_000);
    expect(game.remainingMs()).toBe(Infinity);
  });
});
