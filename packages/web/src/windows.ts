/**
 * Namen für die Kampagnen-Fenster. Jedes Fenster im Tal ist ein echtes Ding —
 * ein Küchenfenster, das Oberlicht der Werkstatt, ein Bogen im Farbhof. Der
 * Name steht im Spiel über dem Brett, damit ein Level etwas bedeutet und nicht
 * bloß „Der Garten · 5 / 19" heißt (KONZEPT §F). Rein kosmetisch; die Reihen-
 * folge kommt weiter aus dem Manifest.
 */

const GARDEN = [
  "Das Küchenfenster",
  "Die Veranda",
  "Miras Laterne",
  "Das Beet hinterm Haus",
  "Die alte Scheune",
  "Das Giebelfenster",
  "Der Brunnen im Hof",
  "Das Treibhaus",
  "Die Bienenkörbe",
  "Das Fenster zur Straße",
  "Der Taubenschlag",
  "Das Dachluk",
  "Die Gartentür",
  "Das Efeufenster",
  "Der Geräteschuppen",
  "Das Fenster über der Bank",
  "Die Sommerküche",
  "Das runde Fenster",
  "Der letzte Garten",
];

const WORKSHOP = [
  "Die Werkbank",
  "Der Bogen über der Esse",
  "Anselms Zeichentisch",
  "Das Oberlicht",
  "Die Bleiglas-Kammer",
  "Das Fenster mit dem Sprung",
  "Der Werkzeugschrank",
  "Das Fenster zum Stollen",
  "Die Schleifkammer",
  "Das geteilte Fenster",
  "Der Musterrahmen",
  "Das Fenster hinter der Tür",
  "Die Farbküche",
  "Das Fenster ohne Namen",
  "Der zweite Zeichentisch",
  "Das Fenster mit dem Zettel",
  "Die kalte Esse",
  "Das schmale Fenster",
  "Anselms letzte Arbeit",
];

const COURTYARD = [
  "Der erste Bogen",
  "Die Rosette",
  "Das hohe Fenster",
  "Der Doppelbogen",
  "Das Fenster im Nebel",
  "Die zwölf Scheiben",
  "Der kalte Bogen",
  "Lys’ Fenster",
  "Das Fenster, das er baute",
  "Der Bogen ohne Licht",
  "Die letzte Rosette",
  "Das Fenster über dem Tor",
  "Der Chorbogen",
  "Das Fenster aus Scherben",
  "Der westliche Bogen",
  "Das Colossus-Fenster",
  "Anselms Prüfstück",
  "Das letzte Fenster",
];

const POOLS: Record<string, string[]> = {
  garden: GARDEN,
  workshop: WORKSHOP,
  courtyard: COURTYARD,
};

/** Der Name des `index`-ten Fensters einer Region, oder ein sanfter Fallback. */
export function windowName(regionId: string, index: number): string {
  const pool = POOLS[regionId];
  if (pool && pool[index]) return pool[index]!;
  return `Fenster ${index + 1}`;
}
