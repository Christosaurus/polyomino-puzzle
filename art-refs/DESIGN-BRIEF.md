# Lumen — Design-Neuaufbau: was ich von dir brauche

Ziel: das ganze Aussehen auf Premium-Niveau heben (Qualität wie „Blocks Out" o. Ä.).
Du sammelst / generierst die Sachen unten, lädst sie mir **hier in den Chat** hoch, dann
baue ich die komplette Oberfläche damit neu.

Arbeite die Blöcke **1 → 2 → 3 → 4** ab. Block 1 allein bringt schon 80 %.

---

## BLOCK 1 — Referenz-Screenshots  ⚑ wichtigster Teil

Mach von **1–3 Spielen, die dir gefallen** (Blocks Out + evtl. andere) Screenshots.
Aus diesen Bildern lese ich Farben, Abstände, Ecken-Rundung, Schatten, Button-Stil,
HUD-Aufbau ab und baue Lumen genau in dieser Sprache.

**Bitte je Spiel diese 6 Screens abfotografieren (Vollbild, PNG):**

| # | Was | Datei-Name |
|---|---|---|
| 1 | Startbildschirm / Hauptmenü | `ref-<spiel>-home.png` |
| 2 | Das Puzzle-Spielfeld **mit Teilen** (Mitte einer Runde) | `ref-<spiel>-game.png` |
| 3 | Die **untere Menüleiste** / Navigation (nah ran) | `ref-<spiel>-tabbar.png` |
| 4 | Ein **Gewinn-/Ergebnis-Popup** (Sterne, „Weiter"-Button) | `ref-<spiel>-win.png` |
| 5 | Level-Auswahl / Karte / „Welt" | `ref-<spiel>-map.png` |
| 6 | Ein Shop / Belohnungs- / Einstellungs-Screen | `ref-<spiel>-shop.png` |

`<spiel>` = kurzer Name, z. B. `blocksout`. Nicht alle 6 zwingend — je mehr, desto genauer.

---

## BLOCK 2 — 6 Entscheidungen (kurz beantworten)

Kopier die Liste, schreib hinter jede ein Wort:

1. **Grundton:** hell / dunkel / hell+dunkel umschaltbar?
2. **Look:** clean & grafisch (wie Blocks Out) — ODER illustrierte Welt (wie Township) — ODER Mischung (cleane Bedien-Elemente über illustriertem Hintergrund)?
3. **Akzentfarbe:** eine Wunschfarbe für Buttons/Highlights? (Hex oder Beschreibung, sonst wähle ich)
4. **Name/Logo:** bleibt „Lumen"? Soll ich ein Wortmarken-Logo bauen, oder lieferst du eins?
5. **Maskottchen/Figur:** ja (dann brauche ich ein Bild) / nein?
6. **Teile-Stil:** glänzende Kugeln (wie IQ Puzzler, aktuell) / flache abgerundete Blöcke / Glas / Holz / Neon?

---

## BLOCK 3 — Hintergründe (Nano Banana)

Ich liefere dir **Layout-Vorlagen** (`layout-*.png`) — grobe Kompositionen mit einer
ruhigen, dunkleren Mitte fürs Spielbrett. Du lädst je eine Vorlage + den passenden
Prompt (`PROMPT-*.md`) bei Nano Banana hoch, generierst **2–3 Varianten**, schickst
mir die besten als **PNG**.

| Slot | Vorlage | Prompt | Rückgabe |
|---|---|---|---|
| Startseite / Karte | `layout-map.png` | `PROMPT-map.md` | `bg-map.png` |
| Region „Der Garten" | `layout-garten.png` | `PROMPT-garten.md` *(schon geliefert)* | `bg-garten-nacht.png` + `bg-garten-tag.png` |
| Region „Die Werkstatt" | `layout-werkstatt.png` | `PROMPT-werkstatt.md` | `bg-werkstatt-nacht.png` + `bg-werkstatt-tag.png` |
| Region „Der Farbhof" | `layout-farbhof.png` | `PROMPT-farbhof.md` | `bg-farbhof-nacht.png` + `bg-farbhof-tag.png` |

Von jeder Region **zwei** Versionen: „nacht" (im Schatten) und „tag" (erleuchtet) — ich
blende in-game weich zwischen beiden über, je nach Fortschritt.

Wenn du in Block 2 „clean, keine Illustration" wählst: dann brauche ich statt der
Regionen nur **eine** `bg-map.png` und den Rest mache ich mit Verläufen/Mustern.

**Format je Hintergrund:** PNG, **Hochformat**, mind. **1080 × 1920** (mehr ist besser),
**kein Text, keine Buttons, keine UI, keine Menschen/Logos**.

---

## BLOCK 4 — Icons (optional, kann ich auch selbst bauen)

Ich brauche 15 kleine Icons. **Du hast 3 Wege:**

- **A (am einfachsten):** nichts tun — ich baue sie als SVG passend zum Referenz-Stil.
- **B:** ein Icon-Sheet in Nano Banana generieren (Prompt liefere ich als `PROMPT-icons.md`), als ein PNG zurück.
- **C:** aus einer Gratis-Bibliothek ziehen (Lucide, Phosphor, Tabler — alle kommerziell frei) und mir die Namen nennen.

Die 15: `spielen, taeglich, abstieg, kaskade, sammlung` (Tab-Leiste) ·
`tipp, zeit, loesen` (Joker) · `herz, splitter, stern, schloss, haken, pause, pfeil-weiter`.

**Format je Icon (falls B/C):** PNG, **256 × 256**, **transparenter Hintergrund**,
einfarbig oder flach, Name `icon-<name>.png`.

---

## So schickst du's mir

Alles einfach **als Datei-Anhang in den Chat**. Benennung wie oben — dann landet jedes
Bild automatisch am richtigen Platz. Reihenfolge egal, Teillieferungen sind ok
(z. B. erst nur die Referenz-Screenshots).

## Was ich dann mache

Aus Block 1+2: neues Farb-/Typo-/Abstands-System, alle Buttons, Karten, Pills, HUD,
Gewinn-/Pause-Overlays, **die untere Tab-Leiste**, die Karten-/Journey-Ansicht,
Teile-Stil.
Aus Block 3: Hintergründe eingebaut, mit Dunkel→Hell-Übergang pro Region.
Aus Block 4: Icons überall eingesetzt.

Ergebnis: eine zusammenhängende, hochwertige Optik statt des jetzigen Prototyp-Looks.
