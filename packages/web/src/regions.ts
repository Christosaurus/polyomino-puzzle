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

export function buildRegions(manifest: Manifest): Region[] {
  const sorted = [...manifest.levels].sort((a, b) => a.difficulty - b.difficulty);
  const per = Math.ceil(sorted.length / META.length);
  return META.map((m, i) => ({
    ...m,
    levels: sorted.slice(i * per, (i + 1) * per),
  }));
}
