# Nano Banana — Profil-Avatare (8 Smileys)

Ziel: **ein** Sheet mit 8 Avatar-Köpfen, gleicher Look, den ich einzeln
ausschneide. Jeder wird im Spiel in einem abgerundeten Quadrat-Rahmen gezeigt
(den Rahmen macht das UI schon) → **quadratisch, Kopf mittig, transparenter
Hintergrund**, am Ende je **256×256 PNG**.

Look-Referenz: der glänzende orange Wackel-Charakter aus dem Screenshot
(`avatar-ref.png`) — knautschige "Gummi/Plastik"-Figur, riesiges Lächeln,
weiche Rundungen, satter Glanzpunkt oben, ein weicher Schlagschatten. Genau
dieser Stil, nur als 8 Varianten.

Dateiname-Zuordnung (wichtig, damit ich sie direkt einbauen kann):
`grin, cool, wow, wink, joy, smirk, angel, party`

---

## Prompt

```
Create one clean character sheet of 8 cute mascot avatar heads for a cozy
mobile puzzle game called "Lumen", on a plain flat background, in a neat
4-by-2 grid with generous even spacing.

Style: glossy, squishy "gummy / soft-plastic" blobby creatures — like a
premium match-3 game mascot. Each is a rounded, slightly wobbly head with big
expressive cartoon eyes and a wide friendly mouth. Thick soft outline in dark
purple (#201356). Strong single top-left glossy highlight, gentle subframe
shading, one soft drop shadow beneath. Chunky, bouncy, joyful. All 8 the same
size, same framing (head fills ~80% of the tile, centred), same light
direction, so they read as one matching set. No text, no frames, no
background — transparent.

Colour palette (each avatar its own body colour, all saturated-but-soft, never
neon): warm gold #ffc23b, amber #ff9c3d, rose pink #ff5fa8, coral #ff5b6a,
aqua teal #2fd9cf, sky blue #45c1ff, lime green #66e05f, grape violet #8b6bff.
Eyes white with dark pupils; cheeks a soft blush.

The 8 avatars, in order (this is the file order too):
1. grin  — amber #ff9c3d body, huge open toothy grin, eyes squeezed happy.
2. cool  — grape violet #8b6bff body, calm smile, wearing tiny round dark
           sunglasses with a white glint.
3. wow   — gold #ffc23b body, star-shaped sparkle eyes, mouth open in delight,
           little sparkles around the head.
4. wink  — sky blue #45c1ff body, one eye winking, cheeky half-smile.
5. joy   — coral #ff5b6a body, laughing with eyes shut, one tiny happy tear,
           big open smile.
6. smirk — aqua teal #2fd9cf body, one raised brow, sly confident smirk.
7. angel — lime green #66e05f body, soft innocent closed-eye smile, a small
           glowing gold halo floating above.
8. party — rose pink #ff5fa8 body, wide cheer, a little gold party hat,
           two or three confetti bits.

Plain / transparent background, high resolution, crisp clean edges, all heads
aligned on the grid.
```

---

Danach: Sheet zurückschicken → ich schneide die 8 aus (256×256, transparent),
lege sie unter `packages/web/public/ui/avatars/<id>.webp` ab, dann erscheinen
sie automatisch im Profil-Picker und ersetzen die Emoji-Platzhalter.
