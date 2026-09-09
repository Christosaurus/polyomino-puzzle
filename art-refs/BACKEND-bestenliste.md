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

### 2b. Migration — Land + Cheat-Schutz Stufe 2

Wenn Schritt 2 (die Grundtabelle) schon lief: das hier als **eine** neue Query
im **SQL Editor** ausführen. Nichts vorher löschen — `add column if not exists`,
`drop function if exists` und `create or replace` machen den Umbau selbst. Die
Tabellendaten bleiben.

Das legt an: die `country`-Spalte, eine Token-Tabelle (`run_tokens`), die
Funktion `start_cascade_run` (Einmal-Token vor jeder Runde, pro Spieler
rate-limitiert) und die neue `submit_cascade_score` mit Token-Prüfung +
Plausibilität (Zeit / Reihen / Punkte müssen zueinander passen).

```sql
-- 1) Land-Spalte
alter table public.cascade_scores
  add column if not exists country text not null default 'XX';

-- 2) Token-Tabelle: ein Token pro gestarteter Runde, wird beim Submit verbraucht
create table if not exists public.run_tokens (
  token      uuid primary key default gen_random_uuid(),
  player_id  text not null,
  created_at timestamptz not null default now(),
  used       boolean not null default false
);
alter table public.run_tokens enable row level security;
-- keine Policies: nur die security-definer-Funktionen unten kommen dran

-- 3) Token vor der Runde holen (rate-limitiert)
create or replace function public.start_cascade_run(p_player_id text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare tok uuid;
begin
  if p_player_id is null or length(p_player_id) not between 8 and 64 then
    raise exception 'bad player id';
  end if;
  if (select count(*) from run_tokens
      where player_id = p_player_id
        and created_at > now() - interval '90 seconds') >= 6 then
    raise exception 'rate limit';
  end if;
  delete from run_tokens where created_at < now() - interval '2 hours';
  insert into run_tokens (player_id) values (p_player_id) returning token into tok;
  return tok;
end;
$$;
grant execute on function public.start_cascade_run(text) to anon;

-- 4) Submit: Token einlösen + Plausibilität + bestehende Upsert-Logik
drop function if exists public.submit_cascade_score(text, text, integer, integer);
drop function if exists public.submit_cascade_score(text, text, integer, integer, text);

create or replace function public.submit_cascade_score(
  p_player_id text, p_name text, p_score integer, p_cleared integer,
  p_country text default 'XX', p_token uuid default null, p_run_ms integer default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  wk text := to_char(now() at time zone 'UTC', 'IYYY')
             || '-W' || lpad(to_char(now() at time zone 'UTC', 'IW'), 2, '0');
  nm text := left(trim(coalesce(p_name, '')), 24);
  cc text := upper(left(coalesce(p_country, 'XX'), 2));
  score_cap integer;
  tok_ok boolean;
begin
  -- Token: existiert, gehört dem Spieler, frisch, noch nicht benutzt
  update run_tokens set used = true
   where token = p_token and player_id = p_player_id
     and not used and created_at > now() - interval '25 minutes'
  returning true into tok_ok;
  if tok_ok is distinct from true then
    raise exception 'invalid run token';
  end if;

  -- Plausibilität (Kaskade = 2:30 Grundzeit, Perfect Clears legen bis ~+30s drauf)
  if p_run_ms is null or p_run_ms < 45000 or p_run_ms > 200000 then
    raise exception 'implausible run time';
  end if;
  if p_cleared < 0 or p_cleared > (p_run_ms / 550) then
    raise exception 'implausible clears';
  end if;
  score_cap := least(200000, p_cleared * 800 + (p_run_ms / 1000) * 30 + 6000);
  if p_score < 0 or p_score > score_cap then
    raise exception 'implausible score';
  end if;

  if cc !~ '^[A-Z]{2}$' then cc := 'XX'; end if;
  insert into public.cascade_scores (player_id, name, score, cleared, week, country)
  values (p_player_id,
          coalesce(nullif(nm, ''), 'Glaser'),
          p_score,
          greatest(0, least(coalesce(p_cleared, 0), 100000)),
          wk, cc)
  on conflict (player_id, week) do update
    set score      = greatest(cascade_scores.score, excluded.score),
        cleared    = greatest(cascade_scores.cleared, excluded.cleared),
        name       = excluded.name,
        country    = excluded.country,
        updated_at = now();
end;
$$;
grant execute on function public.submit_cascade_score to anon;

-- 5) Testdaten weg
delete from public.cascade_scores;
```

**Grenzen von Stufe 2:** Der Score wird weiter im Client gerechnet. Wer *in sich
stimmige* Fake-Zahlen schickt (Zeit + Reihen + Punkte passen zueinander), kommt
durch. Das Token + Rate-Limit stoppt aber das simple „Submit-Request mit großer
Zahl wiederholen". Echt sicher wird es erst mit Stufe 3 (Replay-Prüfung in einer
Edge Function). Die Deckel in Schritt 4 sind bewusst locker — wenn echte
Top-Scores reinkommen, `p_cleared`-Faktor (550) und `score_cap` (800/30/6000)
enger stellen.

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
