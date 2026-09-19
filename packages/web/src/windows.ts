/**
 * Namen für die Kampagnen-Fenster. Jedes Fenster im Tal ist ein echtes Ding —
 * ein Küchenfenster, das Oberlicht der Werkstatt, ein Bogen im Farbhof. Der
 * Name steht im Spiel über dem Brett, damit ein Level etwas bedeutet und nicht
 * bloß „Der Garten · 5 / 19" heißt (KONZEPT §F). Rein kosmetisch; die Reihen-
 * folge kommt weiter aus dem Manifest.
 */

const GARDEN = [
  "The Kitchen Window",
  "The Veranda",
  "Mira's Lantern",
  "The Flowerbed Behind the House",
  "The Old Barn",
  "The Gable Window",
  "The Well in the Yard",
  "The Greenhouse",
  "The Beehives",
  "The Window to the Street",
  "The Dovecote",
  "The Skylight",
  "The Garden Door",
  "The Ivy Window",
  "The Tool Shed",
  "The Window Above the Bench",
  "The Summer Kitchen",
  "The Round Window",
  "The Last Garden",
];

const WORKSHOP = [
  "The Workbench",
  "The Arch Above the Forge",
  "Anselm's Drafting Table",
  "The Transom",
  "The Leaded Glass Chamber",
  "The Window with the Crack",
  "The Tool Cabinet",
  "The Window to the Mine",
  "The Grinding Chamber",
  "The Divided Window",
  "The Pattern Frame",
  "The Window Behind the Door",
  "The Color Kitchen",
  "The Nameless Window",
  "The Second Drafting Table",
  "The Window with the Note",
  "The Cold Forge",
  "The Narrow Window",
  "Anselm's Last Work",
];

const COURTYARD = [
  "The First Arch",
  "The Rosette",
  "The Tall Window",
  "The Double Arch",
  "The Window in the Fog",
  "The Twelve Panes",
  "The Cold Arch",
  "Lys's Window",
  "The Window He Built",
  "The Arch Without Light",
  "The Last Rosette",
  "The Window Above the Gate",
  "The Choir Arch",
  "The Window Made of Shards",
  "The Western Arch",
  "The Colossus Window",
  "Anselm's Masterwork",
  "The Last Window",
];

const POOLS: Record<string, string[]> = {
  garden: GARDEN,
  workshop: WORKSHOP,
  courtyard: COURTYARD,
};

/** Windows with a fixed name, no matter where they land in the region. */
const BY_ID: Record<string, string> = {
  boss_01: "The Last Window",
  boss_02: "Anselm's Masterwork",
};

/** The name of the `index`-th window in a region, or a gentle fallback. */
export function windowName(regionId: string, index: number, levelId?: string): string {
  if (levelId && BY_ID[levelId]) return BY_ID[levelId]!;
  const pool = POOLS[regionId];
  if (pool && pool[index]) return pool[index]!;
  return `Window ${index + 1}`;
}
