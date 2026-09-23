# Kaskade-Ökonomie & Sog-Konzept

Antwort auf den Playtest-Bericht (`playtest-kaskade-bericht.md`, Hook-Score 4/10). Ziel: ein Währungs-, Fähigkeiten- und Belohnungssystem, das echten Sog erzeugt, ohne Pay-to-Win zu sein — Design/Sound-Politur kommt in einer späteren Runde, hier geht's um Architektur und Balance.

**Leitplanken, an denen sich jede Entscheidung unten misst:**
1. Jede Ressource ist rein durchs Spielen erreichbar — Echtgeld (falls später überhaupt kommt) kauft nie einen exklusiven Vorteil, höchstens dieselbe Währung schneller oder Kosmetik.
2. Kein Kauf gibt jemals direkt Punkte auf die Bestenliste. Währung kauft Werkzeuge und Weiterspielen, nie den Score selbst.
3. Fähigkeiten sind verbrauchbar und auf Lagerbestand gedeckelt — ein Vorteil pro Runde bleibt begrenzt, nie ein dauerhafter Skill-Multiplikator.
4. Die reibungslose Eingangstür ("1 Tap → Brett, 1 Tap → nochmal") bleibt unangetastet — der Playtest nannte sie explizit eine der drei stärksten Stellen im Spiel. "Runden limitieren" heißt hier NICHT wieder ein Energie-Gate vor den Start zu hängen, sondern Rundenlänge und Weiterspielen sauber zu deckeln (Details unten, Abschnitt 4).

---

## 1. Währung: Lichtsplitter (✦) — Auszahlung neu gebaut

**Der Ist-Zustand ist der eigentliche Kern des Problems.** Die Auszahlung ist `min(40, 5 + floor(score/120))` — bei Testscores von 10.000–38.000 zahlt praktisch jede gute Runde exakt denselben Deckelbetrag. Ein Score von 4.200 und ein Score von 38.000 sind für die Wirtschaft ununterscheidbar. Und Kaskade hat aktuell **keine einzige Ausgabemöglichkeit** für die Splitter (der Shop verkauft nur Kampagnen-Joker) — Farmen ist also selbst dann sinnlos, wenn der Deckel fehlen würde.

**Neue Formel — belohnt Spielweise, nicht nur Score, und hat keinen Score-Deckel mehr:**

| Ereignis | Splitter | Begründung |
|---|---|---|
| Runde beendet (Teilnahme) | +3 | Nie eine Nullrunde, egal wie schlecht — Ausgangspunkt, kein Grind |
| pro geräumte Reihe/Spalte | +0.3 | Trifft den Kern-Takt direkt (Clear alle ~2,3s laut Playtest-Messung) |
| pro gewonnene Challenge | +4 | Challenges gaben bisher nur Zeit, nie Währung |
| pro erfülltes Kombi-Angebot | +5 | Ergänzt die Zeit-/Herz-/Mult-Belohnung, macht den ✕/✓-Moment auch wirtschaftlich relevant |
| pro Kettenstufe ≥3 | +1 | Belohnt sauberes Ketten-Spiel zusätzlich, ohne der Haupttreiber zu sein |
| Perfect Clear | +15 | Seltener Moment, spürbarer Bonus |
| Mega-/Ultimate-Clear | +30 | Der teuerste Effekt im Spiel verdient auch die fetteste Belohnung |
| **Soft-Cap pro Runde** | **150** | Verhindert Ausreißer durch exploit-artig lange Runden, liegt aber weit über dem, was normales Spiel real erreicht |

Eine solide, durchschnittliche Runde (Playtest-Baseline: ~78 Clears, 2–3 Challenges, 1 Kombi) kommt so auf **grob 40–55 Splitter** statt der bisherigen starren 40 — spürbar mehr bei richtig gutem Spiel (Perfect/Mega/viele Ketten), nie weniger als 3.

**Umsetzung:** `CascadeState` bekommt ein internes Splitter-Akkumulatorfeld (analog zu `score`), das bei jedem der obigen Ereignisse hochzählt (dieselben Stellen, an denen `this.score +=` schon steht) und in `result()` als `shardsEarned` mit rausgeht — ersetzt die App-seitige `Math.min(40, 5 + floor(score/120))`-Formel in `app.ts:1794` komplett.

---

## 2. Ausgabe-Ebene A: Fähigkeiten (vor der Runde kaufen, in der Runde einsetzen)

Vier Werkzeuge, alle als Verbrauchsgut im Shop kaufbar (Paket-Preise = günstiger pro Stück als Einzelkauf, Standard-F2P-Anreiz), alle mit **Lagerdeckel 3 pro Typ**, damit eine einzelne Grind-Session nie zu einer Runde mit unfairem Dauervorteil führt (Bestenliste bleibt fair — jeder kann maximal 3 pro Typ gleichzeitig mitnehmen, nie mehr).

| Fähigkeit | Icon | Wirkung | Paketpreis | Einzelpreis-Äquivalent |
|---|---|---|---|---|
| Mischen | 🔀 | Das komplette sichtbare Band wird neu gewürfelt (3 neue, garantiert platzierbare Teile) | 15 ✦ / 3 Stück | 5 ✦ |
| Klärfunke | 💣 | Eine frei wählbare Zelle sofort leeren — das Werkzeug gegen ein zu volles Brett (siehe Abschnitt 3) | 20 ✦ / 2 Stück | 10 ✦ |
| Zeitphiole | ⏱️ | Sofort +10s, manuell auslösbar (zusätzlich zu, nicht statt, den passiven Challenge-/Kombi-Boni) | 12 ✦ / 2 Stück | 6 ✦ |
| Weitblick | 👁️ | Dauerhaftes Meta-Upgrade (Einmalkauf, kein Verbrauchsgut): zeigt eine Scherbe mehr Vorschau aufs Band | 25 ✦ einmalig | — |

Bei ~45 Splitter/Runde ist ein Mischen-Dreierpack nach einer guten Runde drin, ein Klärfunke-Zweierpack nach eineinhalb Runden — spürbar erreichbar, nicht grindy, aber auch kein "beim ersten Spielen schon alles voll".

**Umsetzung:** `progress.ts` bekommt ein `d.cascadeAbilities: { shuffle: number; clear: number; time: number; foresight: boolean }`-Feld (Muster wie `d.jokers` heute), Shop-Einträge analog zu `SHOP` in `app.ts:2052`, aber als eigene Liste unter einem neuen "Kaskade"-Abschnitt (bzw. dem neuen Shop-Tab aus dem laufenden UI-Umbau). In `cascade.ts`/`cascade-view.ts` je eine Methode `useShuffle()`, `useClearSpark(pos)`, `useTimeVial()`, die den Bestand in `progress.ts` prüfen/dekrementieren und den Effekt auslösen.

---

## 3. Der "Brett wird eng"-Moment — sichtbar statt unsichtbar

Aktuell garantiert `pickPlaceableName()` still im Hintergrund, dass immer irgendetwas passt (Fallback auf `"mono"`) — der Spieler merkt nie bewusst, dass er kurz vorm Stecken war. Der Playtest nennt das exakt als Juice-Lücke ("kein Feedback für fast voll"). Das ist gleichzeitig die Lücke, die dem Klärfunken (Abschnitt 2) erst einen echten Daseinsgrund gibt.

**Neuer Mechanismus:**
- `crowdedFrac` (existiert schon als Lokalvariable in `pickPlaceableName`) wird ein sichtbarer Zustand: überschreitet die Brett-Füllung ~78%, geht das Panel in einen **Gefahr-Zustand** — Rahmen pulsiert warnend (Gelb/Orange, dieselbe Box-Shadow-Technik wie das bestehende `ultimate-glow`, nur andere Farbe/Timing), ein kleines Warn-Icon blinkt neben der Uhr.
- Solange der Gefahr-Zustand aktiv ist, wird der Klärfunke (falls vorhanden) im HUD hervorgehoben (kurzer Puls auf dem Icon) — ein klarer, undstoßiger Hinweis "jetzt wäre der Moment", ohne zu bevormunden.
- Der Zustand verschwindet automatisch, sobald wieder Platz da ist (Reihe geräumt) — reine Fühlbarkeit, keine zusätzliche Spielregel.

Das macht aus einem unsichtbaren Sicherheitsnetz einen spürbaren Spannungsbogen — genau der "man sieht sich verlieren kommen"-Moment, den der Playtest als fehlend markiert (Sog-Killer #1).

---

## 4. Runden limitieren & Weiterspielen-Ökonomie (Ausgabe-Ebene B)

Zwei getrennte Probleme, zwei getrennte, gezielte Lösungen — **kein** Energie-Gate vor dem Start (das würde die als Stärke gelobte Reibungslosigkeit zerstören):

### 4a. Rundenlänge deckeln
Der Playtest maß Laufzeiten von 195–360s bei 180s Grundzeit — Challenges/Kombis/Perfect/Mega-Boni addieren sich unbegrenzt. Fix: eine harte Obergrenze für die Summe aller Zeit-Boni pro Runde (`extraMs`), z. B. **+90s** (macht maximal ~270s statt bis zu 360s) — Runden bleiben vorhersehbar lang, ohne dass eine einzelne glückliche Session komplett aus dem Ruder läuft. Betrifft `CHALLENGE_TIME_BONUS_MS`, `COMBO_TIME_BONUS_MS`, den Perfect-Clear-Bonus und die manuelle Zeitphiole (Abschnitt 2) gemeinsam — alle zahlen auf denselben gedeckelten Topf ein.

### 4b. Weiterspielen-Angebot beim Leben-Verlust (die "am Ende mehr Zeit/Herz kaufen"-Idee)
Ausgelöst **genau in dem Moment, in dem das letzte Leben verloren ginge** (nicht wenn die Uhr regulär abläuft — ein sauberes "Zeit ist um" bleibt ein sauberes Ende, das ist Genre-Standard und in Ordnung). Statt die Runde sofort zu beenden, erscheint ein Angebot:

- **"+1 ❤ weiterspielen"** — Preis steigt PRO Nutzung *innerhalb derselben Runde*: 15 ✦ → 30 ✦ → 60 ✦, **maximal 3× pro Runde**. Der steigende Preis + die Obergrenze verhindern, dass eine einzelne Runde durch Dauer-Zukauf die Bestenliste sprengt — es bleibt eine "lohnt sich das jetzt?"-Entscheidung, kein Freikauf.
- Reines Splitter-Geschäft, nie Echtgeld-exklusiv — jeder, der spielt, kann sich das erspielen.

**Umsetzung:** `CascadeState` bekommt `continuesUsed: number` (Reset pro Runde) und eine Methode `offerContinue(): number | null` (gibt den nächsten Preis zurück oder `null`, wenn das Limit erreicht ist), aufgerufen von der View, sobald `lives` durch einen Belt-Fall auf 0 fallen würde — die View pausiert die Anzeige kurz für den Kauf-Dialog, bevor `isOver` tatsächlich greift.

---

## 5. Meta-Ebene: was über die Runde hinauszieht

Der Playtest nennt das den größten verbleibenden Sog-Killer, unabhängig von Währung. Vier konkrete Bausteine:

1. **Bestenlisten-Rang im Ergebnis-Overlay**, nicht nur während der Runde im HUD (das HUD zeigt den Rückstand zu Platz 1 schon jetzt richtig konzipiert, nur falsch beschriftet/gewichtet — B11 im Bugbericht). Ergänzt um "noch X Punkte bis Platz N" nach dem Lauf.
2. **Kaskade-eigene Erfolgsleiter** statt der drei trivialen Score-Schwellen (alle drei fallen laut Test im ersten guten Lauf). Neue Dimensionen: Gesamtzahl je geräumter Reihen, beste Kette, Anzahl Perfect Clears, Anzahl Mega Clears, erfüllte Kombi-Angebote, Anzahl gespielter Runden — mehrstufig (Bronze/Silber/Gold o. ä.), damit auch nach Woche 3 noch was offen ist.
3. **Wochen-Countdown sichtbar auf der Startkarte** ("Bestenliste: Reset in 3T 4h"), nicht nur hinter dem Pokal-Tab versteckt.
4. **Kaskade-eigener Tages-Bonus** (Phase 2, kein Blocker jetzt): erste Runde des Tages gibt einen kleinen Splitter-Bonus + eigenen Streak-Zähler — unabhängig vom alten Pentomino-"Daily"-Modus, der laut Playtest ein komplett anderes Spiel ist und nicht als Kaskade-Retention-Haken zählt.

---

## 6. Juice-Lücken (ohne Sound, wie gewünscht)

- **Landung mit Wucht**: kurzer Squash-and-Stretch-Pop beim Platzieren, statt die Figur einfach erscheinen zu lassen.
- **Wegfliegende Reihen**: die vorhandene Schockwellen-Partikel-Logik (`spawnShockwave`) auf normale Clears anwenden (kleiner skaliert) statt die Reihe einfach auf 0 zu setzen — größter Effekt-Wiederverwendungs-Gewinn im Projekt, kein neuer Code nötig, nur eine kleinere Instanz des Bestehenden.
- **Gefahr-Zustand** bei vollem Brett (siehe Abschnitt 3) — schließt die "kein Feedback für fast voll"-Lücke.
- **Multiplikator-Präsenz**: eigene Badge/Leiste statt kleiner dunkler Schrift überm Mond-Artwork, pulsiert bei Stufensprüngen.

---

## 7. Priorisierte Punkteliste — was als Nächstes angegangen wird

Reihenfolge nach Wirkung auf Sog ÷ Aufwand, alles außer explizit markiertem "Phase 2":

**A — Wirtschaft (dieses Konzept umsetzen)**
1. Neue Splitter-Auszahlungsformel (Abschnitt 1) — ersetzt `app.ts:1794`.
2. Vier Fähigkeiten + Shop-Einträge + Lagerbestand in `progress.ts` (Abschnitt 2).
3. Gefahr-Zustand bei vollem Brett + Klärfunke-Hervorhebung (Abschnitt 3).
4. Rundenlängen-Deckel (`extraMs`-Obergrenze, Abschnitt 4a).
5. Weiterspielen-Angebot beim Leben-Verlust (Abschnitt 4b).

**B — Meta/Retention**
6. Bestenlisten-Rang im Ergebnis-Overlay (Abschnitt 5.1).
7. Kaskade-eigene, mehrstufige Erfolgsleiter (Abschnitt 5.2).
8. Wochen-Countdown auf der Startkarte (Abschnitt 5.3).

**C — Juice (ohne Sound)**
9. Squash-and-Stretch-Landung.
10. Wegfliegende Reihen (Schockwellen-Partikel wiederverwenden).
11. Multiplikator-Badge.

**D — Noch offene Bugs aus dem Playtest (unabhängig von der Wirtschaft)**
12. B9 — kein `visibilitychange`-Pausenhandler für Kaskade (App im Hintergrund = Runde verloren).
13. B10 — langes Drücken auf eine Gürtel-Scherbe wirft sie versehentlich in Hold + Fehlerton.
14. B11 — HUD-Highscore-Label ist falsch beschriftet, Rekord-Fanfare feuert beim allerersten Stein.
15. B8 — "skip ›" überspringt nur einen von fünf Intro-Beats.
16. B13 — Kaltstart lädt sechs ungenutzte Kampagnen-Hintergründe.
17. B14 — drei Namen für denselben Modus ("Start Cascade" / "Cascade!" / "Shard Storm"), "MEGA-CLEAR!" vs. "ULTIMATE CLEAR!" kollidieren.
18. B7 — Rettungslevel res07/res08 sind rechnerisch unlösbar (`targetRows` > `rows`).
19. Gürtel-Lesbarkeit (15,5px vs. 45px Brettzelle — Genre-Standard 60–70%).
20. Testabdeckung für `cascade.ts`/`cascade-view.ts` (aktuell keine einzige Testdatei deckt die beiden am häufigsten geänderten Dateien ab).

**Phase 2 (bewusst zurückgestellt, nicht vergessen):**
- Kaskade-eigener Tages-Bonus/Streak (Abschnitt 5.4).
- Kosmetik-Shop als langfristige Splitter-Senke (Abschnitt 2, Punkt C).
- Design-/Sound-Politur (auf Christians ausdrücklichen Wunsch später).

---

## Offene Entscheidung, die nur Christian treffen kann

Alles oben geht davon aus, dass "Runden limitieren" NICHT als Energie-Gate vor dem Rundenstart gemeint war (das widerspräche dem als Stärke gelobten reibungslosen Einstieg), sondern als Rundenlängen-Deckel + gedeckeltes Weiterspielen. Falls tatsächlich ein Energie-Gate wie im Kampagnen-Modus (5 Herzen, Regeneration alle 20 Min) auch für Kaskade gewünscht ist — das wäre ein bewusster Kurswechsel gegen die eigene, gerade erst gewonnene Stärke des Spiels und sollte gesondert besprochen werden, bevor er umgesetzt wird.
