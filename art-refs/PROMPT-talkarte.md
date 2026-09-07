# Nano Banana — Die Talkarte (Hintergrund für den Lichtpfad)

Der Startbildschirm ist jetzt ein senkrecht gescrollter Pfad: Der Garten →
Tagesfenster → Werkstatt → Anselms Stollen → Farbhof → Scherbenregen. Bisher
läuft nur eine bunte CSS-Linie dahinter. Diese Karte ersetzt sie.

**Ablage:** `packages/web/public/bg/talkarte.webp`
**Format:** PNG, **Hochformat, sehr lang** — mind. **1080 × 3600** (3 : 10),
gern noch länger. Wird oben-mittig fixiert und vom Spieler durchgescrollt.
**Kein Text, keine UI, keine Menschen, keine Zahlen.**

---

## Das Wichtigste: die Dunkel→Hell-Achse

Die Karte muss von **unten (Anfang, im Licht)** nach **oben (Ende, noch
finster)** verlaufen — der Spieler startet unten und arbeitet sich nach oben ins
Dunkle. Das Spiel blendet zusätzlich global heller, je mehr Fenster erhellt
sind; die Karte liefert die Grund-Stimmung, nicht den Effekt.

- **unteres Drittel** — der Garten: warmes Abendlicht, sattes Grün, blühende
  Beete, ein paar erleuchtete Fenster in Häuschen, Glühwürmchen.
- **mittleres Drittel** — die Werkstatt: kühler, kantiger, Steinmauern,
  Werkzeug-Silhouetten, Dämmerung, wenige Lichter.
- **oberes Drittel** — der Farbhof: fast nachtschwarz, große leere
  Fensterbögen, kalter blauer Nebel, ein einzelner ferner Lichtpunkt ganz oben.

---

## Prompt

```
Create one very tall vertical map illustration for a cozy mobile puzzle game
called "Lumen" — a painted valley seen from a gentle bird's-eye angle, meant
to be scrolled from bottom to top.

A single winding path runs up the whole image, from the warm lit bottom to the
dark unlit top. Along the path sit small landmarks with room around each one
(the game places its own markers on them): a flowering garden with little
lantern-lit cottages near the bottom; a stone glazier's workshop with a big
arched window in the middle; a mine entrance into a hillside; a grand courtyard
of tall empty window-arches near the top; and off the path near the top, a spot
where glass shards rain down a slope.

Light gradient along the path, this is the point of the image:
- bottom third: warm golden evening light, lush green, blossom, fireflies,
  windows glowing from inside — the valley is alive here.
- middle third: cooler, greyer, dusk, stone and timber, only a few lights.
- top third: near-black night, cold blue mist, large dark empty window frames,
  and one small distant point of light at the very top.

Style: painted "township / storybook" mobile-game art — soft rounded forms,
hand-painted texture, glowing highlights, a thick but soft dark outline where
shapes meet the sky. Cohesive, atmospheric, a little melancholy at the top,
hopeful at the bottom.

Colour palette: warm gold #ffc23b and amber #ff9c3d (the lit valley), aqua
#2fd9cf and grape #5039c6 in the shadows and the path, deep indigo #170f45 for
the night at the top, rose #ff5fa8 as a rare far accent.

No text, no numbers, no UI, no people, no logos. Portrait, very tall
(roughly 3:10), high resolution, seamless left and right edges.
```

---

Wenn's zu lang für einen Rutsch ist: **drei Kacheln** (`talkarte-garten.png`,
`talkarte-werkstatt.png`, `talkarte-farbhof.png`), je 1080 × 1440, oben/unten
so gehalten dass sie ineinander übergehen — dann setze ich sie im Code
zusammen.
