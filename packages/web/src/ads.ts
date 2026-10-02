/**
 * Belohnungswerbung (Rewarded Ads). Eine kleine Schicht, damit der Rest des
 * Spiels nur `showRewardedAd(grund)` kennt:
 *
 *  - In der Android-App (Capacitor): echtes AdMob inkl. Zustimmungsabfrage
 *    (Googles UMP, in der EU Pflicht). Solange `ADS_TEST_MODE` an ist, nur
 *    Test-Anzeigen.
 *  - Im Browser (Entwicklung, GitHub Pages): ein klar als Test gekennzeichnetes
 *    Overlay mit 3-Sekunden-Countdown -- so lässt sich der ganze Ablauf
 *    (Belohnung, Abbruch) ohne SDK ausprobieren.
 *
 * Liefert `true` NUR, wenn die Belohnung verdient wurde.
 */

import { ADMOB, ADS_TEST_MODE } from "./ads-config.js";

export type AdReason = "attempt" | "continue" | "double";

const isNative = (): boolean =>
  !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

let busy = false;
let consentOk = false;
let privacyOptionsRequired = false;
let initPromise: Promise<void> | null = null;

/** Muss der Spieler in den Einstellungen die Werbe-Datenschutzoptionen erreichen können? */
export function adsPrivacyOptionsRequired(): boolean {
  return privacyOptionsRequired;
}

/** AdMob initialisieren + Zustimmung einholen. Mehrfach aufrufbar, im Web ein No-Op. */
export function initAds(): Promise<void> {
  if (!isNative()) return Promise.resolve();
  initPromise ??= (async () => {
    try {
      const m = await import("@capacitor-community/admob");
      await m.AdMob.initialize({ initializeForTesting: ADS_TEST_MODE });
      let info = await m.AdMob.requestConsentInfo();
      if (info.status === m.AdmobConsentStatus.REQUIRED && info.isConsentFormAvailable) {
        info = await m.AdMob.showConsentForm();
      }
      consentOk = info.canRequestAds;
      // Das Plugin exportiert die Enum nicht; der Wert ist der String "REQUIRED".
      privacyOptionsRequired = String(info.privacyOptionsRequirementStatus) === "REQUIRED";
    } catch {
      consentOk = false; // ohne SDK/Zustimmung gibt's schlicht keine Werbung
    }
  })();
  return initPromise;
}

/** Datenschutzoptionen der Werbung erneut öffnen (Pflicht-Zugang in der EU). */
export async function openAdPrivacyOptions(): Promise<void> {
  if (!isNative()) return;
  try {
    const m = await import("@capacitor-community/admob");
    await m.AdMob.showPrivacyOptionsForm();
  } catch {
    /* nichts zu tun */
  }
}

async function nativeRewarded(): Promise<boolean> {
  await initAds();
  if (!consentOk) return false;
  const m = await import("@capacitor-community/admob");
  return new Promise<boolean>((resolve) => {
    let rewarded = false;
    let finished = false;
    const handles: Array<{ remove: () => Promise<void> }> = [];
    const done = (value: boolean): void => {
      if (finished) return;
      finished = true;
      for (const h of handles) void h.remove();
      resolve(value);
    };
    void (async () => {
      try {
        handles.push(await m.AdMob.addListener(m.RewardAdPluginEvents.Rewarded, () => (rewarded = true)));
        handles.push(await m.AdMob.addListener(m.RewardAdPluginEvents.Dismissed, () => done(rewarded)));
        handles.push(await m.AdMob.addListener(m.RewardAdPluginEvents.FailedToShow, () => done(false)));
        await m.AdMob.prepareRewardVideoAd({ adId: ADMOB.android.rewarded, isTesting: ADS_TEST_MODE });
        await m.AdMob.showRewardVideoAd();
      } catch {
        done(false);
      }
    })();
  });
}

const REASON_TEXT: Record<AdReason, string> = {
  attempt: "+1 attempt",
  continue: "keep playing",
  double: "double shards",
};

/** Browser-Platzhalter: klar als Test markiert, damit niemand ihn für echte Werbung hält. */
function webTestAd(reason: AdReason): Promise<boolean> {
  return new Promise((resolve) => {
    const ov = document.createElement("div");
    ov.className = "overlay show";
    ov.style.zIndex = "70";
    const card = document.createElement("div");
    card.className = "ocard";
    const h = document.createElement("h3");
    h.textContent = "📺 Test ad";
    const sub = document.createElement("p");
    sub.className = "muted";
    sub.style.cssText = "margin:0;text-align:center";
    const btns = document.createElement("div");
    btns.className = "btns";
    btns.style.flexDirection = "column";
    const claim = document.createElement("button");
    claim.className = "go big";
    claim.disabled = true;
    const close = document.createElement("button");
    close.textContent = "Close (no reward)";
    btns.append(claim, close);
    card.append(h, sub, btns);
    ov.append(card);
    document.body.append(ov);

    let left = 3;
    const tick = (): void => {
      sub.textContent = `In the app a video plays here. Reward (${REASON_TEXT[reason]}) in ${left} …`;
      claim.textContent = `Wait ${left} …`;
    };
    tick();
    const timer = window.setInterval(() => {
      left -= 1;
      if (left > 0) {
        tick();
        return;
      }
      window.clearInterval(timer);
      sub.textContent = `Reward ready: ${REASON_TEXT[reason]}.`;
      claim.textContent = "Claim reward";
      claim.disabled = false;
    }, 1000);
    const end = (value: boolean): void => {
      window.clearInterval(timer);
      ov.remove();
      resolve(value);
    };
    claim.addEventListener("click", () => end(true));
    close.addEventListener("click", () => end(false));
  });
}

/** Zeigt eine Belohnungswerbung; `true` = Belohnung verdient. Nie zwei gleichzeitig. */
export async function showRewardedAd(reason: AdReason): Promise<boolean> {
  if (busy) return false;
  busy = true;
  try {
    return isNative() ? await nativeRewarded() : await webTestAd(reason);
  } finally {
    busy = false;
  }
}
