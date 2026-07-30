/**
 * Which seasons the playoff series model covers.
 *
 * The TypeScript half of an exclusion whose authority is `EXCLUDED_SEASON` in
 * `ml/build_series_dataset.py` and `ml/compute_series_features.py`. Those decide what reaches
 * `playoff_series`; this decides what the season selector offers. They must agree, because a
 * season offered here with no rows there renders as two 0% accuracy tiles above an empty
 * bracket — which reads as a broken page, not as an honest empty state.
 *
 * @see docs/adr/0004-season-exclusions-belong-to-modules-not-ingest.md
 */

import { NBA_SEASONS } from "@/lib/nba-season";

/**
 * Seasons withheld from Playoff Predictions, and from that surface only.
 *
 * 2019-20's playoffs were played entirely inside the Orlando bubble, reached through a
 * 4½-month suspension and then eight seeding games. `entry_rest_diff` — the series model's
 * headline feature and its only descendant of the rest model the rest of the site is built on
 * — cannot mean anything under those conditions.
 *
 * This is the series model's own objection. It is not the bubble rule (`ABNORMAL_STRETCHES`,
 * which excludes dates from every model) and not the truncated-season rule (`TRUNCATED_SEASONS`,
 * which is about unequal game counts and belongs to Schedule Edge). The season's regular-season
 * games are used everywhere else.
 */
export const PLAYOFF_MODEL_EXCLUDED_SEASONS: readonly string[] = ["2019-20"];

/** The seasons Playoff Predictions will offer, newest last, as a subset of {@link NBA_SEASONS}. */
export function playoffModelSeasons(
  seasons: readonly string[] = NBA_SEASONS
): readonly string[] {
  return seasons.filter((s) => !PLAYOFF_MODEL_EXCLUDED_SEASONS.includes(s));
}
