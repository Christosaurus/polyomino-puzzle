/**
 * Kleine Sprechblasen auf dem Startbildschirm — die Figuren schauen ab und zu
 * vorbei und sagen einen Satz zum Stand der Dinge. Bewusst **selten** (Cadence
 * unten), damit es Würze bleibt und nicht nervt.
 *
 * Voller Story-Ballast läuft über die Cutscenes (`beats.ts`); das hier ist nur
 * das gelegentliche Winken zwischendurch.
 */

export type ChatterSpeaker = "mira" | "anselm";

export interface ChatterCtx {
  /** Fenster erhellt (Kampagne). */
  panes: number;
  /** Freigeschaltete Region: 0 Garten, 1 Werkstatt, 2 Farbhof. */
  region: number;
  /** Hat der Spieler die Wendung (Gestalt = Anselm) schon gesehen? */
  sawTwist: boolean;
  /** Alle Kampagnen-Fenster gelöst? */
  finished: boolean;
}

interface Line {
  who: ChatterSpeaker;
  text: string;
  /** Nur zeigen, wenn `ok(ctx)`. */
  ok: (c: ChatterCtx) => boolean;
}

const LINES: Line[] = [
  // ── Mira, early ──────────────────────────────────────────────────────────
  { who: "mira", text: "Still dark up here. But less than yesterday.", ok: (c) => c.region === 0 },
  { who: "mira", text: "I'm counting the shards in the ground. There are fewer — and not because of us.", ok: (c) => c.region === 0 && c.panes >= 4 },
  { who: "mira", text: "One window after another. That's exactly what the old master always said.", ok: (c) => c.region === 0 },
  // ── Mira, workshop ────────────────────────────────────────────────────
  { who: "mira", text: "The workshop still smells of hot lead. As if Anselm just stepped out for a moment.", ok: (c) => c.region === 1 && !c.sawTwist },
  { who: "mira", text: "These clean cuts at the lead joints. No storm does that — a hand does.", ok: (c) => c.region === 1 && !c.sawTwist },
  { who: "mira", text: "I know now who the Collector is. I just don't want to believe it.", ok: (c) => c.region >= 1 && c.sawTwist },
  // ── Anselm, after the twist ──────────────────────────────────────────
  { who: "anselm", text: "You work fast, child. Cleaner than I did at your age.", ok: (c) => c.sawTwist && c.region >= 1 },
  { who: "anselm", text: "Every pane you set is one missing from my arch. That's … fine.", ok: (c) => c.sawTwist },
  { who: "anselm", text: "The Color Court is the hardest part. Big panes, little support. Take your time.", ok: (c) => c.sawTwist && c.region >= 2 },
  // ── later / ending ─────────────────────────────────────────────────────
  { who: "mira", text: "Look down into the valley. Light almost everywhere. Almost.", ok: (c) => c.panes >= 30 },
  { who: "anselm", text: "Just the last arch left. I'll hold the frame when it's time.", ok: (c) => c.sawTwist && c.panes >= 40 },
  { who: "mira", text: "The valley is bright. We actually did it.", ok: (c) => c.finished },
];

/**
 * Wähle eine passende Zeile — deterministisch aus `seq`, damit sie nicht
 * springt und sich nicht sofort wiederholt. `null`, wenn nichts passt.
 */
export function pickChatter(ctx: ChatterCtx, seq: number): { who: ChatterSpeaker; text: string } | null {
  const pool = LINES.filter((l) => l.ok(ctx));
  if (pool.length === 0) return null;
  const l = pool[seq % pool.length]!;
  return { who: l.who, text: l.text };
}
