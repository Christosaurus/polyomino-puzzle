/**
 * Miras Stimme.
 *
 * Die Geschichte darf nie zwischen dem Spieler und dem nächsten Level stehen —
 * also sitzt sie auf einem Screen, den er ohnehin ansieht: dem Ergebnis. Eine
 * Zeile, ein Portrait, kein extra Tap. Siehe `art-refs/KONZEPT-lumen.md` §C.
 *
 * Verdiente Momente (erstes Fenster, Sieg nach Fehlschlägen) sprechen immer.
 * Alles andere spricht nur jedes dritte Mal, damit es ein Geschenk bleibt und
 * keine Textwand wird.
 */

export type StoryPlace = "garden" | "workshop" | "courtyard" | "daily" | "descent";

export interface StoryContext {
  /** Wie viele Fenster der Spieler insgesamt gelöst hat (inkl. diesem). */
  solved: number;
  place: StoryPlace;
  /** 0–3; 3 = makellos. */
  stars?: number;
  /** Dieses Fenster hatte den Spieler vorher schon geschlagen. */
  struggled?: boolean;
  /** Serie im Abstieg. */
  streak?: number;
  /** Tiefe im Abstieg. */
  depth?: number;
}

const LINES = {
  first: ["A whole window holding light again. The first since that night. Look at it."],

  struggled: [
    "How many tries was that? Doesn't matter — it counts just the same.",
    "I'd have given up on this window long ago. You didn't.",
    "That was stubborn. Stubborn is exactly right here.",
    "It was hard. That makes it shine brighter now.",
  ],

  perfect: [
    "Not one pane too many, not one crooked. Anselm would have nodded.",
    "Cleanly set. I've seen masters do worse.",
    "Flawless. And no, I didn't just say that.",
  ],

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

  descent: [
    "This deep down? This is where he hoards what he collects.",
    "Every shard you pull out of here, he doesn't get.",
    "Further down. I'll hold the lantern.",
    "Smells like cold soot. He was here recently.",
  ],

  streak: [
    "Three in a row. Keep at it.",
    "You're in the zone. Don't fall out of it now.",
    "At this pace, we'll get the whole valley back.",
  ],

  generic: [
    "Another one. The valley gets a little brighter.",
    "One more window back on our side.",
    "One more house that holds light again.",
    "From up here, I can see it glow.",
    "The valley remembers things like this.",
    "Good. Next.",
  ],
} as const;

/**
 * Rotiert durch den Pool. `turn` ist ein Zähler, der pro *gezeigter* Zeile
 * hochläuft — nicht `solved` selbst, sonst würde er mit der „jedes dritte
 * Fenster"-Regel aliasen und pro Pool käme nur eine Zeile je vor (B4).
 */
function rot(pool: readonly string[], turn: number): string {
  const i = ((Math.floor(turn) % pool.length) + pool.length) % pool.length;
  return pool[i]!;
}

/**
 * Die Zeile für dieses Ergebnis — oder `null`, wenn Mira diesmal schweigt.
 * Alles ist aus `solved` abgeleitet, deshalb braucht es keinen eigenen
 * Speicher-Eintrag und die Kadenz überlebt einen Neustart.
 */
export function miraLine(ctx: StoryContext): string | null {
  const n = ctx.solved;

  // verdiente Momente — die sprechen immer
  if (n === 1) return LINES.first[0]!;
  if (ctx.struggled) return rot(LINES.struggled, n);

  // sonst nur jedes dritte Fenster
  if (n % 3 !== 0) return null;
  const r = n / 3; // 1, 2, 3, … — zählt die gezeigten Ergebnis-Zeilen

  if (ctx.streak !== undefined && ctx.streak >= 3) return rot(LINES.streak, ctx.streak);
  if (ctx.stars === 3 && r % 3 === 0) return rot(LINES.perfect, r / 3);
  if (ctx.place === "descent" && (ctx.depth ?? 0) >= 5) return rot(LINES.descent, ctx.depth ?? r);

  const byPlace = LINES[ctx.place];
  // jedes zweite Mal ortsbezogen, sonst allgemein — sonst wird der Ort schal
  return r % 2 === 0 ? rot(byPlace, r / 2) : rot(LINES.generic, (r - 1) / 2);
}
