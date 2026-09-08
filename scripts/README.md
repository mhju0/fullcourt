# Ingest and maintenance scripts

These are operational entry points, not commands to run indiscriminately. Many write database
rows or generated artifacts. Read the script's arguments and the linked runbook before use.
Use `pnpm exec tsx scripts/<name>.ts` for TypeScript and the appropriate Python environment.
Dependencies are in `requirements.txt`, `scripts/requirements.txt`, and `ml/requirements.txt`.

| Purpose | Entry points | Guide |
| --- | --- | --- |
| Daily updates | `daily_update.py`, `run-daily.ts`, `sync_scores_espn.ts`, `fetch_game_context.ts` | [Live-season verification](../docs/LAUNCH_DAY.md) |
| Season schedules and identities | `seed_upcoming_season_espn.ts`, `seed_season_from_hoopr.ts`, `rekey_season_from_hoopr.ts`, `fetch_nba_schedule_cdn.py`, `fetch_schedule.py` | [Season rollover](../docs/SEASON_ROLLOVER.md) |
| Historical backfills | `backfill_historical.py`, `backfill_game_types.py`, `backfill_fatigue.ts`, `backfill_predictions.ts`, `seed_teams.py` | [Data pipeline](../docs/DATA_PIPELINE.md) |
| Projections and audits | `project_fatigue.ts`, `audit_data.ts`, `verify_predictions.ts` | Read each script's scope; projected fatigue is not a measured result |
| Playoff ingest | `fetch_playoffs.py`, `fetch_play_in.py` | [Analysis inventory](../ml/README.md) |
| Shooting export | `fetch_shooting_data.py`, `analyze_player_shooting.py`, `export_player_rest.py` | [Data pipeline](../docs/DATA_PIPELINE.md) |
| Shot Value | `collect_shot_data.py`, `aggregate_shot_grid.py`, `sq4_train_shot_value.py`, `sq4b_train_gbm.py`, `sq5_write_surface.py` | [Data pipeline](../docs/DATA_PIPELINE.md) |
| Historical referee research | `fetch_officials.ts`, `fetch_playoff_officials.ts`, `analyze_officials_splits.ts` | [Research index](../docs/research/README.md) |
| Rest/model research | `export_fatigue_features.ts`, `measure_home_rest_confound.ts`, `measure_rest_eras.ts`, `measure_uncalled_half.ts`, `verify_rest_eras_adversarial.ts`, `verify_q1_noise.ts`, `fetch_win_totals.ts` | [Analysis inventory](../ml/README.md), ADR 0006 |
| Documentation and UI checks | `screenshots.mjs`, `check-doc-links.mjs`, `audit_design_scale.mjs` | [Testing](../docs/TESTING_AND_CICD.md) |

`reset_predictions.ts` is a destructive maintenance tool; its presence is not permission to run
it. `nba_ot_periods.py` remains a legacy dependency of historical schedule ingestion, not dead
code. `season_window.py` and `schedule_upsert_contract.py` are shared ingest contracts.

Published outputs in `src/data/`, `public/data/`, and model-facts modules must match their
producers and tests. Raw caches in `ml/data/` and model binaries in `ml/shot_value/` are local
and ignored; do not delete them as disposable UI output. New SQL belongs in manual records
under `drizzle/`, not an automatic schema reconciliation.
