/**
 * Referee folklore — the shape of `src/data/referee-legends.json`.
 *
 * Written by `ml/build_referee_legends.py` from the analyses in `ml/REFEREE_PLAYER_REPORT.md`,
 * under the pre-registration in `ml/referee_player_preregistration.md`.
 *
 * **This file's whole job is to make one thing impossible: quoting an extreme pair without the
 * number chance puts beside it.** Every record here was drawn from a grid of 689 official-and-
 * player pairs, and in a grid that size somebody finishes first whether or not anything is
 * happening. So {@link NoiseFloor} is not context for the findings, it *is* one of them, and
 * {@link readNoiseFloor} exists so the page states the comparison in one voice rather than three.
 *
 * Nothing here is a fairness claim. Three officials work every game and the play-by-play never
 * records which one blew the whistle, so every figure is roughly a third of the effect it names
 * and none of it distinguishes a correct call from an incorrect one.
 */

/** A record against what the same player's other games in the same postseasons would predict. */
export interface PairRecord {
  official: string;
  player: string;
  wins: number;
  losses: number;
  /** Opponent-aware: a win model over every playoff team-game, from both sides' regular-season
   * strength and home court. Senior officials draw later rounds, and that alone would manufacture
   * losing records without this. */
  expectedWins: number;
  /**
   * **Two-sided**, from simulating the same games' independent outcomes at their modelled odds.
   *
   * Two-sided because {@link NoiseFloor.mostExtremePFromNoise} is the expected minimum of a
   * two-sided sweep, and the page's central comparison puts the two side by side. Quoting a
   * one-sided p against that floor overstates the pair by a factor of two — which this artifact
   * did until `referee-legends.test.ts` caught it.
   */
  p: number;
}

/** One of the officials' *other* pairs — carried to show the same man at both ends of the list. */
export interface OtherPair {
  player: string;
  wins: number;
  games: number;
  expectedWins: number;
  p: number;
  /** True when the player's team beat its expectation with this official rather than missing it. */
  playerWon: boolean;
}

/**
 * What a grid of this size produces when nothing is going on.
 *
 * `mostExtremePFromNoise` is the headline comparison: with N pairs, the most extreme p-value you
 * should *expect* from pure noise is about 1/N. A famous pair that barely beats that number has
 * not shown you an effect, it has shown you the maximum of a large sample.
 */
export interface NoiseFloor {
  pairsTested: number;
  minSharedGames: number;
  mostExtremePFromNoise: number;
  clearedPoint01: number;
  expectedPoint01: number;
  clearedPoint05: number;
  expectedPoint05: number;
}

/** A claim named in advance. Its p is one-sided: the pre-registration fixed the direction. */
export interface PreRegisteredClaim {
  official: string;
  player: string;
  wins: number;
  losses: number;
  expectedWins: number;
  pOneSided: number;
}

export interface RefereeLegends {
  source: string;
  generated: string;
  preRegistration: string;
  report: string;
  firstSeason: string;
  lastSeason: string;
  regularSeasonGames: number;
  playoffGames: number;
  whistleVolume: {
    leagueFoulsPerGame: number;
    lowest: number;
    highest: number;
    spreadRatio: number;
    officialsTested: number;
  };
  legend: PairRecord & {
    /** The same pair one-sided, kept for the record and never compared to the noise floor. */
    pOneSided: number;
    opponentStrengthWith: number;
    opponentStrengthWithout: number;
    /** Where this pair ranks among every pair tested. 1 is the most lopsided in the sport. */
    rank: number;
    beforeClaimWasFamous: EraRecord;
    afterClaimWasFamous: EraRecord;
    /** Below this many shared games a pair is described and never judged. */
    minGamesToJudge: number;
    /** The season by which the claim was already circulating — what makes later games a test. */
    famousBySeason: string;
  };
  sameOfficialOtherPairs: OtherPair[];
  pairNobodyNamed: { official: string; player: string; wins: number; games: number;
    expectedWins: number; p: number };
  noiseFloor: NoiseFloor;
  preRegisteredClaims: PreRegisteredClaim[];
  makeupCalls: {
    observedSwitchRate: number;
    shuffledNull: number;
    excessT: number;
    afterDefensiveFoul: number;
    afterDefensiveT: number;
    /** The discriminating figure. An offensive foul is a turnover, so possession alone predicts
     * this falls *below* chance while compensation predicts above. It falls below. */
    afterOffensiveFoul: number;
    afterOffensiveT: number;
    afterOffensiveWithin15s: number;
    pairs: number;
  };
  starFoulTrouble: {
    starGames: number;
    twoFoulsFirstQuarterRate: number;
    atHome: number;
    onTheRoad: number;
    /** Minutes against the player's own season mean. Negative: foul trouble costs him time. */
    minutesLost: number;
    spreadRatio: number;
    p: number;
    officialsTested: number;
  };
}

export interface EraRecord {
  wins: number;
  losses: number;
  /** False when the era has too few games to support a verdict, whatever its record looks like. */
  testable: boolean;
}

/**
 * The reading the grid supports as a whole, in the page's own words.
 *
 * Deliberately blunt. "At chance" is stated as a refusal rather than softened into "no clear
 * evidence", because the entire value of this measurement is that it is unambiguous — and because
 * the alternative reading is one a reader arrives already believing.
 */
export type GridReading = "at chance" | "above chance";

export function readNoiseFloor(floor: NoiseFloor): GridReading {
  return floor.clearedPoint01 > floor.expectedPoint01 * 1.5 ? "above chance" : "at chance";
}

/**
 * Whether the sport's single most lopsided pair is more extreme than the most lopsided pair a
 * grid this size produces from nothing. This is the comparison the page is built to make.
 */
export function beatsNoiseFloor(p: number, floor: NoiseFloor): boolean {
  return p < floor.mostExtremePFromNoise;
}

/** "1–10", with the en dash the type scale expects rather than a hyphen. */
export function formatRecord(wins: number, losses: number): string {
  return `${wins}–${losses}`;
}

/** The winning pairs first, so the page's turn — same official, teams winning — leads the list. */
export function winnersFirst(pairs: OtherPair[]): OtherPair[] {
  return [...pairs].sort(
    (a, b) => Number(b.playerWon) - Number(a.playerWon) || b.wins / b.games - a.wins / a.games
  );
}

/** Small counts read as words in a sentence; anything a reader would scan stays a numeral. */
export function countWord(n: number): string {
  return ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"][n] ?? String(n);
}

/** "A, B and C" — an English list, rather than the comma-joined array a template literal gives. */
export function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
