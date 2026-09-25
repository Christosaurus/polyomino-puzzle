import { describe, expect, it } from "vitest";
import { isoWeek, msUntilWeekReset } from "../src/leaderboard.js";

describe("isoWeek — muss zum Postgres-Wochen-Key passen", () => {
  it("liefert IYYY-Www im UTC", () => {
    // von Postgres bestätigt: 2026-09-09 → 2026-W37
    expect(isoWeek(new Date("2026-09-09T12:00:00Z"))).toBe("2026-W37");
    // Jahreswechsel: 2027-01-01 ist ein Freitag → noch KW 53 von 2026
    expect(isoWeek(new Date("2027-01-01T12:00:00Z"))).toBe("2026-W53");
    // 2027-01-04 (Montag) → KW 1 von 2027
    expect(isoWeek(new Date("2027-01-04T12:00:00Z"))).toBe("2027-W01");
    // Wochenmitte bleibt in derselben Woche
    expect(isoWeek(new Date("2026-06-15T00:00:01Z"))).toBe(isoWeek(new Date("2026-06-21T23:59:59Z")));
  });
});

describe("msUntilWeekReset — Countdown bis Montag 00:00 UTC (Abschnitt 5.3)", () => {
  it("Sonntag kurz vor Mitternacht: fast Null", () => {
    expect(msUntilWeekReset(new Date("2027-01-03T23:00:00Z"))).toBe(3_600_000); // 1h
  });

  it("genau Montag 00:00: Reset ist gerade erst durch -- nächster liegt eine volle Woche entfernt", () => {
    expect(msUntilWeekReset(new Date("2027-01-04T00:00:00Z"))).toBe(7 * 86_400_000);
  });

  it("Montagmittag: 6,5 Tage bis zum nächsten Reset", () => {
    expect(msUntilWeekReset(new Date("2027-01-04T12:00:00Z"))).toBe(6.5 * 86_400_000);
  });

  it("Wochenmitte (Mittwoch): 5 Tage bis Montag", () => {
    expect(msUntilWeekReset(new Date("2027-01-06T00:00:00Z"))).toBe(5 * 86_400_000);
  });
});
