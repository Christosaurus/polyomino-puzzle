# Briefing: Lumen — neutrales Architektur-Audit & Redesign-Konzept

> Für ein starkes Modell (Fable) mit **frischem Blick**. Ziel: **denken, nicht
> explorieren.** Der Ist-Zustand steht unten faktisch drin — du musst dich nicht
> erst durch den Code arbeiten. Lies Code nur punktuell nach, wenn du eine
> konkrete Zahl brauchst.

---

## 0. Dein Auftrag

Christian baut solo „Lumen", ein gemütliches Polyomino-Packpuzzle (Web/TS, später
Expo). Das Spiel **funktioniert und macht Spaß**, aber:

- es macht **noch nicht süchtig** — es fehlt der Sog, der Spieler in der App hält
- die Modi laufen **parallel nebeneinander**, nicht verzahnt
- die „Licht"-Story ist bisher nur eine **Prozentzahl** — keine echte Erzählung
- Level werden schwerer, aber kaum **kreativer** (nur „gesperrte Felder")
- Statistiken, Währungen und Erfolge **ergeben zusammen kein rundes Bild**

Liefere ein **langes, detailliertes, umsetzbares Konzept**, das Lumen zu einer
„runden Sache" macht: extrem durchdacht, unkompliziert zu bedienen, mit
maximalem Spaß- und Retention-Faktor. **Nimm dir explizit erfolgreiche Mobile
Games als Vorbild** und benenne, was du von welchem übernimmst und warum.

Sei kritisch. Wenn etwas am aktuellen Aufbau grundsätzlich nicht trägt, sag es.
Christian will die neutrale Außensicht, keine Bestätigung.

---

## 1. Was Lumen heute ist (Ist-Zustand, faktisch)

### Kern-Mechanik
„Fülle die Silhouette": eine Zielform ist vorgegeben, der Spieler zieht Polyomino-
Teile per Finger hinein, bis die Form exakt gedeckt ist. Klassische 12 Pentominoes
+ Spiegelung. Teile werden als glänzende, verbundene Kugeln gerendert (IQ-Puzzler-
Look). Kein Zeitdruck im Story-Modus außer einer großzügigen Uhr für die
Sternewertung.

### Die 5 Modi (heute unabhängig voneinander)

| Modus | Was es ist | Fortschritt / Belohnung |
|---|---|---|
| **Spielen** (Kampagne) | 3 Regionen — „Der Garten", „Die Werkstatt", „Der Farbhof" — mit je ~10 handgebauten, vorab bewerteten Leveln aus einem Manifest (30 gesamt). „Fülle die Silhouette". | 1–3 Sterne je Level (nach Restzeit). Regionen schalten per **Gesamt-Sterne** frei (0 / 12 / 30). Sterne gibt es **nur hier**. |
| **Täglich** | 1 generiertes Level pro Kalendertag, für alle gleich. Sonntags „Wochen-Herausforderung" mit gesperrter Zone. | Streak-Zähler + Meilensteine (3/7/14/30/60/100 Tage → Lichtsplitter). |
| **Abstieg** | Endlos-Modus, generierte Level, wird mit der Tiefe schwerer (Teilezahl + Schwierigkeit steigen). 10 rotierende Varianten pro Tiefe. Ab Ebene 4 jede 4. Ebene mit gesperrter Zone. „Momentum"-System: „NEUER REKORD" + Hype-Wörter zwischen Leveln. | Lichtsplitter pro Ebene. Bestmarke (tiefste Ebene). |
| **Kaskade** | 90-Sekunden-Speedmodus. Scherben laufen auf einem Fließband herunter, der Spieler zieht sie ins Feld, füllt Reihen → Reihen „zünden" und lösen sich. 3 Leben; eine verpasste Scherbe kostet ein Leben, 0 Leben = Runde vorbei. Multiplikator hält bei Tempo. Mini-Challenge („nur gerade Linien" → +1 Leben). Eigenes, breiteres Teileset (1er bis Pentominoes). | Punkte-Rekord, meiste Reihen. |
| **Sammlung** | Statistik-Raster + Shop (Joker/Leben gegen Lichtsplitter) + 11 Erfolge. | — |
| **Profil** | Avatar (8 Smileys), Name, „Stufe" (aus allem hochgerechnete XP-Zahl), Statistik-Kacheln. | — |

### Währungen & Ressourcen
- **Lichtsplitter** (Soft Currency): aus Siegen, ausgegeben im Shop.
- **Leben** (max 5, regeneriert 1/20 min): Eintritts-Gate für Kampagne & Abstieg.
- **Joker** (Verbrauch): Tipp, +20 Sek, Lösen.
- **Sterne**: nur aus Kampagnen-Leveln; einziger Freischalt-Mechanismus.

### Story-/Thema-Elemente heute
- Titel „Lumen". Thema: **Licht zurückbringen**.
- Startbildschirm zeigt „Licht: X %" — reine Ableitung aus Gesamt-Sternen.
- Der Hintergrund (gemalte Szenerien: Garten, Werkstatt) blendet mit jedem Sieg
  ein Stück von **Nacht → Tag** über.
- Regionen haben stimmungsvolle Namen/Untertitel („Wo das Licht zuerst zurückkehrt").
- Erfolgs-Namen sind thematisch („Erstes Licht", „Lichtträger", „Tiefdunkel").
- **Keine** Figuren, **keine** Handlung, **kein** Antagonist, **keine** Sequenzen/
  Cutscenes. Kein „Warum". Level haben keinen erzählten Sinn.

### Level-Abwechslung heute
- Einziger „Twist": **gesperrte Zonen** — ein Teil der Silhouette ist verriegelt,
  bis der Rest gelöst ist (nur ganze Lösungsteile werden gesperrt, nie ein
  geometrischer Schnitt, sonst Deadlock).
- Sonst variiert nur Silhouetten-Form, Teilezahl und Zeitdruck.

### Technische Rahmenbedingungen (hart)
- **TypeScript, Vite, Vanilla + Canvas 2D.** Monorepo: `puzzle-core` (Solver via
  Dancing Links / Exact Cover), `level-gen-cli`, `web`.
- **Level werden on-device generiert** (Daily, Abstieg). Ein eindeutig lösbares
  großes Level (7+ Teile) zu generieren + Eindeutigkeit zu prüfen ist auf dem
  Handy **langsam** → die Teilezahl im Abstieg plateaut real bei ~Ebene 9–10.
  Handgebaute Level (Manifest) haben dieses Problem nicht.
- **Offline-first**, `localStorage`-Persistenz. Kein Backend, kein Account.
- Ziel-Plattform: **Expo (mobile)**, aber Web-first entwickelt (kein Mac).
- **Solo-Entwickler**, neu im Tooling. Grafik entsteht über Nano Banana
  (Bild-KI) + handgebaute SVGs/Canvas.
- 60 fps, `prefers-reduced-motion` wird respektiert.

---

## 2. Was das Konzept liefern soll (Deliverables)

Schreib es als zusammenhängendes Dokument mit diesen Teilen:

### A. Audit (schonungslos)
- Wo verliert Lumen den Spieler heute? (Onboarding, Session-Ende, Modus-Wechsel,
  fehlende Ziele, unklare Belohnungen …)
- Welche der 5 Modi ziehen ihr Gewicht **nicht**? Was ist redundant?
- Welche Systeme (Währungen, Sterne, Stufe, Leben, Joker, Streak) sind
  überflüssig, verwirrend oder ziehen in unterschiedliche Richtungen?
- Benchmarke gegen 3–5 konkret benannte Mobile Games (siehe §4): was machen die
  besser, und **was davon passt zu einem Solo-Dev-Puzzler ohne Backend**?

### B. Die Kern-Schleife & Meta-Progression
- **Eine** klare Haupt-Fortschrittsachse. Was ist das eine, worauf der Spieler
  hinarbeitet? Wie fühlt sich eine 3-Minuten-Session an, wie eine 30-Tage-Reise?
- **Wie verzahnen sich die Modi?** Christians Wunsch: in einem Modus verdient man
  etwas (z. B. Währung), das den **Story-Modus voranbringt** — kein
  Nebeneinander. Entwirf das konkret: welche Ressource, welcher Fluss, welche
  Gates. Jeder Modus muss einen **klaren Zweck im Ganzen** haben (oder wegfallen).
- Retention-Haken: warum kommt der Spieler morgen wieder? (Ohne Dark Patterns —
  gemütlich, nicht ausbeuterisch.)

### C. Die Geschichte (das Herzstück dieser Anfrage)
Christian will eine **echte Geschichte**, tief ins Gameplay integriert:
- **Was ist passiert?** Warum ist das Licht weg? Wer/was hat es genommen?
  Entwirf die Welt, den Auslöser, den Einsatz.
- **Ein Antagonist**, der über den Verlauf besiegt wird — oder eine andere klare
  dramatische Kurve. Anfang, Mitte, Wendepunkt, Finale.
- **Was bedeutet ein Level-Sieg erzählerisch?** Jedes Fenster/Puzzle muss einen
  konkreten Sinn in der Fiktion haben („du reparierst das Fenster der Werkstatt,
  damit …"). Level-Erfolge müssen sich anfühlen wie Fortschritt in einer
  Handlung, nicht wie abgehakte Aufgaben.
- **Sequenzen / Cutscenes:** eine Figur wird eingeblendet und spricht den Spieler
  an — „Toll, du hast Ebene X gelöst. So holen wir uns das Licht zurück …". Wie
  oft, in welchem Ton, mit welcher Figur/welchen Figuren? Wie wird das
  produziert (Standbild-Portrait + Text-Box? animiert?) mit den vorhandenen
  Mitteln (Bild-KI, Canvas)?
- Wie ersetzt/erweitert das die dünne „Licht: X %"-Anzeige? Der Nacht→Tag-
  Übergang der Szenerie soll erhalten bleiben und **erzählerisch aufgeladen**
  werden.
- Grober Handlungsbogen in Akten, an die vorhandene Struktur andockbar (3
  Regionen + Endlos-Abstieg + Kaskade).

### D. Kreativere, sinnvollere Level
- Ein **Katalog von Level-Mechaniken / Modifikatoren**, die die Schwierigkeit
  UND die Abwechslung erhöhen — deutlich über „gesperrte Zone" hinaus.
  Christian nennt **„Block Out"** als Beispiel dafür, was mechanisch noch geht
  (bitte im Konzept konkret werden: Hindernisse, Sonderfelder, Ziele,
  Vorbelegungen, mehrstufige Bretter, bewegliche Elemente, Farb-/Form-Regeln …).
- Wie sichern wir **Schwierigkeit** ab, obwohl on-device-Generierung bei großen
  eindeutigen Leveln an die Grenze kommt? (Mehr handgebaute Level? Ein
  Autoren-Workflow? Curated Packs + generierte Füller? Hybride?)
- Wie bekommt **jedes** Level einen konkreten Sinn (siehe C)?
- Wie interagieren Level-Mechaniken mit der Story (ein Mechanik-Typ =
  ein Story-Beat)?

### E. Grafik-Direktion
- Gesamt-Bildsprache (Christian mag den „Township/Candy"-Look, glänzend-
  plastisch, dicke Konturen, kräftige Schrift; Referenz auch „Blocks Out").
- Wie sehen aus: Brett, Teile, HUD, Overlays, die Story-Sequenzen, die
  Weltkarte, der Nacht→Tag-Übergang, der/die Charakter(e)?
- Konkrete, mit Bild-KI + Canvas produzierbare Vorgaben (keine Vollanimation,
  die ein Team bräuchte).
- Wo lohnt sich Bewegung (Feiern, Übergänge), wo nicht?

### F. Statistiken & Erfolge, die Sinn ergeben
- Welche Zahlen sollte Lumen überhaupt tracken — und **warum interessiert die den
  Spieler** (nicht „weil man kann")?
- Wie hängen Erfolge an der Story / der Kern-Schleife?
- Was wird aus „Stufe", Streak, Rekorden, Ø-Zeit, „Fenster gelöst"?

### G. Roadmap
- Priorisierte Umsetzungs-Reihenfolge für einen Solo-Dev. Was zuerst, was bringt
  den größten Retention-Hebel pro Aufwand? Was ist „später/optional"?
- Kennzeichne, was ein Bruch mit dem jetzigen Datenmodell/Save wäre.

---

## 3. Leitplanken (bitte einhalten)
- **Unkompliziert.** Kein Feature, das eine Erklärung braucht. Ein neuer Spieler
  muss in 20 Sekunden im ersten Puzzle sein.
- **Gemütlich, nicht ausbeuterisch.** Retention über Charme und Sinn, nicht über
  Energie-Timer-Frust oder aggressive Pop-ups.
- **Solo-machbar.** Alles muss mit TS/Canvas + Bild-KI umsetzbar sein, ohne Team,
  ohne Backend, offline.
- **Baut auf dem Vorhandenen auf**, wo sinnvoll — aber scheu keinen Umbau, wenn
  ein System grundsätzlich im Weg steht. Sag klar, was du wegwerfen würdest.

---

## 4. Vorbilder zum Benchmarken
Nutze die Besten ihrer Kategorie und sag jeweils, **was** du übernimmst:
- **Meta-Progression / „ein Ziel":** Royal Match, Gardenscapes/Homescapes,
  Toon Blast.
- **Story tief im Gameplay:** Homescapes (Renovierung = Fortschritt),
  Monument Valley (Umgebung erzählt), Gorogoa, A Little to the Left.
- **Schwierigkeitskurve & „nur noch eine Runde":** Threes, Two Dots,
  Blockudoku / Woodoku, 1010!.
- **Gemütliche Bildsprache:** Alba, A Monster's Expedition, Monument Valley,
  I Love Hue.
- **Polyomino/Packen speziell:** Blockudoku, Woodoku, IQ Fit, Cross Logic,
  Tetris Effect (Feiern/Feedback).
- **Verzahnte Modi:** wie Clash Royale / Marvel Snap Nebenmodi in eine Haupt-
  Progression zahlen — auf einen ruhigen Puzzler übertragen.

*(Christian: falls du selbst konkrete Lieblingsspiele hast, hier ergänzen —
„Block Out" bitte präzisieren, welches genau.)*

---

## 5. Format
Langes Markdown-Dokument. Struktur nach §2 (A–G). Konkret, mit Beispielen,
mit klaren Empfehlungen statt Optionslisten. Wo du eine Zahl aus dem Code
brauchst, nenn die Datei — der Rest steht oben.
