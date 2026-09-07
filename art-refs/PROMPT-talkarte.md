# Nano Banana — Die Talkarte (Hintergrund für den Lichtpfad)

Der Startbildschirm ist ein senkrecht gescrollter Pfad: Der Garten →
Tagesfenster → Werkstatt → Anselms Stollen → Farbhof → Scherbenregen. Aktuell
zeichnet ein prozeduraler Canvas die Stimmung dahinter. Diese Karte ersetzt sie
als gemaltes Hintergrundbild.

**Ablage:** `packages/web/public/bg/talkarte.webp` (bzw. drei Kacheln, s. u.)
**Format:** Hochformat, sehr lang — Ziel **~1080 × 3600** (3 : 10).
**Kein Text, keine UI, keine Menschen, keine Zahlen, keine Logos.**

---

## Wie das Bild eingebaut wird (wichtig fürs Motiv)

Das Bild liegt **hinter einer schmalen, mittig zentrierten Kartenspalte**
(max. ~620 px breit) und wird mit ihr vertikal durchgescrollt (leichter
Parallax, etwas langsamer als die Karten). Die 6 Stationen sind **DOM-Karten**,
die je nach Bildschirmgröße und Spielfortschritt an **wechselnden Höhen**
sitzen.

Daraus folgt:

1. **Keine ausrichtungspflichtigen Landmarken.** Es darf nichts im Bild geben,
   das exakt unter einer bestimmten Station liegen muss — die Karten schweben
   frei darüber. Szenerie nur **angedeutet und impressionistisch**, grob in
   Dritteln verteilt.
2. **Der geschwungene Pfad ist reine Deko** und darf frei verlaufen. Er muss
   keine festen %-Höhen treffen.
3. **Das Einzige, was verlässlich stimmen muss, ist die Dunkel→Hell-Achse**
   (s. u.). Sie ist der ganze Zweck des Bildes.
4. **Seiten:** Auf breiteren Screens wird links/rechts beschnitten, auf
   schmalen entsteht seitlich Rand. Deshalb die Seiten als **geschlossene
   Talwände** anlegen (Wald / Fels, die das Bild einrahmen) — dann ist Beschnitt
   unkritisch und ein sichtbarer Seitenrand stört nie. **Keine horizontale
   Kachelung / kein tileable pattern.** Vertikal ebenfalls nicht kachelbar
   (der Verlauf!).

---

## Das Wichtigste: die Dunkel→Hell-Achse

Von **unten (Anfang, im Licht)** nach **oben (Ende, noch finster)** — der
Spieler startet unten und arbeitet sich nach oben ins Dunkle. Das Spiel blendet
zusätzlich global heller, je mehr Fenster erhellt sind; die Karte liefert die
Grund-Stimmung, nicht den Effekt.

- **unteres Drittel** — der Garten: warmes Abendlicht, sattes Grün, blühende
  Beete, ein paar erleuchtete Fenster in Häuschen, Glühwürmchen. Lebendig.
- **mittleres Drittel** — die Werkstatt: kühler, kantiger, Steinmauern,
  Werkzeug-Silhouetten, Dämmerung, wenige Lichter.
- **oberes Drittel** — der Farbhof: fast nachtschwarz, große leere
  Fensterbögen, kalter blauer Nebel, ein einzelner ferner Lichtpunkt ganz oben.

---

## Generierung: bitte in 3 Kacheln

Nano Banana verzerrt 3 : 10 in einem Rutsch. Deshalb **drei Kacheln**:

| Datei | Inhalt | Format |
|---|---|---|
| `talkarte-garten.webp` | unteres Drittel, warm/lebendig | 1080 × 1440 |
| `talkarte-werkstatt.webp` | mittleres Drittel, Dämmerung | 1080 × 1440 |
| `talkarte-farbhof.webp` | oberes Drittel, Nacht | 1080 × 1440 |

Jede Kachel oben und unten je ~15 % als **ruhige Übergangszone** halten (kein
Motiv-Detail direkt an der Schnittkante, Farbton dort neutral) — ich blende sie
im Code mit einem weichen Verlauf ineinander. Wer lieber ein Bild macht: ein
moderates Hochformat generieren und nach oben/unten **outpainten**.

---

## Prompt (pro Kachel den passenden Absatz einsetzen)

```
Create a tall vertical background panel for a cozy hyper-casual mobile puzzle
game called "Lumen": a painted valley seen from a gentle bird's-eye angle,
part of one continuous map that is scrolled from bottom (lit) to top (dark).

This is a BACKGROUND ONLY — the game floats its own cards over it, so keep
scenery loose and impressionistic, with no landmark that needs to line up
with anything. A soft winding path may drift up through the panel as pure
decoration. Forested / rocky valley walls frame the left and right edges so
the panel can be cropped on wider screens without a visible seam. Keep the
top ~15% and bottom ~15% calm and detail-free for blending into the
neighbouring panel.

[GARTEN-KACHEL:] Warm golden evening light, lush green, blossoming beds, a few
little cottages with windows glowing from inside, fireflies. The valley is
alive and hopeful here.

[WERKSTATT-KACHEL:] Cooler and greyer, dusk. Stone walls, timber, the
suggestion of a glazier's workshop roofline and tool silhouettes. Only a few
scattered lights. Transitional mood.

[FARBHOF-KACHEL:] Near-black night, cold blue mist, the suggestion of tall
empty window-arches, a slope where faint glass shards catch the light. One
small distant point of light near the very top. Melancholy, still.

Style: painted "township / storybook" mobile-game art — soft rounded forms,
hand-painted texture, glowing highlights, a thick but soft dark outline where
shapes meet the sky. Cohesive and atmospheric.

Colour palette: warm gold #ffc23b and amber #ff9c3d for the lit valley, aqua
#2fd9cf and grape #5039c6 in the shadows and the path, deep indigo #170f45 for
the night, rose #ff5fa8 as a rare far accent.

No text, no numbers, no UI, no people, no logos. Portrait, 1080 x 1440,
high resolution.
```
