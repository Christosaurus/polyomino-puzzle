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
  anselm: { name: "Meister Anselm", img: "ui/chars/anselm.webp", emoji: "🕯" },
  umbra: { name: "Umbra", img: "ui/chars/umbra.webp", emoji: "◆" },
  welt: { name: "", img: "", emoji: "✦" },
};

/** Die Intro-Sequenz — läuft einmal beim allerersten Start, vor Fenster 1. */
export const INTRO: Beat[] = [
  {
    id: "intro-tal",
    atPanes: 0,
    title: "Das Glimmertal",
    speaker: "welt",
    bg: "bg/intro-1-tal.webp",
    lines: [
      "Im Glimmertal hat man das Licht nie gesucht — man hat es gemacht.",
      "Die Glaser fingen es in ihren Scheiben ein und setzten es in die Fenster.",
      "So trug jedes Haus seine eigene kleine Sonne, und abends leuchtete das ganze Tal von innen heraus.",
    ],
  },
  {
    id: "intro-nacht",
    atPanes: 0,
    title: "Die Nacht",
    speaker: "welt",
    bg: "bg/intro-2-sturm.webp",
    lines: [
      "Dann kam die eine Nacht.",
      "Zur selben Stunde zersprang in jedem Haus das Glas. Das Licht lief heraus und versickerte im Boden.",
      "Bis zum Morgen war das Tal schwarz — und wer diese Nacht heraufbeschworen hatte, war längst in den Bergen verschwunden.",
    ],
  },
  {
    id: "intro-schatten",
    atPanes: 0,
    title: "Im Schatten",
    speaker: "welt",
    bg: "bg/intro-3-schatten.webp",
    lines: [
      "Das ist Monate her. Das Glimmertal liegt immer noch im Schatten.",
      "Die Menschen haben gelernt, im Dunkeln zu leben. Sie sind still geworden dabei, und bitter.",
      "Keiner spricht mehr davon, dass es einmal anders war — keiner bis auf eine. Und heute Nacht klopft sie an deine Tür.",
    ],
  },
  {
    id: "intro-mira",
    atPanes: 0,
    title: "Der Auftrag",
    speaker: "mira",
    bg: "bg/intro-4-garten.webp",
    lines: [
      "Du bist also der Glaser, von dem sie reden. Der, der die ganze Nacht verschlafen hat. … Ja. Sieht man.",
      "Ich bin Mira. Ich trage das Licht durch die Gegend, ich kenne jedes kaputte Fenster im Tal, und ich habe keine Geduld. Von den dreien helfen dir zwei.",
      "Die Scherben liegen noch da, wo sie runtergefallen sind. Wir setzen sie wieder zusammen — ein Fenster nach dem anderen — bis das Tal wieder leuchtet. Fangen wir mit dem hier an.",
    ],
  },
  {
    id: "intro-umbra",
    atPanes: 0,
    title: "Umbra",
    speaker: "umbra",
    bg: "bg/intro-5-umbra.webp",
    lines: [
      "Da unten wird ein Fenster wieder hell. … Wie rührend.",
      "Sie nennen mich Umbra. Den Namen solltest du dir merken.",
      "Ich habe diesem Tal das Licht genommen, und ich nehme es jedes Mal aufs Neue. Setz ruhig deine Scheiben, Glaser — jede bringt dich ein Stück näher zu mir herauf.",
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
