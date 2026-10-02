/**
 * AdMob-Konfiguration. Zentrale Stelle für alles, was beim Wechsel auf
 * echte Werbung geändert werden muss:
 *
 *  1. `ADS_TEST_MODE` auf `false`
 *  2. unten die echten IDs aus der AdMob-Konsole eintragen
 *  3. dieselbe App-ID in `android/app/src/main/AndroidManifest.xml`
 *     (`com.google.android.gms.ads.APPLICATION_ID`) ersetzen
 *
 * ACHTUNG: Auf dem eigenen Gerät mit ECHTEN Anzeigen testen/klicken ist bei
 * AdMob ein Sperrgrund. Solange `ADS_TEST_MODE` an ist, laufen nur Googles
 * öffentliche Test-Anzeigen.
 */
export const ADS_TEST_MODE = true;

export const ADMOB = {
  android: {
    // Googles öffentliche Test-IDs (https://developers.google.com/admob/android/test-ads)
    appId: "ca-app-pub-3940256099942544~3347511713",
    rewarded: "ca-app-pub-3940256099942544/5224354917",
  },
} as const;
