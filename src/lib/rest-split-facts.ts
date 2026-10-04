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
 * 1985-86, where the same measurement is 42.4% across 11,546. Nothing tied the sentence to a
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
  neutral: 8193,
  decided: 38950,
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
  homeWins: 28247,
  homeWinPct: 59.9,
  roadWinPct: 40.1,
});

/** The published row: the more-rested team was also at home. */
export const RESTED_AT_HOME: RestRow = Object.freeze({
  games: 27404,
  wins: 16765,
  winPct: 61.2,
  ladder: Object.freeze([
    Object.freeze({ gap: 2, games: 16073, wins: 9945, winPct: 61.9 }),
    Object.freeze({ gap: 3, games: 10526, wins: 6640, winPct: 63.1 }),
    Object.freeze({ gap: 4, games: 6389, wins: 4078, winPct: 63.8 }),
    Object.freeze({ gap: 5, games: 3781, wins: 2469, winPct: 65.3 }),
    Object.freeze({ gap: 6, games: 2151, wins: 1403, winPct: 65.2 }),
    Object.freeze({ gap: 7, games: 1105, wins: 728, winPct: 65.9 }),
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
  games: 11546,
  wins: 4892,
  winPct: 42.4,
  ladder: Object.freeze([
    Object.freeze({ gap: 2, games: 4354, wins: 1891, winPct: 43.4 }),
    Object.freeze({ gap: 3, games: 2056, wins: 899, winPct: 43.7 }),
    Object.freeze({ gap: 4, games: 952, wins: 447, winPct: 47 }),
    Object.freeze({ gap: 5, games: 341, wins: 157, winPct: 46 }),
    Object.freeze({ gap: 6, games: 108, wins: 54, winPct: 50 }),
    Object.freeze({ gap: 7, games: 26, wins: 16, winPct: 61.5 }),
  ]),
});

/** One era's road row, against that era's own road baseline. */
export interface RestEraRow {
  label: string;
  seasons: number;
  games: number;
  wins: number;
  winPct: number;
  /** That era's own road baseline. Not a constant — home court has fallen league-wide. */
  roadBaselinePct: number;
  /** `winPct − roadBaselinePct`. The comparison that survives the drift. */
  liftPp: number;
  ladder: readonly RestGapRung[];
}

/**
 * The road row inside recent eras, each against its own baseline.
 *
 * This exists because the pooled 41-season figure is dominated by an era when home-court
 * advantage was far larger than it is now, and two claims the site used to publish leaned on
 * the pooled rate as though it were timeless. Both are retired; this is what replaced them.
 *
 * The raw rate has moved a long way — 42.4% to 49.3% — and it would be easy to read that as
 * rest mattering more. Most of it is not: the road baseline moved with it, 40.1% to 44.7%.
 * What is left after subtracting that is the lift, and the lift is where the real question is.
 *
 * Every era carries its own baseline for the same reason the season chart does. Comparing a
 * 2024 rate to a 1987 baseline measures the league, not the schedule.
 */
export const RESTED_ON_ROAD_BY_ERA: readonly RestEraRow[] = Object.freeze([
  Object.freeze({
    label: "All seasons",
    seasons: 41,
    games: 11546,
    wins: 4892,
    winPct: 42.4,
    roadBaselinePct: 40.1,
    liftPp: 2.3,
    ladder: Object.freeze([
      Object.freeze({ gap: 2, games: 4354, wins: 1891, winPct: 43.4 }),
      Object.freeze({ gap: 3, games: 2056, wins: 899, winPct: 43.7 }),
      Object.freeze({ gap: 4, games: 952, wins: 447, winPct: 47 }),
      Object.freeze({ gap: 5, games: 341, wins: 157, winPct: 46 }),
    ]),
  }),
  Object.freeze({
    label: "Last 10 seasons",
    seasons: 10,
    games: 3084,
    wins: 1469,
    winPct: 47.6,
    roadBaselinePct: 43.8,
    liftPp: 3.8,
    ladder: Object.freeze([
      Object.freeze({ gap: 2, games: 1134, wins: 566, winPct: 49.9 }),
      Object.freeze({ gap: 3, games: 522, wins: 260, winPct: 49.8 }),
      Object.freeze({ gap: 4, games: 231, wins: 121, winPct: 52.4 }),
      Object.freeze({ gap: 5, games: 67, wins: 33, winPct: 49.3 }),
    ]),
  }),
  Object.freeze({
    label: "Last 5 seasons",
    seasons: 5,
    games: 1638,
    wins: 807,
    winPct: 49.3,
    roadBaselinePct: 44.7,
    liftPp: 4.6,
    ladder: Object.freeze([
      Object.freeze({ gap: 2, games: 602, wins: 314, winPct: 52.2 }),
      Object.freeze({ gap: 3, games: 274, wins: 145, winPct: 52.9 }),
      Object.freeze({ gap: 4, games: 117, wins: 68, winPct: 58.1 }),
      Object.freeze({ gap: 5, games: 36, wins: 21, winPct: 58.3 }),
    ]),
  }),
]);

/**
 * Below this, a rung is printed muted and never quoted in prose.
 *
 * Set at 200 rather than higher on purpose. The last-ten rung at a gap of 4 is 231 games and
 * sits above even — it is the single observation that refutes "no threshold rescues it" in the
 * modern game, so a cut that hid it would be the same omission that let the claim stand. The
 * last-five rungs at gaps of 4 and 5 are 117 and 36 games: they read as the most dramatic
 * numbers in the table and are the least trustworthy in it.
 */
export const THIN_SAMPLE_GAMES = 200;

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
  calls: 45508,
  coveragePct: 96.5,
  correct: 27179,
  accuracyPct: 59.7,
  roadCalls: 1386,
  roadLosses: 752,
  /** Picking the home team in every scored game — the bar this has to clear, and does not. */
  alwaysHomePct: 59.9,
});

/** Percentage points above the side's own baseline. Signed; render through `signedNumber()`. */
export function liftOverBaseline(winPct: number, baselinePct: number): number {
  return Math.round((winPct - baselinePct) * 10) / 10;
}
