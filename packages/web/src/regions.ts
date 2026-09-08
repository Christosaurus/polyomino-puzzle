/** Campaign regions, derived from the bundled level manifest. */

export interface ManifestEntry {
  id: string;
  difficulty: number;
  pieces: string;
}
export interface Manifest {
  seed: string;
  levels: ManifestEntry[];
}

export interface Region {
  id: string;
  name: string;
  subtitle: string;
  /** Fenster erhellt (über *alle* Modi), bevor die Laterne dieser Region angeht. */
  panesToUnlock: number;
  levels: ManifestEntry[];
}

const META = [
  { id: "garden", name: "Der Garten", subtitle: "Wo das Licht zuerst zurückkehrt", panesToUnlock: 0 },
  { id: "workshop", name: "Die Werkstatt", subtitle: "Enger, kantiger, knäuliger", panesToUnlock: 8 },
  { id: "courtyard", name: "Der Farbhof", subtitle: "Große Fenster, wenig Zeit", panesToUnlock: 22 },
];

/**
 * Schwierigkeit als *steigende Sägezahnkurve*: meist leichte Fenster, alle vier
 * ein schwereres, und die Grundlinie zieht durchgehend an — das erste schwere
 * Fenster ist noch nicht so hart wie das zehnte. Eingabe ist eine aufsteigend
 * sortierte Liste; jeder vierte Platz zieht aus den schwersten Fenstern (die
 * verbleibenden auch aufsteigend), der Rest aus den leichteren.
 */
/** Fenster, die immer ganz zum Schluss ihrer Region kommen (Finale, Prüfstück). */
const PIN_LAST = ["boss_02", "boss_01"];

function sawtooth(sortedAsc: ManifestEntry[]): ManifestEntry[] {
  // die Boss-Fenster ans Ende pinnen, in fester Reihenfolge
  const pinned = PIN_LAST.map((id) => sortedAsc.find((l) => l.id === id)).filter(
    (l): l is ManifestEntry => !!l,
  );
  const body = sortedAsc.filter((l) => !PIN_LAST.includes(l.id));
  const n = body.length;
  if (n < 6) return [...body, ...pinned];
  const spikeCount = Math.floor(n / 4);
  const hard = body.slice(n - spikeCount); // die schwersten, aufsteigend
  const easy = body.slice(0, n - spikeCount); // der Rest, aufsteigend
  const out: ManifestEntry[] = [];
  for (let k = 0; k < n; k++) {
    // erster Platz nie ein Spike; danach jeder vierte
    out.push(k > 0 && k % 4 === 3 && hard.length ? hard.shift()! : (easy.shift() ?? hard.shift()!));
  }
  return [...out, ...pinned];
}

export function buildRegions(manifest: Manifest): Region[] {
  const sorted = [...manifest.levels].sort((a, b) => a.difficulty - b.difficulty);
  const per = Math.ceil(sorted.length / META.length);
  return META.map((m, i) => ({
    ...m,
    levels: sawtooth(sorted.slice(i * per, (i + 1) * per)),
  }));
}
