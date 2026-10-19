# Corrected playoff data gets a new model revision

Status: accepted (2026-10-20), within the owner's full-data correction request.

## Context

Rebuilding all 600 stored playoff-series feature rows found nine stale regular-season
win-percentage differences in 2024-25 and two stale entry-rest differences in 2025-26.
The nine values match partial-season records rather than the final official standings;
that supports staleness, but does not prove when or why the original computation occurred.
The official [Cavaliers playoff guide](https://cdn.nba.com/teams/uploads/sites/1610612739/2025/04/CLEVELAND-CAVALIERS-OFFICIAL-2025-PLAYOFF-GUIDE-small-v2.pdf)
corroborates the complete regular-season records. These features use the full official
regular season, including neutral regular games, rather than the site's venue-filtered
rest-advantage publication cohort.

Both affected first-round series opened April 19, 2026. Oklahoma City and San Antonio
last played April 12; Phoenix played [April 17](https://www.nba.com/game/gsw-vs-phx-0052500211)
and Portland played [April 14](https://www.nba.com/game/por-vs-phx-0052500121). The existing
raw-day convention therefore gives entry-rest differences of five and two days.
The Cup additions do not explain these older stored-feature discrepancies.

The v2 model uses seed, regular-season record, prior-round grind and head-to-head
features. Entry rest is retained for explanation but is no longer fitted. Correcting
nine record features changes the fitted model and some walk-forward estimates. The
existing prediction producer would overwrite rows keyed to the old v2 version.

## Decision

Repair only the eleven verified feature values and their computation metadata. Preserve
all series identities, bracket/results, seeds and unrelated features. Include both complete
playoff tables in the atomic correction snapshot, locks, compare-and-swap checks and rollback.

Publish corrected outputs as `logistic_grind_v2_r20261020`, with both `walk_forward_oos`
and `full_insample` rows. Preserve every old v1/v2 prediction byte-for-byte. Readers and
current generated metrics select the new revision explicitly; timestamps do not choose a
model version. Early seasons without sufficient prior training still have no OOS output.

Keep the same v2 features, hyperparameters, standardization and strictly earlier-season
walk-forward protocol. This is a corrected data revision, not a new algorithm or an
operational fatigue-coefficient change. OOS remains a historical replay using only earlier
seasons, and the fit using known results remains labeled as hindsight. Neither output is
represented as a contemporaneous logged wager.

## Consequences

Current metrics, calibration, round splits, model artifacts and displayed probabilities
must all use the corrected revision together. Producer JSON supplies displayed figures.
Rollback removes only the newly inserted revision rows and restores the eleven feature
values alongside the regular-season correction. This requires no schema migration, but
expands the reviewed persistent-data transition and therefore needs a new frozen candidate,
real PostgreSQL rehearsal, independent review and immediate production-write approval.
