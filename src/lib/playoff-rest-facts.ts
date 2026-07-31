/**
 * Every figure the /playoffs page publishes.
 *
 * These are constants because they describe a fitted model and a finished measurement, not a
 * query: they change only when `ml/playoff_rest_report.py` or `ml/train_series_model.py` is
 * re-run. `src/lib/__tests__/playoff-rest-facts.test.ts` pins this file against
 * `ml/playoff_rest_facts.json`, so a number edited here and nowhere else fails the suite.
 *
 * Why one home: the previous version of this page retyped its figures into a component, a
 * method page and a README, and they drifted.
 */

/** One cell of the grind matrix: home-court series win rate and the series behind it. */
export interface GrindCell {
  /** 0-100, one decimal. */
  winPct: number;
  n: number;
}

/**
 * Equal-rest counts across playoff games, play-in excluded.
 *
 * The Game 2+ figure is the page's opening claim and it is exact: after Game 1 the two teams
 * are playing each other, so they share a schedule by construction.
 */
export const PLAYOFF_EQUAL_REST = Object.freeze({
  game1Games: 600,
  game1Equal: 277,
  laterGames: 2545,
  laterEqual: 2545,
});

/**
 * The Grind Tax. Rows are the home-court team's own prior-round grind, columns its opponent's.
 * "Low" = closed early (0-1 games beyond a sweep), "high" = went long (2-3).
 *
 * The bottom row matters as much as the lit cell: when the home-court team also went long, the
 * opponent's grind stops helping and reverses. That is the signature of a differential rather
 * than of "long series are bad in the absolute".
 */
export const PLAYOFF_GRIND_MATRIX = Object.freeze({
  ownLowOppLow: Object.freeze({ winPct: 68.9, n: 74 }) as GrindCell,
  ownLowOppHigh: Object.freeze({ winPct: 85.4, n: 89 }) as GrindCell,
  ownHighOppLow: Object.freeze({ winPct: 65.9, n: 44 }) as GrindCell,
  ownHighOppHigh: Object.freeze({ winPct: 59.7, n: 72 }) as GrindCell,
});

/**
 * The confound test. The opponent's prior-round length is decided by two other teams, so it is
 * exogenous to the home-court team — unlike its own closeout speed, which is confounded with
 * being good.
 *
 * `meanWinPctDiff` is published alongside because the "went long" group is nominally stronger
 * on record, so the headline gap is partly strength. The close-matchup pair is the number the
 * claim actually rests on.
 */
export const PLAYOFF_GRIND_EXOGENOUS = Object.freeze({
  oppClosedEarly: Object.freeze({ winPct: 68.9, n: 74, meanWinPctDiff: 0.0891 }),
  oppWentLong: Object.freeze({ winPct: 85.4, n: 89, meanWinPctDiff: 0.1079 }),
  closeMatchupOppClosedEarly: Object.freeze({ winPct: 53.2, n: 62 }) as GrindCell,
  closeMatchupOppWentLong: Object.freeze({ winPct: 67.9, n: 78 }) as GrindCell,
  /** Holding own grind high and varying the opponent's: the effect goes the wrong way. */
  mirrorDeltaPts: -6.2,
});

/** Corroboration from a second angle: series win rate by the layoff into Game 1, rounds 2+. */
export const PLAYOFF_ENTRY_REST_BUCKETS = Object.freeze([
  Object.freeze({ label: "2 or more days short", n: 67, winPct: 65.7 }),
  Object.freeze({ label: "within a day either way", n: 92, winPct: 59.8 }),
  Object.freeze({ label: "2 or more days rested", n: 120, winPct: 83.3 }),
]);

/**
 * Why grind is measured beyond a sweep rather than as raw games played: in a best-of-5, five
 * games means going the full distance; in a best-of-7 it means closing early.
 */
export const PLAYOFF_BEST_OF_FIVE = Object.freeze({
  round1BestOfFive: 136,
  round1Total: 320,
});

/** One side of the round split. Accuracies are 0-100 with one decimal; losses are raw. */
export interface RoundSplitSlice {
  n: number;
  /** Model accuracy, 0-100. */
  model: number;
  /** Always-pick-the-home-court-team accuracy, 0-100. */
  baseline: number;
  logLoss: number;
  baselineLogLoss: number;
}

/**
 * The model's real claim. It gains where a prior round exists to have been ground down by, and
 * loses in Round 1 where it does not. Pooling the two halves is what produced the earlier
 * "+0.2 points, inside noise" headline.
 */
export const PLAYOFF_ROUND_SPLIT = Object.freeze({
  roundsTwoPlus: Object.freeze({
    n: 210,
    model: 73.3,
    baseline: 69.5,
    logLoss: 0.5658,
    baselineLogLoss: 0.6148,
  }) as RoundSplitSlice,
  roundOne: Object.freeze({
    n: 240,
    model: 77.1,
    baseline: 78.8,
    logLoss: 0.4311,
    baselineLogLoss: 0.5173,
  }) as RoundSplitSlice,
});

/**
 * Standardized L2-logistic coefficients for `logistic_grind_v2` (all 599 rows, in-sample;
 * `ml/PHASE3_REPORT.md` §4). Keyed by feature name — not a positional tuple — so a column
 * reorder in `ml/train_series_model.py` cannot silently mismatch this page's table.
 */
export const PLAYOFF_MODEL_COEFFICIENTS = Object.freeze({
  seed_diff: 0.4026,
  win_pct_diff: 0.7141,
  prior_grind_diff: 0.2822,
  h2h_diff: 0.1233,
});

export const PLAYOFF_MODEL_INTERCEPT = 1.3724;

/**
 * Per-season paired record against the always-home-court rule in rounds 2+.
 *
 * The pooled accuracy gap is about eight series, so the pooled number alone is not evidence.
 * The paired record is what carries the claim — and it is the test `ml/PHASE3_REPORT.md` §5
 * already argues is the right one here.
 */
export const PLAYOFF_ROUNDS_TWO_PLUS_RECORD = Object.freeze({ win: 11, tie: 16, loss: 3 });

/**
 * How a series card names a team's previous round.
 *
 * Games played, not grind: "survived a 7" is a phrase a fan already owns, while "grind 3" is
 * modelling vocabulary. The format matters for the wording as much as for the arithmetic — in
 * a best-of-5, five games IS the full distance.
 */
export function priorRoundGamesLabel(
  gamesPlayed: number | null,
  isBestOf7: boolean
): string | null {
  if (gamesPlayed === null) return null;
  const sweep = isBestOf7 ? 4 : 3;
  const distance = isBestOf7 ? 7 : 5;
  if (gamesPlayed <= sweep) return `swept in ${gamesPlayed}`;
  if (gamesPlayed >= distance) return `survived a ${gamesPlayed}`;
  return `closed in ${gamesPlayed}`;
}
