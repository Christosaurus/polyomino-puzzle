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
      "Der Garten wird wieder wach. Riechst du das?",
      "Da hinten wächst was, wo jahrelang nichts war.",
      "Hier hat das Licht zuerst gehalten. Hier kommt es zuerst zurück.",
    ],
    workshop: [
      "Anselms Werkstatt. Jeder Schnitt hier trägt seine Hand.",
      "Hier hat er gearbeitet, bevor er ging.",
      "Diese Scheiben wurden gelöst, nicht zerschlagen. Das ändert alles.",
      "Das Blei ist frisch nachgezogen. Er war nicht vor Jahren hier — er ist es dauernd.",
    ],
    courtyard: [
      "Der Farbhof. Die größten Fenster im Tal, und die schwersten.",
      "Hier war das Licht am buntesten. Stück für Stück kommt es zurück.",
      "Jede Scheibe, die du hier setzt, fehlt ihm in seinem großen Bogen.",
    ],
    daily: [
      "Ein Fenster am Tag. So hat es das Tal früher gehalten.",
      "Das Tal hat gefragt. Du hast geantwortet.",
      "Komm morgen wieder — es wartet schon das nächste.",
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
      "Wieder eins. Das Tal wird ein Stück heller.",
      "Noch ein Fenster zurück auf unserer Seite.",
      "Ein Speicher mehr, der wieder Licht hält.",
      "Von hier oben seh ich es leuchten.",
      "Das Tal merkt sich so etwas.",
      "Gut. Nächstes.",
    ];
    for (const line of generic) expect(seen.has(line)).toBe(true);
  });

  it("der Makellos-Pool (3 Zeilen) kommt vollständig dran", () => {
    const perfect = [
      "Keine Scheibe zu viel, keine schief. Anselm hätte genickt.",
      "Sauber gesetzt. Ich hab Meister gesehen, die das schlechter hinkriegen.",
      "Makellos. Und nein, das hab ich nicht gesagt.",
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
