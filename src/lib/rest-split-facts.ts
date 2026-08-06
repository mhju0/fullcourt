/**
 * Every figure `/behind-the-data/rest-advantage` publishes about the two rest rows.
 *
 * Constants because they describe a finished full-table measurement, not a query: a static
 * reference page cannot read the database, and re-running the backtest per page view to print
 * one sentence would be absurd. They change only when `scripts/measure_uncalled_half.ts` is
 * re-run. `src/lib/__tests__/rest-split-facts.test.ts` pins this file against
 * `ml/rest_split_facts.json`, so a number edited here and nowhere else fails the suite.
 * Same arrangement as `availability-facts.ts` and `playoff-rest-facts.ts`.
 *
 * **This file exists because the alternative failed.** The page hand-typed
 * "44.4% across 7,224 games" for the rested-road row. That figure was never wrong — it
 * described the `ml/` harness slice, which floors at 2002-03 — but the site publishes from
 * 1985-86, where the same measurement is 42.4% across 11,548. Nothing tied the sentence to a
 * population, so nothing caught it. Two neighbouring claims went stale the same way.
 *
 * The live `/analysis` figures are NOT here: they come from `AnalysisResponse` and are
 * computed per request. These are only for the surfaces that cannot read the database.
 */

/** One rung of a rest-gap ladder: every game at or above `gap`, so the rungs are cumulative. */
export interface RestGapRung {
  gap: number;
  games: number;
  wins: number;
  /** The rested team's win rate in that bucket (0–100, 1 decimal). */
  winPct: number;
}

/** One venue row: the rested team at home, or the rested team on the road. */
export interface RestRow {
  games: number;
  wins: number;
  winPct: number;
  ladder: readonly RestGapRung[];
}

/** What the measurement ran over. */
export const REST_SPLIT_SAMPLE = Object.freeze({
  scoredGames: 47143,
  /** |RA| < 0.5 — no side is the rested one. About one game in six. */
  neutral: 8195,
  decided: 38948,
  firstSeason: "1985-86",
  lastSeason: "2025-26",
  seasons: 41,
});

/**
 * How often each side wins regardless of rest.
 *
 * The number every rate below is read against. Counted over all 47,143 scored games including
 * the neutral ones, for the same reason `AnalysisResponse.venueBaseline` is: a baseline drawn
 * only from games with a rest gap would already carry the effect it exists to subtract.
 */
export const REST_SPLIT_BASELINE = Object.freeze({
  games: 47143,
  homeWins: 28248,
  homeWinPct: 59.9,
  roadWinPct: 40.1,
});

/** The published row: the more-rested team was also at home. */
export const RESTED_AT_HOME: RestRow = Object.freeze({
  games: 27400,
  wins: 16761,
  winPct: 61.2,
  ladder: Object.freeze([
    Object.freeze({ gap: 2, games: 16078, wins: 9947, winPct: 61.9 }),
    Object.freeze({ gap: 3, games: 10524, wins: 6639, winPct: 63.1 }),
    Object.freeze({ gap: 4, games: 6389, wins: 4078, winPct: 63.8 }),
    Object.freeze({ gap: 5, games: 3782, wins: 2469, winPct: 65.3 }),
    Object.freeze({ gap: 6, games: 2153, wins: 1404, winPct: 65.2 }),
    Object.freeze({ gap: 7, games: 1108, wins: 730, winPct: 65.9 }),
  ]),
});

/**
 * The row counted separately: the more-rested team was the visitor.
 *
 * Published in full rather than dropped. Note the top two rungs — 108 and 26 games across
 * forty-one seasons — are the schedule running out of examples, not a signal switching on.
 * Any copy quoting them has to say so.
 */
export const RESTED_ON_ROAD: RestRow = Object.freeze({
  games: 11548,
  wins: 4894,
  winPct: 42.4,
  ladder: Object.freeze([
    Object.freeze({ gap: 2, games: 4351, wins: 1889, winPct: 43.4 }),
    Object.freeze({ gap: 3, games: 2056, wins: 897, winPct: 43.6 }),
    Object.freeze({ gap: 4, games: 949, wins: 443, winPct: 46.7 }),
    Object.freeze({ gap: 5, games: 342, wins: 158, winPct: 46.2 }),
    Object.freeze({ gap: 6, games: 108, wins: 54, winPct: 50 }),
    Object.freeze({ gap: 7, games: 26, wins: 16, winPct: 61.5 }),
  ]),
});

/**
 * The obvious objection, measured: fold home court into the score and let the combined number
 * pick, instead of counting the two rows separately.
 *
 * It covers nearly everything and still lands *below* the trivial strategy of picking the home
 * team every time — adding a constant to both sides does not create information. Run over all
 * 47,143 scored games, neutral included, which is where the high coverage comes from.
 */
export const HOME_BAR_COUNTERFACTUAL = Object.freeze({
  /** Points of home court added to every rest edge before the call is made. */
  homeBar: 3,
  calls: 45507,
  coveragePct: 96.5,
  correct: 27177,
  accuracyPct: 59.7,
  roadCalls: 1385,
  roadLosses: 752,
  /** Picking the home team in every scored game — the bar this has to clear, and does not. */
  alwaysHomePct: 59.9,
});

/** Percentage points above the side's own baseline. Signed; render through `signedNumber()`. */
export function liftOverBaseline(winPct: number, baselinePct: number): number {
  return Math.round((winPct - baselinePct) * 10) / 10;
}
