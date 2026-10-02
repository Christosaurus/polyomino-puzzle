# Lumen für Android / Google Play – Weg bis zum Release

Stand: Capacitor-Projekt unter `packages/web/android` ist vorbereitet. **Was hier
noch NICHT gebaut oder auf einem Gerät getestet wurde** (kein JDK/Android Studio auf dem
Entwicklungsrechner) ist unten unter „Ungetestet" markiert – das ist dein erster Test.

## Schon erledigt (im Repo)

- Capacitor 8 + `@capacitor/app`, App-ID `app.lumen.game`, Name „Lumen"
- Echtes Launcher-Icon (adaptiv + Legacy + rund) und lila Splash aus `public/icons/icon-512.png`
- Hochformat festgenagelt, Vibrations-Berechtigung (für die Haptik) im Manifest
- Zurück-Taste: Overlay zu → Runde pausieren → Home → App beenden (`handleBackButton` in `app.ts`)
- Auto-Pause beim App-Wechsel (`appStateChange` + `visibilitychange`)
- Release-Signierung über `android/keystore.properties` (nicht im Repo, `.gitignore` schützt Schlüssel)
- Store-Grafiken (Entwurf): `store-assets/android/icon-512.png`, `feature-graphic-1024x500.png`
- Entwurf der Datenschutzerklärung: `store-assets/android/privacy-policy-DRAFT.html`
- App-Größe: ~8 MB (weit unter jeder Store-Grenze)

## 1. Einmalig auf deinem PC

1. **Android Studio** installieren (bringt JDK und Android SDK mit). Beim ersten Start die
   vorgeschlagenen SDK-Komponenten installieren lassen.
2. Im Repo: `npm install`
3. Web-App bauen und ins Android-Projekt kopieren:
   ```bash
   npm run cap:sync -w @polyomino/web
   ```
   (Nach **jeder** Web-Änderung wiederholen.)
4. Android Studio öffnen: `npm run cap:android -w @polyomino/web`

## 2. Auf dem Handy testen

1. Handy: Entwickleroptionen → USB-Debugging an, per Kabel verbinden.
2. In Android Studio oben dein Gerät wählen → ▶ Run.
3. **Prüfliste (das konnte ich nicht testen):**
   - Statusleiste/Notch/Gesten-Leiste: Wird irgendwas von HUD, Tab-Leiste oder Bändern verdeckt?
     (Android 15+ zeichnet App-Inhalt unter die Systemleisten; die App nutzt `safe-area-inset`.)
   - Splash: lila statt weiß? Android 12+ zeigt zusätzlich das App-Icon.
   - Zurück-Taste: im Spiel → Pause; Pause → Weiter; Home → App schließt.
   - Haptik beim Räumen/Lebensverlust (Android-WebView: `navigator.vibrate`).
   - Sound startet nach dem ersten Tippen; Musik pausiert nicht beim Tab-Wechsel falsch.
   - Bestenliste lädt, Rundenende sendet den Score (Supabase, https).
   - Hochformat bleibt beim Drehen; Home-Taste während der Runde → Pause beim Zurückkommen.
   - Flüssigkeit auf einem günstigen Android-Gerät (Canvas-Effekte, Flammenrand).

## 3. Signierschlüssel erzeugen (einmalig, gut aufbewahren!)

```bash
cd packages/web/android
keytool -genkeypair -v -keystore lumen-upload.jks -alias lumen -keyalg RSA -keysize 2048 -validity 10000
```

Dann `packages/web/android/keystore.properties` anlegen (steht in `.gitignore`):

```properties
storeFile=lumen-upload.jks
storePassword=DEIN_PASSWORT
keyAlias=lumen
keyPassword=DEIN_PASSWORT
```

**Schlüssel + Passwörter an mindestens zwei Orten sichern** (nicht im Repo). Mit „Play App
Signing" (Standard) ist das nur der *Upload-Schlüssel* – bei Verlust lässt er sich bei Google
zurücksetzen, trotzdem sauber aufbewahren.

## 4. Release-Bundle (.aab) bauen

- Android Studio: *Build → Generate Signed App Bundle* – oder:
  ```bash
  cd packages/web && npm run cap:sync && cd android && ./gradlew bundleRelease
  ```
- Ergebnis: `packages/web/android/app/build/outputs/bundle/release/app-release.aab`
- **Bei jedem Upload `versionCode` in `android/app/build.gradle` um 1 erhöhen** (`versionName` frei).

## 5. Google Play Console

1. Entwicklerkonto anlegen (einmalig ca. 25 $, Identitätsprüfung). *Persönliches* Konto: Google
   verlangt vor dem Produktiv-Release einen **geschlossenen Test mit einer Mindestzahl Testern über
   14 Tage** (zuletzt 12 Tester – aktuelle Zahl bitte bei Google prüfen). Tester früh organisieren.
2. App anlegen (Name „Lumen", Spiel, kostenlos).
3. **Store-Eintrag:** Kurzbeschreibung (80 Zeichen), Beschreibung, App-Icon 512×512
   (`store-assets/android/icon-512.png`), Feature-Grafik 1024×500 (Entwurf liegt dabei – gern
   mit Text/Szene aufwerten), **mindestens 2 Handy-Screenshots** (am besten vom echten Gerät).
4. **Datenschutzerklärung:** Entwurf ausfüllen → nach `packages/web/public/privacy.html` kopieren →
   pushen → URL `https://christosaurus.github.io/polyomino-puzzle/privacy.html` eintragen.
5. **Data-Safety-Formular** (Entwurf, anhand des Codes): erhoben werden Spielername (öffentlich in
   der Bestenliste), zufällige Spieler-ID, Punktzahl/Spielaktivität, ungefähres Land (aus Zeitzone/
   Sprache). Übertragung verschlüsselt (https). Löschung auf Anfrage per E-Mail. Keine Weitergabe
   zu Werbezwecken *(ändert sich mit AdMob!)*.
6. **Inhaltseinstufung** (IARC-Fragebogen): Puzzlespiel, keine Gewalt/Glücksspiel.
7. **Zielgruppe:** nicht an Kinder unter 13 richten (sonst strengere Familien-Regeln).
8. **Werbung-Deklaration:** „enthält Werbung" erst mit AdMob auf *Ja* setzen.
9. Geschlossener Test → 14 Tage → Produktion beantragen.

## 5b. Werbung (AdMob) -- eingebaut, im Testmodus

- Belohnungswerbung an drei Stellen: „Keine Versuche" (+1 Versuch, primärer Knopf), Weiterspielen
  beim letzten Leben (zusätzlich zum Splitter-Preis) und Rundenende („Double shards").
  Code: `src/ads.ts`, Konfiguration: `src/ads-config.ts`.
- **Testmodus**: `ADS_TEST_MODE = true` + Googles öffentliche Test-IDs; im AndroidManifest steht
  die Test-App-ID. Im Browser läuft stattdessen ein als „Test ad" gekennzeichnetes Overlay.
- Zustimmungsabfrage (Googles UMP) läuft beim App-Start; im Pausenmenü erscheint „Ad privacy
  settings", wo Google das verlangt (EU/UK).
- **Auf echte Werbung umstellen** (erst nach AdMob-Konto + Store-Verknüpfung):
  1. AdMob-Konto, App anlegen, Rewarded-Anzeigenblock erstellen.
  2. Echte IDs in `src/ads-config.ts` eintragen, `ADS_TEST_MODE = false`.
  3. App-ID in `AndroidManifest.xml` (`com.google.android.gms.ads.APPLICATION_ID`) ersetzen.
  4. Play-Console: „enthält Werbung" = Ja; Data-Safety ergänzen (Werbe-ID, Gerätekennungen,
     Zugriff durch Google AdMob).
  5. **Nie mit echten Anzeigen auf dem eigenen Gerät klicken** -- Sperrgrund bei AdMob.
- Nicht gebaut: Banner und Vollbild-Anzeigen (Banner braucht einen Gerätetest für die Position
  über der Tab-Leiste; Vollbild frühestens ab Runde 4, max. 1 pro 3 Runden).

## 6. Offene Entscheidungen

- **App-ID `app.lumen.game` ist nach dem ersten Upload dauerhaft.** Ändern geht nur vorher
  (`capacitor.config.ts` + `android/app/build.gradle`, am saubersten den `android/`-Ordner neu mit
  `npx cap add android` erzeugen und die hier gemachten Anpassungen übernehmen).
- **Impressum/Anbieterkennzeichnung:** in Deutschland brauchst du ein Impressum (Name, Anschrift,
  E-Mail) – in der Datenschutzerklärung und im Store-Eintrag.
- **Bestenliste:** Server-SQL aus `BACKEND-bestenliste.md` Abschnitt 2e ist eingespielt. Vor dem
  Release den Punkte-Deckel (aktuell 200.000) an echten Scores ausrichten, Namensfilter/Meldefunktion
  erwägen.

## Ungetestet (bitte beim ersten Gerätetest prüfen)

Nichts davon wurde auf einem Android-Gerät oder -Emulator ausgeführt, weil auf dem Entwicklungsrechner
kein JDK/Android SDK installiert ist. Verifiziert ist nur: `npm run build`, `npx cap sync android`
laufen durch, Typecheck und Tests sind grün, Icons wurden als Bilder geprüft. Risikostellen: Insets
unter Android 15/16, System-Splash (Android 12+), WebView-Audio, Vibration, Zurück-Taste,
**AdMob (Test-Anzeigen laden/abspielen, Zustimmungsformular, Belohnung wird gutgeschrieben)**.
