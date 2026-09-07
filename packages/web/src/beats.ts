/**
 * Story-Beats — die kleinen Szenen zwischen den Fenstern.
 *
 * Sie hängen an „Fenster erhellt" (nicht an einem Modus), weil der Fortschritt
 * aus allen Modi kommt. Eine Szene ist 2–4 Zeilen, überspringbar, danach in der
 * Sammlung nachlesbar (KONZEPT-lumen.md §C).
 *
 *   Akt I  — Der Garten:   du erwachst, Mira findet dich, jemand sammelt die
 *                          Splitter ein, bevor du sie zurückbekommst.
 *   Akt II — Die Werkstatt: Anselms Werkstatt. Die Fenster wurden geschnitten,
 *                          nicht zerschlagen. Sein Zettel. Die Wendung: der
 *                          Scherbensammler ist Anselm.
 *   Akt III — Der Farbhof:  das Warum. Lys ging in ein Fenster und kam nicht
 *                          zurück. Er sammelt, um sie zurückzuholen. Er trauert.
 *   Finale — Das letzte Fenster: du baust es mit ihm zu Ende. Es holt Lys nicht
 *                          zurück. Es gibt dem Tal das Licht. Anselm lässt los.
 */

export interface Beat {
  id: string;
  /** Wird gezeigt, sobald „Fenster erhellt" diese Schwelle erreicht. */
  atPanes: number;
  /** Kurztitel für die „Erinnerungen"-Liste. */
  title: string;
  speaker: "mira" | "anselm" | "welt";
  lines: string[];
}

/** Sprecher → Portrait-Datei + Notfall-Emoji, wenn das Bild noch fehlt. */
export const SPEAKERS: Record<Beat["speaker"], { name: string; img: string; emoji: string }> = {
  mira: { name: "Mira", img: "ui/chars/mira.webp", emoji: "🏮" },
  anselm: { name: "Meister Anselm", img: "ui/chars/anselm.webp", emoji: "🕯" },
  welt: { name: "", img: "", emoji: "✦" },
};

export const BEATS: Beat[] = [
  // ── Akt I — Der Garten ──────────────────────────────────────────────────
  {
    id: "a1-erwachen",
    atPanes: 1,
    title: "Erwachen",
    speaker: "mira",
    lines: [
      "Da bist du ja. Ich dachte schon, du machst gar nicht mehr auf.",
      "Weißt du noch, wer du bist? … Nein? Auch egal.",
      "Du bist Glaser. Und das Tal ist dunkel. Der Rest kommt beim Arbeiten.",
    ],
  },
  {
    id: "a1-erstes-licht",
    atPanes: 4,
    title: "Das erste Licht",
    speaker: "mira",
    lines: [
      "Siehst du das? Ein Fenster brennt wieder.",
      "So war das Tal mal überall — von innen heraus hell.",
      "In der Nacht sind alle zersprungen. Alle, gleichzeitig.",
    ],
  },
  {
    id: "a1-die-spur",
    atPanes: 9,
    title: "Die Spur",
    speaker: "mira",
    lines: [
      "Ich hab die Splitter gezählt, die noch im Boden stecken.",
      "Gestern waren es mehr. Deutlich mehr.",
      "Jemand sammelt sie ein. Und er ist schneller als wir.",
    ],
  },
  {
    id: "a1-die-schnitte",
    atPanes: 15,
    title: "Die Schnitte",
    speaker: "mira",
    lines: [
      "Diese Scheibe ist nicht zerschlagen. Sie ist geschnitten.",
      "Sauber. Mit einer ruhigen Hand.",
      "Nur einer im Tal konnte so schneiden. Und der ist seit der Nacht weg.",
    ],
  },
  {
    id: "a1-garten-hell",
    atPanes: 22,
    title: "Der Garten atmet",
    speaker: "welt",
    lines: [
      "Der Garten steht wieder im Licht.",
      "Wo seit Jahren nichts wuchs, drückt sich Grün durch den Boden.",
      "Über dem Hang, wo der Weg in die Werkstatt führt, ist es noch dunkel.",
    ],
  },

  // ── Akt II — Die Werkstatt ──────────────────────────────────────────────
  {
    id: "a2-werkstatt",
    atPanes: 26,
    title: "Die Werkstatt",
    speaker: "mira",
    lines: [
      "Das ist Anselms Werkstatt. War sie.",
      "Das Werkzeug liegt noch, wie er es hingelegt hat. Die Esse ist kalt.",
      "Niemand hat hier aufgeräumt. Niemand hat sich getraut.",
    ],
  },
  {
    id: "a2-geschnitten",
    atPanes: 31,
    title: "Kein Sturm",
    speaker: "mira",
    lines: [
      "Die Fenster hier sind nicht zersprungen. Sie sind zerlegt.",
      "Jede Scheibe an der Bleifuge getrennt, sauber, mit Absicht.",
      "Das war kein Unglück in der Nacht. Das hat sich jemand vorgenommen.",
    ],
  },
  {
    id: "a2-der-zettel",
    atPanes: 36,
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
    atPanes: 41,
    title: "Die Handschrift",
    speaker: "anselm",
    lines: [
      "Du sammelst das Licht ein, Kind. Fenster für Fenster.",
      "Das tue ich auch. Seit langem, und gründlicher.",
      "Der Unterschied ist: ich baue damit etwas Bestimmtes zu Ende.",
    ],
  },

  // ── Akt III — Der Farbhof ───────────────────────────────────────────────
  {
    id: "a3-farbhof",
    atPanes: 46,
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
    atPanes: 51,
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
    atPanes: 56,
    title: "Das Warum",
    speaker: "anselm",
    lines: [
      "Jeder Splitter des Tals sollte in dieses eine Fenster. Groß genug für sie.",
      "Ich bin nicht dein Feind. Ich bin nur nicht fertig geworden.",
      "Und ich werde es allein auch nicht.",
    ],
  },

  // ── Finale — Das letzte Fenster ────────────────────────────────────────
  {
    id: "finale",
    atPanes: 62,
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
