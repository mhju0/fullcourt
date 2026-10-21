# Data pipeline

The producing scripts are authoritative. This guide maps the write paths and publications;
[script inventory](../scripts/README.md) and [analysis inventory](../ml/README.md) locate tools.
Dependencies differ by workflow: root `requirements.txt`, `scripts/requirements.txt`, and
`ml/requirements.txt` are deliberate separate environments.

## Scheduled updates

`.github/workflows/daily-update.yml` runs `scripts/daily_update.py` daily at 21:17 UTC. Its
America/New_York season gate runs before credentials or ingest dependencies are needed. It
opens three days before ESPN's published regular-season start and closes three days after
its end; if ESPN cannot be read it falls back to October through April and says so in the
log. An offseason success means a skip, not a tested ingestion path.

The in-season sequence is:

1. `sync_scores_espn.ts` reconciles recent scores, status, and overtime over the lookback window.
2. `fetch_game_context.ts` refreshes context for completed games, including tip-off and neutral
   site information, before fatigue calculation.
3. `project_fatigue.ts` fills unscored scheduled-game projections.
4. `run-daily.ts` refreshes the configured date window's games, fatigue, and predictions. Prior
   games are read from the schedule, played or not (D-82); a finished one brings its real
   overtime and margin, an unplayed one neither.

The score route also rescores fatigue, narrowly: once it stores a night's finals, the next game
of each finalized team is rescored if it is today or tomorrow (ET) and has not tipped off, so
that night's overtime and margin are in the row before the game (D-83).

Failure in required steps fails the workflow. Database credentials come from the process
environment or local environment files; never print their values. The workflow retains manual
schedule resync/seed input names but rejects those tasks before dependencies or credentials are
loaded. Follow the manual-source runbook before preparing any replacement operation.

The separate Vercel cron runs `/api/cron/update` once in each hour from 21:00 to 08:00 UTC, from
`vercel.json`. It stores final scores for yesterday and today (ET) and does not replace the full
fatigue pipeline. Both writers share the [lifecycle transaction](GAME_STATUS_LIFECYCLE.md):
explicit postponed/cancelled states carry no scores, preserve final-result monotonicity and
invalidate affected future derived forecasts before bounded recovery. Neither writer stores
a game in progress ([D-81](DECISIONS.md)). Supabase Realtime can deliver
changed game rows to browsers. Verify completed-game writes with the [live-season checklist](LAUNCH_DAY.md).

## Schedule and historical data

`fetch_schedule.py`, `fetch_nba_schedule_cdn.py`, and `seed_season_from_hoopr.ts` support distinct
source/era paths. `seed_upcoming_season_espn.ts` supports an upcoming schedule when the normal
source is unavailable. Provider reachability is environment- and time-dependent; old probes
are historical observations, not guarantees.

The historical hoopR seeder inserts missing fixtures only: repeated fixture/result keys,
failed ESPN dates, identity conflicts or changes to an existing result refuse the whole
transaction. Identical stored finals are no-ops; use the reviewed correction/re-key paths
for changes. The upcoming ESPN seeder requires complete date collection and 30 teams with
uniform 80 or 82 regular-season games, excluding the Cup final from those counts. It is not
a shortened-season or partial-schedule importer. Both tools create their local cache directories.
See [ADR 0016](adr/0016-season-seeds-refuse-ambiguous-fixtures.md) for the write contract.

ESPN-seeded games use `espn-<eventId>` until played-game hoopR data permits a verified canonical
ID join. `rekey_season_from_hoopr.ts` is dry-run by default, refuses ambiguous/colliding mappings,
and updates only eligible IDs. [Season rollover](SEASON_ROLLOVER.md) owns that procedure.

Historical backfills are manual tools, not routine daily work. `nba_ot_periods.py` remains an
imported legacy helper in historical ingestion. Preserve game IDs and dates; do not infer canonical
IDs from chronological position or use local-time dates in place of Eastern dates.

## Controlled historical corrections

Accepted overtime, game-type, neutral-site and tip-off corrections are overlaid after provider
normalization using `src/data/game-input-corrections.json` in TypeScript and Python ingestion.
Explicit nonregular Cup-final/play-in rows remain workload context, with recognized `006`/`005`
provider types kept separate from regular targets. The physical-venue registry is separate from
home-court classification and modeled team bases;
see [ADR 0011](adr/0011-physical-venues-and-historical-correction.md).

`scripts/history-correction/` prepares a full before/after candidate from a database snapshot.
Its local PostgreSQL rehearsal exercises atomic apply, retry, drift refusal, writer locking
and exact rollback. Production application requires an explicit reviewed target and owner
approval immediately before the mass update. It is not a daily pipeline or schema migration.
The correction also repairs verified stale playoff features and appends a new explicit model
data revision while preserving older outputs; see [ADR 0012](adr/0012-playoff-data-revisions-preserve-model-history.md).
Preserve resolved prediction history; regenerate eligible future predictions and dependent
publications together. The documented maintenance gate prevents mixed old/new results during
the production cutover.

D-131 adds the separately guarded [arena correction transition](../scripts/arena-correction/README.md).
It authenticates an immutable v1.0.7 replay before accepting the new dated arena registry,
then derives affected seasons from a complete replay and updates changed sides only.
`src/data/arena-history.json` separates physical building eras from modeled-base overrides;
`fixture-venue-corrections.json` resolves exact exceptions before those defaults. Mixed Atlanta
home dates require explicit fixtures. The [source table](research/2026-10-20-arena-shooting/arena-eras.csv)
retains observed game bounds, coordinate methods and citations. Production is not changed by
preparation, local rehearsal or analytics regeneration; a new exact-manifest owner approval
is required. The transition preserves historical prediction rows and playoff revisions.

## Fatigue and predictions

`src/lib/fatigue.ts` combines ratified workload, travel, recovery, density, altitude, road-trip,
and time-zone terms. Tip-off, overtime, and prior-game context feed the calculation where available.
The score is written to `fatigue_scores`; pages read stored results. Upcoming projections are
labeled separately from measured fatigue. Do not copy the coefficients into this guide.

`publishableGames()` and module-specific eligibility rules govern published regular-season
reads. Headline outcomes use rested home teams and their venue baseline. The full coefficient
study, exclusions, amendments, and authorization boundary are in
[ADR 0006](adr/0006-fatigue-weights-were-fitted-and-the-model-was-not-changed.md).

## Offline publications

| Publication | Producers | Serving path |
| --- | --- | --- |
| Player Shooting by Rest | `fetch_shooting_data.py` → `analyze_player_shooting.py` → `export_player_rest.py` | `public/data/player-rest.json`, consumed by Shooting and its zero-rest workload disclosure |
| Availability | `ml/availability_cost.py`, `availability_quality.py`, `availability_facts.py` | Generated facts and pinned TypeScript mirror |
| Playoff series | `fetch_playoffs.py`, `fetch_play_in.py` → `ml/build_series_dataset.py`, `compute_series_features.py`, `train_series_model.py`, `predict_series.py` | Series/prediction tables and `/api/playoffs` |
| Previous-round workload | `ml/compute_prior_grind.py`, `playoff_rest_report.py` | Published playoff facts |
| Shot Value | `collect_shot_data.py` → `aggregate_shot_grid.py` → `sq4_train_shot_value.py` / `sq4b_train_gbm.py` → `sq5_write_surface.py` | Manual-schema shot tables and `/api/shot-quality` |
| Historical referee studies | `fetch_officials.ts`, `fetch_playoff_officials.ts`, `analyze_officials_splits.ts`, `ml/referee_*.py`, `build_referee_legends.py` | Committed exports, rendered at `/behind-the-data/referees/archive` |
| Officiating | `ml/collect_l2m_season.py` → `publish_officiating.py`; historical PDF/JSON archive normalization described in [operations](OFFICIATING.md) | Compact season index and content-addressed public report JSON |

Paths without a prefix in the producer column are under `scripts/`. Do not run all these tools
on every update: they have different data dependencies, validation protocols, and write scopes.

## Reproducibility and storage

Raw caches and local model binaries live under ignored `ml/data/` and `ml/shot_value/`. Published
artifacts in `src/data/`, `public/data/`, and model-facts files stay tracked, together with producing
scripts, validation reports, pre-registrations, and pinning tests. Do not hand-edit published
figures. Historical snapshots remain valid evidence when their date and scope are explicit.

Officiating's workflow retains raw source artifacts for its configured retention period, fails
incomplete collection, and prepares a review branch. Publication occurs only after preview review,
merge, and deployment. See [Officiating operations](OFFICIATING.md) for source continuity and revisions.

SQL changes are manual records in `drizzle/`. `src/lib/db/schema.ts` intentionally omits the shot
tables; ORM schema push/generate is not a safe bootstrap. See [Database](DATABASE.md).
