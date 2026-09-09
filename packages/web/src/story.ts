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
  first: ["Ein Fenster. Nach all den Jahren. Und du machst es einfach an."],

  struggled: [
    "Beim wievielten Mal? Zählt trotzdem.",
    "Ich hätte aufgegeben. Du nicht.",
    "Das war stur. Stur ist hier gut.",
    "Er hat auf dieses Fenster aufgepasst. Jetzt nicht mehr.",
  ],

  perfect: [
    "Kein Splitter zu viel. Anselm hätte genickt.",
    "Sauber. Ich hab Meister gesehen, die das schlechter können.",
    "Makellos. Sag nicht, dass ich das gesagt hab.",
  ],

  garden: [
    "Der Garten atmet wieder. Riechst du das?",
    "Da hinten wächst was, wo seit Jahren nichts war.",
    "Hier hat das Licht angefangen. Hier fängt es wieder an.",
  ],

  workshop: [
    "Das ist Anselms Handschrift. Ich erkenne seine Schnitte.",
    "Hier hat er gearbeitet. Vor der Nacht.",
    "Die Werkstatt erinnert sich an ihn. Ich auch.",
    "Diese Scheibe wurde geschnitten, nicht zerschlagen. Merk dir das.",
  ],

  courtyard: [
    "Der Farbhof. Die schwersten Fenster im Tal.",
    "Hier war das Licht am buntesten. Es kommt zurück.",
    "Noch drei Höfe. Dann wissen wir es.",
  ],

  daily: [
    "Ein Fenster am Tag. So hat man das früher gemacht.",
    "Das Tal hat gefragt. Du hast geantwortet.",
    "Komm morgen wieder. Es wartet eins auf dich.",
  ],

  descent: [
    "So tief? Hier unten hortet er sie.",
    "Jeder Splitter hier ist einer, den er nicht kriegt.",
    "Weiter runter. Ich halte die Laterne.",
    "Riecht nach Ruß. Er war vor kurzem hier.",
  ],

  streak: [
    "Drei am Stück. Mach ruhig weiter.",
    "Du bist im Fluss. Nicht stehenbleiben.",
    "In dem Tempo holen wir das ganze Tal.",
  ],

  generic: [
    "Wieder eins. Das Tal wird heller.",
    "Noch ein Fenster, das ihm nicht gehört.",
    "Sammel sie ein, bevor er es tut.",
    "Ich seh das Licht bis hierher.",
    "Ein Splitter mehr auf unserer Seite.",
    "Gut. Weiter.",
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
