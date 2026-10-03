/**
 * In-App-Kauf "No Ads" (Einmalkauf). Eine kleine Schicht um Google Play Billing:
 *
 *  - In der Android-App: echter Kauf über `@capgo/native-purchases`. Das Produkt
 *    `remove_ads` muss in der Play Console als EINMALIGES Produkt (nicht
 *    Abo) angelegt und aktiviert sein -- siehe art-refs/ANDROID-RELEASE.md.
 *  - Im Browser: ein TEST-Kauf (es wird nichts abgebucht), damit sich der
 *    ganze Ablauf ohne Store ausprobieren lässt.
 *
 * "No Ads" heißt hier: alle Belohnungen (zusätzlicher Versuch, Weiterspielen,
 * verdoppelte Splitter) gibt es sofort, ohne Video.
 */

export const REMOVE_ADS_PRODUCT = "remove_ads";

const isNative = (): boolean =>
  !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

/** Preis-Text für den Knopf (aus dem Store; im Browser ein Test-Preis). `null` = nicht verfügbar. */
export async function getRemoveAdsPrice(): Promise<string | null> {
  if (!isNative()) return "2.99 € (test)";
  try {
    const m = await import("@capgo/native-purchases");
    const { product } = await m.NativePurchases.getProduct({
      productIdentifier: REMOVE_ADS_PRODUCT,
      productType: m.PURCHASE_TYPE.INAPP,
    });
    return product.priceString;
  } catch {
    return null;
  }
}

/** Kauf starten; `true` nur bei erfolgreichem Kauf. */
export async function buyRemoveAds(): Promise<boolean> {
  if (!isNative()) return true; // Browser: Test-Kauf
  try {
    const m = await import("@capgo/native-purchases");
    await m.NativePurchases.purchaseProduct({
      productIdentifier: REMOVE_ADS_PRODUCT,
      productType: m.PURCHASE_TYPE.INAPP,
    });
    return true;
  } catch {
    return false; // abgebrochen, offline, Abbuchung gescheitert ...
  }
}

/** Gehört dem Spieler "No Ads" laut Google Play schon (Neuinstallation / neues Gerät)? */
export async function ownsRemoveAds(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const m = await import("@capgo/native-purchases");
    const { purchases } = await m.NativePurchases.getPurchases({ productType: m.PURCHASE_TYPE.INAPP });
    return purchases.some((p) => p.productIdentifier === REMOVE_ADS_PRODUCT);
  } catch {
    return false;
  }
}
