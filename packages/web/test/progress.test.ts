import { beforeEach, describe, expect, it } from "vitest";
import {
  beginAttempt,
  endAttempt,
  load,
  NO_BEST_MS,
  panes,
  recordFail,
  recordLevel,
  takePendingAttempt,
} from "../src/progress.js";

beforeEach(() => localStorage.clear());

describe("recordLevel — Erstclear & Fenster erhellen", () => {
  it("ein sauberer Erstclear erhellt ein Fenster und gibt den Erstclear-Bonus", () => {
    const r = recordLevel("level_001", 3, 40_000, false);
    expect(r.firstClear).toBe(true);
    expect(panes()).toBe(1);
    // base = stars(3) + firstClear(3) = 6, Serie 1 → mult 1
    expect(r.shards).toBe(6);
  });

  it("ein Re-Clear erhellt kein weiteres Fenster und gibt nur den kleinen Bonus", () => {
    recordLevel("level_001", 3, 40_000, false);
    const again = recordLevel("level_001", 3, 38_000, false);
    expect(again.firstClear).toBe(false);
    expect(panes()).toBe(1); // unverändert
  });

  it("B1: ein zuerst verlorenes Fenster zählt beim späteren Sieg trotzdem als Erstclear", () => {
    recordFail("level_001");
    expect(panes()).toBe(0); // ein Fehlschlag erhellt nichts
    expect(load().levels["level_001"]?.stars).toBe(0);

    const win = recordLevel("level_001", 2, 55_000, false);
    expect(win.firstClear).toBe(true);
    expect(panes()).toBe(1);
    // voller Erstclear-Bonus: base = 2 + 3 = 5
    expect(win.shards).toBe(5);
  });

  it("B1: nach fail → win → win wird das Fenster nicht doppelt gezählt", () => {
    recordFail("level_001");
    recordLevel("level_001", 1, 59_000, false);
    const third = recordLevel("level_001", 3, 30_000, false);
    expect(third.firstClear).toBe(false);
    expect(panes()).toBe(1);
  });

  it("ein Fehlschlag auf einem längst gewonnenen Fenster nimmt weder Sterne noch pane", () => {
    recordLevel("level_001", 3, 30_000, false);
    recordFail("level_001");
    expect(load().levels["level_001"]?.stars).toBe(3);
    expect(panes()).toBe(1);
    const reWin = recordLevel("level_001", 1, 58_000, false);
    expect(reWin.firstClear).toBe(false);
    expect(panes()).toBe(1);
  });

  it("B6: recordFail schreibt eine JSON-feste 'keine Bestzeit' (nicht Infinity → null)", () => {
    recordFail("level_005");
    const roundTripped = JSON.parse(localStorage.getItem("polyomino.save.v2")!);
    expect(roundTripped.levels.level_005.bestMs).toBe(NO_BEST_MS);
    // ein späterer Sieg setzt eine echte Bestzeit
    recordLevel("level_005", 2, 47_000, false);
    expect(load().levels["level_005"]?.bestMs).toBe(47_000);
  });
});

describe("pendingAttempt — Reload-Schutz (Exploit 4)", () => {
  it("beginAttempt setzt den Marker, endAttempt räumt ihn weg", () => {
    beginAttempt("level_010");
    expect(load().pendingAttempt).toBe("level_010");
    endAttempt();
    expect(load().pendingAttempt).toBe(null);
  });

  it("ein Sieg schließt den offenen Versuch ab", () => {
    beginAttempt("level_010");
    recordLevel("level_010", 3, 40_000, false);
    expect(load().pendingAttempt).toBe(null);
  });

  it("recordFail (Timeout) schließt den offenen Versuch ab", () => {
    beginAttempt("level_010");
    recordFail("level_010");
    expect(load().pendingAttempt).toBe(null);
  });

  it("takePendingAttempt gibt den offenen Versuch zurück und leert ihn", () => {
    beginAttempt("level_010");
    expect(takePendingAttempt()).toBe("level_010");
    expect(takePendingAttempt()).toBe(null); // nur einmal
  });

  it("Reload mitten im Level → nachträglicher Fehlschlag bricht die Serie", () => {
    recordLevel("level_001", 3, 30_000, false); // Serie 1
    recordLevel("level_002", 3, 30_000, false); // Serie 2
    beginAttempt("level_003");
    // Reload passiert hier — beim nächsten Start:
    const abandoned = takePendingAttempt();
    expect(abandoned).toBe("level_003");
    recordFail(abandoned!);
    expect(load().stats.winStreak).toBe(0);
  });
});
