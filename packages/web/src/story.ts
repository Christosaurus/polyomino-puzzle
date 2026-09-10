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
  first: ["Ein ganzes Fenster, das wieder Licht hält. Das erste seit der Nacht. Sieh es dir an."],

  struggled: [
    "Beim wievielten Versuch? Egal — es zählt genauso.",
    "Ich hätt dieses Fenster längst aufgegeben. Du nicht.",
    "Das war stur. Stur ist hier genau richtig.",
    "Schwer war's. Umso heller ist es jetzt.",
  ],

  perfect: [
    "Keine Scheibe zu viel, keine schief. Anselm hätte genickt.",
    "Sauber gesetzt. Ich hab Meister gesehen, die das schlechter hinkriegen.",
    "Makellos. Und nein, das hab ich nicht gesagt.",
  ],

  garden: [
    "Der Garten wird wieder wach. Riechst du das?",
    "Da hinten wächst was, wo jahrelang nichts war.",
    "Hier hat das Licht zuerst gehalten. Hier kommt es zuerst zurück.",
  ],

  workshop: [
    "Anselms Werkstatt. Jeder Schnitt hier trägt seine Hand.",
    "Hier hat er gearbeitet, bevor er ging.",
    "Diese Scheiben wurden gelöst, nicht zerschlagen. Das ändert alles.",
    "Das Blei ist frisch nachgezogen. Er war nicht vor Jahren hier — er ist es dauernd.",
  ],

  courtyard: [
    "Der Farbhof. Die größten Fenster im Tal, und die schwersten.",
    "Hier war das Licht am buntesten. Stück für Stück kommt es zurück.",
    "Jede Scheibe, die du hier setzt, fehlt ihm in seinem großen Bogen.",
  ],

  daily: [
    "Ein Fenster am Tag. So hat es das Tal früher gehalten.",
    "Das Tal hat gefragt. Du hast geantwortet.",
    "Komm morgen wieder — es wartet schon das nächste.",
  ],

  descent: [
    "So tief unten? Hier hortet er, was er sammelt.",
    "Jede Scherbe, die du hier rausholst, kriegt er nicht.",
    "Weiter runter. Ich halt die Laterne.",
    "Riecht nach kaltem Ruß. Er war vor Kurzem hier.",
  ],

  streak: [
    "Drei am Stück. Bleib dran.",
    "Du bist drin. Jetzt nicht rausfallen.",
    "In dem Tempo holen wir das ganze Tal zurück.",
  ],

  generic: [
    "Wieder eins. Das Tal wird ein Stück heller.",
    "Noch ein Fenster zurück auf unserer Seite.",
    "Ein Speicher mehr, der wieder Licht hält.",
    "Von hier oben seh ich es leuchten.",
    "Das Tal merkt sich so etwas.",
    "Gut. Nächstes.",
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
