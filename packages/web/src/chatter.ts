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
  // ── Mira, früh ──────────────────────────────────────────────────────────
  { who: "mira", text: "Noch dunkel hier oben. Aber weniger als gestern.", ok: (c) => c.region === 0 },
  { who: "mira", text: "Ich zähl die Scherben im Boden nach. Werden weniger — und das nicht durch uns.", ok: (c) => c.region === 0 && c.panes >= 4 },
  { who: "mira", text: "Ein Fenster nach dem anderen. Genau so hat's der alte Meister immer gesagt.", ok: (c) => c.region === 0 },
  // ── Mira, Werkstatt ────────────────────────────────────────────────────
  { who: "mira", text: "In der Werkstatt riecht's noch nach heißem Blei. Als wär Anselm nur kurz raus.", ok: (c) => c.region === 1 && !c.sawTwist },
  { who: "mira", text: "Diese sauberen Schnitte an der Bleifuge. Kein Sturm macht das — das macht eine Hand.", ok: (c) => c.region === 1 && !c.sawTwist },
  { who: "mira", text: "Ich weiß jetzt, wer der Sammler ist. Ich will's nur nicht glauben.", ok: (c) => c.region >= 1 && c.sawTwist },
  // ── Anselm, nach der Wendung ──────────────────────────────────────────
  { who: "anselm", text: "Du arbeitest schnell, Kind. Sauberer als ich in deinem Alter.", ok: (c) => c.sawTwist && c.region >= 1 },
  { who: "anselm", text: "Jede Scheibe, die du setzt, fehlt mir in meinem Bogen. Das ist … in Ordnung.", ok: (c) => c.sawTwist },
  { who: "anselm", text: "Der Farbhof ist der schwerste Teil. Große Scheiben, wenig Halt. Nimm dir Zeit.", ok: (c) => c.sawTwist && c.region >= 2 },
  // ── später / Ende ─────────────────────────────────────────────────────
  { who: "mira", text: "Schau mal ins Tal runter. Fast überall Licht. Fast.", ok: (c) => c.panes >= 30 },
  { who: "anselm", text: "Nur noch der letzte Bogen. Ich halte den Rahmen, wenn's soweit ist.", ok: (c) => c.sawTwist && c.panes >= 40 },
  { who: "mira", text: "Das Tal ist hell. Wir haben's tatsächlich geschafft.", ok: (c) => c.finished },
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
