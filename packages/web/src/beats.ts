/**
 * Story-Beats — die kleinen Szenen zwischen den Fenstern.
 *
 * Sie hängen an „Fenster erhellt" (`panes`), das jetzt **nur** durch neu
 * gelöste Kampagnen-Fenster steigt — die Nebenmodi zählen nicht mehr rein. Eine
 * Szene ist 2–4 Zeilen, überspringbar, danach in der Sammlung nachlesbar.
 *
 *   Intro (beim ersten Start):  die Nacht, in der alle Fenster zersprangen; eine
 *                          Gestalt sammelt das fallende Licht ein; Mira findet
 *                          dich; du bist Glaser, hol das Licht zurück.
 *   Akt I  — Der Garten:   die ersten Fenster, erste Spur.
 *   Akt II — Die Werkstatt: (Freischalt-Szene) Anselms Werkstatt. Geschnitten,
 *                          nicht zerschlagen. Sein Zettel. Wendung: die Gestalt
 *                          ist Anselm.
 *   Akt III — Der Farbhof:  (Freischalt-Szene) das riesige halbfertige Fenster.
 *                          Lys. Das Warum. Er trauert.
 *   Finale — Das letzte Fenster: ihr baut es zusammen zu Ende. Anselm lässt los.
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
      "Früher hielt jedes Fenster im Tal ein Stück Licht.",
      "In einer Nacht zersprangen sie alle. Das Licht sank in den Boden.",
    ],
  },
  {
    id: "intro-gestalt",
    atPanes: 0,
    title: "Die Gestalt",
    speaker: "gestalt",
    lines: [
      "Eine Gestalt sammelt die Splitter ein, bevor sie zurück ins Glas können.",
      "Wer sie ist, sieht niemand. Nur ihre Arbeit.",
    ],
  },
  {
    id: "intro-mira",
    atPanes: 0,
    title: "Der Auftrag",
    speaker: "mira",
    lines: [
      "Da bist du ja. Weißt du noch, wer du bist? … Auch egal.",
      "Du bist Glaser. Wir holen uns das Licht zurück — Fenster für Fenster. Komm.",
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
      "Siehst du das? Ein Fenster brennt wieder.",
      "So war das Tal mal überall — von innen heraus hell.",
      "Ein Fenster. Von hunderten. Aber es ist ein Anfang.",
    ],
  },
  {
    id: "a1-die-spur",
    atPanes: 6,
    title: "Die Spur",
    speaker: "mira",
    lines: [
      "Ich hab die Splitter gezählt, die noch im Boden stecken.",
      "Gestern waren es mehr. Deutlich mehr.",
      "Die Gestalt sammelt sie ein. Und sie weiß, wohin sie geht.",
    ],
  },

  // ── Akt II — Die Werkstatt (Freischalt-Szene bei Fenster 8) ─────────────
  {
    id: "a2-werkstatt",
    atPanes: 8,
    title: "Die Werkstatt",
    speaker: "mira",
    lines: [
      "Der Weg über den Hang führt zu einer alten Werkstatt.",
      "Die vom Meister. Anselm. Bester Glaser, den das Tal je hatte.",
      "Seit der Nacht ist er weg. Das Werkzeug liegt noch, wie er's hinlegte.",
      "Wenn irgendwo Antworten liegen, dann hier.",
    ],
  },
  {
    id: "a2-geschnitten",
    atPanes: 12,
    title: "Kein Sturm",
    speaker: "mira",
    lines: [
      "Diese Fenster sind nicht zersprungen. Sie sind zerlegt.",
      "Jede Scheibe an der Bleifuge getrennt, sauber, mit Absicht.",
      "Das war kein Unglück in der Nacht. Das hat sich jemand vorgenommen.",
    ],
  },
  {
    id: "a2-der-zettel",
    atPanes: 16,
    title: "Der Zettel",
    speaker: "mira",
    lines: [
      "Auf der Bank liegt ein Zettel. Seine Schrift, keine Frage.",
      "„Ich hole sie zurück. Ein Fenster, groß genug. Verzeiht mir das Dunkel.“",
      "Kein Datum. Aber die Tinte ist Jahre alt.",
    ],
  },
  {
    id: "a2-die-wendung",
    atPanes: 21,
    title: "Die Handschrift",
    speaker: "anselm",
    lines: [
      "Du sammelst das Licht ein, Kind. Fenster für Fenster.",
      "Das tue ich auch. Seit langem, und gründlicher.",
      "Die Gestalt, der ihr nachjagt — das bin ich.",
      "Der Unterschied ist: ich baue damit etwas Bestimmtes zu Ende.",
    ],
  },

  // ── Akt III — Der Farbhof (Freischalt-Szene bei Fenster 22) ────────────
  {
    id: "a3-farbhof",
    atPanes: 22,
    title: "Der Farbhof",
    speaker: "welt",
    lines: [
      "Der Farbhof: hohe, leere Fensterbögen, einer neben dem anderen.",
      "In der Mitte steht eines, das größer ist als alle Kirchen des Tals.",
      "Halb fertig. Seit Jahren wächst es Scheibe um Scheibe.",
    ],
  },
  {
    id: "a3-lys",
    atPanes: 32,
    title: "Lys",
    speaker: "anselm",
    lines: [
      "Meine Tochter Lys ging durch ein Fenster, das ich gebaut hatte.",
      "Sie kam nicht auf der anderen Seite heraus. Sie kam gar nicht heraus.",
      "Ein Fehler in der Teilung. Mein Fehler.",
    ],
  },
  {
    id: "a3-das-warum",
    atPanes: 44,
    title: "Das Warum",
    speaker: "anselm",
    lines: [
      "Jeder Splitter des Tals sollte in dieses eine Fenster. Groß genug für sie.",
      "Ich bin nicht dein Feind. Ich bin nur nicht fertig geworden.",
      "Und ich werde es allein auch nicht.",
    ],
  },

  // ── Finale — Das letzte Fenster (per forceBeat nach boss_01) ───────────
  {
    id: "finale",
    atPanes: 999,
    title: "Das letzte Fenster",
    speaker: "anselm",
    lines: [
      "Setz die letzte Scheibe. Ich halte den Rahmen.",
      "Es bringt sie nicht zurück. Das weiß ich, seit du hier bist.",
      "Aber das Tal soll nicht in meinem Dunkel bleiben. Danke, Kind.",
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
