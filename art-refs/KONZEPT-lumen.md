# Lumen — Architektur & Konzept

> Antwort auf `FABLE-AUDIT-BRIEF.md`. Neutrale Außensicht, opinionated.
> Keine Optionslisten — Empfehlungen.

---

## 0. Die eine Diagnose

**Lumen ist heute eine Logikrätsel-Sammlung im Kostüm eines Progression-Games.**

Ein eindeutig lösbares Pentomino-Packproblem ist ein *Denksport-Rätsel* wie Sudoku:
Man löst es einmal, dann ist es tot. Es hat keine Spannungskurve, keinen
Beinahe-Verlust, kein „ach komm, nochmal". Bus Jam, Screw Jam, Water Sort sind
etwas völlig anderes — **taktische Spiele mit sichtbarem Druck und sofortigem
Neustart**. Der Bus füllt sich vor deinen Augen. Du *siehst*, dass du gleich
verlierst. Genau dieses Gefühl fehlt Lumen komplett.

Daraus folgt alles andere:

1. **Die süchtige DNA ist längst im Spiel — in Kaskade.** Timer, Leben,
   Beschleunigung, Multiplikator, sichtbares Scheitern. Und ausgerechnet
   Kaskade zahlt auf **nichts** ein.
2. **Die Kampagne ist die einzige Fortschrittsachse** — und gleichzeitig der
   Modus mit der geringsten Wiederspielbarkeit und nur 30 Leveln Inhalt.
3. **Leben blockieren genau die Schleife**, die süchtig machen soll.

Die drei Dinge zu drehen ist das ganze Konzept. Der Rest ist Ausschmückung.

> **Die verworfene Alternative:** Kaskade zum Hauptmodus machen. Wäre der
> schnellste Weg zum Sog — aber Kaskade ist ein Blockudoku-Klon ohne eigene
> Identität. Das Fenster-Packen *ist* Lumen. Richtig ist deshalb: **Kaskades
> Spannungsmechanik in den Hauptmodus importieren**, nicht Kaskade befördern.

---

## A. Audit

### Wo der Spieler verloren geht

| # | Problem | Warum es weh tut |
|---|---|---|
| 1 | **Der Startbildschirm stellt eine Frage.** 5 gleichwertige Tabs = eine Entscheidung vor dem ersten Spaß. | Bus Jam öffnet *ins Level*. Jede Entscheidung vor dem Spaß kostet Spieler. |
| 2 | **Kein sichtbarer Druck.** Beim Silhouetten-Füllen naht kein Scheitern, das man kommen sieht. | Kein Anspannungs-Aufbau → keine Erlösung → kein Dopamin. Das ist der Kern. |
| 3 | **Leben sperren die Kernschleife.** | „Nochmal!" ist der wichtigste Knopf im Spiel. Er darf nie ausgegraut sein. |
| 4 | **Sterne nur aus der Kampagne.** | 3 von 5 Modi sind für den Fortschritt objektiv sinnlos. Spieler merken das in 2 Sessions. |
| 5 | **Content-Klippe bei Level 30.** | Danach ist die „Story" vorbei, es bleiben zwei Endlosmodi ohne Erzählung. |
| 6 | **Vier Ressourcen** (Sterne, Splitter, Leben, Joker) in einem Spiel ohne Monetarisierung. | Jede braucht Erklärung. Ohne Bezahlschranke gibt es keinen Grund für vier. |
| 7 | **„Licht: 67 %" ist kein Motiv.** | Das ist ein Fortschrittsbalken mit Kostüm. Es beantwortet kein „warum". |
| 8 | **Die Uhr im Story-Modus ist die falsche Spannung.** | Zeitdruck in einem Denkspiel *bestraft Nachdenken*. Bus Jam hat keine Uhr — es hat einen volllaufenden Bus. Der Unterschied ist entscheidend. |
| 9 | **Gesperrte Zonen sind die einzige Level-Variation.** | Nach dem dritten Mal ist es kein Twist mehr, sondern eine Verzögerung. |

### Was welcher Modus wiegt

| Modus | Zieht sein Gewicht? | Urteil |
|---|---|---|
| **Kampagne** | Als einziger Fortschritt: ja. Als Inhalt: nein (30 Level). | **Bleibt der Kern** — braucht Mechaniken + Autoren-Workflow. |
| **Kaskade** | Bester Loop, null Zweck. | **Bleibt** — bekommt eine Rolle in der Ökonomie und in der Fiktion. |
| **Abstieg** | Guter Endlos-Modus, plateaut technisch bei Ebene ~9. | **Bleibt** — wird durch Zugbudget-Level technisch entfesselt. |
| **Täglich** | Bester Retention-Haken pro Aufwand. | **Bleibt unverändert.** |
| **Sammlung** | Halb Statistik-Friedhof, halb Shop. | **Bleibt, wird ausgemistet** (§F). |
| **Profil / Stufe** | Zweite Fortschrittszahl neben Sternen. | **Verschmilzt** mit der Hauptzahl. |

### Benchmark — was ich von wem nehme

| Spiel | Was es besser macht | Was Lumen übernimmt |
|---|---|---|
| **Bus Jam / Traffic Escape** | Sichtbarer, wachsender Druck. Man sieht die Niederlage nahen. | **Kriechender Schatten** + **Zugbudget** (§D). Der eine wichtigste Import. |
| **Block Out! (Grand Games)** | Reicher Mechanik-Katalog auf einem Brett; jedes Level fühlt sich anders an. | Kompletter Mechanik-Katalog (§D). |
| **Water Sort / Screw Jam** | Unendliche Neustarts, null Reibung, klare Sackgassen. | **Leben raus**, Sofort-Neustart. |
| **Homescapes / Gardenscapes** | Spielen → Währung → Welt verändert sich sichtbar → Story. | **Eine Währung, ein Tor, sichtbare Karte** (§B). |
| **Royal Match** | Kein Story-Screen zwischen dir und dem nächsten Level. | Story lebt **auf Screens, die eh da sind** (§C). |
| **Monument Valley** | Welt erzählt ohne Textwände. | Nacht→Tag-Übergang wird zum Erzählmittel, nicht zum Balken. |

**Was davon *nicht* zu einem Solo-Dev ohne Backend passt:** Ligen, Teams, Events
mit Serverzeit, Leaderboards, Live-Ops. Alles ignorieren. Retention muss aus
Inhalt und Charme kommen, nicht aus Sozialdruck.

---

## B. Architektur — eine Achse, vier Zuflüsse

### Das Rückgrat: Der Lichtpfad

**Eine** Fortschrittsachse. **Eine** Zahl: *Fenster erhellt*.
Eine senkrecht scrollende, gemalte Talkarte. Jeder Knoten = ein Fenster.
Hinter dir leuchtet das Tal, vor dir ist es schwarz. Das ist Fortschrittsbalken,
Weltkarte und Story-Anzeige in einem Bild.

### Die eine Währung: Licht

| Weg | Ertrag | Charakter |
|---|---|---|
| Lichtpfad-Fenster | Basis + Sauberkeits-Bonus | stetig |
| Scherbenregen (Kaskade) | viel Licht pro Minute | Skill, schnell |
| Die Stollen (Abstieg) | steigt mit Tiefe | Risiko, lang |
| Tagesfenster | Basis + Streak-Bonus | Gewohnheit |

**Ausgegeben wird Licht für genau zwei Dinge:**
1. **Die Laterne** am Regionsübergang (das Tor).
2. **Joker** (Tipp, Lösen, +Zug).

### Das eine Tor: die Laterne

Am Ende jeder Region steht eine Laterne. Sie braucht X Licht. Sie füllt sich
sichtbar. **Jeder Modus füllt sie.**

Das ist die Verzahnung, die du wolltest — und sie ist ehrlich:
- Du kommst **immer** durch, indem du einfach weiter Fenster spielst.
- Die Seitenmodi sind **schneller**, nie **nötig**.
- Kein Wall, kein Frust — aber jeder Modus hat plötzlich einen sichtbaren Zweck.

```
   Scherbenregen ──┐
   Die Stollen ────┤
   Tagesfenster ───┼──► LICHT ──► Laterne ──► nächste Region
   Lichtpfad ──────┘        └──► Joker
```

### Was aus der Navigation wird

Der 5-Tab-Balken behauptet „fünf gleichwertige Dinge". Das ist die falsche
Botschaft. Richtig ist: **ein Hauptweg + drei Nebenorte.**

- **Start = die Karte**, gescrollt auf deinen aktuellen Knoten. Ein großer
  Knopf: *Spielen*. Fertig.
- Die Seitenmodi sind **Orte auf der Karte**: der Stolleneingang, die Stelle
  wo die Scherben fallen, das Tagesfenster am Dorfplatz.
- Sammlung/Profil bleiben als kleines Icon oben.

Effekt: Der Spieler startet die App und ist mit **einem** Tap im Puzzle.

### Wie sich Zeit anfühlt

- **3 Minuten:** zwei, drei Fenster auf dem Pfad — oder ein Scherbenregen-Lauf.
  Immer ein sichtbares Stück Tal, das aufleuchtet.
- **30 Tage:** drei Akte, ~120 Fenster, das Tal geht von Schwarz nach Gold.
  Die Karte ist das Fotoalbum deines Fortschritts.

### Warum er morgen wiederkommt (ohne Dark Patterns)

1. **Er sieht, was er getan hat.** Die Karte verändert sich sichtbar. Das ist
   der stärkste, ehrlichste Haken den es gibt.
2. **Das Tagesfenster** + Streak. Klein, freundlich, kein Verlust bei Abbruch
   außer der Zahl.
3. **Ein Story-Beat wartet** am nächsten Knoten. Nicht „du musst", sondern
   „ich will wissen, wie es weitergeht".
4. **Kein Energie-Timer.** Wer zurückkommt, kommt weil er will.

---

## C. Die Geschichte

### Die Welt

Im Tal hat man Licht nicht gefunden, sondern **gemacht**. Glaser fassten es in
Fensterscheiben — jedes Fenster ein kleiner Speicher, jedes Haus eine Laterne.
Das Tal leuchtete von innen heraus.

### Der Bruch

In einer Nacht zersprangen **alle** Fenster des Tals gleichzeitig. Das Licht
zerfiel in Splitter und versickerte im Boden. Seitdem: Dunkelheit.

### Die Figuren

| Figur | Rolle | Ton |
|---|---|---|
| **Du** | Ein Glaser. Erinnerst dich an die Nacht nicht. | stumm (Spieler) |
| **Mira** | Junge Glaserin, Lampenträgerin. Deine Begleiterin, spricht den Spieler an. | warm, trocken-witzig, ungeduldig |
| **Meister Anselm** | Der beste Glaser des Tals. Seit der Nacht verschwunden. | ruhig, müde, gefährlich höflich |
| **Lys** | Anselms Tochter. Verschwunden. Nur in Erinnerungen. | — |

### Der Antagonist: Der Scherbensammler

Eine Gestalt, die durch das Tal geht und die Splitter **einsammelt, bevor sie
zurück ins Glas können**. Man sieht ihn selten — man sieht seine Arbeit:

> **Ruß, Eis, Risse, versiegelte Scheiben — das sind die Level-Mechaniken.**
> Jede Mechanik ist seine Handschrift. Der Spieler lernt ihn kennen, indem er
> gegen seine Werkzeuge spielt.

### Der Bogen

| Akt | Region | Was passiert |
|---|---|---|
| **I** | Der Garten | Du erwachst. Mira findet dich. Die ersten Fenster. Erste Spur: die Splitter verschwinden — jemand ist schneller als du. |
| **II** | Die Werkstatt | Anselms alte Werkstatt. Die Fenster sind nicht zersprungen — sie wurden **geschnitten**. Werkzeugspuren. Sein letzter Zettel. **Wendung: Der Scherbensammler ist Anselm.** |
| **III** | Der Farbhof | Das Warum. Lys ging in ein Fenster, das er gebaut hatte, und kam nicht zurück. Seit Jahren sammelt er jeden Splitter des Tals, um **ein** Fenster zu bauen, groß genug, sie zurückzuholen. Er ist nicht böse. Er trauert. |
| **Finale** | Das letzte Fenster | Du baust es **mit ihm** zu Ende — ein Puzzle zu zweit. Es holt Lys nicht zurück. Es gibt dem Tal das Licht zurück. Anselm lässt los. |

### Warum diese Geschichte die richtige ist

Sie ist keine Verzierung — sie erklärt jede Mechanik, die schon da ist:

- **Warum sind die Puzzles Fenster?** Weil Fenster das Licht halten.
- **Warum heißt die Währung Lichtsplitter?** Weil sie *das Objekt der Handlung
  ist*. Jeder Splitter, den du einsammelst, ist einer, den er nicht bekommt.
- **Warum gibt es gesperrte Zonen?** Weil er dort schon war.
- **Warum Nacht → Tag?** Weil du das Tal Fenster für Fenster zurückholst.
- **Warum gibt es Scherbenregen?** Wenn er Splitter bewegt, fallen welche.
  Fang sie, bevor sie weg sind.
- **Warum gibt es die Stollen?** Sein Depot liegt tief unter dem Tal.
- **Warum das Tagesfenster?** Das Tal bittet jeden Tag um ein Fenster.

**Jeder Modus hat eine Aufgabe in der Fiktion.** Genau das war die Anforderung.

### Wie die Story ausgeliefert wird (ohne den Loop zu brechen)

Das ist der Knackpunkt aus dem Briefing. Die Auflösung ist **eine einzige Regel**:

> **Die Geschichte steht nie zwischen dem Spieler und dem nächsten Level.
> Sie sitzt auf Screens, die er ohnehin ansieht.**

Drei Schichten:

**1. Mikro — ständig, kostenlos, unterbricht nichts**
Eine Zeile von Mira **im Ergebnis-Overlay**, mit kleinem Portrait. 6–12 Wörter.
Etwa jedes 3.–5. Fenster.
> *„Das war Anselms Handschrift. Ich erkenne seine Schnitte."*

Das ist genau das, was du beschrieben hast („Toll, du hast Level X gelöst…") —
und es kostet **null** zusätzliche Screens.

**2. Beat — alle ~8–10 Fenster**
Die Karte hält an einem Knoten an, eine kleine gemalte Szene leuchtet auf,
2–4 Zeilen, Tippen = weiter. Immer überspringbar.

**3. Akt — 3× pro Region + Finale**
Vollbild-Cutscene: gemaltes Key-Art, Portrait, 6–10 Zeilen, Schreibmaschinen-
Text. Überspringbar. Danach **in der Sammlung unter „Erinnerungen" nachlesbar** —
das macht Story zu Sammelinhalt.

**Harte Grenze: nie mehr als 4 Zeilen, bevor man weitertippen kann.**

### Boss-Fenster

Am Ende jeder Region ein **Boss-Fenster**: ein großes, mehrstufiges Fenster —
Stufe 1 gelöst → die Scheiben rücken, Stufe 2 erscheint. Mechanisch die
Doppelscheiben-Mechanik, erzählerisch die Konfrontation. Drei davon, plus das
Finale.

### Was aus „Licht: 67 %" wird

Die Zahl verschwindet. An ihre Stelle tritt **die Karte selbst**: gemaltes Tal,
hinten hell, vorne schwarz, die Grenze wandert. Und **die Laterne**, die man
sichtbar füllt. Beides zeigt exakt dasselbe — aber als Bild statt als Prozent.

---

## D. Level — Mechaniken & Sinn

### Der technische Befreiungsschlag

**Heute:** Ein Level muss *eindeutig* lösbar sein → der Solver muss *alle*
Lösungen zählen → teuer → Teilezahl deckelt bei ~7, Abstieg plateaut bei Ebene 9.

**Vorschlag:** Ein Level braucht **ein Ziel und ein Zugbudget** statt Eindeutigkeit.
Die Anforderung wird: *„es existiert mindestens eine Lösung innerhalb von N Zügen"*
→ **Suche bis zur ersten Lösung** statt vollständiger Zählung → um
Größenordnungen billiger.

Das löst drei Probleme mit einer Änderung:
1. **Große Level werden generierbar** → Abstieg plateaut nicht mehr.
2. **Zugbudget erzeugt Spannung** — „knapp lösbar" ist das Bus-Jam-Gefühl.
3. **Mechaniken werden möglich**, weil sie die Eindeutigkeit nicht mehr zerstören.

Eindeutigkeit bleibt optional für handgebaute Story-Fenster („Meisterstücke").

### Der Mechanik-Katalog

| Mechanik | Regel | Erzeugt | Ab Akt |
|---|---|---|---|
| **Ruß** ✅ | Verrußte Scheiben. Bedecken reinigt. Ziel: alle rein. | Zieldenken statt „alles voll" | I |
| **Fester Splitter** ✅ | Ein Splitter steckt fest, nicht überdeckbar. | Formgefühl, Umbauen | I |
| **Lichtmotte** ✅ | Gefangene Motte; Bedecken befreit sie. Ziel: N Motten. | Teilziele, hübsches Feedback | I |
| **Kette** ✅ | Zwei Zellen verkettet — **dasselbe Teil** muss beide decken. | Vorausdenken | II |
| **Riss** ✅ | Zwischen zwei Zellen läuft ein Riss; **kein Teil darf ihn kreuzen**. | Innere Wände ohne Formänderung | II |
| **Eis** ✅ | Vereiste Scheibe. Erst deckbar, wenn eine Nachbarscheibe gedeckt ist. | Reihenfolge | II |
| **Zugbudget** | Nur N Platzierungen. | Spannung, knappe Lösbarkeit | II |
| **Farbsiegel** ✅ | Diese Scheibe verlangt ein Teil **dieser Farbe**. | Teilewahl statt nur Platz | III |
| **Kriechender Schatten** | Alle N Züge wird eine freie Scheibe dunkel und unbrauchbar. | **Sichtbarer Druck** — der wichtigste Import | III |
| **Doppelscheibe** | Hinter der ersten Lage liegt eine zweite. | Mehrstufigkeit | III / Boss |
| **Wanderscherbe** ✅ | Rückt pro Zug eine Zelle weiter. | Bewegtes Brett | Boss |
| **Kerze** ✅ | Muss **zuletzt** gedeckt werden, sonst geht sie aus. | Reihenfolge-Endspiel | Boss |

**Einführungsregel:** Eine neue Mechanik pro Region, **wortlos** erklärt — beim
ersten Auftreten spielt eine kleine Animation den Zug einmal vor. Nie zwei neue
gleichzeitig. Danach frei kombinierbar.

**Der kriechende Schatten ist die wichtigste Zeile in dieser Tabelle.** Er ist
das, was Bus Jam hat und Lumen fehlt: eine Bedrohung, die man wachsen sieht.

### Content-Strategie

| Quelle | Wofür | Menge |
|---|---|---|
| **Handgebaut** | Story-Fenster mit Mechaniken, alle Boss-Fenster | ~40–60 + 4 |
| **Generiert** | Tagesfenster, Stollen, Füller zwischen Story-Knoten | unbegrenzt |
| **Hybrid** | Generator baut die Packung, ein Skript **streut Mechaniken darüber** und prüft Lösbarkeit im Zugbudget | der Hebel |

Der Hybrid ist der Schlüssel: Mechaniken lassen sich **nachträglich** auf ein
generiertes Level legen und billig validieren. Damit skaliert kreativer Inhalt,
ohne dass du 500 Level von Hand baust.

Dafür brauchst du einen **Autoren-Workflow**: ein erweitertes Level-JSON
(Mechanik-Layer + Ziel + Zugbudget) und eine kleine Editor-Seite im Web-Paket.
Das ist der einzige größere Werkzeug-Bau in der Roadmap — er zahlt sich sofort
aus.

### Wie jedes Level Sinn bekommt

Jeder Knoten auf der Karte ist **ein konkretes Fenster an einem konkreten Ort**:
„Das Küchenfenster der Bäckerei", „Das Oberlicht der Werkstatt", „Die Rosette
der Kapelle". Der Name steht im HUD. Beim Sieg leuchtet **genau dieses Gebäude**
auf der Karte auf.

Das ist die ganze Magie: Der Spieler repariert nicht „Level 34", er repariert
das Fenster der Bäckerei — und sieht danach die Bäckerei leuchten.

---

## E. Grafik-Direktion

### Die eine Änderung, die am meisten bringt

**Das Brett wird ein echtes Fensterrahmen-Objekt** — Bleiruten, Sprossen,
Fensterbank, Holz. Eine gefüllte Scheibe **leuchtet von hinten durch**.

Damit fühlt sich jedes Level nach der Geschichte an, ohne ein Wort Text. Das ist
der größte optische Hebel für den kleinsten Aufwand.

### Bausteine

| Element | Richtung |
|---|---|
| **Teile** | Bleiben glänzende Kugeln (wiedererkennbar, gut gebaut). Neu: beim Vervollständigen einer Scheibe leuchtet das Licht *durch* das Glas. |
| **Karte** | Ein langes, senkrecht gemaltes Tal, in 3 Streifen (je Region). Je Streifen eine **dunkle** und eine **helle** Fassung, überblendet pro erhelltem Knoten — exakt die Technik, die schon läuft. |
| **HUD** | Bleibt. Ergänzt um **Ziel-Anzeige** oben („3 von 8 Scheiben rein") und **Zug-Anzeige**. Beides groß, sofort erkennbar. |
| **Figuren** | Mira + Anselm, je 3 Ausdrücke, gemalt (Bild-KI), transparentes PNG, ~40 % Bildbreite. Mehr braucht es nicht. |
| **Cutscene** | Portrait unten links, Sprechblase, Schreibmaschinen-Text, unscharfer Szenen-Hintergrund. **Reines DOM/CSS** — keine Engine, kein Video. |
| **Laterne** | Ein gemaltes Objekt am Regionsübergang, das sich sichtbar mit Licht füllt. |

### Bewegungs-Budget

**Animieren:** Sieg-Feier (existiert, gut), Laterne füllt sich, Knoten leuchtet
auf der Karte auf, Fenster-Durchleuchten beim Scheiben-Abschluss,
Seitenübergänge.
**Nicht animieren:** Menüs, Listen, Statistiken. Bewegung nur dort, wo sie einen
Erfolg bestätigt.

---

## F. Zahlen, die Sinn ergeben

**Regel:** Eine Zahl bleibt nur, wenn sie (a) Fortschritt zum *einen* Ziel zeigt,
(b) ein persönlicher Rekord ist, den man schlagen will, oder (c) eine
Geschichts-Tatsache ist.

| Bleibt | Warum |
|---|---|
| **Fenster erhellt** | Die Hauptzahl. Ist gleichzeitig „Stufe". |
| **Licht gesammelt** (gesamt) | Story-Tatsache: so viel hast du ihm abgenommen. |
| **Tiefste Ebene** (Stollen) | Rekord zum Schlagen. |
| **Scherbenregen-Rekord** | Rekord zum Schlagen. |
| **Längster Streak** | Gewohnheit. |
| **Erinnerungen** (X / Y) | Macht Story sammelbar. |

| Fliegt raus | Warum |
|---|---|
| Ø Lösezeit | Interessiert niemanden, belohnt Hetze. |
| „Stufe" als eigene XP-Formel | Zweite Fortschrittszahl neben der echten. |
| „Läufe", „Reihen gesamt" | Zähler ohne Ziel. |

**Erfolge umschreiben:** Jeder Erfolg wird ein **Story-Meilenstein**, kein
willkürlicher Schwellwert.
- statt „Löse 10 Fenster" → **„Das erste Licht im Garten"**
- statt „Erreiche Ebene 10" → **„Anselms Depot gefunden"**
- statt „500 Punkte" → **„Kein Splitter ist gefallen"** (ein Scherbenregen-Lauf
  ohne Verlust)

---

## G. Roadmap

Sortiert nach **Retention-Hebel pro Aufwand**. `⚠` = Bruch mit dem
gespeicherten Datenmodell.

### Phase 1 — Der Sog *(1–2 Wochen)*
> Danach ist die Kernschleife eine Hyper-Casual-Schleife. Das ist der wichtigste
> Block im ganzen Dokument.

| # | Maßnahme | Stand | Wirkung |
|---|---|---|---|
| 1 | ~~Leben raus~~ → **Herzen: nur Story-Modus, + Rewarded-Ad-Stub** | ✅ | Verknappung + Ad-Hebel |
| 2 | **Zugbudget statt Uhr** (Abstieg; Story bleibt Uhr) | ✅ | **XL** |
| 3 | **Ruß-Mechanik**: statisch (Intro) → **kriechend** (spannend) + Ziel-Streifen | ✅ | L |
| 3b | **Riss-Mechanik** (zweite Mechanik, Kanten) + **Level-Werkstatt** (Dev-Editor) | ✅ | L |
| 3c | **Eis-Mechanik** (dritte Mechanik, Reihenfolge): vereiste Scheibe taut erst, wenn ein Nachbar *liegt* — von außen nach innen bauen. `ice_01` (Werkstatt), `ice_02/03` (Farbhof) + Eis-Malmodus im Editor | ✅ | M |
| 4 | Solver: keine Eindeutigkeits-Zählung mehr nötig — Deckungs-Ziel macht sie überflüssig | ✅ | *(Flaschenhals weg)* |

### Phase 2 — Eine Achse *(1–2 Wochen)*

| # | Maßnahme | Aufwand | Wirkung |
|---|---|---|---|
| 5 | **Licht als einzige Währung.** Sterne → Sauberkeits-Bonus in Licht. | M ⚠ | L |
| 6 | **Laternen-Tor** an Regionsgrenzen; alle Modi zahlen ein. | S | L |
| 7 | **Karte als Startbildschirm**, Seitenmodi als Orte darauf. | L ⚠ | L | — 🟡 Pfad + gemalte Talkarte (Garten→Farbhof, Dunkel→Hell) stehen; Beats/Boss noch offen |

### Phase 3 — Die Geschichte *(2–3 Wochen)*

| # | Maßnahme | Aufwand | Wirkung |
|---|---|---|---|
| 8 | **Mira-Zeilen im Ergebnis-Overlay.** | **S** | **L** ← bestes Verhältnis im Dokument | ✅ (`story.ts`) |
| 9 | Portraits (Bild-KI) + Cutscene-System (DOM). | M | L | 🟡 Cutscene-System ✅ (`beats.ts`), Portraits fehlen noch (`PROMPT-charaktere.md`) |
| 10 | Akt I schreiben, Beats auf der Karte setzen. | M | XL *(emotional)* | ✅ |

### Phase 4 — Tiefe *(fortlaufend)*

| # | Maßnahme | Aufwand |
|---|---|---|
| 11 | Level-Autoren-Workflow (Mechanik-JSON + Editor-Seite). | L ⚠ | ✅ `level.ts`-Schema + `editor.html` (Ruß / Riss / Eis / Kerze malen) |
| 12 | Mechanik-Katalog ausbauen, eine pro Region. | fortlaufend | 🟢 **8 von 11**: Ruß+Kriechruß, Fester Splitter, Lichtmotte, Riss, Eis, Kette, Farbsiegel, Kerze, Wanderscherbe ✅ · **offen: Doppelscheibe** (braucht Zwei-Phasen-Brett, eigener Entwurf) |
| 13 | 40–60 handgebaute Story-Fenster. | fortlaufend | 🟡 13 Mechanik-Fenster generiert (soot/crack/ice/candle/boss), handkuratiert kommen |
| 14 | Boss-Fenster. | M | 🟡 `boss_01` „Das letzte Fenster" (Risse + Kerze, 9 Teile) ✅ · Wanderscherbe ✅ als eigene Mechanik · Doppelscheibe noch offen; Boss könnte alle drei kombinieren |
| 15 | ~~Akt II + III, Finale.~~ ✅ Text steht (`beats.ts`, 13 Beats), Finale-Cutscene nach `boss_01`. |

**Wenn du nur eine Woche hast:** #1, #2, #8. Das sind die drei mit dem besten
Verhältnis — Sofort-Neustart, sichtbarer Druck, eine Stimme im Spiel.

---

## H. Was ich wegwerfen würde

> **Nachtrag (Christians Entscheidung, überschreibt den Punkt unten):** Herzen
> bleiben — aber **nur im Story-Modus**, als bewusste künstliche Verknappung.
> Abstieg, Kaskade, Tagesfenster kosten kein Herz. Wer nicht 20 min auf ein
> Herz warten will, holt sich später über einen Rewarded-Ad-Block eins. Damit
> verkauft das Spiel *Zugang*, nicht nur *Hilfe* — die klassische
> Casual-Monetarisierung. Der „one more try"-Sog bleibt trotzdem erhalten,
> weil Fehlschläge in den Endlosmodi frei sind.

| Weg damit | Grund |
|---|---|
| ~~**Leben + Regeneration**~~ *(behalten, s. o.)* | ~~Blockiert die Kernschleife.~~ Als Story-Verknappung + Ad-Hebel doch gewollt. |
| **Sterne als eigene Währung** | Zweite Ökonomie für dasselbe Ziel. Als *Anzeige* (3 Funken) behalten, als Währung → Licht. |
| **„Stufe" als eigene XP-Formel** | Doppelt die Hauptzahl. Stufe **ist** „Fenster erhellt". |
| **Ø Lösezeit** | Belohnt Hetze in einem gemütlichen Spiel. |
| **Die Uhr im Story-Modus** | Bestraft Nachdenken. Ersetzt durch Zugbudget + kriechenden Schatten. |
| **Der 5-Tab-Balken als Gleichgewicht** | Behauptet fünf gleichwertige Dinge. Es gibt einen Hauptweg. |
| **Eindeutigkeits-Zwang bei generierten Leveln** | Der technische Flaschenhals. Kostet mehr als er bringt. |

---

## Beißt sich Hyper-Casual mit Story?

**Nein — unter einer Bedingung.** Die Geschichte darf nie zwischen dem Spieler
und dem nächsten Level stehen.

Sie darf: auf dem Ergebnis-Screen sitzen (den er ohnehin ansieht), auf der Karte
sitzen (die er ohnehin durchscrollt), in der Welt sichtbar sein (Nacht → Tag),
und sich in der Sammlung nachlesen lassen.

Sie darf nicht: einen eigenen Pflicht-Screen bekommen, mehr als vier Zeilen am
Stück ohne Weitertippen zeigen, oder unüberspringbar sein.

Halte diese Regel ein, und du bekommst beides: den Sog von Bus Jam **und** einen
Grund, warum das Licht zurückkommt.

---

## I. Level-Variation — die acht Achsen

Variation entsteht nicht aus „mehr Mechaniken", sondern daraus, dass man
**mehrere unabhängige Achsen** dreht. Lumen dreht heute an genau einer.

| # | Achse | Was sie ändert | Aufwand | Heute genutzt |
|---|---|---|---|---|
| 1 | **Brettform** | Silhouette, Löcher, mehrteilige Bretter | — (da) | ✅ |
| 2 | **Teileset** | Welche Formen du überhaupt bekommst | **~0** | ❌ |
| 3 | **Ziel** | Was „gewonnen" heißt | S | ❌ |
| 4 | **Beschränkung** | Zugbudget, keine Drehung erlaubt | S | ❌ (nur Uhr) |
| 5 | **Störung** | Etwas auf dem Brett *handelt* (kriechender Schatten) | M | ❌ |
| 6 | **Reihenfolge** | Ketten, Eis, Kerze | M | 🟡 Eis ✅, Ketten/Kerze ❌ |
| 7 | **Information** | Nächstes Teil sichtbar / verborgen / Vorschau | S | ❌ |
| 8 | **Brett-Zustand** | Doppelscheibe, Scheiben rücken nach einem Zug | L | ❌ |

### Die zwei Achsen, die geschenkt sind

**Achse 2 — Teileset. Das ist die billigste große Variation im ganzen Spiel.**
Das Teileset ist bereits Daten. Ein Level, das dir **nur Balken** (1×2, 1×3, 1×4)
gibt, fühlt sich völlig anders an als ein Pentomino-Level — bei **null**
Engineering. Weitere Sets, alle sofort verfügbar:

| Set | Gefühl |
|---|---|
| Nur Balken (2/3/4) | geometrisch, klar, schnell |
| Nur L- und T-Formen | kantig, verzahnt |
| Nur symmetrische Teile | ruhig, „sauber" |
| Ein 6er-Riese + Einer-Füller | ein großes Problem, dann Feinarbeit |
| Nur Dominos | meditativ, sehr viele Teile |
| Gemischt 1–5 (Kaskade-Set) | chaotisch, arcade-nah |

Ein Level-Paket „Die Bäckerei — nur gerade Scheiben" ist damit über Nacht baubar
und fühlt sich wie eine eigene Welt an.

**Achse 3 — Ziel.** Heute gibt es genau ein Ziel: *alles zudecken*. Sobald
„Ziel" ein Feld im Level-JSON ist, entstehen sofort mehrere Spielgefühle aus
derselben Mechanik:

- *Alle Scheiben decken* (heute)
- *Allen Ruß entfernen* — der Rest darf offen bleiben → **völlig anderes Denken**
- *N Motten befreien* — Teilziel, man darf ineffizient sein
- *Diese 3 markierten Scheiben erleuchten* — Zielanflug statt Flächendeckung
- *Überstehe 12 Züge* — Verteidigung gegen den kriechenden Schatten

Achse 2 und 3 zusammen kosten wenige Tage und vervielfachen den gefühlten Inhalt
mehr als der ganze Mechanik-Katalog.

### Der Rhythmus: vier Level pro Idee

Gute Puzzle-Spiele führen keine Mechanik ein, sie **erzählen** sie in vier
Schritten (das Nintendo-Muster):

1. **Einführung** — die Mechanik allein, sicher, kaum falsch spielbar. Wortlos.
2. **Ausbau** — dieselbe Mechanik, jetzt fordernd.
3. **Wendung** — Kombination mit einer bekannten Mechanik.
4. **Prüfung** — verlangt echtes Verständnis. Das „aha".

Eine Region ≈ 15 Fenster ≈ **3–4 solcher Vierergruppen**. Das ist dein
Autoren-Takt. Nie zwei neue Ideen gleichzeitig, nie eine Idee länger als vier
Level ohne Wendung.

### Wie viele Level brauchst du wirklich?

Der klassische Solo-Dev-Fehler ist, Level 200 zu bauen, bevor Level 5 perfekt ist.

- **D1-Retention entscheidet sich in Level 1–5.** Wer da abspringt, sieht nie
  einen Splitter.
- **D7 entscheidet sich in Level ~10–40.**
- Ab dort trägt Wiederholung + Endlosmodi.

**Empfehlung:** 60 handgebaute Fenster (Akt I vollständig + Akt II angefangen),
der Rest generiert/hybrid. Und **die ersten zehn poliert man dreimal.**

---

## J. Kommerzielle Architektur — Hook & Retention

> Zur Idee: *Kaskade als Hook, Story als Bindung.*

### Das Muster stimmt

„Simpler Arcade-Hook zieht rein, Meta-Progression + Geschichte halten fest" ist
kein Bauchgefühl, sondern **das** bewährte Muster im Hybrid-Casual:
Royal Match, Gardenscapes, Homescapes fahren genau das. Die Intuition ist richtig.

### Der Fehler steckt woanders

Das Muster hat eine Voraussetzung, die man leicht überliest: **die
erfolgreichen Spiele haben nur EINE Kernmechanik.** Royal Match ist Match-3 —
im Ad, im Tutorial, in Level 3000. Bus Jam ist Bus-Sortieren, überall.

Lumen hat heute **zwei konkurrierende Identitäten**: Fenster-Packen und
Kaskade-Reihen. Genau deshalb wirkt das Spiel „gut, aber nicht rund". Das ist
der eigentliche Konstruktionsfehler — größer als die Modus-Verzahnung.

Wenn du Kaskade zum Hook machst und der Spieler landet danach im Pentomino-
Packen, baust du strukturell den **Bait-and-Switch**, der Gardenscapes seinen
Ruf gekostet hat. Das funktioniert kommerziell — aber nur mit großem UA-Budget
zum Verbrennen von Churn. Als Solo-Dev ohne Budget ist es der teuerste mögliche
Weg.

### Die drei Gabelungen

| | Identität | Für dich |
|---|---|---|
| **A** | Fenster-Packen ist das Spiel. Kaskade ist Beiwerk. | Distinktiv, aber der Hook muss erst lesbar werden. |
| **B** | Kaskade ist das Spiel. Packen wird Sonderlevel. | Kommerziell sicher, aber ein Blockudoku-Klon unter 500. Wirft weg, was Lumen einzigartig macht. |
| **C** ✅ | **Eine Mechanik, zwei Tempi.** | Hook und Kernspiel sind dasselbe. Kein Bait, keine doppelte Politur. |

### Empfehlung: C — eine Mechanik, zwei Tempi

Der Unterschied zwischen Story-Modus und Scherbenregen darf **nicht die
Mechanik** sein, sondern nur, **wie die Teile ankommen**:

| | Lichtpfad | Scherbenregen |
|---|---|---|
| Brett | Fenster mit Scheiben | Fenster mit Scheiben |
| Ziel | Scheiben erleuchten | Scheiben erleuchten |
| Teile | liegen im Tablett — du denkst | kommen auf dem Band — du reagierst |
| Druck | Zugbudget, kriechender Schatten | Uhr, Leben, Bandtempo |

Damit zeigt der Ad **echtes Gameplay**, der Spieler bekommt danach genau das,
und du polierst **ein** Spiel statt zwei.

**Umsetzung in zwei Stufen:**

1. **Billig (1–2 Tage), sofort machbar:** Kaskade behält Mechanik und
   Reihen-Löschen, bekommt aber **denselben Fensterrahmen, dieselben
   Teile-Grafiken, dasselbe Durchleuchten**. Rein optische Kontinuität — der
   Spieler sieht dasselbe Spiel, auch wenn die Regel abweicht. Holt 80 %.
2. **Richtig (später):** Scherbenregen läuft auf einer echten Fenster-Silhouette
   mit Scheiben-Ziel; „Reihe voll" wird zu „Sprossenreihe erleuchtet".

### Der Ad-Lesbarkeits-Test

Ein Hook funktioniert im Ad, wenn er vier Dinge in **fünf Sekunden ohne Ton**
zeigt:

| | | Kaskade heute | Fenster + kriechender Schatten |
|---|---|---|---|
| 1 | Ziel in 1 Sek. erkennbar | ✅ Reihe füllen | ✅ Fenster erleuchten |
| 2 | Bedrohung sichtbar wachsend | ✅ Band + Uhr | ✅ Dunkelheit kriecht rein |
| 3 | **Beinahe-Fehler** („nein, nicht da hin!") | ⚠️ schwach | ✅ letzte Scheibe verdunkelt fast |
| 4 | Befriedigende Auflösung | ✅ | ✅ Licht flutet das Fenster |
| | **Differenzierung** | ❌ = 500 andere Spiele | ✅ eigenes Bild |

Punkt 3 ist der wichtigste in jedem Playable Ad — er löst den „das kann ich
besser"-Reflex aus. Und in der Zeile *Differenzierung* verliert Kaskade
deutlich: Ein Förderband mit Reihen sieht aus wie jedes andere Blockspiel. Ein
Fenster, in das die Dunkelheit von außen kriecht, ist ein **eigenes Bild** — und
Bilder sind das, was in einem Store-Feed hängen bleibt.

**Fazit:** Der Hook sollte der **Hauptmodus in lesbar gemacht** sein, nicht
Kaskade. Kaskade behält einen echten kommerziellen Job: die 90-Sekunden-Session
und eine zweite Ad-Variante fürs A/B-Testing der Arcade-Zielgruppe.

### Monetarisierung — ehrlich

Ohne Backend bleibt: **Rewarded Ads + einmaliger „Keine-Werbung"-Kauf.**
Rewarded passt sauber in dieses Konzept:
- *„+3 Züge ansehen"*, wenn das Zugbudget knapp verfehlt wurde ← der stärkste Platz
- *„Laterne schneller füllen"*
- *„Erinnerung freischalten"* (Story-Szene)

**Der Preis der Entscheidung:** Das Konzept wirft die Leben raus — und Leben
sind der klassische Monetarisierungshebel („Weiterspielen für 💎"). Ohne sie
verkaufst du **Hilfe**, nicht **Zugang**. Das kostet ARPDAU und bringt
Retention, Bewertungen und Weiterempfehlung. Für ein erstes Spiel ohne
UA-Budget ist das eindeutig der richtige Tausch: Du kannst dir keine gekauften
Nutzer leisten, also müssen die organischen bleiben.
