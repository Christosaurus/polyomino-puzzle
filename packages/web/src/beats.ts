/**
 * Story-Beats — die kleinen Szenen zwischen den Fenstern.
 *
 * Sie hängen an „Fenster erhellt" (`panes`), das jetzt **nur** durch neu
 * gelöste Kampagnen-Fenster steigt — die Nebenmodi zählen nicht mehr rein. Eine
 * Szene ist 2–4 Zeilen, überspringbar, danach in der Sammlung nachlesbar.
 *
 *   Intro (beim ersten Start, 5 Szenen mit gemaltem Hintergrund):
 *                          das Glimmertal machte sein Licht selbst und fasste es
 *                          in Glas; eine Nacht, ein Zauber, jedes Fenster
 *                          zersprang; Monate Dunkelheit, die Leute verbittert;
 *                          Mira holt dich (Glaser); Umbra benennt sich selbst
 *                          und droht.
 *
 *   Akt I–III + Finale: NOCH AUF DEM ALTEN STAND („der Sammler ist Anselm",
 *                          Lys). Nach der Umbra-Kehre (Entscheidung A) müssen
 *                          diese Beats neu geschrieben werden: Umbra ist der
 *                          Gegner von Anfang an, Anselm wird der verschwundene
 *                          gute Meister, den Umbra „heraufgezogen" hat.
 */

export interface Beat {
  id: string;
  /** Wird gezeigt, sobald „Fenster erhellt" diese Schwelle erreicht. */
  atPanes: number;
  /** Kurztitel für die „Erinnerungen"-Liste. */
  title: string;
  speaker: "mira" | "anselm" | "welt" | "umbra";
  lines: string[];
  /** Gemaltes Hintergrundbild unter der Sprechblase (Datei in `public/bg/`). */
  bg?: string;
}

/** Sprecher → Portrait-Datei + Notfall-Emoji, wenn das Bild noch fehlt. */
export const SPEAKERS: Record<Beat["speaker"], { name: string; img: string; emoji: string }> = {
  mira: { name: "Mira", img: "ui/chars/mira.webp", emoji: "🏮" },
  anselm: { name: "Master Anselm", img: "ui/chars/anselm.webp", emoji: "🕯" },
  umbra: { name: "Umbra", img: "ui/chars/umbra.webp", emoji: "◆" },
  welt: { name: "", img: "", emoji: "✦" },
};

/**
 * Die Intro-Sequenz — läuft einmal beim allerersten Start, vor Fenster 1.
 *
 * IDs bewusst frisch (`intro2-…`) und nicht die alten `intro-nacht` /
 * `intro-mira` wiederverwendet: Spielstände von vor diesem Rewrite hatten die
 * alten IDs schon als „gesehen" markiert, wodurch die gleichnamigen neuen
 * Beats (Sturm, Mira) beim Laden still übersprungen wurden, obwohl Text und
 * Bild ganz anders sind. Neue IDs garantieren, dass jeder die neue Sequenz
 * einmal vollständig sieht.
 */
export const INTRO: Beat[] = [
  {
    id: "intro2-tal",
    atPanes: 0,
    title: "The Glimmer Valley",
    speaker: "welt",
    bg: "bg/intro-1-tal.webp",
    lines: [
      "In the Glimmer Valley, people never searched for light — they made it.",
      "The glassmakers caught it in their panes and set it into windows.",
      "So every house carried its own small sun, and every evening the whole valley glowed from within.",
    ],
  },
  {
    id: "intro2-sturm",
    atPanes: 0,
    title: "The Night",
    speaker: "welt",
    bg: "bg/intro-2-sturm.webp",
    lines: [
      "Then came the one night.",
      "At the very same hour, the glass shattered in every house. The light ran out and seeped into the ground.",
      "By morning the valley was black — and whoever had summoned that night was long gone into the mountains.",
    ],
  },
  {
    id: "intro2-schatten",
    atPanes: 0,
    title: "In the Shadow",
    speaker: "welt",
    bg: "bg/intro-3-schatten.webp",
    lines: [
      "That was months ago. The Glimmer Valley still lies in shadow.",
      "The people have learned to live in the dark. It has made them quiet, and bitter.",
      "No one talks anymore about how it used to be — no one except one. And tonight, she knocks on your door.",
    ],
  },
  {
    id: "intro2-mira",
    atPanes: 0,
    title: "The Task",
    speaker: "mira",
    bg: "bg/intro-4-garten.webp",
    lines: [
      "So you're the glazier they talk about. The one who slept through the whole night. … Yes. I can tell.",
      "I'm Mira. I carry the light around these parts, I know every broken window in the valley, and I have no patience. Of the three, two will help you.",
      "The shards are still lying where they fell. We'll put them back together — one window after another — until the valley glows again. Let's start with this one.",
    ],
  },
  {
    id: "intro2-umbra",
    atPanes: 0,
    title: "Umbra",
    speaker: "umbra",
    bg: "bg/intro-5-umbra.webp",
    lines: [
      "Down there, a window lights up again. … How touching.",
      "They call me Umbra. You should remember that name.",
      "I took the light from this valley, and I take it again every time. Go ahead and set your panes, glazier — each one brings you a little closer to me.",
    ],
  },
];

export const BEATS: Beat[] = [
  // ── Akt I — Der Garten ──────────────────────────────────────────────────
  {
    id: "a1-erstes-licht",
    atPanes: 3,
    title: "The First Light",
    speaker: "mira",
    lines: [
      "There — the window burns again. The first since that night.",
      "That's how the whole valley used to look. Every house lit from within.",
      "One out of hundreds. But it counts.",
    ],
  },
  {
    id: "a1-die-spur",
    atPanes: 6,
    title: "The Trail",
    speaker: "mira",
    lines: [
      "Every morning I count the shards still stuck in the ground. There are fewer.",
      "Not because of us — we're far too slow for that.",
      "The Collector came through here. And he's not wandering around — he has a direction.",
    ],
  },

  // ── Act II — The Workshop (unlock scene at window 8) ─────────────
  {
    id: "a2-werkstatt",
    atPanes: 8,
    title: "The Workshop",
    speaker: "mira",
    lines: [
      "The path over the ridge ends at a workshop. The old master's — Anselm's.",
      "The best glazier the valley ever had. Gone since that night.",
      "His tools still lie exactly where he left them.",
      "If an answer lies anywhere, it's here.",
    ],
  },
  {
    id: "a2-geschnitten",
    atPanes: 12,
    title: "No Storm",
    speaker: "mira",
    lines: [
      "Look at the windows here. These didn't shatter.",
      "Every pane was released at the lead joint — cleanly, by hand, one after another.",
      "This wasn't an accident that night. Someone took their time here.",
    ],
  },
  {
    id: "a2-der-zettel",
    atPanes: 16,
    title: "The Note",
    speaker: "mira",
    lines: [
      "There's a note on the workbench. Anselm's handwriting, unmistakably.",
      "\"I will bring it back — all of it, into one window, big enough. Forgive me for that night.\"",
      "No date. But the ink is years old. He's been at this for a long time.",
    ],
  },
  {
    id: "a2-die-wendung",
    atPanes: 21,
    title: "The Handwriting",
    speaker: "anselm",
    lines: [
      "You're gathering the light, child. Window by window.",
      "So am I. Longer than you, and more thoroughly.",
      "The Collector you've been chasing is me. Anselm.",
      "I don't take windows apart out of malice. I need every pane for a particular work.",
    ],
  },

  // ── Act III — The Color Court (unlock scene at window 22) ────────────
  {
    id: "a3-farbhof",
    atPanes: 22,
    title: "The Color Court",
    speaker: "welt",
    lines: [
      "The Color Court: a yard full of tall, empty window arches, one beside another.",
      "In the middle stands one, bigger than any church in the valley. Half finished.",
      "It has been growing for years, pane by pane. This is where Anselm brings the light.",
    ],
  },
  {
    id: "a3-lys",
    atPanes: 32,
    title: "Lys",
    speaker: "anselm",
    lines: [
      "This great arch was meant to become a passage. Made of light. My daughter Lys was to be the first to walk through it.",
      "She went in and never came out anywhere. A flaw in how I had divided the panes held her fast.",
      "My cut. My hand.",
    ],
  },
  {
    id: "a3-das-warum",
    atPanes: 44,
    title: "The Why",
    speaker: "anselm",
    lines: [
      "Scattered, the light would never have been enough to get her out.",
      "So I gathered it in a single night — every window in the valley at once. Yes. That was me.",
      "All of it goes into this one arch. I'm not your enemy — I just never finished. And I can't do it alone.",
    ],
  },

  // ── Finale — The Last Window (via forceBeat after boss_01) ───────────
  {
    id: "finale",
    atPanes: 999,
    title: "The Last Window",
    speaker: "anselm",
    lines: [
      "The last pane. Set it — I'll hold the frame.",
      "I built this arch as a passage. For Lys.",
      "Now we won't open it to the other side. We'll let the light back into the valley. … Thank you, child.",
    ],
  },
];

/**
 * Der Beat, der beim Sprung von `before` auf `after` Fenster fällig wird — oder
 * `null`. Nur einer pro Sprung; die anderen holt der nächste Sieg nach.
 */
export function beatAfter(before: number, after: number): Beat | null {
  return BEATS.find((b) => b.atPanes > before && b.atPanes <= after) ?? null;
}
