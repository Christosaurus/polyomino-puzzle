import { describe, expect, it } from "vitest";
import { nextGoal } from "../src/goals.js";

describe("nextGoal -- nächstes Ziel fürs Rundenende", () => {
  const items = [
    { label: "Time Vial", cost: 18, locked: false },
    { label: "Shuffle", cost: 24, locked: false },
    { label: "Clear Spark", cost: 30, locked: false },
  ];

  it("nennt das günstigste noch nicht leistbare Stück und die Lücke", () => {
    expect(nextGoal(10, items)).toEqual({ label: "Time Vial", missing: 8 });
    expect(nextGoal(18, items)).toEqual({ label: "Shuffle", missing: 6 });
  });

  it("ignoriert gesperrte Stücke und Gratis-/Platzhalter-Einträge", () => {
    const withLocked = [{ label: "Voll", cost: 5, locked: true }, { label: "Soon", cost: 0, locked: false }, ...items];
    expect(nextGoal(0, withLocked)).toEqual({ label: "Time Vial", missing: 18 });
  });

  it("gibt null zurück, wenn man sich alles leisten kann", () => {
    expect(nextGoal(999, items)).toBeNull();
  });
});
