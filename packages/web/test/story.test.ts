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
      "The garden's waking up again. Can you smell that?",
      "Something's growing back there, where nothing grew for years.",
      "This is where the light held out first. This is where it comes back first.",
    ],
    workshop: [
      "Anselm's workshop. Every cut here carries his hand.",
      "This is where he worked, before he left.",
      "These panes were cut loose, not smashed. That changes everything.",
      "The lead's been freshly redrawn. He wasn't here years ago — he's here constantly.",
    ],
    courtyard: [
      "The Color Court. The biggest windows in the valley, and the hardest.",
      "This is where the light was most colorful. Piece by piece, it's coming back.",
      "Every pane you set here is one he's missing from his great arc.",
    ],
    daily: [
      "One window a day. That's how the valley used to keep going.",
      "The valley asked. You answered.",
      "Come back tomorrow — the next one's already waiting.",
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
      "Another one. The valley gets a little brighter.",
      "One more window back on our side.",
      "One more house that holds light again.",
      "From up here, I can see it glow.",
      "The valley remembers things like this.",
      "Good. Next.",
    ];
    for (const line of generic) expect(seen.has(line)).toBe(true);
  });

  it("der Makellos-Pool (3 Zeilen) kommt vollständig dran", () => {
    const perfect = [
      "Not one pane too many, not one crooked. Anselm would have nodded.",
      "Cleanly set. I've seen masters do worse.",
      "Flawless. And no, I didn't just say that.",
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
