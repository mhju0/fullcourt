/**
 * The playoff series model's published evaluation result.
 *
 * These are POOLED walk-forward numbers over the whole covered span, not per-season figures.
 * They are constants because they describe a fitted model, not a query: they change only when
 * `ml/train_series_model.py` is re-run. The authority is [`ml/PHASE3_REPORT.md`](../../ml/PHASE3_REPORT.md)
 * §3 — every value below was read from its results table.
 *
 * Why this file exists: `/playoffs` used to headline per-season accuracy, which is the one
 * metric on which this model has no measurable edge (see {@link PLAYOFF_MODEL_ACCURACY}). The
 * page now leads with calibration, so the numbers behind that claim need one home rather than
 * being retyped into a component, a method page and a README.
 *
 * As of 2026-07-31 these describe the `logistic_grind_v2` model (prior_grind_diff replaced
 * entry_rest_diff). The page no longer headlines them — see `playoff-rest-facts.ts`, which
 * holds the round split that is now the model's claim — but they remain the pooled figures
 * and the method page still quotes them.
 *
 * Every pooled figure below (calibration model/baseline, accuracy model/baseline, winTieLoss)
 * is pinned in `src/lib/__tests__/playoff-rest-facts.test.ts` against the `pooled` /
 * `pooledRecord` blocks of the committed `ml/playoff_round_split.json` — not against
 * `ml/phase3_results.txt`, which is gitignored and would let these drift silently on a retrain.
 */

/** The pooled walk-forward evaluation span these metrics were measured over. */
export const PLAYOFF_MODEL_EVAL = Object.freeze({
  /** Expanding-window folds, one per evaluated season (1995-96 … 2025-26). */
  folds: 30,
  /** Out-of-sample series predictions pooled across those folds. */
  series: 450,
  firstSeason: "1995-96",
});

/**
 * Calibration — the model's real, defensible win.
 *
 * `baseline` is the base-rate constant: always predict the home-court team at the historical
 * home-court series win rate. Both metrics are lower-is-better.
 */
export const PLAYOFF_MODEL_CALIBRATION = Object.freeze([
  Object.freeze({
    key: "logLoss",
    label: "LOG LOSS",
    model: 0.4939,
    baseline: 0.5696,
    /** Relative reduction vs the base rate, rounded for display. */
    improvementPct: 13,
  }),
  Object.freeze({
    key: "brier",
    label: "BRIER SCORE",
    model: 0.1628,
    baseline: 0.1907,
    improvementPct: 15,
  }),
]);

/**
 * Accuracy — where the model has NO distinguishable edge, published because omitting it would
 * be the dishonest half of the same result.
 *
 * The 95% CI on the model's accuracy contains the baseline, and across the 30 folds the model
 * beat / tied / lost to the baseline 11 / 13 / 6 times — `winTieLoss` mirrors
 * `ml/playoff_round_split.json`'s `pooledRecord`, pinned by
 * `src/lib/__tests__/playoff-rest-facts.test.ts`. "Predict the home-court team" is, within
 * measurement error, exactly as accurate.
 */
export const PLAYOFF_MODEL_ACCURACY = Object.freeze({
  model: 0.753,
  baseline: 0.744,
  baselineName: "always predict the home-court team",
  winTieLoss: "11/13/6",
});
