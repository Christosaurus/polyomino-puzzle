import { describe, expect, it } from "vitest";
import { miraLine, type StoryPlace } from "../src/story.js";

/** Alle Zeilen einsammeln, die `miraLine` über einen langen Lauf ausgibt.
 *  Start bei n=2, damit die einmalige „erstes Fenster"-Zeile nicht mitzählt. */
function collect(fn: (n: number) => string | null, upTo = 900): Set<string> {
  const seen = new Set<string>();
  for (let n = 2; n <= upTo; n++) {
    const line = fn(n);
    if (line) seen.add(line);
  }
  return seen;
}

describe("miraLine — B4: alle geschriebenen Zeilen sind erreichbar", () => {
  const PLACE_LINES: Record<string, string[]> = {
    garden: [
      "Der Garten atmet wieder. Riechst du das?",
      "Da hinten wächst was, wo seit Jahren nichts war.",
      "Hier hat das Licht angefangen. Hier fängt es wieder an.",
    ],
    workshop: [
      "Das ist Anselms Handschrift. Ich erkenne seine Schnitte.",
      "Hier hat er gearbeitet. Vor der Nacht.",
      "Die Werkstatt erinnert sich an ihn. Ich auch.",
      "Diese Scheibe wurde geschnitten, nicht zerschlagen. Merk dir das.",
    ],
    courtyard: [
      "Der Farbhof. Die schwersten Fenster im Tal.",
      "Hier war das Licht am buntesten. Es kommt zurück.",
      "Noch drei Höfe. Dann wissen wir es.",
    ],
    daily: [
      "Ein Fenster am Tag. So hat man das früher gemacht.",
      "Das Tal hat gefragt. Du hast geantwortet.",
      "Komm morgen wieder. Es wartet eins auf dich.",
    ],
  };

  it("die Orts-Pools kommen vollständig dran", () => {
    for (const place of Object.keys(PLACE_LINES)) {
      const seen = collect((n) => miraLine({ solved: n, place: place as StoryPlace }));
      for (const line of PLACE_LINES[place]!) expect(seen.has(line)).toBe(true);
    }
  });

  it("der generische Pool (6 Zeilen) kommt vollständig dran", () => {
    // aus jedem Ort fällt „jedes zweite Mal" eine generische Zeile
    const seen = collect((n) => miraLine({ solved: n, place: "garden" }));
    const generic = [
      "Wieder eins. Das Tal wird heller.",
      "Noch ein Fenster, das ihm nicht gehört.",
      "Sammel sie ein, bevor er es tut.",
      "Ich seh das Licht bis hierher.",
      "Ein Splitter mehr auf unserer Seite.",
      "Gut. Weiter.",
    ];
    for (const line of generic) expect(seen.has(line)).toBe(true);
  });

  it("der Makellos-Pool (3 Zeilen) kommt vollständig dran", () => {
    const perfect = [
      "Kein Splitter zu viel. Anselm hätte genickt.",
      "Sauber. Ich hab Meister gesehen, die das schlechter können.",
      "Makellos. Sag nicht, dass ich das gesagt hab.",
    ];
    const seen = collect((n) => miraLine({ solved: n, place: "garden", stars: 3 }));
    for (const line of perfect) expect(seen.has(line)).toBe(true);
  });

  it("der Fehlschlag-Pool (4 Zeilen) kommt vollständig dran", () => {
    expect(collect((n) => miraLine({ solved: n, place: "garden", struggled: true })).size).toBe(4);
  });

  it("der Serien-Pool (3 Zeilen) kommt vollständig dran", () => {
    const seen = new Set<string>();
    for (let streak = 3; streak < 30; streak++) {
      const line = miraLine({ solved: 3, place: "descent", streak });
      if (line) seen.add(line);
    }
    expect(seen.size).toBe(3);
  });

  it("der Abstiegs-Pool (4 Zeilen) kommt vollständig dran", () => {
    const seen = new Set<string>();
    for (let depth = 5; depth < 40; depth++) {
      const line = miraLine({ solved: 3, place: "descent", depth });
      if (line) seen.add(line);
    }
    expect(seen.size).toBe(4);
  });

  it("erstes Fenster spricht immer, danach nur jedes dritte", () => {
    expect(miraLine({ solved: 1, place: "garden" })).not.toBeNull();
    expect(miraLine({ solved: 2, place: "garden" })).toBeNull();
    expect(miraLine({ solved: 4, place: "garden" })).toBeNull();
    expect(miraLine({ solved: 6, place: "garden" })).not.toBeNull();
  });
});
