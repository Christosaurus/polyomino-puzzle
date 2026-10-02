/**
 * "Nächstes Ziel" fürs Rundenende: das günstigste Shop-Stück, das man sich
 * mit dem aktuellen Splitter-Stand noch NICHT leisten kann -- ein klarer Haken,
 * noch eine Runde zu spielen.
 */

export interface GoalItem {
  label: string;
  cost: number;
  /** Gesperrt/nicht kaufbar (Vorrat voll, "soon" ...) -- zählt nicht als Ziel. */
  locked: boolean;
}

export function nextGoal(shards: number, items: ReadonlyArray<GoalItem>): { label: string; missing: number } | null {
  const open = items
    .filter((i) => !i.locked && i.cost > 0 && i.cost > shards)
    .sort((a, b) => a.cost - b.cost);
  const first = open[0];
  return first ? { label: first.label, missing: first.cost - shards } : null;
}
