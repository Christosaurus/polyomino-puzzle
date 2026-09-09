# Bestenliste — Supabase-Setup

Ziel für den Anfang: eine **Kaskade-Wochenbestenliste**. Cheatbar (der Score
wird im Client gerechnet, der anon-Key liegt offen), aber gedeckelt und wöchentlich
zurückgesetzt — echte Replay-Prüfung kommt später als Edge Function.

## Was Christian in Supabase macht

### 1. Organisation + Projekt

1. „New organization" → Name **Lumen**, Plan **Free**.
2. Im Projekt: „New project".
   - Name: **lumen**
   - Database Password: generieren, **irgendwo speichern** (brauchen wir für die
     Bestenliste nicht, aber verlieren sollte man es nicht).
   - Region: **Central EU (Frankfurt)** — nächste an deutschen Spielern.
   - Plan: **Free**.
3. ~2 Minuten warten, bis das Projekt bereitsteht.

### 2. Tabelle + Funktion anlegen

Linke Leiste → **SQL Editor** → „New query" → das hier einfügen und **Run**:

```sql
create table public.cascade_scores (
  player_id  text        not null,
  name       text        not null,
  score      integer     not null check (score between 0 and 200000),
  cleared    integer     not null default 0 check (cleared between 0 and 100000),
  week       text        not null,
  updated_at timestamptz not null default now(),
  primary key (player_id, week)
);

alter table public.cascade_scores enable row level security;

-- jeder darf die Bestenliste lesen
create policy "read leaderboard"
  on public.cascade_scores for select using (true);
-- kein insert/update/delete von aussen: Schreiben nur ueber die Funktion unten

create or replace function public.submit_cascade_score(
  p_player_id text, p_name text, p_score integer, p_cleared integer
) returns void
language plpgsql security definer set search_path = public as $$
declare
  wk text := to_char(now() at time zone 'UTC', 'IYYY')
             || '-W' || lpad(to_char(now() at time zone 'UTC', 'IW'), 2, '0');
  nm text := left(trim(coalesce(p_name, '')), 24);
begin
  if p_player_id is null or length(p_player_id) not between 8 and 64 then
    raise exception 'bad player id';
  end if;
  if p_score < 0 or p_score > 200000 then
    raise exception 'bad score';
  end if;
  insert into public.cascade_scores (player_id, name, score, cleared, week)
  values (p_player_id,
          coalesce(nullif(nm, ''), 'Glaser'),
          p_score,
          greatest(0, least(coalesce(p_cleared, 0), 100000)),
          wk)
  on conflict (player_id, week) do update
    set score      = greatest(cascade_scores.score, excluded.score),
        cleared    = greatest(cascade_scores.cleared, excluded.cleared),
        name       = excluded.name,
        updated_at = now();
end;
$$;

grant execute on function public.submit_cascade_score to anon;
```

### 3. Die zwei Werte für mich holen

Linke Leiste → **Project Settings** → **API**:

- **Project URL** — `https://xxxxxxxx.supabase.co`
- **Project API keys → `anon` `public`** — der lange Key, der mit `eyJ...`
  anfängt.

Beide sind **öffentlich** (der anon-Key steckt in jeder Supabase-Web-App, RLS
schützt die Daten). Also einfach hier reinkopieren.

**Nicht** rausgeben: das `service_role`-Key und das Database Password — die sind
geheim.

## Was ich dann mache

- `packages/web/src/leaderboard.ts`: feste Spieler-UUID im localStorage,
  `submitCascadeScore()` (POST auf `/rest/v1/rpc/submit_cascade_score`),
  `topCascade(week)` (GET auf `/rest/v1/cascade_scores?...`).
- URL + anon-Key als Konstanten (öffentlich, dürfen ins Repo).
- Ein Panel im Kaskade-Screen: Top 50 der Woche + eigener Rang, Submit am
  Rundenende.
- Wochen-Reset ist automatisch (der `week`-Key wechselt).

## Später (Härtung)

- Supabase Edge Function `verify-run`: Client schickt Seed + Zugfolge mit
  Zeitstempeln, die Function spielt den Lauf nach und rechnet den Score selbst.
  Nur verifizierte Läufe kommen in die Tabelle. Braucht `cascade.ts`
  serverseitig lauffähig.
- Rate Limit pro `player_id` (Supabase hat das eingebaut, oder in der Function).
