/**
 * Kaskade-Wochenbestenliste über Supabase.
 *
 * URL + Key sind **öffentlich** — der publishable Key ist für den Client-Einsatz
 * gedacht, Row-Level-Security + die `security definer`-Funktion schützen die
 * Daten (Schreiben nur über `submit_cascade_score`, das nur den besseren Score
 * behält und bei 200.000 deckelt). Setup: `art-refs/BACKEND-bestenliste.md`.
 *
 * Cheatbar-für-den-Anfang: der Score wird im Client gerechnet. Echte Prüfung
 * (Replay in einer Edge Function) kommt später; der Wochen-Reset begrenzt den
 * Schaden bis dahin.
 */

const SUPABASE_URL = "https://bhgkwdrwvckutnachtyb.supabase.co";
const SUPABASE_KEY = "sb_publishable_oCeLYRvrFVsHJolaZ_J0cA_kdAYAoOQ";

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

/**
 * ISO-Woche in UTC — muss zum Postgres-Ausdruck in `submit_cascade_score`
 * passen: `to_char(now(),'IYYY') || '-W' || lpad(to_char(now(),'IW'),2,'0')`.
 */
export function isoWeek(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Mo=1 … So=7
  d.setUTCDate(d.getUTCDate() + 4 - day); // auf den Donnerstag der Woche
  const isoYear = d.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

const PID_KEY = "lumen.pid";
/** Stabile Spieler-id (unabhängig vom Spielstand, damit ein Save-Reset die
 *  Bestenlisten-Identität nicht verwaist). */
export function playerId(): string {
  try {
    let id = localStorage.getItem(PID_KEY);
    if (!id || id.length < 8) {
      id = (crypto.randomUUID?.() ?? `p_${Date.now()}_${Math.random().toString(36).slice(2)}`).slice(0, 64);
      localStorage.setItem(PID_KEY, id);
    }
    return id;
  } catch {
    return "p_anon";
  }
}

export interface LeaderRow {
  player_id: string;
  name: string;
  score: number;
  cleared: number;
}

/** Score der laufenden Runde einreichen. Fehler werden verschluckt — die
 *  Bestenliste darf das Ergebnis-Overlay nie blockieren. */
export async function submitCascadeScore(score: number, cleared: number, name: string): Promise<boolean> {
  if (!(score > 0)) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_cascade_score`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        p_player_id: playerId(),
        p_name: name.slice(0, 24) || "Glaser",
        p_score: Math.round(score),
        p_cleared: Math.max(0, Math.round(cleared)),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Top-Liste der aktuellen Woche. `[]` bei Netzfehler. */
export async function topCascade(limit = 50): Promise<LeaderRow[]> {
  try {
    const q = new URLSearchParams({
      week: `eq.${isoWeek()}`,
      select: "player_id,name,score,cleared",
      order: "score.desc,updated_at.asc",
      limit: String(limit),
    });
    const res = await fetch(`${SUPABASE_URL}/rest/v1/cascade_scores?${q}`, { headers: HEADERS });
    if (!res.ok) return [];
    return (await res.json()) as LeaderRow[];
  } catch {
    return [];
  }
}
