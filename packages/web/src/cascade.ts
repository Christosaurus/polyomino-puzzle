/**
 * Kaskade — the speed mode.
 *
 * A fixed frame starts empty. Shards ride down a conveyor on the right; you drag
 * them onto the frame to cover cells. Fill a whole row and it ignites and
 * clears, freeing space. Cover as much as you can before the clock runs out;
 * score rewards speed (a multiplier that builds while you place cleanly and
 * resets when a shard falls off the belt).
 */

import { type Rng, rngFromSeed } from "@polyomino/puzzle-core";
import {
  pickShardName,
  SHARD_NAMES,
  shardByColorIndex,
  shardColorIndex,
  shardDef,
  shardsFittingGap,
} from "./shards.js";
import { nf } from "./format.js";

export const CASCADE_ROWS = 8;
export const CASCADE_COLS = 6;
const DURATION_MS = 180_000; // 3:00 Grundzeit (Joker/Blitzstein legen noch drauf)
/** Obergrenze für die Summe ALLER Zeit-Boni einer Runde (Challenge, Kombi,
 *  Perfect/Mega-Clear, Zeitphiole) — Abschnitt 4b im Ökonomie-Konzept.
 *  Der Playtest maß Laufzeiten von 195–360s bei 180s Grundzeit, weil sich
 *  Boni unbegrenzt summierten; 90s Deckel macht maximal ~270s, Runden
 *  bleiben vorhersehbar lang statt einzelne Glückssessions ausufern zu
 *  lassen. Siehe `addExtraTime()` unten, der einzige Ort, an dem `extraMs`
 *  wächst. */
const EXTRA_MS_CAP = 90_000;
/** Weiterspielen-Angebot beim Verlust des letzten Lebens (Abschnitt 4c) —
 *  Preis steigt pro Nutzung INNERHALB derselben Runde, maximal 3x. Reines
 *  Splitter-Geschäft (siehe app.ts), nie Echtgeld-exklusiv. Der steigende
 *  Preis + die feste Obergrenze verhindern, dass eine einzelne Runde durch
 *  Dauer-Zukauf die Bestenliste sprengt. */
const CONTINUE_PRICES = [15, 30, 60] as const;
const BASE_SPAWN_MS = 2200;
const MIN_SPAWN_MS = 950;
const BELT_TRAVEL_MS_START = 16_500; // time for a shard to ride top→bottom, at run start
const BELT_TRAVEL_MS_END = 8_000; // ...and by the end of the run — the belt speeds up
export const CASCADE_LIVES = 3;
const MAX_ON_BELT = 3;
const MIN_GAP_Y = 0.36; // spacing between shards on the belt

export interface Pos {
  row: number;
  col: number;
}

export interface Shard {
  id: number;
  name: string;
  orientationIndex: number;
  /** 0 = top of belt, 1 = fallen off the bottom. */
  y: number;
}

export interface CascadeResult {
  score: number;
  cleared: number;
  covered: number;
  perfectClears: number;
  /** Wie oft die Schockwelle (2+ Reihen UND 2+ Spalten in einer Platzierung) ausgelöst hat. */
  megaClears: number;
  livesLeft: number;
  bestChain: number;
  /** Gespielte Zeit in ms — für die Plausibilitätsprüfung der Bestenliste. */
  elapsedMs: number;
  /** Nur im Level-Modus aussagekräftig — Ziel erreicht, bevor Leben/Budget alle waren. */
  won: boolean;
  /** Lichtsplitter, die diese Runde verdient hat — siehe `KONZEPT-kaskade-oekonomie.md`
   *  §1: belohnt Spielweise (Clears/Challenges/Kombis/Perfects/Ketten), nicht
   *  nur den Score, mit einem Teilnahme-Sockel und einem großzügigen, aber
   *  echten Deckel gegen Ausreißer-Runden. */
  shardsEarned: number;
  /** Wie viele Kombi-Angebote diese Runde erfüllt wurden — für die
   *  Kaskade-Erfolgsleiter (Abschnitt 5.2 im Ökonomie-Konzept). */
  combosWon: number;
}

/**
 * Ein Story-Level: dieselbe Kaskade-Mechanik, aber mit einem festen Ziel statt
 * einer Uhr. Kein Zeitdruck — der Druck kommt aus dem Scherben-Budget: ist es
 * aufgebraucht (und Band + Ablage leer), bevor `targetRows` erreicht ist, ist
 * das Level verloren, genau wie bei 0 Leben.
 */
export interface LevelConfig {
  rows: number;
  cols: number;
  /** Wie viele Scherben dieses Level insgesamt ausspuckt — kein Nachschub danach. */
  shardBudget: number;
  /** So viele Reihen müssen geräumt werden, um zu gewinnen. */
  targetRows: number;
  lives: number;
}

/**
 * A short-lived objective with a real constraint. Vier Arten, eine zufällig
 * pro Fenster — reißt der Spieler eine, kommt sofort die nächste, andere Art.
 * Belohnung: ein Leben zurück (oder Punkte, wenn schon voll) **und** Extrazeit
 * — Runden werden länger, aber nur wer die Aufgaben löst, verdient sich das.
 */
export type ChallengeKind = "straight" | "rows" | "mono" | "combo";
export interface Challenge {
  kind: ChallengeKind;
  target: number;
  progress: number;
  /** `elapsedMs()` value at which the challenge expires. */
  deadline: number;
  /** `elapsedMs()` value at which the challenge was created — für die
   *  Vorschau-Phase (siehe `challengePreviewRemainingMs`). */
  createdAt: number;
  label: string;
}
const CHALLENGE_KINDS: ReadonlyArray<{ kind: ChallengeKind; target: number; label: string }> = [
  { kind: "straight", target: 1, label: "Row of straight pieces only (2·3·4)" },
  { kind: "rows", target: 2, label: "Clear 2 rows" },
  { kind: "mono", target: 1, label: "Row in a single color" },
  { kind: "combo", target: 3, label: "Build a ×3 chain" },
];
const CHALLENGE_COOLDOWN_MIN = 12_000;
const CHALLENGE_COOLDOWN_JITTER = 8_000;
/** Wie lange ein Fenster offen ist — exportiert, damit die View den Balken
 *  (Countdown-Leiste über dem Brett) als Anteil davon füllen kann. */
export const CHALLENGE_WINDOW_MS = 22_000;
/** Wie lange die neue Aufgabe erst nur "angekündigt" wird, bevor sie normal
 *  weiterläuft — zählt vom bestehenden Fenster ab, verlängert es nicht. */
export const CHALLENGE_PREVIEW_MS = 6_000;
const CHALLENGE_FIRST_AT = 12_000;
/** Bonuszeit für eine gelöste Aufgabe — Runden werden länger, wenn man sie löst. */
const CHALLENGE_TIME_BONUS_MS = 15_000;
/** Schockwelle: 2+ Reihen UND 2+ Spalten in einer Platzierung wischen das
 *  ganze Brett leer — der große, clip-taugliche Showmoment (Christians
 *  "Bombe"-Idee). Bonus ist bewusst deutlich fetter als der normale Perfect
 *  Clear, dafür ist die Bedingung auch viel seltener/schwerer zu treffen. */
const MEGA_SCORE_BONUS = 500;
const MEGA_MULT_BOOST = 1.5;
const MEGA_TIME_BONUS_MS = 10_000;

/**
 * Lichtsplitter-Auszahlung — siehe `KONZEPT-kaskade-oekonomie.md` §1. Ersetzt
 * die alte, rein score-basierte Formel (`min(40, 5 + score/120)` in app.ts),
 * die bei Testscores von 10.000+ praktisch immer denselben Deckelbetrag
 * zahlte und Kaskade damit keine wirkliche Ausgabemöglichkeit für Splitter
 * gab. Belohnt jetzt Spielweise statt nur Score: ein Teilnahme-Sockel (nie
 * eine Nullrunde) plus ein Betrag pro Ereignis, gedeckelt gegen Ausreißer.
 */
const SHARDS_BASE = 3;
const SHARDS_PER_LINE = 0.3;
const SHARDS_PER_CHALLENGE = 4;
const SHARDS_PER_COMBO = 5;
const SHARDS_PER_CHAIN_TIER = 1;
const SHARDS_PER_PERFECT = 15;
const SHARDS_PER_MEGA = 30;
const SHARDS_ROUND_CAP = 150;

/**
 * Kombi-Angebot: eine ANDERE Art Gelegenheit als die normale Challenge, an
 * derselben Zeitschiene (`nextChallengeAt`) — mal kommt das eine, mal das
 * andere. Anders als eine Challenge startet ein Kombi-Angebot nicht von
 * selbst: der Spieler sieht Ziel-Figur + Belohnung schon VOR der Zusage und
 * muss aktiv annehmen (oder es einfach verfallen lassen = ablehnen). Erst
 * nach der Annahme zählt jede Platzierung dieser Figur aufs Ziel — und erst
 * dann bevorzugt das Band diese Figur auch spürbar (siehe `pickPlaceableName`).
 */
export type ComboReward = "time" | "heart" | "mult";
export interface ComboOffer {
  /** Welche Form gebaut werden muss — derselbe `name` wie in `shards.ts`. */
  shardName: string;
  /** Wie viele Stück dieser Form platziert werden müssen. */
  target: number;
  progress: number;
  /** Wie viele Exemplare der Zielfigur seit der Zusage schon aufs Band kamen
   *  (unabhängig davon, ob sie auch platziert wurden) — steuert die Garantie
   *  in `pickPlaceableName`: erst wenn genug Nachschub da war/ist, darf die
   *  Auswahl wieder normal laufen. Ohne das war "X Stück platzieren" nur ein
   *  Versprechen, das vom Zufall der Gewichtung abhing. */
  spawned: number;
  reward: ComboReward;
  /** Fertiger Anzeigetext für die Belohnung ("+15s", "+1 ❤", "+2.0×") —
   *  steht schon in der Anfrage, bevor der Spieler zusagt. */
  rewardLabel: string;
  /** `elapsedMs()` beim Anbieten — für den Annahme-Countdown. */
  createdAt: number;
  accepted: boolean;
  /** Nur gültig, sobald `accepted` — `elapsedMs()`-Wert, an dem die Zeit abläuft. */
  deadline: number;
  /** Nur gültig, sobald `accepted` — die volle Fensterdauer, für die Balkenanzeige. */
  windowMs: number;
  /** Wie viel Zeit das Sicherheitsnetz (Brett zu voll für die Zielfigur)
   *  bereits zusätzlich gutgeschrieben hat — gedeckelt, siehe `tick()`. Ohne
   *  Deckel könnte ein dauerhaft zu volles Brett die Deadline unbegrenzt vor
   *  sich herschieben und damit für den Rest des Laufs jede neue Challenge
   *  UND jedes neue Kombi-Angebot blockieren (beides teilt sich dieselbe
   *  Zeitschiene). Irgendwann muss das Angebot ehrlich verfallen dürfen. */
  safetyExtendedMs: number;
}
/** Anteil der Gelegenheiten, die ein Kombi-Angebot statt einer normalen
 *  Challenge sind. */
const COMBO_CHANCE = 0.35;
/** Zeit zum Annehmen, bevor ein Angebot von selbst verfällt (= ablehnen) —
 *  exportiert, damit die View den Countdown auf der Angebotskarte als Anteil
 *  davon füllen kann (siehe `comboDecisionRemainingMs`). */
export const COMBO_DECISION_MS = 8_000;
/** Obergrenze für das Deadline-Sicherheitsnetz (siehe `tick()`) — ein
 *  dauerhaft zu volles Brett darf ein Angebot eine Weile am Leben halten,
 *  aber nicht für den Rest des Laufs jede neue Challenge blockieren. */
const COMBO_SAFETY_CAP_MS = 15_000;
const COMBO_TIME_BONUS_MS = 15_000;
const COMBO_MULT_BOOST = 2;
/** Schwierigkeitsstufen — Zielanzahl kommt NICHT mehr von hier, sondern aus
 *  `comboTarget()` (hängt von der Formgröße ab), nur die Belohnung ist fix
 *  pro Stufe (leicht→schwer = mehr Zeit → Herz → Multiplikator). */
const COMBO_TIERS: ReadonlyArray<{ reward: ComboReward; rewardLabel: string }> = [
  { reward: "time", rewardLabel: "+15s" },
  { reward: "heart", rewardLabel: "+1 ❤" },
  { reward: "mult", rewardLabel: `+${COMBO_MULT_BOOST.toFixed(1)}×` },
];
/** Basis + Zeit pro gefordertem Stück für das Lösungsfenster, nachdem ein
 *  Angebot angenommen wurde — bewusst großzügig, weil jedes Stück ja nicht
 *  nur ERSCHEINEN, sondern vom Spieler auch noch erkannt, gegriffen und
 *  platziert werden muss (siehe `comboTarget` + die Nachschub-Garantie in
 *  `pickPlaceableName`). */
const COMBO_WINDOW_BASE_MS = 17_000;
const COMBO_WINDOW_PER_PIECE_MS = 8_000;
/**
 * Ziel-Stückzahl für ein Kombi-Angebot: gestaffelt nach Formgröße (2..5
 * Zellen) UND Schwierigkeitsstufe (0 = leicht/Zeit .. 2 = schwer/Mult). Eine
 * kleine, häufige Form (z. B. "duo") verlangt mehr Stück als eine seltene,
 * große Pentomino-Form — ohne diese Staffelung verlangte jede Form dieselbe
 * feste Anzahl, was ein Angebot mit einer seltenen großen Form in der
 * verfügbaren Zeit quasi unschaffbar machte.
 */
function comboTarget(size: number, tier: 0 | 1 | 2): number {
  const base = Math.max(3, 8 - size); // size 2→6, 3→5, 4→4, 5→3
  return Math.max(2, base - 1 + tier);
}
/** Größtmögliches Zeitfenster eines Kombi-Angebots (härteste Stufe, kleinste
 *  Form) — bevor eins angeboten wird, muss noch genug Rundenzeit übrig sein,
 *  es überhaupt zu Ende zu spielen. */
const COMBO_MAX_WINDOW_MS = COMBO_WINDOW_BASE_MS + comboTarget(2, 2) * COMBO_WINDOW_PER_PIECE_MS;
/** "mono" (1x1) passt überall — als Kombi-Ziel kein echter Auftrag. */
const COMBO_SHARD_POOL = SHARD_NAMES.filter((n) => n !== "mono");

export class CascadeState {
  readonly rows: number;
  readonly cols: number;
  /** 0 = empty, otherwise 1-based index into PIECE_NAMES for the colour. */
  readonly board: Int8Array;
  /** Gesetzt, wenn dies ein Story-Level ist (Budget statt Uhr) — sonst `null` = Free Play. */
  readonly level: LevelConfig | null;

  belt: Shard[] = [];
  hold: Shard | null = null;

  score = 0;
  multiplier = 1;
  cleared = 0;
  perfectClears = 0;
  /** Wie oft die Schockwelle ausgelöst hat (siehe `triggerMegaClear`). */
  megaClears = 0;
  /** Lichtsplitter-Summe für diese Runde — siehe die `SHARDS_*`-Konstanten
   *  oben, ausgezahlt am Rundenende über `result().shardsEarned`. */
  private shardsEarned = 0;
  misses = 0;
  /** A shard reaching the bottom unplaced costs one of these; hit 0 and the run ends. */
  lives: number;
  /** Aufeinanderfolgende Platzierungen, die je mindestens eine Reihe räumen —
   *  reißt bei einer Platzierung ohne Clear oder einem verpassten Splitter. */
  chain = 0;
  bestChain = 0;
  /** Row indices cleared by the most recent `place()` — for the view's flash. */
  lastCleared: number[] = [];
  /** Column indices cleared by the most recent `place()` — vertikale Reihen. */
  lastClearedCols: number[] = [];
  /** Score before the most recent clear-causing placement — for the view's "+N" pop. */
  private clearScoreBase = 0;
  private freshClear = false;
  /** Nur Level-Modus: wie viele neue Leerzeilen beim letzten Kollaps oben
   *  entstanden sind — die View animiert damit das Zusammenrutschen. */
  private collapsedRows = 0;
  /**
   * Nur Level-Modus: wie viele Reihen von oben schon dauerhaft weg sind. Das
   * Spielfeld selbst wird kleiner, nicht nur sein Inhalt — Reihen `< shrunkRows`
   * gehören nicht mehr zum Brett (dort liegt jetzt der Schutt der Szene) und
   * können nie wieder bebaut werden. Steigt nur, geht nie zurück.
   */
  shrunkRows = 0;
  /** Höchste bereits gefeierte Multiplikator-Stufe (abgerundet). */
  private multTierSeen = 1;
  private tierUp = 0;
  private perfectFlag = false;
  private megaFlag = false;
  /** Snapshot der Zellen, die die Schockwelle gerade weggewischt hat (Position +
   *  Farbe) — für die View, die daraus die Wegflieg-Funken baut, bevor die
   *  Zellen selbst schon längst wieder 0 sind. */
  private megaCells: Array<{ row: number; col: number; colorIndex: number }> = [];
  /** Snapshot der Zellen aus einem normalen Reihen-/Spalten-Clear (Position +
   *  Farbe), fürs Wegflieg-Funken der View (Abschnitt 6 im Ökonomie-Konzept —
   *  dieselbe Idee wie `megaCells`, nur für den häufigen Fall statt den
   *  seltenen Mega-Clear). Vor dem Leeren der Zellen befüllt, siehe
   *  `clearFullRows()`. */
  private clearedCells: Array<{ row: number; col: number; colorIndex: number }> = [];

  /** The rows/cols cleared by the last placement, once — for the view's burst/flash/pop. */
  consumeFreshClear(): {
    rows: number[];
    cols: number[];
    gain: number;
    chain: number;
    collapsedRows: number;
    cells: Array<{ row: number; col: number; colorIndex: number }>;
  } | null {
    if (!this.freshClear) return null;
    this.freshClear = false;
    const collapsedRows = this.collapsedRows;
    this.collapsedRows = 0;
    return {
      rows: [...this.lastCleared],
      cols: [...this.lastClearedCols],
      gain: Math.round(this.score - this.clearScoreBase),
      chain: this.chain,
      collapsedRows,
      cells: [...this.clearedCells],
    };
  }
  /** Neue Multiplikator-Stufe (2..6), einmalig — oder `null`. Für Screen-Shake + Fanfare. */
  consumeTierUp(): number | null {
    if (!this.tierUp) return null;
    const t = this.tierUp;
    this.tierUp = 0;
    return t;
  }
  /** Einmalig `true`, direkt nachdem das Brett komplett leer geworden ist — der
   *  „alle Scherben weg"-Bonus (siehe `place()`). Für eine eigene Feier in der View. */
  consumePerfectClear(): boolean {
    const v = this.perfectFlag;
    this.perfectFlag = false;
    return v;
  }
  /** Einmalig die weggewischten Zellen, direkt nach einer Schockwelle — `null`
   *  sonst. Für die "alles fliegt weg"-Feier in der View. */
  consumeMegaClear(): { cells: Array<{ row: number; col: number; colorIndex: number }> } | null {
    if (!this.megaFlag) return null;
    this.megaFlag = false;
    const cells = this.megaCells;
    this.megaCells = [];
    return { cells };
  }
  /** The active mini-challenge, if any — cleared automatically on success or timeout. */
  challenge: Challenge | null = null;
  /** Aktuelles Kombi-Angebot — erst nur eine Anfrage (`accepted: false`),
   *  nach Zusage ein laufendes Ziel wie eine Challenge. */
  comboOffer: ComboOffer | null = null;

  private rng: Rng;
  private nextId = 1;
  private spawnCount = 0;
  private started: number | null = null;
  private extraMs = 0;
  private spawnTimer = 0;
  private spawnInterval = BASE_SPAWN_MS;
  private endedAt: number | null = null;
  private pausedAt: number | null = null;
  private pausedTotal = 0;
  private nextChallengeAt = CHALLENGE_FIRST_AT;
  private challengeWon = false;
  /** True once, wenn die gerade gewonnene Aufgabe ein Herz gebracht hat (statt Punkte). */
  private challengeWonHeart = false;
  private comboWon = false;
  private comboWonHeart = false;
  private comboWonLabel = "";
  /** Wie viele Kombi-Angebote diese Runde erfüllt wurden — siehe `result()`. */
  private combosWon = 0;
  /** Wie oft in dieser Runde schon "Weiterspielen" gekauft wurde — steuert
   *  Preis + Obergrenze, siehe CONTINUE_PRICES und `nextContinuePrice()`. */
  private continuesUsed = 0;
  /** True genau in dem Fenster zwischen "letztes Leben verloren" und der
   *  Kauf-/Ablehn-Entscheidung — friert die Runde ein (siehe `tick()`,
   *  `freezeForContinue()`), ohne die normale Pause-Budget-Uhr zu belasten. */
  private awaitingContinue = false;
  private continueFreezeStart: number | null = null;
  private continueFreezeTotal = 0;

  constructor(seed: string, level: LevelConfig | null = null) {
    this.rng = rngFromSeed(seed);
    this.level = level;
    this.rows = level?.rows ?? CASCADE_ROWS;
    this.cols = level?.cols ?? CASCADE_COLS;
    this.board = new Int8Array(this.rows * this.cols);
    this.lives = level?.lives ?? CASCADE_LIVES;
    this.belt.push(this.makeShard(0.72), this.makeShard(0.38), this.makeShard(0.04));
  }

  private makeShard(y: number): Shard {
    this.spawnCount += 1;
    const name = this.pickPlaceableName();
    return { id: this.nextId++, name, orientationIndex: 0, y };
  }

  /**
   * Gewichtet nach Crowding (siehe `pickShardName`) — garantiert aber danach,
   * dass mindestens eine Scherbe im Spiel (Band + Ablage + die neue) auch
   * wirklich irgendwo hinpasst. Ohne diese Garantie kann ein enges Brett
   * softlocken: alle sichtbaren Scherben passen nirgends mehr, und der Lauf
   * ist praktisch vorbei, obwohl noch Leben übrig sind. Andere Scherben, die
   * gerade nirgends passen, dürfen trotzdem weiter auftauchen — nur *irgendeine*
   * muss immer gehen.
   */
  private pickPlaceableName(): string {
    const crowdedFrac = this.coveredCells() / (this.rows * this.cols);
    // Läuft gerade die "nur gerade Linien"-Aufgabe, sollen spürbar öfter
    // gerade Steine kommen — sonst ist die Aufgabe oft gar nicht lösbar,
    // bevor das Zeitfenster zu ist. Nicht ausschließlich, sonst wäre es
    // trivial statt einer echten Aufgabe.
    const favorStraight = this.challenge?.kind === "straight";
    // Angenommenes Kombi-Angebot: die Zielfigur muss zuverlässig auftauchen,
    // sonst ist die Zusage ein leeres Versprechen.
    const offer = this.comboOffer;
    const favorName = offer?.accepted ? offer.shardName : undefined;
    // Solange noch nicht genug Nachschub der Zielfigur erzeugt wurde, MUSS sie
    // irgendwann erzwungen werden — eine Gewichtung allein kann bei Pech ganz
    // ausbleiben. Aber nicht bei JEDER Gelegenheit erzwingen: das machte das
    // Band für die Dauer eines Angebots zu einer Reihe identischer Teile
    // (z. B. sechs Duos hintereinander) und nahm dem Kombi jede Spannung,
    // weil die Zielquote dadurch faktisch 100 % wurde. Stattdessen nur mit
    // 40 % Chance erzwingen — genug Nachschub kommt trotzdem durch, nur
    // gestreckt über mehr, gemischtere Spawns — UND garantiert erzwingen,
    // sobald die Restzeit knapp wird (weniger als 4s pro noch offenem
    // Stück übrig), als Aufhol-Garantie, damit "muss in der Zeit erscheinen"
    // trotzdem verlässlich stimmt.
    if (favorName && offer && offer.spawned < offer.target && this.canPlaceAnywhere(favorName)) {
      const remainingNeeded = offer.target - offer.spawned;
      const mustCatchUp = this.elapsedMs() >= offer.deadline - remainingNeeded * 4_000;
      if (mustCatchUp || this.rng.next() < 0.4) {
        offer.spawned += 1;
        return favorName;
      }
    }
    // Steht ein Ultra-Clear kurz bevor (mehrere Reihen/Spalten brauchen
    // zusammen nur noch eine Handvoll Zellen), kommt mit erhöhter statt
    // garantierter Chance ein Teil, das genau in die Lücke passt — der
    // Spieler merkt nur, dass gerade das Richtige dabei ist, nicht dass
    // nachgeholfen wurde. Ob er es auch richtig einsetzt, bleibt ihm überlassen.
    const gap = this.findClearGap();
    let name: string;
    if (gap && this.rng.next() < 0.65) {
      const fitting = shardsFittingGap(gap);
      if (fitting.length) {
        // passt die gesuchte Kombi-Figur zufällig auch in diese Lücke, nimm
        // die — sonst bleibt's bei der zufälligen Passform wie bisher.
        name =
          favorName && fitting.includes(favorName)
            ? favorName
            : fitting[Math.floor(this.rng.next() * fitting.length)]!;
      } else {
        name = pickShardName(this.rng, crowdedFrac, favorStraight, favorName);
      }
    } else {
      name = pickShardName(this.rng, crowdedFrac, favorStraight, favorName);
    }
    const others = this.hold ? [...this.belt, this.hold] : this.belt;
    const somethingFits = this.canPlaceAnywhere(name) || others.some((s) => this.canPlaceAnywhere(s.name));
    // "mono" (1x1) passt in jede einzelne freie Zelle — der einzig echte
    // Notausgang, solange das Brett nicht buchstäblich zu 100% voll ist.
    return somethingFits ? name : "mono";
  }

  /**
   * Sucht eine kleine, verstreute Lücke, deren Füllung mehrere Reihen/Spalten
   * *gleichzeitig* räumen würde ("Ultra Clear") — dafür müssen mindestens
   * zwei Reihen/Spalten schon fast voll sein (höchstens `NEAR` leere Zellen,
   * die Größe unserer größten Alltagsteile) und die Gesamtlücke darf nicht
   * größer sein, als sich mit ~3 Teilen realistisch noch füllen lässt.
   * `null`, wenn gerade keine solche Gelegenheit ansteht.
   */
  private findClearGap(): Array<[number, number]> | null {
    const NEAR = 4;
    const GAP_BUDGET = 10;
    const nearLines: Array<Array<[number, number]>> = [];
    for (let r = this.shrunkRows; r < this.rows; r++) {
      const empties: Array<[number, number]> = [];
      for (let c = 0; c < this.cols; c++) if (!this.board[this.idx(r, c)]) empties.push([r, c]);
      if (empties.length > 0 && empties.length <= NEAR) nearLines.push(empties);
    }
    // Spalten räumen nur im Free Play (siehe clearFullRows) — die Erleichterung
    // muss derselben Regel folgen wie das echte Clearing.
    if (!this.level) {
      for (let c = 0; c < this.cols; c++) {
        const empties: Array<[number, number]> = [];
        for (let r = 0; r < this.rows; r++) if (!this.board[this.idx(r, c)]) empties.push([r, c]);
        if (empties.length > 0 && empties.length <= NEAR) nearLines.push(empties);
      }
    }
    if (nearLines.length < 2) return null;
    const gapMap = new Map<string, [number, number]>();
    for (const line of nearLines) for (const cell of line) gapMap.set(`${cell[0]},${cell[1]}`, cell);
    const gap = [...gapMap.values()];
    return gap.length <= GAP_BUDGET ? gap : null;
  }

  /** Passt diese Scherbe in irgendeiner Drehung irgendwo aufs aktuelle Brett? */
  private canPlaceAnywhere(name: string): boolean {
    const probe: Shard = { id: -1, name, orientationIndex: 0, y: 0 };
    const oCount = this.orientationCount(name);
    for (let oi = 0; oi < oCount; oi++) {
      probe.orientationIndex = oi;
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.canPlace(probe, { row: r, col: c })) return true;
        }
      }
    }
    return false;
  }

  /** Wie viele Scherben dieses Level noch ausspuckt — `Infinity` im Free Play. */
  get shardsLeft(): number {
    return this.level ? Math.max(0, this.level.shardBudget - this.spawnCount) : Infinity;
  }
  /** Nur im Level-Modus aussagekräftig: Ziel schon erreicht? */
  get won(): boolean {
    return this.level !== null && this.cleared >= this.level.targetRows;
  }

  /** Belt speed ramps up over the run — a run gets visibly faster near the end.
   *  Im Level-Modus gibt's keine Uhr, gegen die man ramped — konstantes Tempo. */
  private travelMs(): number {
    if (this.level) return BELT_TRAVEL_MS_START;
    const t = this.started === null ? 0 : Math.min(1, this.elapsedMs() / DURATION_MS);
    return BELT_TRAVEL_MS_START + (BELT_TRAVEL_MS_END - BELT_TRAVEL_MS_START) * t;
  }

  start(): void {
    if (this.started === null) this.started = performance.now();
  }
  get isStarted(): boolean {
    return this.started !== null;
  }
  get isPaused(): boolean {
    return this.pausedAt !== null;
  }
  /** Wie viel Pausenzeit pro Lauf von der Uhr abgezogen wird, bevor sie
   *  wieder ganz normal mitzählt — kurze Pausen (Anruf, Unterbrechung) sind
   *  gratis, danach nicht mehr. Ohne Deckel wäre Pause unbegrenztes Gratis-
   *  Nachdenken in einem Score-Attack-Modus mit Bestenliste: `elapsedMs()`
   *  (== `runMs` an den Server) bliebe beliebig lange künstlich niedrig,
   *  während echte Zeit vergeht — dieselbe Regel wie im Story-Modus
   *  (`game.ts`), nur bisher hier gefehlt. */
  private static readonly PAUSE_BUDGET_MS = 40_000;
  pause(): void {
    if (this.pausedAt === null && this.started !== null && this.endedAt === null) {
      this.pausedAt = performance.now();
    }
  }
  resume(): void {
    if (this.pausedAt !== null) {
      const room = Math.max(0, CascadeState.PAUSE_BUDGET_MS - this.pausedTotal);
      this.pausedTotal += Math.min(performance.now() - this.pausedAt, room);
      this.pausedAt = null;
    }
  }
  elapsedMs(): number {
    if (this.started === null) return 0;
    const end = this.endedAt ?? this.pausedAt ?? this.continueFreezeStart ?? performance.now();
    return end - this.started - this.pausedTotal - this.continueFreezeTotal;
  }
  /** Im Level-Modus bedeutungslos (keine Uhr) — `Infinity`, statt eine falsche
   *  Zahl runterzuzählen, gegen die niemand spielt. */
  remainingMs(): number {
    if (this.level) return Infinity;
    return Math.max(0, DURATION_MS + this.extraMs - this.elapsedMs());
  }
  /** Einziger Ort, an dem `extraMs` wächst — deckelt die Summe aller
   *  Zeit-Boni einer Runde bei EXTRA_MS_CAP (Abschnitt 4b). */
  private addExtraTime(ms: number): void {
    this.extraMs = Math.min(EXTRA_MS_CAP, this.extraMs + ms);
  }
  /** Friert Uhr/Multiplikator-Zerfall für das Weiterspielen-Angebot ein —
   *  bewusst NICHT über `pause()`/`resume()`, die haben ein knappes
   *  Budget gegen Pause-Missbrauch (Playtest-Exploit E2); dieses Fenster
   *  öffnet das Spiel selbst, nicht der Spieler, und darf das Budget nicht
   *  auffressen, sonst könnte ein spätes Weiterspielen-Angebot mitten in der
   *  Kaufentscheidung plötzlich wieder die Uhr laufen lassen. */
  private freezeForContinue(): void {
    if (this.continueFreezeStart === null && this.started !== null && this.endedAt === null) {
      this.continueFreezeStart = performance.now();
    }
  }
  private unfreezeForContinue(): void {
    if (this.continueFreezeStart !== null) {
      this.continueFreezeTotal += performance.now() - this.continueFreezeStart;
      this.continueFreezeStart = null;
    }
  }
  /** Preis für die nächste Weiterspielen-Nutzung in dieser Runde, oder
   *  `null` sobald das Limit (3x) erreicht ist. Reiner Lesezugriff — der
   *  eigentliche Kauf läuft über `acceptContinue()`, hier wird nichts
   *  verändert. */
  nextContinuePrice(): number | null {
    return this.continuesUsed < CONTINUE_PRICES.length ? CONTINUE_PRICES[this.continuesUsed]! : null;
  }
  /** True genau während das Weiterspielen-Angebot auf eine Entscheidung
   *  wartet (siehe `tick()`) — steuert den Kauf-Dialog in der App. */
  get awaitingContinueOffer(): boolean {
    return this.awaitingContinue;
  }
  /** App.ts hat den Preis schon geprüft und bezahlt — ein Leben zurück,
   *  Runde läuft normal weiter. */
  acceptContinue(): void {
    if (!this.awaitingContinue) return;
    this.lives = 1;
    this.continuesUsed += 1;
    this.awaitingContinue = false;
    this.unfreezeForContinue();
  }
  /** Abgelehnt oder kein Geld — Runde endet normal, `lives` bleibt bei 0
   *  und `isOver` greift im nächsten Frame wie gehabt. */
  declineContinue(): void {
    if (!this.awaitingContinue) return;
    this.awaitingContinue = false;
    this.unfreezeForContinue();
  }
  get isOver(): boolean {
    if (!this.isStarted) return false;
    if (this.awaitingContinue) return false; // eingefroren, wartet auf Kauf/Ablehnung
    if (this.lives <= 0) return true;
    if (this.level) {
      // gewonnen, oder aus Scherben (Band + Ablage leer, kein Nachschub mehr) —
      // beides beendet den Lauf, ohne dass eine Uhr mitspielt
      if (this.won) return true;
      return this.shardsLeft <= 0 && this.belt.length === 0 && !this.hold;
    }
    return this.remainingMs() <= 0;
  }
  finish(): void {
    if (this.endedAt === null) this.endedAt = performance.now();
  }

  result(): CascadeResult {
    return {
      score: Math.round(this.score),
      cleared: this.cleared,
      covered: this.coveredCells(),
      perfectClears: this.perfectClears,
      megaClears: this.megaClears,
      livesLeft: this.lives,
      bestChain: this.bestChain,
      elapsedMs: Math.round(this.elapsedMs()),
      won: this.won,
      // Teilnahme-Sockel + gesammelte Ereignis-Beträge, gedeckelt gegen
      // Ausreißer-Runden (siehe SHARDS_*-Konstanten oben).
      shardsEarned: Math.round(Math.min(SHARDS_ROUND_CAP, SHARDS_BASE + this.shardsEarned)),
      combosWon: this.combosWon,
    };
  }

  // ── Belt ─────────────────────────────────────────────────────────────────
  /** Advance the belt; drop shards that reach the bottom. */
  tick(dt: number): void {
    if (!this.isStarted || this.isOver || this.isPaused || this.awaitingContinue) return;
    const speed = dt / (this.travelMs() / 1000);
    for (const s of this.belt) s.y += speed;

    // passive ramp: spawns come a little faster the longer the run goes — nur
    // im Free Play, ein Level soll sein eigenes, vorhersagbares Tempo halten
    if (!this.level) this.spawnInterval = Math.max(MIN_SPAWN_MS, this.spawnInterval - dt * 13);

    const fell = this.belt.filter((s) => s.y >= 1);
    if (fell.length > 0) {
      this.belt = this.belt.filter((s) => s.y < 1);
      this.misses += fell.length;
      this.multiplier = 1;
      this.chain = 0;
      this.multTierSeen = 1;
      // the whole point now: every shard on the belt is meant to get used —
      // let one ride off unplaced and it costs a life, same as failing a move
      const newLives = Math.max(0, this.lives - fell.length);
      if (newLives <= 0 && this.lives > 0 && !this.level && this.nextContinuePrice() !== null) {
        // letztes Leben verloren, NICHT weil die Uhr regulär abgelaufen ist
        // (das bleibt ein sauberes Ende) -- Weiterspielen-Angebot statt
        // sofortigem Rundenende, Abschnitt 4c im Ökonomie-Konzept. Limit
        // erreicht? Dann normal durchfallen wie bisher.
        this.lives = 0;
        this.awaitingContinue = true;
        this.freezeForContinue();
      } else {
        this.lives = newLives;
      }
      this.spawnInterval = Math.max(MIN_SPAWN_MS, this.spawnInterval * 0.97);
      // Sicherheitsnetz: fiel gerade die letzte Scherbe vom Band, die irgendwo
      // gepasst hätte, sofort nachlegen — sonst könnte genau in diesem Fenster
      // niemand mehr ziehen, bis der nächste planmäßige Spawn kommt.
      // `makeShard()` garantiert selbst, dass die neue Scherbe passt.
      if (this.belt.length < MAX_ON_BELT && this.shardsLeft > 0) {
        const others = this.hold ? [...this.belt, this.hold] : this.belt;
        if (!others.some((s) => this.canPlaceAnywhere(s.name))) {
          this.belt.push(this.makeShard(0));
          this.spawnTimer = 0;
        }
      }
    }

    // gentle multiplier decay while idle
    this.multiplier = Math.max(1, this.multiplier - dt * 0.12);

    this.spawnTimer += dt * 1000;
    const topGap = this.belt.length === 0 ? 1 : Math.min(...this.belt.map((s) => s.y));
    if (
      this.spawnTimer >= this.spawnInterval &&
      this.belt.length < MAX_ON_BELT &&
      topGap >= MIN_GAP_Y &&
      this.shardsLeft > 0 // Level: kein Nachschub mehr, wenn das Budget aufgebraucht ist
    ) {
      this.spawnTimer = 0;
      this.belt.push(this.makeShard(0));
    }

    // objective: a short window to pull off a constrained clear for a life back
    // — nur im Free Play; ein Level hat schon sein eigenes Ziel, keine Zeit-Boni
    if (this.level) return;
    if (this.challenge) {
      if (this.elapsedMs() >= this.challenge.deadline) {
        this.challenge = null;
        this.nextChallengeAt = this.elapsedMs() + this.nextChallengeCooldown();
      }
    } else if (this.comboOffer) {
      if (!this.comboOffer.accepted) {
        // Angebot nicht innerhalb der Bedenkzeit angetippt → gilt als abgelehnt
        if (this.elapsedMs() - this.comboOffer.createdAt >= COMBO_DECISION_MS) this.declineCombo();
      } else {
        const c = this.comboOffer;
        // Sicherheitsnetz: ist das Brett gerade so voll, dass die Zielfigur
        // NIRGENDS hinpasst, kann `pickPlaceableName` sie auch nicht
        // nachliefern (sonst käme eine unplatzierbare Scherbe aufs Band) —
        // die Garantie stünde dann nur auf dem Papier. Statt die Uhr in so
        // einem Moment einfach weiterlaufen zu lassen, wird das Fenster in
        // kleinen Schritten geschoben, bis entweder genug Nachschub kam
        // (`spawned >= target`), wieder Platz für die Figur ist, oder der
        // Deckel erreicht ist — ohne Deckel könnte ein dauerhaft zu volles
        // Brett das Angebot endlos am Leben halten und damit (`challenge`/
        // `comboOffer` teilen sich dieselbe Zeitschiene) für den Rest des
        // Laufs jede neue Challenge mit blockieren.
        if (
          c.spawned < c.target &&
          c.safetyExtendedMs < COMBO_SAFETY_CAP_MS &&
          this.elapsedMs() >= c.deadline - 3_000 &&
          !this.canPlaceAnywhere(c.shardName)
        ) {
          c.deadline += 3_000;
          c.windowMs += 3_000;
          c.safetyExtendedMs += 3_000;
        }
        if (this.elapsedMs() >= c.deadline) {
          this.comboOffer = null;
          this.nextChallengeAt = this.elapsedMs() + this.nextChallengeCooldown();
        }
      }
    } else if (this.elapsedMs() >= this.nextChallengeAt && this.remainingMs() > CHALLENGE_WINDOW_MS + 5000) {
      const wantsCombo =
        this.rng.next() < COMBO_CHANCE && this.remainingMs() > COMBO_MAX_WINDOW_MS + 5000;
      const combo = wantsCombo ? this.buildComboOffer() : null;
      if (combo) {
        this.comboOffer = combo;
      } else {
        const pick = CHALLENGE_KINDS[Math.floor(this.rng.next() * CHALLENGE_KINDS.length)]!;
        this.challenge = {
          kind: pick.kind,
          target: pick.target,
          progress: 0,
          deadline: this.elapsedMs() + CHALLENGE_WINDOW_MS,
          createdAt: this.elapsedMs(),
          label: pick.label,
        };
      }
    }
  }

  /** Pause zwischen zwei Gelegenheiten (Challenge oder Kombi-Angebot) — schrumpft
   *  Richtung Rundenende spürbar, damit gerade dort mehr Chancen auf Bonuszeit
   *  kommen und Spieler eher noch "eine Runde länger" dranbleiben. */
  private nextChallengeCooldown(): number {
    const t = this.level ? 0 : Math.min(1, this.elapsedMs() / DURATION_MS);
    const min = Math.max(4_000, CHALLENGE_COOLDOWN_MIN - t * 6_000); // 12s → 6s
    const jitter = Math.max(2_000, CHALLENGE_COOLDOWN_JITTER - t * 4_000); // 8s → 4s
    return min + this.rng.next() * jitter;
  }

  /** Wählt Schwierigkeitsstufe + Zielfigur für ein neues Kombi-Angebot — `null`,
   *  wenn gerade keine der in Frage kommenden Formen überhaupt irgendwo aufs
   *  Brett passt (dann bietet der Aufrufer stattdessen eine normale Challenge an). */
  private buildComboOffer(): ComboOffer | null {
    const tierIndex = Math.floor(this.rng.next() * COMBO_TIERS.length) as 0 | 1 | 2;
    const tier = COMBO_TIERS[tierIndex]!;
    const pool = COMBO_SHARD_POOL.filter((n) => this.canPlaceAnywhere(n));
    if (pool.length === 0) return null;
    const shardName = pool[Math.floor(this.rng.next() * pool.length)]!;
    return {
      shardName,
      target: comboTarget(shardDef(shardName).size, tierIndex),
      progress: 0,
      spawned: 0,
      reward: tier.reward,
      rewardLabel: tier.rewardLabel,
      createdAt: this.elapsedMs(),
      accepted: false,
      deadline: 0,
      windowMs: 0,
      safetyExtendedMs: 0,
    };
  }

  /** >0, solange die aktuelle Aufgabe noch in der Ankündigungs-Phase steckt —
   *  zählt vom bestehenden Lösungsfenster ab, verlängert es nicht. */
  challengePreviewRemainingMs(): number {
    return this.challenge
      ? Math.max(0, this.challenge.createdAt + CHALLENGE_PREVIEW_MS - this.elapsedMs())
      : 0;
  }

  challengeRemainingMs(): number {
    return this.challenge ? Math.max(0, this.challenge.deadline - this.elapsedMs()) : 0;
  }
  /** True once, right after a challenge is won — consume it to trigger a celebration. */
  consumeChallengeWin(): boolean {
    const v = this.challengeWon;
    this.challengeWon = false;
    return v;
  }
  /** True once, direkt nach einem Aufgaben-Sieg, der ein Herz gebracht hat —
   *  eigenes Flag, damit die View nur dann die große Herz-Feier zeigt. */
  consumeChallengeHeart(): boolean {
    const v = this.challengeWonHeart;
    this.challengeWonHeart = false;
    return v;
  }

  /** >0, solange ein Kombi-Angebot noch unbeantwortet auf dem Tisch liegt —
   *  für den Countdown auf der Angebots-Karte. */
  comboDecisionRemainingMs(): number {
    return this.comboOffer && !this.comboOffer.accepted
      ? Math.max(0, this.comboOffer.createdAt + COMBO_DECISION_MS - this.elapsedMs())
      : 0;
  }
  comboRemainingMs(): number {
    return this.comboOffer?.accepted
      ? Math.max(0, this.comboOffer.deadline - this.elapsedMs())
      : 0;
  }
  /** Angebot annehmen — ab jetzt zählt jede passende Platzierung, und das Band
   *  liefert die Zielfigur garantiert nach (siehe `pickPlaceableName`). */
  acceptCombo(): void {
    const c = this.comboOffer;
    if (!c || c.accepted) return;
    c.accepted = true;
    c.windowMs = COMBO_WINDOW_BASE_MS + c.target * COMBO_WINDOW_PER_PIECE_MS;
    c.deadline = this.elapsedMs() + c.windowMs;
  }
  /** Angebot ablehnen — sofort weg, normale Gelegenheiten-Pause startet neu. */
  declineCombo(): void {
    if (!this.comboOffer || this.comboOffer.accepted) return;
    this.comboOffer = null;
    this.nextChallengeAt = this.elapsedMs() + this.nextChallengeCooldown();
  }
  /** True once, right after an accepted combo is completed — consume it for
   *  the celebration; `rewardLabel` matches what was already shown at the offer. */
  consumeComboWin(): { heart: boolean; rewardLabel: string } | null {
    if (!this.comboWon) return null;
    this.comboWon = false;
    return { heart: this.comboWonHeart, rewardLabel: this.comboWonLabel };
  }

  private applyComboReward(offer: ComboOffer): void {
    this.comboWonHeart = false;
    // `comboWonLabel` zeigt IMMER, was tatsächlich passiert ist, nie einfach
    // das an der Angebotskarte versprochene `rewardLabel` — bei vollen Leben
    // gibt's für eine "heart"-Belohnung Punkte statt eines Herzens, aber die
    // Feier zeigte bisher trotzdem "+1 ❤" an, obwohl kein Herz dazukam.
    if (offer.reward === "time") {
      this.addExtraTime(COMBO_TIME_BONUS_MS);
      this.comboWonLabel = offer.rewardLabel;
    } else if (offer.reward === "heart") {
      if (this.lives < CASCADE_LIVES) {
        this.lives += 1;
        this.comboWonHeart = true;
        this.comboWonLabel = offer.rewardLabel;
      } else {
        const bonus = 250 * this.multiplier;
        this.score += bonus;
        this.comboWonLabel = `+${nf(bonus)}`;
      }
    } else {
      this.multiplier = Math.min(6, this.multiplier + COMBO_MULT_BOOST);
      this.comboWonLabel = offer.rewardLabel;
    }
    this.comboWon = true;
  }

  /** Wischt das GESAMTE Brett leer (nicht nur die gerade vollen Reihen/Spalten)
   *  und zündet den großen Bonus — ausgelöst, sobald eine einzelne Platzierung
   *  2+ Reihen UND 2+ Spalten gleichzeitig räumt. Merkt sich Position + Farbe
   *  jeder weggewischten Zelle für die "alles fliegt weg"-Funken in der View. */
  private triggerMegaClear(): void {
    const cells: Array<{ row: number; col: number; colorIndex: number }> = [];
    for (let r = this.shrunkRows; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const v = this.board[this.idx(r, c)] ?? 0;
        if (v !== 0) {
          cells.push({ row: r, col: c, colorIndex: v });
          this.board[this.idx(r, c)] = 0;
        }
      }
    }
    this.megaCells = cells;
    this.megaClears += 1;
    this.score += MEGA_SCORE_BONUS * this.multiplier;
    this.multiplier = Math.min(6, this.multiplier + MEGA_MULT_BOOST);
    // Zeitbonus nur im Free Play — im Level-Modus läuft keine Uhr, gegen die
    // man Zeit gewinnen könnte.
    if (!this.level) this.addExtraTime(MEGA_TIME_BONUS_MS);
    this.megaFlag = true;
    this.shardsEarned += SHARDS_PER_MEGA;
  }

  cells(shard: Shard): ReadonlyArray<readonly [number, number]> {
    const o = shardDef(shard.name).orientations;
    return o[shard.orientationIndex % o.length]!;
  }
  orientationCount(name: string): number {
    return shardDef(name).orientations.length;
  }
  colorIndex(name: string): number {
    return shardColorIndex(name);
  }

  rotate(shard: Shard): void {
    shard.orientationIndex = (shard.orientationIndex + 1) % this.orientationCount(shard.name);
  }

  /**
   * Move a belt shard into the hold slot. Any shard already held goes straight
   * back onto the belt — unconditionally, no discard, no cap. You can shelter
   * exactly one shard at a time and no more; grabbing a second one puts the
   * first back in play where it can still ride off and cost a life.
   *
   * The returned shard resumes at the SAME `y` it had when it went into hold,
   * not back at the top. Resetting it to the top (the old behaviour) turned
   * hold into a free, unlimited timer reset: park whichever shard is about to
   * fall, it comes back with a full fresh trip every time — a skilled player
   * could cycle two shards forever and never lose a life. Hold now only
   * pauses a shard's clock while it's tucked away; it never rewinds it.
   */
  toHold(shard: Shard): void {
    this.belt = this.belt.filter((s) => s.id !== shard.id);
    if (this.hold) {
      this.belt.unshift(this.hold);
    }
    this.hold = shard;
  }
  takeHold(): Shard | null {
    const s = this.hold;
    this.hold = null;
    return s;
  }
  removeFromBelt(id: number): void {
    this.belt = this.belt.filter((s) => s.id !== id);
  }
  returnToBelt(shard: Shard): void {
    this.belt.push({ ...shard, y: 0 });
  }

  // ── Board ────────────────────────────────────────────────────────────────
  private idx(r: number, c: number): number {
    return r * this.cols + c;
  }
  filled(r: number, c: number): boolean {
    return r >= 0 && c >= 0 && r < this.rows && c < this.cols && this.board[this.idx(r, c)] !== 0;
  }
  canPlace(shard: Shard, pos: Pos): boolean {
    for (const [dr, dc] of this.cells(shard)) {
      const r = pos.row + dr;
      const c = pos.col + dc;
      if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return false;
      // Level-Modus: die obersten `shrunkRows` Reihen gehören nicht mehr zum
      // Brett — das Feld ist dort schon geschrumpft, das gehört jetzt dem Schutt.
      if (r < this.shrunkRows) return false;
      if (this.board[this.idx(r, c)] !== 0) return false;
    }
    return true;
  }

  /** Place a shard. Returns rows cleared, or -1 if it doesn't fit. */
  place(shard: Shard, pos: Pos): number {
    if (!this.canPlace(shard, pos)) return -1;
    const ci = this.colorIndex(shard.name);
    this.clearScoreBase = this.score;
    for (const [dr, dc] of this.cells(shard)) {
      this.board[this.idx(pos.row + dr, pos.col + dc)] = ci;
    }
    this.score += 5 * this.multiplier;
    this.multiplier = Math.min(6, this.multiplier + 0.25);

    const { rows, cols } = this.clearFullRows();
    const lines = rows + cols;
    if (lines > 0) {
      this.cleared += lines;
      // Gleiche Multi-Clear-Kurve wie bisher (quadratisch über alle Linien),
      // plus ein Bonus pro Spalte — vertikale Reihen sind seltener zu bauen
      // und sollen sich sichtbar mehr lohnen.
      this.score += (12 * lines * lines + 10 * cols) * this.multiplier;
      this.multiplier = Math.min(6, this.multiplier + 0.4 * lines);
      this.freshClear = true;
      this.chain += 1;
      if (this.chain > this.bestChain) this.bestChain = this.chain;
      this.shardsEarned += lines * SHARDS_PER_LINE;
      if (this.chain >= 3) this.shardsEarned += SHARDS_PER_CHAIN_TIER;
    } else {
      this.chain = 0;
    }
    // eine neue Multiplikator-Stufe (2..6) zünden — einmalig, für Shake + Fanfare
    const tier = Math.floor(this.multiplier);
    if (tier > this.multTierSeen) {
      this.multTierSeen = tier;
      this.tierUp = tier;
    }
    // "combo"-Aufgabe: hängt an der Kette, nicht an einer einzelnen Reihe —
    // darum erst hier geprüft, nachdem this.chain aktuell ist
    if (this.challenge?.kind === "combo" && this.chain >= this.challenge.target) {
      this.creditChallenge(this.challenge.target);
    }
    // Kombi-Angebot: zählt JEDE Platzierung der Zielfigur, egal ob sie gerade
    // eine Reihe räumt — "X Stück auf dem Brett unterbringen" ist der Auftrag,
    // nicht "X Reihen räumen".
    if (this.comboOffer?.accepted && shard.name === this.comboOffer.shardName) {
      this.comboOffer.progress += 1;
      if (this.comboOffer.progress >= this.comboOffer.target) {
        this.applyComboReward(this.comboOffer);
        this.shardsEarned += SHARDS_PER_COMBO;
        this.combosWon += 1;
        this.comboOffer = null;
        this.nextChallengeAt = this.elapsedMs() + this.nextChallengeCooldown();
      }
    }
    // Schockwelle: 2+ Reihen UND 2+ Spalten in EINER Platzierung — der große,
    // clip-taugliche Showmoment. Geht dem normalen Perfect Clear vor (schließt
    // ihn ein, da danach garantiert 0 Zellen belegt sind), sonst würden beide
    // gleichzeitig feiern und doppelt Bonus geben.
    if (rows >= 2 && cols >= 2) {
      this.triggerMegaClear();
    } else if (this.coveredCells() === 0 && lines > 0) {
      // Perfekt zählt bei JEDER Kombination aus Reihen/Spalten, die das Brett
      // leer macht — vorher zählten nur Reihen, ein reiner Spalten-Clear ins
      // leere Brett (im Free Play ganz normal möglich) wurde übersehen.
      this.perfectClears += 1;
      this.score += 200 * this.multiplier;
      this.addExtraTime(5000);
      this.perfectFlag = true;
      this.shardsEarned += SHARDS_PER_PERFECT;
    }
    return rows;
  }

  /**
   * Clear every full row AND every full column — Kaskade räumt in beide
   * Richtungen. Credits the active challenge (straight/mono/rows — "rows"
   * meint wörtlich horizontale Reihen, Spalten zählen dafür nicht; "combo"
   * wird separat in `place()` geprüft, nach dem Chain-Update).
   *
   * Im Level-Modus fallen geräumte Reihen nicht einfach leer aus — der ganze
   * Rest des Turms rutscht wie bei Tetris zusammen: alles, was noch über einer
   * geräumten Reihe stand, sackt nach unten, oben wird Platz frei. Das ist die
   * "Steine rutschen nach"-Bewegung der Rettungsszene. Im Free Play bleibt das
   * alte Verhalten (Reihe wird leer, nichts rutscht) — dort ist Tempo der Kern,
   * kein Turm, der abgetragen wird. Spalten lösen in keinem Modus einen
   * Kollaps aus (die "Turm sackt"-Bewegung ist bewusst an Reihen gebunden) —
   * sie werden einfach direkt geleert, in beiden Modi gleich.
   */
  private clearFullRows(): { rows: number; cols: number } {
    this.lastCleared = [];
    this.lastClearedCols = [];
    const clearedRows = new Set<number>();
    const clearedCols = new Set<number>();

    for (let r = 0; r < this.rows; r++) {
      let full = true;
      let straightOnly = true;
      let monoOnly = true;
      let firstColor = -1;
      for (let c = 0; c < this.cols; c++) {
        const v = this.board[this.idx(r, c)];
        if (!v) {
          full = false;
          break;
        }
        if (!shardByColorIndex(v).straight) straightOnly = false;
        if (firstColor === -1) firstColor = v;
        else if (v !== firstColor) monoOnly = false;
      }
      if (full) {
        clearedRows.add(r);
        this.lastCleared.push(r);
        const kind = this.challenge?.kind;
        if (kind === "straight" && straightOnly) this.creditChallenge();
        else if (kind === "mono" && monoOnly) this.creditChallenge();
        else if (kind === "rows") this.creditChallenge();
      }
    }
    // Spalten nur im Free Play: der Level-Modus hat ein explizites Reihen-Ziel
    // (targetRows) und eine Erzählung, die an Reihen hängt (Turm-Kollaps,
    // Schutt-Füllung) — Spalten hätten dort keine passende Entsprechung.
    if (!this.level) {
      for (let c = 0; c < this.cols; c++) {
        let full = true;
        for (let r = 0; r < this.rows; r++) {
          if (!this.board[this.idx(r, c)]) {
            full = false;
            break;
          }
        }
        if (full) {
          clearedCols.add(c);
          this.lastClearedCols.push(c);
        }
      }
    }
    if (clearedRows.size === 0 && clearedCols.size === 0) return { rows: 0, cols: 0 };

    // Snapshot VOR dem Leeren -- fürs Wegflieg-Funken der View (dieselbe
    // Zelle kann sowohl in einer geräumten Reihe als auch Spalte liegen,
    // darum über ein Set dedupliziert statt doppelt aufzunehmen).
    this.clearedCells = [];
    const seen = new Set<number>();
    for (const r of clearedRows) {
      for (let c = 0; c < this.cols; c++) {
        const i = this.idx(r, c);
        if (seen.has(i)) continue;
        seen.add(i);
        this.clearedCells.push({ row: r, col: c, colorIndex: this.board[i]! });
      }
    }
    for (const c of clearedCols) {
      for (let r = 0; r < this.rows; r++) {
        const i = this.idx(r, c);
        if (seen.has(i)) continue;
        seen.add(i);
        this.clearedCells.push({ row: r, col: c, colorIndex: this.board[i]! });
      }
    }

    // Spalten zuerst direkt leeren — unabhängig vom Modus, kein Kollaps.
    for (const c of clearedCols) for (let r = 0; r < this.rows; r++) this.board[this.idx(r, c)] = 0;

    if (this.level) {
      // Kollaps: alle nicht geräumten Reihen behalten ihre Reihenfolge, rücken
      // aber ganz nach unten zusammen — oben (Reihe 0) entsteht der Freiraum.
      const kept: number[] = [];
      for (let r = 0; r < this.rows; r++) if (!clearedRows.has(r)) kept.push(r);
      const next = new Int8Array(this.rows * this.cols);
      const topGap = this.rows - kept.length;
      for (let i = 0; i < kept.length; i++) {
        const srcRow = kept[i]!;
        const dstRow = topGap + i;
        for (let c = 0; c < this.cols; c++) next[dstRow * this.cols + c] = this.board[srcRow * this.cols + c]!;
      }
      this.board.set(next);
      this.collapsedRows = topGap; // für die View: so viele neue Leerzeilen oben
      this.shrunkRows += topGap; // dauerhaft: das Feld ist jetzt insgesamt so viel kleiner
    } else {
      for (const r of clearedRows) for (let c = 0; c < this.cols; c++) this.board[this.idx(r, c)] = 0;
    }
    return { rows: this.lastCleared.length, cols: this.lastClearedCols.length };
  }

  private creditChallenge(amount = 1): void {
    const ch = this.challenge;
    if (!ch) return;
    ch.progress = Math.min(ch.target, ch.progress + amount);
    if (ch.progress < ch.target) return;
    this.completeChallenge();
  }

  /** Belohnung für eine gelöste Aufgabe: ein Leben zurück (nur wenn eins
   *  fehlt — sonst Punkte) und immer Extrazeit — so werden Runden länger,
   *  aber nur wenn man die Aufgaben tatsächlich löst. */
  private completeChallenge(): void {
    if (this.lives < CASCADE_LIVES) {
      this.lives += 1;
      this.challengeWonHeart = true;
    } else {
      this.score += 250 * this.multiplier;
    }
    this.addExtraTime(CHALLENGE_TIME_BONUS_MS);
    this.challengeWon = true;
    this.shardsEarned += SHARDS_PER_CHALLENGE;
    this.challenge = null;
    this.nextChallengeAt = this.elapsedMs() + this.nextChallengeCooldown();
  }

  coveredCells(): number {
    let n = 0;
    for (const v of this.board) if (v !== 0) n += 1;
    return n;
  }

  // ── Fähigkeiten (KONZEPT-kaskade-oekonomie.md §2) ───────────────────────
  // Reiner Effekt, kein Bestandscheck/-abbau -- das erledigt der Aufrufer
  // (app.ts) über `progress.ts`, genau wie schon bei den Kampagnen-Jokern
  // (siehe `useJoker` in app.ts): CascadeState kennt keine Währung, nur den
  // Spieleffekt.

  /** Mischen: das komplette sichtbare Band neu würfeln, ohne die Fallzeit
   *  der einzelnen Scherben zu berühren (kein verstecktes "+Zeit" obendrauf —
   *  das ist die Zeitphiole). Nutzt dieselbe Garantie wie ein normaler Spawn:
   *  jede neue Scherbe passt irgendwo (siehe `pickPlaceableName`). */
  shuffleBelt(): void {
    this.belt = this.belt.map((s) => ({ ...s, name: this.pickPlaceableName() }));
  }

  /** Klärfunke: eine einzelne Zelle sofort leeren -- das Werkzeug gegen ein
   *  zu volles Brett. Löst absichtlich KEIN Clearing/Score/Kombi-Progress
   *  aus, auch wenn die Zelle zufällig eine Reihe vervollständigen würde —
   *  das ist ein Rettungswerkzeug, kein Platzierungs-Ersatz. */
  clearCell(row: number, col: number): boolean {
    if (row < 0 || col < 0 || row >= this.rows || col >= this.cols) return false;
    if (row < this.shrunkRows) return false;
    const i = this.idx(row, col);
    if (this.board[i] === 0) return false;
    this.board[i] = 0;
    return true;
  }

  /** Klärfunke ohne manuelle Zielwahl: sucht selbst die Zelle, die am meisten
   *  hilft -- die volltseste Reihe (die einer Vervollständigung am nächsten
   *  ist), darin eine belegte Zelle. Gibt die geräumte Position zurück (für
   *  einen kurzen Blitz in der View) oder `null`, wenn das Brett schon leer ist. */
  clearMostBlockedCell(): Pos | null {
    let bestRow = -1;
    let bestFilled = -1;
    for (let r = this.shrunkRows; r < this.rows; r++) {
      let filled = 0;
      for (let c = 0; c < this.cols; c++) if (this.board[this.idx(r, c)] !== 0) filled += 1;
      if (filled > bestFilled && filled < this.cols) {
        bestFilled = filled;
        bestRow = r;
      }
    }
    if (bestRow === -1 || bestFilled <= 0) return null;
    for (let c = 0; c < this.cols; c++) {
      if (this.board[this.idx(bestRow, c)] !== 0) {
        this.board[this.idx(bestRow, c)] = 0;
        return { row: bestRow, col: c };
      }
    }
    return null;
  }

  /** Zeitphiole: sofortige, manuell ausgelöste Zeitgutschrift -- zusätzlich
   *  zu, nicht statt, den passiven Challenge-/Kombi-/Perfect-Boni. */
  addTime(ms: number): void {
    if (!this.level) this.addExtraTime(ms);
  }
}
