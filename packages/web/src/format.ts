/**
 * Eine einzige Zahlenformatierung fürs ganze Spiel — `nf()` stand bisher nur
 * lokal in app.ts, und cascade-view.ts hatte sich für den "+N"-Pop seine
 * eigene, abweichende Formatierung gebaut (`de-DE` statt `en-US`). Damit
 * standen z. B. "+1.234" (Pop) und "1,234" (HUD) nebeneinander auf demselben
 * Screen. Von hier importieren alle Module, die Zahlen anzeigen.
 */

/** Numbers in the game always with a thousands separator — "12,345" not "12345". */
export const nf = (n: number): string => Math.round(n).toLocaleString("en-US");
/** Multiplier as-is — "×1.5" (don't round!). */
export const xf = (n: number | string): string => String(n);
