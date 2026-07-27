# Schedule Disparity derives rest days from `games`, not `fatigue_scores`

Status: accepted (2026-07-27)

`fatigue_scores.days_since_last_game` already holds each team's rest before a game, so the
Schedule Disparity module reading it would be the obvious choice. It does not. The module's
headline metric computes rest days with a `LAG` window function over `games`, partitioned by
`(team, season)`.

The reason is staleness under schedule change. `scripts/backfill_fatigue.ts:131` only fills
games *missing* fatigue rows, so when a game is inserted into an existing schedule the
neighbouring already-scored games keep a stale `days_since_last_game`.
`scripts/run-daily.ts:63-65` repairs each game on the day it is played, so the error self-heals
— but Schedule Disparity publishes forward-looking numbers for unplayed schedules, where the
error would sit uncorrected for weeks.

This is not hypothetical. The NBA announces only 80 of each team's 82 games before the season;
the remaining two are added in December once NBA Cup group play resolves. Every season now
inserts games into a published schedule.

Deriving from `games` also makes the headline a pure schedule fact that requires no trust in the
fatigue model — which is what the page claims to be.

## Consequences

Two places in the codebase compute "days since last game," which reads as duplication worth
cleaning up. It is not. `src/lib/__tests__/` carries a pinning test asserting the two agree on
played games; that test is what keeps the duplication safe, and it must fail if either
definition drifts.

The module's secondary **net fatigue edge** column still reads `fatigue_scores` and therefore
still lags for unplayed games. That limitation is stated on the page rather than engineered
away.

## Considered and rejected

- **Add a date-scoped force-recompute to `backfill_fatigue.ts`.** Keeps one source of truth, but
  requires a manual rerun once per season after the December fill — a step that will eventually
  be forgotten, failing silently.
- **Accept the drift.** Cheapest, and the daily run converges on its own, but publishes numbers
  that are quietly wrong for a couple of weeks each December.
