# Audio — Stand & was noch fehlt

## Soundeffekte — **sind drin**

`packages/web/src/sfx.ts` synthetisiert die SFX über WebAudio (keine Dateien):
`pickUp` (Teil greifen), `place` (Teil legen), `invalid` (geht nicht),
`win` (gelöst). Verdrahtet in `view.ts` / `cascade-view.ts`. Der „Ton"-Schalter
schaltet sie stumm.

Die Synth-Bleeps sind funktional, aber schlicht. Wenn's saftiger werden soll:
kurze Samples (je < 30 KB) in `public/audio/` legen und `sfx.ts` so umbauen,
dass es die Datei nimmt, sonst den Synth als Fallback. Nicht dringend.

## Musik — **System ist da, Tracks fehlen**

`packages/web/src/music.ts` ist gebaut: ein Loop pro Kontext mit Crossfade,
„Ducking" (leiser während Cutscenes), pausiert im Hintergrund, startet erst nach
der ersten Nutzergeste (Autoplay-Politik). Verdrahtet:

| Kontext | Track | wann |
|---|---|---|
| `menu` | `public/music/menu.mp3` | Start, Täglich, Abstieg-Screen, Kaskade-Screen, Sammlung |
| `play` | `public/music/play.mp3` | Kampagnen-Fenster, Tagesfenster, Abstieg |
| `cascade` | `public/music/cascade.mp3` | Kaskade-Runde |

**Fehlt nur:** die drei MP3s. Solange sie nicht da sind, passiert nichts
(kein 404-Krach, `music.ts` verschluckt das).

### Was die Tracks brauchen

- **Format:** MP3, ~128 kbps, Mono oder Stereo. (MP3 läuft überall inkl.
  iOS-Safari; ~1–1,5 MB pro 90-s-Loop, wird gecacht.)
- **Nahtloser Loop** — Anfang und Ende müssen sauber ineinander übergehen
  (im Editor auf Null-Durchgang schneiden, kein Reverb-Tail am Ende).
- **Länge:** 60–120 s reicht, es loopt ja.
- **Lautstärke:** eher leise abmischen — die Master-Lautstärke steht auf 0,32,
  aber der Track selbst sollte nicht schon heiß sein.

### Stimmung (passend zu `KONZEPT-lumen.md` / der Talkarte)

- **menu** — ruhig, warm, ein bisschen wehmütig. Musikuhr / Spieldose,
  weiche Pads, sparsam. „Ein Tal, das auf sein Licht wartet." Kein Beat.
- **play** — konzentriert, unaufdringlich. Leichter Puls, damit man im Fluss
  bleibt, aber nichts, was vom Nachdenken ablenkt. Marimba/Harfe/Glas.
- **cascade** — treibend, 2½ Minuten Energie. Deutlicher Beat, steigt subtil an.
  Das ist der einzige Track, der „zieht".

### Quellen

CC0 / lizenzfrei: [freesound.org](https://freesound.org) (Filter „Creative
Commons 0"), [Pixabay Music](https://pixabay.com/music/), [incompetech.com]
(Kevin MacLeod, CC-BY — Namensnennung nötig). Oder ein kleiner Loop-Pack aus
einem Asset-Store. Beim Namensnennungs-Zwang: Credits-Zeile in die Sammlung /
ein „Über"-Screen.

Schick die drei MP3s, dann lege ich sie in `public/music/` — der Rest läuft
von selbst.
