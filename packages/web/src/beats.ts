/**
 * Story-Beats — die kleinen Szenen zwischen den Fenstern.
 *
 * Sie hängen an „Fenster erhellt" (nicht an einem Modus), weil der Fortschritt
 * aus allen Modi kommt. Eine Szene ist 2–4 Zeilen, überspringbar, danach in der
 * Sammlung nachlesbar (KONZEPT-lumen.md §C). Akt I spielt im Garten: du
 * erwachst, Mira findet dich, und langsam wird klar, dass jemand die Splitter
 * einsammelt, bevor du sie zurück ins Glas bekommst.
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

/** Akt I — Der Garten. Weitere Akte kommen mit den Regionen dahinter. */
export const BEATS: Beat[] = [
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
];

/**
 * Der Beat, der beim Sprung von `before` auf `after` Fenster fällig wird — oder
 * `null`. Nur einer pro Sprung; die anderen holt der nächste Sieg nach.
 */
export function beatAfter(before: number, after: number): Beat | null {
  return BEATS.find((b) => b.atPanes > before && b.atPanes <= after) ?? null;
}
