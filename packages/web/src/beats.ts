/**
 * Story-Beats — die kleinen Szenen zwischen den Fenstern.
 *
 * Sie hängen an „Fenster erhellt" (`panes`), das jetzt **nur** durch neu
 * gelöste Kampagnen-Fenster steigt — die Nebenmodi zählen nicht mehr rein. Eine
 * Szene ist 2–4 Zeilen, überspringbar, danach in der Sammlung nachlesbar.
 *
 *   Intro (beim ersten Start):  das Tal machte sein Licht selbst und fasste es in
 *                          Glas; in einer Nacht zersprang jedes Fenster; ein
 *                          „Sammler" greift das Licht ab, bevor es zurück ins
 *                          Glas kann; Mira findet dich — du bist Glaser, setz
 *                          die Scheiben, hol das Tal zurück.
 *   Akt I  — Der Garten:   das erste erhellte Fenster; die Scherben werden
 *                          weniger, und nicht durch euch — der Sammler hat eine
 *                          Richtung.
 *   Akt II — Die Werkstatt: (Freischalt-Szene) Anselms Werkstatt. Die Fenster
 *                          wurden von Hand zerlegt, nicht zerschlagen. Sein
 *                          Zettel. Wendung: der Sammler ist Anselm.
 *   Akt III — Der Farbhof:  (Freischalt-Szene) der riesige halbfertige Bogen.
 *                          Lys ging als Durchgang hinein und kam nie heraus.
 *                          Das Warum: Anselm hat die Nacht selbst gemacht, um
 *                          genug Licht für diesen einen Bogen zu haben.
 *   Finale — Das letzte Fenster: ihr setzt die letzte Scheibe zusammen. Statt
 *                          den Durchgang zu öffnen, lässt Anselm das Licht zurück
 *                          ins Tal — und lässt los.
 */

export interface Beat {
  id: string;
  /** Wird gezeigt, sobald „Fenster erhellt" diese Schwelle erreicht. */
  atPanes: number;
  /** Kurztitel für die „Erinnerungen"-Liste. */
  title: string;
  speaker: "mira" | "anselm" | "welt" | "gestalt";
  lines: string[];
}

/** Sprecher → Portrait-Datei + Notfall-Emoji, wenn das Bild noch fehlt. */
export const SPEAKERS: Record<Beat["speaker"], { name: string; img: string; emoji: string }> = {
  mira: { name: "Mira", img: "ui/chars/mira.webp", emoji: "🏮" },
  anselm: { name: "Meister Anselm", img: "ui/chars/anselm.webp", emoji: "🕯" },
  gestalt: { name: "", img: "ui/chars/gestalt.webp", emoji: "◆" },
  welt: { name: "", img: "", emoji: "✦" },
};

/** Die drei Intro-Szenen — laufen einmal beim allerersten Start, vor Fenster 1. */
export const INTRO: Beat[] = [
  {
    id: "intro-nacht",
    atPanes: 0,
    title: "Die Nacht",
    speaker: "welt",
    lines: [
      "Im Tal hat man das Licht nicht gefunden. Man hat es gemacht — und in Glas gefasst.",
      "Jedes Fenster ein kleiner Speicher. Jedes Haus eine Laterne, von innen heraus hell.",
      "Dann zersprang in einer einzigen Nacht jedes Fenster im Tal. Das Licht lief aus und sickerte in den Boden.",
      "Seither ist es dunkel.",
    ],
  },
  {
    id: "intro-gestalt",
    atPanes: 0,
    title: "Der Sammler",
    speaker: "gestalt",
    lines: [
      "Das Licht im Boden ist nicht verloren. Man kann es zurück ins Glas holen — Scherbe für Scherbe, Fenster für Fenster.",
      "Aber einer ist schneller. Er greift das Licht ab, bevor es jemand fassen kann.",
      "Gesehen hat ihn niemand. Man kennt ihn nur an dem, was er zurücklässt: Ruß, Eis, Risse im Glas.",
    ],
  },
  {
    id: "intro-mira",
    atPanes: 0,
    title: "Der Auftrag",
    speaker: "mira",
    lines: [
      "Da bist du. An einem kaputten Fenster, wo sonst — du bist Glaser. Die Hände wissen's noch, auch wenn der Kopf gerade streikt.",
      "So läuft's: Scheiben zuschneiden, sauber in den Rahmen setzen, bis er voll ist. Dann fängt das Fenster das Licht wieder ein.",
      "Ein Fenster nach dem anderen. Wir holen das Tal zurück, bevor der Sammler es leerräumt. Fang mit dem hier an.",
    ],
  },
];

export const BEATS: Beat[] = [
  // ── Akt I — Der Garten ──────────────────────────────────────────────────
  {
    id: "a1-erstes-licht",
    atPanes: 3,
    title: "Das erste Licht",
    speaker: "mira",
    lines: [
      "Da — das Fenster brennt wieder. Das erste seit der Nacht.",
      "So sah früher das ganze Tal aus. Jedes Haus von innen heraus hell.",
      "Eins von hunderten. Aber es zählt.",
    ],
  },
  {
    id: "a1-die-spur",
    atPanes: 6,
    title: "Die Spur",
    speaker: "mira",
    lines: [
      "Ich zähl jeden Morgen die Scherben, die noch im Boden stecken. Es werden weniger.",
      "Nicht durch uns — wir sind viel zu langsam dafür.",
      "Der Sammler ist hier durchgezogen. Und er läuft nicht kreuz und quer, er hat eine Richtung.",
    ],
  },

  // ── Akt II — Die Werkstatt (Freischalt-Szene bei Fenster 8) ─────────────
  {
    id: "a2-werkstatt",
    atPanes: 8,
    title: "Die Werkstatt",
    speaker: "mira",
    lines: [
      "Der Pfad überm Hang endet an einer Werkstatt. Die vom alten Meister — Anselm.",
      "Bester Glaser, den das Tal je hatte. Seit der Nacht verschwunden.",
      "Sein Werkzeug liegt noch genau so da, wie er's hingelegt hat.",
      "Wenn irgendwo eine Antwort liegt, dann hier.",
    ],
  },
  {
    id: "a2-geschnitten",
    atPanes: 12,
    title: "Kein Sturm",
    speaker: "mira",
    lines: [
      "Schau dir die Fenster hier an. Die sind nicht zersprungen.",
      "Jede Scheibe ist an der Bleifuge gelöst — sauber, von Hand, eine nach der anderen.",
      "Das war kein Unglück in der Nacht. Da hat sich jemand Zeit genommen.",
    ],
  },
  {
    id: "a2-der-zettel",
    atPanes: 16,
    title: "Der Zettel",
    speaker: "mira",
    lines: [
      "Auf der Werkbank liegt ein Zettel. Anselms Schrift, eindeutig.",
      "„Ich hole es zurück — alles, in ein Fenster, groß genug. Verzeiht mir die Nacht.“",
      "Kein Datum. Aber die Tinte ist Jahre alt. Er ist da schon lange dran.",
    ],
  },
  {
    id: "a2-die-wendung",
    atPanes: 21,
    title: "Die Handschrift",
    speaker: "anselm",
    lines: [
      "Du sammelst das Licht ein, Kind. Fenster für Fenster.",
      "Ich auch. Länger als du, und gründlicher.",
      "Der Sammler, dem ihr nachlauft, bin ich. Anselm.",
      "Ich zerlege die Fenster nicht aus Bosheit. Ich brauche jede Scheibe für eine bestimmte Arbeit.",
    ],
  },

  // ── Akt III — Der Farbhof (Freischalt-Szene bei Fenster 22) ────────────
  {
    id: "a3-farbhof",
    atPanes: 22,
    title: "Der Farbhof",
    speaker: "welt",
    lines: [
      "Der Farbhof: ein Hof voller hoher, leerer Fensterbögen, einer neben dem anderen.",
      "In der Mitte steht einer, größer als jede Kirche im Tal. Halb fertig.",
      "Seit Jahren wächst er, Scheibe um Scheibe. Hierhin bringt Anselm das Licht.",
    ],
  },
  {
    id: "a3-lys",
    atPanes: 32,
    title: "Lys",
    speaker: "anselm",
    lines: [
      "Dieser große Bogen sollte ein Durchgang werden. Aus Licht. Meine Tochter Lys sollte die Erste sein, die hindurchgeht.",
      "Sie ging hinein und kam nirgends wieder heraus. Ein Fehler darin, wie ich die Scheiben geteilt hatte, hat sie festgehalten.",
      "Mein Schnitt. Meine Hand.",
    ],
  },
  {
    id: "a3-das-warum",
    atPanes: 44,
    title: "Das Warum",
    speaker: "anselm",
    lines: [
      "Verstreut hätte das Licht nie gereicht, um sie herauszuholen.",
      "Also habe ich es in einer Nacht eingesammelt — jedes Fenster im Tal auf einmal. Ja. Das war ich.",
      "Alles davon geht in diesen einen Bogen. Ich bin nicht dein Feind — ich bin nur nicht fertig geworden. Und allein schaffe ich es nicht.",
    ],
  },

  // ── Finale — Das letzte Fenster (per forceBeat nach boss_01) ───────────
  {
    id: "finale",
    atPanes: 999,
    title: "Das letzte Fenster",
    speaker: "anselm",
    lines: [
      "Die letzte Scheibe. Setz sie — ich halte den Rahmen.",
      "Ich hab diesen Bogen als Durchgang gebaut. Für Lys.",
      "Jetzt öffnen wir ihn nicht nach drüben. Wir lassen das Licht zurück ins Tal. … Danke, Kind.",
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
