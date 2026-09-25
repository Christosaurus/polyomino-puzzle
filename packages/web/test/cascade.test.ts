import { describe, expect, it } from "vitest";
import { CascadeState, type LevelConfig } from "../src/cascade.js";
import { shardColorIndex } from "../src/shards.js";

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

describe("Kaskade — Weiterspielen-Angebot beim letzten Leben (Abschnitt 4c)", () => {
  /** Simuliert "eine Scherbe fällt vom Band" -- die einzige Stelle, an der
   *  `tick()` Leben abzieht -- ohne auf echte Belt-Timings angewiesen zu sein. */
  function loseLastLife(game: CascadeState): void {
    for (const s of game.belt) s.y = 1;
    game.tick(0.001);
  }

  it("friert die Runde ein statt sie sofort zu beenden, wenn Continues übrig sind", () => {
    const game = new CascadeState("continue-test-1");
    game.start();
    game.lives = 1;
    loseLastLife(game);
    expect(game.lives).toBe(0);
    expect(game.awaitingContinueOffer).toBe(true);
    expect(game.isOver).toBe(false); // eingefroren, noch keine Entscheidung
    expect(game.nextContinuePrice()).toBe(15);
  });

  it("acceptContinue() gibt ein Leben zurück und lässt den Preis pro Nutzung steigen", () => {
    const game = new CascadeState("continue-test-2");
    game.start();
    game.lives = 1;
    loseLastLife(game);
    game.acceptContinue();
    expect(game.lives).toBe(1);
    expect(game.awaitingContinueOffer).toBe(false);
    expect(game.nextContinuePrice()).toBe(30);

    loseLastLife(game);
    game.acceptContinue();
    expect(game.nextContinuePrice()).toBe(60);

    loseLastLife(game);
    game.acceptContinue();
    // 3x verbraucht -- ab jetzt kein Angebot mehr, siehe nächster Test
    expect(game.nextContinuePrice()).toBeNull();
  });

  it("nach 3 Nutzungen pro Runde gibt es kein Angebot mehr -- Leben-Verlust beendet die Runde normal", () => {
    const game = new CascadeState("continue-test-3");
    game.start();
    game.lives = 1;
    for (let i = 0; i < 3; i++) {
      loseLastLife(game);
      game.acceptContinue();
    }
    game.lives = 1;
    loseLastLife(game);
    expect(game.awaitingContinueOffer).toBe(false);
    expect(game.lives).toBe(0);
    expect(game.isOver).toBe(true);
  });

  it("declineContinue() beendet die Runde normal, ohne ein Leben zurückzugeben", () => {
    const game = new CascadeState("continue-test-4");
    game.start();
    game.lives = 1;
    loseLastLife(game);
    game.declineContinue();
    expect(game.awaitingContinueOffer).toBe(false);
    expect(game.lives).toBe(0);
    expect(game.isOver).toBe(true);
  });
});

describe("Kaskade — Zell-Snapshot für die Wegflieg-Funken eines normalen Clears (Abschnitt 6)", () => {
  it("consumeFreshClear().cells enthält Position + Farbe jeder geräumten Zelle, bevor das Brett geleert wird", () => {
    const game = new CascadeState("clear-cells-test");
    const monoColor = shardColorIndex("mono");
    // Reihe 0 bis auf die letzte Spalte von Hand füllen -- der Platzierung
    // einer einzelnen "mono"-Scherbe in die Lücke reicht dann zum Clear.
    for (let c = 0; c < game.cols - 1; c++) game.board[0 * game.cols + c] = monoColor;
    const rows = game.place({ id: 1, name: "mono", orientationIndex: 0, y: 0 }, { row: 0, col: game.cols - 1 });
    expect(rows).toBe(1);

    const clear = game.consumeFreshClear();
    expect(clear).not.toBeNull();
    expect(clear!.rows).toEqual([0]);
    expect(clear!.cells).toHaveLength(game.cols);
    for (const cell of clear!.cells) {
      expect(cell.row).toBe(0);
      expect(cell.colorIndex).toBe(monoColor);
    }
    const cols = clear!.cells.map((c) => c.col).sort((a, b) => a - b);
    expect(cols).toEqual(Array.from({ length: game.cols }, (_, i) => i));

    // Zellen sind jetzt tatsächlich geleert -- der Snapshot war eine Kopie
    // von VOR dem Leeren, nicht eine Live-Referenz aufs Board.
    for (let c = 0; c < game.cols; c++) expect(game.board[0 * game.cols + c]).toBe(0);
  });
});
