# Audio — Stand

## Soundeffekte — **synthetisiert, drin**

`packages/web/src/sfx.ts` erzeugt alle SFX über WebAudio (keine Dateien):
`pickUp`, `place`, `invalid`, `rowClear(n)`, `streak`, `win(tier)`, `milestone`,
`fail`, `tap`, `toggleOn`. Verdrahtet in `view.ts` / `cascade-view.ts` / `app.ts`.
Der „Ton"-Schalter in den Einstellungen schaltet sie stumm; beim Einschalten
bestätigt ein kurzes `toggleOn`-Blip, dass der Ton wieder an ist.

Wenn's mal saftiger werden soll: kurze Samples (je < 30 KB) in `public/audio/`
legen und `sfx.ts` so umbauen, dass es die Datei nimmt, sonst den Synth als
Fallback. Nicht dringend.

## Musik — **generativ, drin, keine Dateien**

`packages/web/src/music.ts` ist ein kleiner generativer Loop, komplett
synthetisiert — also von Haus aus lizenzfrei, kein Asset-Bedarf:

- **Harmonik:** endlose Am–F–C–G-Folge (die „poppige", zieht-immer-Progression),
  warmes Saw+Sine-Pad, leicht tiefpassgefiltert.
- **Melodie:** Glöckchen-Arp aus der A-Moll-Pentatonik, Oktave und Timing streuen
  leicht → nichts wiederholt sich hörbar exakt. Feedback-Delay für Tiefe.
- **Bass:** weicher Grundton, Dichte steigt mit der Energie.
- **Rhythmus:** ab `play` ein weicher Puls, ab `cascade` Kick + Offbeat-Hi-Hat.

Die drei „Tracks" sind nur drei Energie-Stufen derselben Musik; `music.ts`
gleitet sanft zwischen ihnen:

| Kontext | Energie | wann |
|---|---|---|
| `menu` | ruhig, sparsam | Start, Täglich, Abstieg-/Kaskade-Screen, Sammlung |
| `play` | fließend, Puls | Kampagnen-Fenster, Tagesfenster, Abstieg |
| `cascade` | treibend, Beat | Kaskade-Runde |

- Startet erst nach der ersten Nutzergeste (Autoplay-Politik).
- „Ducking" (leiser) während Cutscenes/Dialogszenen.
- Pausiert im Hintergrund (`visibilitychange`), läuft beim Zurückkommen weiter.
- Der „Musik"-Schalter blendet **sanft** aus/ein (kein harter Schnitt) und
  suspendiert den AudioContext, wenn aus.
- Master-Lautstärke 0,22 (unter den SFX).

### Falls doch mal echte Tracks gewünscht sind

MP3 (~128 kbps), nahtloser Loop (auf Null-Durchgang geschnitten, kein
Reverb-Tail), 60–120 s. Dann `music.ts` wieder auf `fetch`+`decodeAudioData`
umstellen (die alte dateibasierte Fassung steht in der Git-Historie) und die
Dateien in `public/music/` legen. Quellen für CC0: pixabay.com/music,
freesound.org (Filter „Creative Commons 0"). Aktuell **nicht nötig** — der
Generator trägt.
