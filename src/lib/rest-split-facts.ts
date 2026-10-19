import facts from "../../ml/rest_split_facts.json";
import { GAP_RANGES, type GapRangeKey } from "@/lib/rest-advantage-evidence";

/**
 * Every figure `/behind-the-data/rest-advantage` publishes about the two rest rows.
 *
 * Constants because they describe a finished full-table measurement, not a query: a static
 * reference page cannot read the database, and re-running the backtest per page view to print
 * one sentence would be absurd. They change only when `scripts/measure_uncalled_half.ts` is
 * re-run. These exports read its generated JSON directly. The pinning tests check
 * the exported measurements and their internal consistency.
 * Same arrangement as `availability-facts.ts` and `playoff-rest-facts.ts`.
 *
 * The rows split by the site's three gap sizes (`GAP_RANGES`), not by cumulative "at least"
 * rungs: a rung at ≥ 2 repeated every game of the rungs above it (D-106).
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

/** One gap size (D-101, D-102): the games whose gap falls in that range, each game in one. */
export interface RestGapRange {
  key: GapRangeKey;
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
  ranges: readonly RestGapRange[];
}

function freezeRestRow(row: typeof facts.restedAtHome): RestRow {
  return Object.freeze({
    ...row,
    ranges: Object.freeze(row.ranges.map((range) => {
      const key = GAP_RANGES.find((candidate) => candidate.key === range.key)?.key;
      if (!key) throw new Error(`Unknown generated rest gap: ${range.key}`);
      return Object.freeze({ ...range, key });
    })),
  });
}

/** What the measurement ran over. */
export const REST_SPLIT_SAMPLE = Object.freeze(facts.sample);

/**
 * How often each side wins regardless of rest.
 *
 * The number every rate below is read against. Counted over every scored game with a home
 * court — neutral-site games have none and are left out (D-92) — including the ones with no
 * rest gap, for the same reason `AnalysisResponse.venueBaseline` is: a baseline drawn only
 * from games with a rest gap would already carry the effect it exists to subtract.
 */
export const REST_SPLIT_BASELINE = Object.freeze(facts.baseline);

/** The published row: the more-rested team was also at home. */
export const RESTED_AT_HOME: RestRow = freezeRestRow(facts.restedAtHome);

/**
 * The row counted separately: the more-rested team was the visitor.
 *
 * Published in full rather than dropped. A large road edge is rare, and the large range
 * inside a recent era is thinner still. Any copy
 * quoting a thin range has to say so.
 */
export const RESTED_ON_ROAD: RestRow = freezeRestRow(facts.restedOnRoad);

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
  ranges: readonly RestGapRange[];
}

/**
 * The road row inside recent eras, each against its own baseline.
 *
 * This exists because the pooled 41-season figure is dominated by an era when home-court
 * advantage was far larger than it is now, and two claims the site used to publish leaned on
 * the pooled rate as though it were timeless. Both are retired; this is what replaced them.
 *
 * The raw rate has moved over time, and it would be easy to read that as rest mattering
 * more. The road baseline moved with it.
 * What is left after subtracting that is the lift, and the lift is where the real question is.
 *
 * Every era carries its own baseline for the same reason the season chart does. Comparing a
 * 2024 rate to a 1987 baseline measures the league, not the schedule.
 */
export const RESTED_ON_ROAD_BY_ERA: readonly RestEraRow[] = Object.freeze(
  facts.restedOnRoadByEra.map((era) => Object.freeze({
    ...era,
    ranges: freezeRestRow(era).ranges,
  }))
);

/**
 * Below this, a gap size is printed muted and never quoted in prose.
 *
 * Set at 200 to keep usable recent-era comparisons visible while marking sparse ranges.
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
export const HOME_BAR_COUNTERFACTUAL = Object.freeze(facts.counterfactual);

/** Percentage points above the side's own baseline. Signed; render through `signedNumber()`. */
export function liftOverBaseline(winPct: number, baselinePct: number): number {
  return Math.round((winPct - baselinePct) * 10) / 10;
}
