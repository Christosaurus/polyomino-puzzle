/**
 * Land des Spielers — für die „Mein Land"-Bestenliste. Kein Netz, keine
 * Berechtigung: erst die IANA-Zeitzone → Land, sonst die Region aus
 * `navigator.language`, sonst „XX" (taucht dann nur global auf).
 *
 * Die Zeitzonen-Tabelle deckt die bevölkerungsreichen Zonen ab; exotische
 * fallen auf die Sprach-Region zurück. Reicht für eine Casual-Bestenliste.
 */

// IANA-Zeitzone → ISO-3166-alpha-2
const TZ_COUNTRY: Record<string, string> = {
  // Europa
  "Europe/Berlin": "DE", "Europe/Vienna": "AT", "Europe/Zurich": "CH", "Europe/Busingen": "DE",
  "Europe/Amsterdam": "NL", "Europe/Brussels": "BE", "Europe/Luxembourg": "LU", "Europe/Paris": "FR",
  "Europe/Madrid": "ES", "Europe/Lisbon": "PT", "Atlantic/Madeira": "PT", "Atlantic/Azores": "PT",
  "Europe/Rome": "IT", "Europe/Vatican": "VA", "Europe/San_Marino": "SM", "Europe/Malta": "MT",
  "Europe/London": "GB", "Europe/Dublin": "IE", "Europe/Guernsey": "GG", "Europe/Jersey": "JE",
  "Europe/Isle_of_Man": "IM", "Europe/Copenhagen": "DK", "Europe/Oslo": "NO", "Europe/Stockholm": "SE",
  "Europe/Helsinki": "FI", "Europe/Mariehamn": "AX", "Europe/Reykjavik": "IS",
  "Europe/Warsaw": "PL", "Europe/Prague": "CZ", "Europe/Bratislava": "SK", "Europe/Budapest": "HU",
  "Europe/Ljubljana": "SI", "Europe/Zagreb": "HR", "Europe/Sarajevo": "BA", "Europe/Belgrade": "RS",
  "Europe/Podgorica": "ME", "Europe/Skopje": "MK", "Europe/Tirane": "AL", "Europe/Bucharest": "RO",
  "Europe/Sofia": "BG", "Europe/Athens": "GR", "Europe/Nicosia": "CY", "Asia/Nicosia": "CY",
  "Europe/Chisinau": "MD", "Europe/Kyiv": "UA", "Europe/Kiev": "UA", "Europe/Simferopol": "UA",
  "Europe/Minsk": "BY", "Europe/Riga": "LV", "Europe/Vilnius": "LT", "Europe/Tallinn": "EE",
  "Europe/Moscow": "RU", "Europe/Kaliningrad": "RU", "Europe/Samara": "RU", "Europe/Yekaterinburg": "RU",
  "Europe/Istanbul": "TR", "Europe/Tirana": "AL", "Europe/Andorra": "AD", "Europe/Monaco": "MC",
  "Europe/Gibraltar": "GI", "Europe/Vaduz": "LI",
  // Nord- & Mittelamerika
  "America/New_York": "US", "America/Detroit": "US", "America/Chicago": "US", "America/Denver": "US",
  "America/Phoenix": "US", "America/Los_Angeles": "US", "America/Anchorage": "US", "Pacific/Honolulu": "US",
  "America/Toronto": "CA", "America/Vancouver": "CA", "America/Edmonton": "CA", "America/Winnipeg": "CA",
  "America/Halifax": "CA", "America/St_Johns": "CA",
  "America/Mexico_City": "MX", "America/Tijuana": "MX", "America/Monterrey": "MX", "America/Cancun": "MX",
  "America/Guatemala": "GT", "America/El_Salvador": "SV", "America/Tegucigalpa": "HN",
  "America/Managua": "NI", "America/Costa_Rica": "CR", "America/Panama": "PA", "America/Havana": "CU",
  "America/Santo_Domingo": "DO", "America/Port-au-Prince": "HT", "America/Jamaica": "JM",
  "America/Puerto_Rico": "PR",
  // Südamerika
  "America/Sao_Paulo": "BR", "America/Bahia": "BR", "America/Fortaleza": "BR", "America/Manaus": "BR",
  "America/Recife": "BR", "America/Buenos_Aires": "AR", "America/Argentina/Buenos_Aires": "AR",
  "America/Santiago": "CL", "America/Bogota": "CO", "America/Lima": "PE", "America/Caracas": "VE",
  "America/La_Paz": "BO", "America/Asuncion": "PY", "America/Montevideo": "UY", "America/Guayaquil": "EC",
  // Asien
  "Asia/Jerusalem": "IL", "Asia/Tel_Aviv": "IL", "Asia/Beirut": "LB", "Asia/Damascus": "SY",
  "Asia/Amman": "JO", "Asia/Baghdad": "IQ", "Asia/Riyadh": "SA", "Asia/Kuwait": "KW",
  "Asia/Qatar": "QA", "Asia/Bahrain": "BH", "Asia/Dubai": "AE", "Asia/Muscat": "OM",
  "Asia/Tehran": "IR", "Asia/Karachi": "PK", "Asia/Kolkata": "IN", "Asia/Calcutta": "IN",
  "Asia/Colombo": "LK", "Asia/Dhaka": "BD", "Asia/Kathmandu": "NP", "Asia/Yangon": "MM",
  "Asia/Bangkok": "TH", "Asia/Ho_Chi_Minh": "VN", "Asia/Phnom_Penh": "KH", "Asia/Vientiane": "LA",
  "Asia/Jakarta": "ID", "Asia/Makassar": "ID", "Asia/Jayapura": "ID", "Asia/Kuala_Lumpur": "MY",
  "Asia/Singapore": "SG", "Asia/Manila": "PH", "Asia/Hong_Kong": "HK", "Asia/Macau": "MO",
  "Asia/Taipei": "TW", "Asia/Shanghai": "CN", "Asia/Urumqi": "CN", "Asia/Seoul": "KR",
  "Asia/Pyongyang": "KP", "Asia/Tokyo": "JP", "Asia/Ulaanbaatar": "MN", "Asia/Almaty": "KZ",
  "Asia/Tashkent": "UZ", "Asia/Baku": "AZ", "Asia/Yerevan": "AM", "Asia/Tbilisi": "GE",
  // Afrika
  "Africa/Cairo": "EG", "Africa/Casablanca": "MA", "Africa/Algiers": "DZ", "Africa/Tunis": "TN",
  "Africa/Tripoli": "LY", "Africa/Lagos": "NG", "Africa/Accra": "GH", "Africa/Abidjan": "CI",
  "Africa/Dakar": "SN", "Africa/Nairobi": "KE", "Africa/Dar_es_Salaam": "TZ", "Africa/Kampala": "UG",
  "Africa/Addis_Ababa": "ET", "Africa/Khartoum": "SD", "Africa/Johannesburg": "ZA",
  "Africa/Harare": "ZW", "Africa/Lusaka": "ZM", "Africa/Maputo": "MZ", "Africa/Luanda": "AO",
  "Africa/Kinshasa": "CD", "Africa/Douala": "CM",
  // Ozeanien
  "Australia/Sydney": "AU", "Australia/Melbourne": "AU", "Australia/Brisbane": "AU",
  "Australia/Perth": "AU", "Australia/Adelaide": "AU", "Australia/Hobart": "AU",
  "Pacific/Auckland": "NZ", "Pacific/Fiji": "FJ", "Pacific/Guam": "GU", "Pacific/Port_Moresby": "PG",
};

const CC_RE = /^[A-Z]{2}$/;

function fromTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return TZ_COUNTRY[tz] ?? null;
  } catch {
    return null;
  }
}

function fromLanguage(): string | null {
  try {
    for (const lang of navigator.languages ?? [navigator.language]) {
      const cc = lang?.split("-")[1]?.toUpperCase();
      if (cc && CC_RE.test(cc)) return cc;
    }
  } catch {
    /* ignore */
  }
  return null;
}

const KEY = "lumen.cc";

/** ISO-3166-alpha-2 des Spielers, oder „XX". Wird einmal ermittelt und gemerkt. */
export function detectCountry(): string {
  try {
    const cached = localStorage.getItem(KEY);
    if (cached && (CC_RE.test(cached) || cached === "XX")) return cached;
  } catch {
    /* ignore */
  }
  const cc = fromTimezone() ?? fromLanguage() ?? "XX";
  try {
    localStorage.setItem(KEY, cc);
  } catch {
    /* ignore */
  }
  return cc;
}

/** Manuelle Korrektur, falls die Erkennung daneben liegt. */
export function setCountry(cc: string): void {
  const c = cc.toUpperCase();
  if (!CC_RE.test(c) && c !== "XX") return;
  try {
    localStorage.setItem(KEY, c);
  } catch {
    /* ignore */
  }
}

/** Flaggen-Emoji aus dem Ländercode (Regional-Indicator-Symbole). */
export function flag(cc: string): string {
  if (cc === "XX" || !CC_RE.test(cc)) return "🏳";
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Landesname in der Sprache des Spielers, z. B. „Deutschland". */
export function countryName(cc: string): string {
  if (!CC_RE.test(cc)) return "Unbekannt";
  try {
    return new Intl.DisplayNames(navigator.languages?.slice() ?? ["de"], { type: "region" }).of(cc) ?? cc;
  } catch {
    return cc;
  }
}
