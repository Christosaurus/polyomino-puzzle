import { beforeEach, describe, expect, it } from "vitest";
import { load, panes, recordFail, recordLevel } from "../src/progress.js";

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
});
