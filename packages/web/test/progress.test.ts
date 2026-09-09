import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginAttempt,
  claimDailyMilestone,
  claimMilestones,
  endAttempt,
  grantRegionReward,
  lives,
  load,
  NO_BEST_MS,
  panes,
  recordDaily,
  recordFail,
  recordLevel,
  takePendingAttempt,
  trustedNow,
} from "../src/progress.js";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

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

describe("Re-Clear-Farm (Exploit 1)", () => {
  it("ein Re-Clear erhöht die Serie nicht", () => {
    recordLevel("level_001", 3, 40_000, false); // Serie 1
    recordLevel("level_002", 3, 40_000, false); // Serie 2
    expect(load().stats.winStreak).toBe(2);
    for (let i = 0; i < 10; i++) recordLevel("level_001", 3, 8_000, false);
    expect(load().stats.winStreak).toBe(2); // unverändert
  });

  it("ein Re-Clear zahlt höchstens 2 Splitter, ohne Multiplikator", () => {
    // Serie auf ×3 bringen (7 Erstclears)
    for (let i = 1; i <= 7; i++) recordLevel(`level_00${i}`, 3, 30_000, false);
    const shardsBefore = load().shards;
    const re = recordLevel("level_001", 3, 8_000, false);
    expect(re.mult).toBe(1);
    expect(re.shards).toBe(2); // min(2, stars) — nicht (3+1)*3 = 12
    expect(load().shards).toBe(shardsBefore + 2);
  });

  it("ein Re-Clear zählt nicht als weiteres 'gelöst'", () => {
    recordLevel("level_001", 3, 40_000, false);
    const solvedAfterFirst = load().stats.solved;
    recordLevel("level_001", 3, 8_000, false);
    recordLevel("level_001", 3, 8_000, false);
    expect(load().stats.solved).toBe(solvedAfterFirst);
  });

  it("ein Re-Clear mit mehr Sternen verbessert weiterhin die Bestwerte", () => {
    recordLevel("level_001", 1, 58_000, false);
    recordLevel("level_001", 3, 20_000, false);
    expect(load().levels["level_001"]).toEqual({ stars: 3, bestMs: 20_000, fails: 0 });
  });

  it("die Serie steigt nur mit echten Erstclears — auch mit Re-Clears dazwischen", () => {
    recordLevel("level_001", 3, 40_000, false); // 1
    recordLevel("level_001", 3, 40_000, false); // Re-Clear, bleibt 1
    recordLevel("level_002", 3, 40_000, false); // 2
    expect(load().stats.winStreak).toBe(2);
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

describe("Systemuhr-Manipulation (Exploit 6)", () => {
  it("trustedNow klemmt einen Vorwärtssprung der Wanduhr auf die echte Zeit", () => {
    const wall = Date.now();
    const perf = performance.now();
    vi.spyOn(Date, "now").mockReturnValue(wall + 3 * 3_600_000); // +3 h
    vi.spyOn(performance, "now").mockReturnValue(perf + 200); // aber nur 200 ms monoton
    // zurückgeklemmt auf ~Sitzungsstart + 200 ms, nicht +3 h
    expect(trustedNow()).toBeLessThan(wall + 60_000);
  });

  it("Herzen regenerieren nicht durch Vorstellen der Uhr innerhalb der Sitzung", () => {
    // 0 Herzen, nextAt in 20 min
    const now = Date.now();
    recordLevel("x", 1, 1, false); // egal, nur um einen Save anzulegen
    // Herzen leeren
    for (let i = 0; i < 5; i++) {
      const d = load();
      d.lives = { count: 0, nextAt: now + 20 * 60_000 };
      localStorage.setItem("polyomino.save.v2", JSON.stringify(d));
    }
    const perf = performance.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 3 * 3_600_000);
    vi.spyOn(performance, "now").mockReturnValue(perf + 500);
    expect(lives().count).toBe(0); // kein Gratis-Herz durch Uhr-Sprung
  });

  it("claimDailyMilestone zahlt jede Schwelle nur einmal", () => {
    expect(claimDailyMilestone(3)).toBe(true);
    expect(claimDailyMilestone(3)).toBe(false); // Serie gebrochen + neu aufgebaut
    expect(claimDailyMilestone(7)).toBe(true);
  });

  it("recordDaily nutzt die geklemmte Zeit (kein Tagessprung in der Sitzung)", () => {
    const first = recordDaily().daily;
    expect(first.streak).toBe(1);
    const wall = Date.now();
    const perf = performance.now();
    vi.spyOn(Date, "now").mockReturnValue(wall + 26 * 3_600_000); // „morgen"
    vi.spyOn(performance, "now").mockReturnValue(perf + 1_000);
    const second = recordDaily().daily;
    expect(second.streak).toBe(1); // derselbe Tag — kein Serien-Zuwachs
  });
});

describe("Joker-Verknappung", () => {
  it("Startvorrat ist 5 pro Joker", () => {
    expect(load().jokers).toEqual({ hint: 5, time: 5, solvent: 5 });
  });

  it("Meilensteine geben nur noch Splitter, keine Joker", () => {
    // 12 Fenster mit 3 Sternen → 36 Sterne → Meilensteine bei 6/12/18/24/30/36
    for (let i = 1; i <= 12; i++) recordLevel(`m${i}`, 3, 30_000, false);
    const before = load().jokers;
    const fresh = claimMilestones();
    expect(fresh.length).toBeGreaterThan(0);
    expect(load().jokers).toEqual(before); // unverändert
    expect(load().shards).toBeGreaterThan(0);
  });

  it("Regionsbelohnung gibt nur Splitter + volle Herzen, keine Joker", () => {
    const before = load().jokers;
    expect(grantRegionReward("garden")).toBe(true);
    expect(load().jokers).toEqual(before);
    expect(load().lives.count).toBe(5);
    expect(grantRegionReward("garden")).toBe(false); // nur einmal
  });
});
