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
 * 1985-86, where the same measurement is lower and on more games (`RESTED_ON_ROAD`). Nothing tied the sentence to a
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
  scoredGames: 47112,
  /** |RA| < 0.5 — no side is the rested one. About one game in six. */
  neutral: 8198,
  decided: 38914,
  firstSeason: "1985-86",
  lastSeason: "2025-26",
  seasons: 41,
});

/**
 * How often each side wins regardless of rest.
 *
 * The number every rate below is read against. Counted over every scored game with a home
 * court — neutral-site games have none and are left out (D-92) — including the ones with no
 * rest gap, for the same reason `AnalysisResponse.venueBaseline` is: a baseline drawn only
 * from games with a rest gap would already carry the effect it exists to subtract.
 */
export const REST_SPLIT_BASELINE = Object.freeze({
  games: 47112,
  homeWins: 28234,
  homeWinPct: 59.9,
  roadWinPct: 40.1,
});

/** The published row: the more-rested team was also at home. */
export const RESTED_AT_HOME: RestRow = Object.freeze({
  games: 27420,
  wins: 16778,
  winPct: 61.2,
  ladder: Object.freeze([
    Object.freeze({ gap: 2, games: 16068, wins: 9936, winPct: 61.8 }),
    Object.freeze({ gap: 3, games: 10463, wins: 6603, winPct: 63.1 }),
    Object.freeze({ gap: 4, games: 6353, wins: 4058, winPct: 63.9 }),
    Object.freeze({ gap: 5, games: 3756, wins: 2452, winPct: 65.3 }),
    Object.freeze({ gap: 6, games: 2128, wins: 1385, winPct: 65.1 }),
    Object.freeze({ gap: 7, games: 1080, wins: 712, winPct: 65.9 }),
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
  games: 11494,
  wins: 4867,
  winPct: 42.3,
  ladder: Object.freeze([
    Object.freeze({ gap: 2, games: 4310, wins: 1875, winPct: 43.5 }),
    Object.freeze({ gap: 3, games: 2035, wins: 894, winPct: 43.9 }),
    Object.freeze({ gap: 4, games: 930, wins: 437, winPct: 47 }),
    Object.freeze({ gap: 5, games: 331, wins: 148, winPct: 44.7 }),
    Object.freeze({ gap: 6, games: 101, wins: 51, winPct: 50.5 }),
    Object.freeze({ gap: 7, games: 24, wins: 15, winPct: 62.5 }),
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
 * The raw rate has moved a long way — 42.3% to 49.4% — and it would be easy to read that as
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
    games: 11494,
    wins: 4867,
    winPct: 42.3,
    roadBaselinePct: 40.1,
    liftPp: 2.2,
    ladder: Object.freeze([
      Object.freeze({ gap: 2, games: 4310, wins: 1875, winPct: 43.5 }),
      Object.freeze({ gap: 3, games: 2035, wins: 894, winPct: 43.9 }),
      Object.freeze({ gap: 4, games: 930, wins: 437, winPct: 47 }),
      Object.freeze({ gap: 5, games: 331, wins: 148, winPct: 44.7 }),
    ]),
  }),
  Object.freeze({
    label: "Last 10 seasons",
    seasons: 10,
    games: 3064,
    wins: 1457,
    winPct: 47.6,
    roadBaselinePct: 43.8,
    liftPp: 3.8,
    ladder: Object.freeze([
      Object.freeze({ gap: 2, games: 1123, wins: 559, winPct: 49.8 }),
      Object.freeze({ gap: 3, games: 519, wins: 258, winPct: 49.7 }),
      Object.freeze({ gap: 4, games: 229, wins: 120, winPct: 52.4 }),
      Object.freeze({ gap: 5, games: 67, wins: 32, winPct: 47.8 }),
    ]),
  }),
  Object.freeze({
    label: "Last 5 seasons",
    seasons: 5,
    games: 1625,
    wins: 802,
    winPct: 49.4,
    roadBaselinePct: 44.7,
    liftPp: 4.7,
    ladder: Object.freeze([
      Object.freeze({ gap: 2, games: 599, wins: 312, winPct: 52.1 }),
      Object.freeze({ gap: 3, games: 276, wins: 146, winPct: 52.9 }),
      Object.freeze({ gap: 4, games: 117, wins: 67, winPct: 57.3 }),
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
 * team every time — adding a constant to both sides does not create information. Run over every
 * scored game with a home court, rest gap or not, which is where the high coverage comes from.
 */
export const HOME_BAR_COUNTERFACTUAL = Object.freeze({
  /** Points of home court added to every rest edge before the call is made. */
  homeBar: 3,
  calls: 45491,
  coveragePct: 96.6,
  correct: 27179,
  accuracyPct: 59.7,
  roadCalls: 1357,
  roadLosses: 733,
  /** Picking the home team in every scored game — the bar this has to clear, and does not. */
  alwaysHomePct: 59.9,
});

/** Percentage points above the side's own baseline. Signed; render through `signedNumber()`. */
export function liftOverBaseline(winPct: number, baselinePct: number): number {
  return Math.round((winPct - baselinePct) * 10) / 10;
}
