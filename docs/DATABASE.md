# Database

Schema, migrations, RLS, and Data API grants — all transcribed from
`src/lib/db/schema.ts` and `drizzle/*.sql`. Column names below are the **physical
PostgreSQL column** (with the Drizzle field name in parentheses where they differ).

## Conventions

- Engine: **Supabase PostgreSQL**, accessed two ways:
  - server/pipeline via **postgres-js + Drizzle** using `DATABASE_URL` (service role);
  - browser via **supabase-js** Realtime using the anon key.
- All four app tables use a `serial` integer **primary key** named `id`.
- `date` columns are SQL `date` (stored/queried as `YYYY-MM-DD` strings).
- `decimal` columns come back from postgres-js as **strings** and are `parseFloat`-ed in
  `queries.ts` (e.g. `score`, `latitude`, multipliers).
- Base tables (`teams`, `games`, `fatigue_scores`, `predictions`) are created by
  `pnpm drizzle-kit push` from `schema.ts`. Newer tables ship as **hand-applied,
  standalone** SQL files pasted into the Supabase SQL editor instead: `playoff_series`
  (`0006`) and `playoff_series_predictions` (`0007`) — both declared in `schema.ts` even
  though they're hand-applied — and `shot_grid` / `shot_value_surface` (`0008`), which are
  **intentionally not declared in `schema.ts`** (`queries.ts` comment: schema.ts lags the
  live schema for these two, so they're read via raw SQL). `drizzle.config.ts`'s
  `tablesFilter` only lists `["teams", "games", "fatigue_scores", "predictions",
  "playoff_series"]` — `playoff_series_predictions`, `shot_grid`, and `shot_value_surface`
  are absent from it, so `drizzle-kit push`/`generate` never touches any of the three. The
  `drizzle/` folder contains **incremental** migrations `0001`–`0008` (there is **no
  committed `0000` initial migration** and no `meta/` snapshot folder).

## ER overview

```
teams (1) ──────< games.home_team_id           (FK)
teams (1) ──────< games.away_team_id           (FK)
teams (1) ──────< fatigue_scores.team_id       (FK)
teams (1) ──────< predictions.predicted_advantage_team_id (FK)
teams (1) ──────< predictions.actual_winner_id (FK, nullable)

games (1) ──────< fatigue_scores.game_id       (FK)  — 2 rows per game (home + away)
games (1) ──────< predictions.game_id          (FK)  — 0..n rows per game (latest wins)

teams (1) ──────< playoff_series.home_court_team_id    (FK)   ┐ in-progress Playoff Predictor
teams (1) ──────< playoff_series.opponent_team_id      (FK)   │ (additive, isolated — no
teams (1) ──────< playoff_series.series_winner_team_id (FK, nullable) ┘ existing query reads it)

playoff_series (1) ─< playoff_series_predictions.series_id      (FK)  — 0..n rows per series
teams (1)          ──< playoff_series_predictions.predicted_winner_team_id (FK)

teams (1) ──────< shot_grid.team_id (FK, nullable — NULL = league-wide)   ┐ Shot Quality
shot_value_surface has no FK to teams (keyed by season/cell_x/cell_y/model_version) ┘ (additive,
                                                             isolated — no existing query reads it)
```

Drizzle `relations()` are declared for all of the above (`teamsRelations`,
`gamesRelations`, `fatigueScoresRelations`, `predictionsRelations`) with named relations
(`homeTeam`/`awayTeam`, `predictedAdvantageTeam`/`actualWinner`). Note: relations are
metadata for the Drizzle relational API; the actual queries in `queries.ts` use explicit
`alias()` + join builders.

## Table: `teams`

30 rows, seeded by `scripts/seed_teams.py`.

| Column | Type | Null | Default | Key / notes |
|--------|------|------|---------|-------------|
| `id` | serial | no | auto | **PK** |
| `abbreviation` | varchar(3) | no | — | **unique** (e.g. `LAL`) |
| `name` | varchar | no | — | e.g. `Lakers` |
| `city` | varchar | no | — | e.g. `Los Angeles` |
| `conference` | varchar | no | — | `East` / `West` |
| `latitude` | decimal | no | — | arena latitude |
| `longitude` | decimal | no | — | arena longitude |
| `altitude_flag` (`altitudeFlag`) | boolean | no | `false` | `true` only for **DEN** and **UTA** |

No secondary indexes beyond the PK and the unique `abbreviation`.

## Table: `games`

| Column | Type | Null | Default | Key / notes |
|--------|------|------|---------|-------------|
| `id` | serial | no | auto | **PK** |
| `external_id` (`externalId`) | varchar | no | — | **unique**; 10-digit NBA stats `GAME_ID` (zero-padded). Regular season starts `002`. Conflict target for all upserts. |
| `date` | date | no | — | game date (`YYYY-MM-DD`). See UTC-vs-ET note below. |
| `season` | varchar | no | — | `"YYYY-YY"` label |
| `home_team_id` (`homeTeamId`) | integer | no | — | **FK → teams.id** |
| `away_team_id` (`awayTeamId`) | integer | no | — | **FK → teams.id** |
| `home_score` (`homeScore`) | integer | yes | — | null until final |
| `away_score` (`awayScore`) | integer | yes | — | null until final |
| `status` | varchar | no | `'scheduled'` | `scheduled` / `live` / `final` |
| `game_type` (`gameType`) | varchar(16) | no | `'regular'` | `regular` / `playoffs` / `finals`. App filters to `regular`. |
| `overtime_periods` (`overtimePeriods`) | integer | no | `0` | 0 = regulation, 1 = one OT, … |

**Indexes:** `games_date_idx (date)`, `games_status_idx (status)`,
`games_home_team_idx (home_team_id)`, `games_away_team_idx (away_team_id)`.

**Verified counts (2026-06-29, read-only `SELECT`):** 49,348 rows — **`regular` 46,167**
(`002`), `playoffs` 2,827 + `finals` 318 (`004`), `play_in` 36 (`005`). The tag-integrity
guard (`external_id` prefix ↔ `game_type`) reports **0 mismatches** — no `004`/`005` row is
mislabeled `regular`, so nothing leaks into the regular-season product.

**Discrepancies to know:**
- Migration `0001_add_game_type.sql` adds `game_type varchar` (no length), while
  `schema.ts` declares `varchar(16)`. Same column, different declared length.
- Migration `0003_games_moneylines.sql` adds `home_moneyline` and `away_moneyline`
  (`integer`, nullable). These columns exist **in the DB only** — they are **not present in
  `schema.ts`** and no tracked script populates or reads them.
- **UTC-vs-ET `date`:** `fetch_nba_schedule_cdn.py` writes `date` as the UTC calendar date
  of tip-off; `fetch_schedule.py` (nba_api) writes the ET `GAME_DATE`. Upserts conflict on
  `external_id` and do **not** update `date`, so the value is fixed by whichever writer
  inserts the row first.

## Table: `fatigue_scores`

Two rows per game (one per team). Latest-by-`computed_at` wins in reads
(`selectDistinctOn` on `(game_id, team_id)` in `queries.ts`).

| Column | Type | Null | Default | Notes |
|--------|------|------|---------|-------|
| `id` | serial | no | auto | **PK** |
| `game_id` (`gameId`) | integer | no | — | **FK → games.id** |
| `team_id` (`teamId`) | integer | no | — | **FK → teams.id** |
| `score` | decimal | no | — | composite fatigue (0 = fully rested, 15+ = severe) |
| `decay_load_score` (`decayLoadScore`) | decimal | no | — | exponential-decay workload component |
| `travel_load_score` (`travelLoadScore`) | decimal | no | — | log-scaled travel component |
| `b2b_multiplier` (`backToBackMultiplier`) | decimal | no | — | `1.38` if back-to-back else `1.0` |
| `altitude_multiplier` (`altitudeMultiplier`) | decimal | no | — | `1.15` if visiting altitude else `1.0` |
| `density_multiplier` (`densityMultiplier`) | decimal | no | — | schedule-stress multiplier (stored name for "schedule density") |
| `freshness_bonus` (`freshnessBonus`) | decimal | no | — | ≤ 0; extended-rest discount |
| `games_in_last_7_days` (`gamesInLast7Days`) | integer | no | — | prior games in 7 calendar days |
| `games_in_last_30_days` (`gamesInLast30Days`) | integer | no | `0` | added in `0002` |
| `travel_distance_miles` (`travelDistanceMiles`) | decimal | no | — | summed flight legs in the 7-day travel window |
| `is_back_to_back` (`isBackToBack`) | boolean | no | — | days since last game = 1 |
| `days_since_last_game` (`daysSinceLastGame`) | integer | yes | — | null = opener / no prior game |
| `is_overtime_penalty` (`isOvertimePenalty`) | boolean | no | `false` | prior game went to OT |
| `road_trip_consecutive_away` (`roadTripConsecutiveAway`) | integer | no | `0` | consecutive away games (incl. tonight when away); added in `0002` |
| `is_three_in_four` (`isThreeInFour`) | boolean | no | `false` | ≥3 games in a rolling 4-day span; added in `0002` |
| `is_four_in_six` (`isFourInSix`) | boolean | no | `false` | ≥4 games in a rolling 6-day span; added in `0002` |
| `has_coast_to_coast_road_swing` (`hasCoastToCoastRoadSwing`) | boolean | no | `false` | large E–W spread on trip; added in `0002` |
| `computed_at` (`computedAt`) | timestamp | no | `now()` | used to pick the newest row per (game, team) |

**Verified coverage (2026-06-29, read-only `SELECT`):** of **46,167** final regular-season
games, only **8** are missing a `fatigue_scores` row on either side (all in 2025-26; ≈0.017%) —
they simply don't surface in analysis (which inner-joins fatigue). Remediable with
`pnpm exec tsx scripts/backfill_fatigue.ts`.

**Indexes:** `fatigue_scores_game_id_idx (game_id)`,
`fatigue_scores_team_id_idx (team_id)`.

**Not persisted:** `calculateFatigue` also returns `roadSegmentLoadScore` and
`overtimeFatigueBonus`, but there are **no DB columns** for them — they're folded into
`score` only.

## Table: `predictions`

| Column | Type | Null | Default | Notes |
|--------|------|------|---------|-------|
| `id` | serial | no | auto | **PK** |
| `game_id` (`gameId`) | integer | no | — | **FK → games.id** |
| `predicted_advantage_team_id` (`predictedAdvantageTeamId`) | integer | no | — | **FK → teams.id**; the more-rested (lower-fatigue) team |
| `rest_advantage_differential` (`restAdvantageDifferential`) | decimal | no | — | `awayFatigue − homeFatigue` at prediction time |
| `actual_winner_id` (`actualWinnerId`) | integer | yes | — | **FK → teams.id**; null = open/ungraded |
| `created_at` (`createdAt`) | timestamp | no | `now()` | backfill sets it to the game date |

**Index:** `predictions_game_id_idx (game_id)`.

Lifecycle: `run-daily.ts` deletes open (`actual_winner_id IS NULL`) predictions for
scheduled games on the target window and re-inserts them; neutral games (`|RA| < 0.5`) get
**no** prediction row. `backfill_predictions.ts` inserts resolved rows (with
`actual_winner_id`) for finished games that don't already have one. Reads use the latest
row per game (`selectDistinctOn` on `game_id`).

## Table: `playoff_series` (Playoff Predictor)

One row per playoff **series** — the modeling unit for the Playoff Predictor module (design:
[PLAYOFF_PREDICTOR_DESIGN.md](PLAYOFF_PREDICTOR_DESIGN.md); status: [ROADMAP.md](ROADMAP.md)).
**Additive and isolated:** no regular-season query reads it. Per-game playoff rows still live in
`games` (tagged `playoffs`/`finals`/`play_in`); this table is **derived** from them in two passes —
the series skeleton (`ml/build_series_dataset.py`, round/winner/`is_best_of_7`/conference) and the
feature pass (`ml/compute_series_features.py`, the four `*_diff` columns below), both
`ON CONFLICT` upserts scoped to their own columns so neither clobbers the other. Defined in
`schema.ts` as `playoffSeries`; created by `drizzle/0006_playoff_series.sql`.

| Column | Type | Null | Default | Notes |
|--------|------|------|---------|-------|
| `id` | serial | no | auto | **PK** |
| `season` | varchar | no | — | `"YYYY-YY"` label |
| `round` | smallint | no | — | 1 = first round … 4 = Finals |
| `conference` | varchar | yes | — | `East`/`West`; null for the Finals (cross-conference) |
| `home_court_team_id` (`homeCourtTeamId`) | integer | no | — | **FK → teams.id**; the §1 reference team |
| `opponent_team_id` (`opponentTeamId`) | integer | no | — | **FK → teams.id** |
| `is_best_of_7` (`isBestOf7`) | boolean | no | — | false = best-of-5 (first round, season start ≤ 2001) |
| `series_winner_team_id` (`seriesWinnerTeamId`) | integer | yes | — | **FK → teams.id**; null until resolved |
| `home_court_wins` (`homeCourtWins`) | smallint | yes | — | games won; null until resolved |
| `opponent_wins` (`opponentWins`) | smallint | yes | — | games won; null until resolved |
| `seed_diff` (`seedDiff`) | decimal | yes | — | regular-season Win%-rank proxy, `(opponent − home-court)`; populated for all 600 rows |
| `win_pct_diff` (`winPctDiff`) | decimal | yes | — | dominant model feature (see `playoff_series_predictions` below); populated for all 600 rows |
| `entry_rest_diff` (`entryRestDiff`) | decimal | yes | — | headline rust-vs-rest signal; populated for all 600 rows |
| `h2h_diff` (`h2hDiff`) | decimal | yes | — | populated for all 600 rows |
| `external_series_key` (`externalSeriesKey`) | varchar | no | — | **unique**; deterministic `"{season}_{abbrA}-{abbrB}"` for idempotent upserts |
| `computed_at` (`computedAt`) | timestamp | no | `now()` | last build time |

**Index:** `playoff_series_season_idx (season)` (plus the unique index on `external_series_key`).

> The skeleton builder's `ON CONFLICT … DO UPDATE` deliberately omits the four feature columns,
> and the feature pass's upsert writes only those columns — so the two passes can re-run
> independently without clobbering each other. RLS + Data API grants for this table ship in `0006`
> (mirroring `0004`/`0005`). **Verified 2026-07-02** (read-only `SELECT`): **600 series** rows — 40
> seasons × 15 (1985-86…2025-26, 2019-20 excluded); 599 have a resolved `series_winner_team_id` (1
> unresolved: 1986-87 LAL–OKC 3–1, one missing historical `004` game); **all 600 rows have all four
> feature columns non-NULL**. The trainable set for modeling is **599** (label present AND all 4
> features present) [Verified `ml/PHASE3_REPORT.md:39-42`].

## Table: `playoff_series_predictions` (Playoff Predictor)

Model-output table for the Playoff Predictor: one row per series × prediction method ×
model version. Defined in `schema.ts` as `playoffSeriesPredictions` (unlike `shot_grid`/
`shot_value_surface` below, it **is** declared there because `GET /api/playoffs` queries it
via Drizzle — see [API.md](API.md)); created by `drizzle/0007_playoff_series_predictions.sql`.
Consumed by `getPlayoffSeriesWithPredictions` (`queries.ts`), which reads two prediction
methods per series (`fullInsample`, `walkForwardOos`) via aliased self-joins.

| Column | Type | Null | Default | Notes |
|--------|------|------|---------|-------|
| `id` | serial | no | auto | **PK** |
| `series_id` (`seriesId`) | integer | no | — | **FK → playoff_series.id** |
| `external_series_key` (`externalSeriesKey`) | varchar | no | — | denormalized copy of the series' business key (join-free display/audit) |
| `predicted_home_court_win_prob` (`predictedHomeCourtWinProb`) | decimal | no | — | `P(series winner == home-court team)` |
| `predicted_winner_team_id` (`predictedWinnerTeamId`) | integer | no | — | **FK → teams.id**; home-court team when prob ≥ 0.5, else the opponent |
| `prediction_method` (`predictionMethod`) | varchar(32) | no | — | e.g. `"full_insample"` / `"walk_forward_oos"` |
| `model_version` (`modelVersion`) | varchar(32) | no | — | e.g. `"logistic_unreg_v1"` |
| `created_at` (`createdAt`) | timestamp | no | `now()` | |

**Unique:** `(series_id, prediction_method, model_version)`. **Index:**
`playoff_series_predictions_series_id_idx (series_id)`. RLS + Data API grants ship inline in
`0007` (mirroring `0004`/`0005`/`0006`). **Not** in `drizzle.config.ts`'s `tablesFilter`
despite being declared in `schema.ts` — see the Conventions note above.

**Verified 2026-07-02** (read-only `SELECT`): **1,049 rows total** — **599** `full_insample`
(one per trainable series) + **450** `walk_forward_oos` (skips the first 10 min-train seasons per
`ml/predict_series.py`'s expanding window), all `model_version = 'logistic_unreg_v1'` (the
unregularized logistic selected in `ml/PHASE3_REPORT.md` §5). Model accuracy/log-loss/Brier: see
that report — headline is a **calibration** improvement over the majority baseline, not a
distinguishable accuracy win (§5, "Honest headline").

## Table: `shot_grid` (Shot Quality — Expected Shot Value / xeFG%)

Aggregated per-cell shot counts — the read model for the `/shot-quality` hexbin chart. A
league-wide row (`team_id IS NULL`) exists per `(season, cell_x, cell_y)`; the schema also
allows a per-team grain via a non-null `team_id`, though `getShotQualityGrid` only reads the
league-wide rows today. **Not declared in `schema.ts`** (intentional — see Conventions);
created by `drizzle/0008_shot_quality_grid.sql`; written by `scripts/aggregate_shot_grid.py`
(SQ-3); read-only from the API (`src/lib/db/queries.ts::getShotQualityGrid`).

| Column | Type | Null | Default | Notes |
|--------|------|------|---------|-------|
| `id` | serial | no | auto | **PK** |
| `season` | varchar | no | — | `"YYYY-YY"` label |
| `team_id` | integer | yes | — | **FK → teams.id**; `NULL` = league-wide |
| `cell_x` | smallint | no | — | 1ft × 1ft grid cell, half-court clip |
| `cell_y` | smallint | no | — | see [FRONTEND.md](FRONTEND.md) for the coordinate transform |
| `zone_basic` | varchar | yes | — | native `SHOT_ZONE_BASIC` label for the cell's dominant zone |
| `zone_range` | varchar | yes | — | native `SHOT_ZONE_RANGE` label |
| `zone_area` | varchar | yes | — | native `SHOT_ZONE_AREA` label |
| `fga` | integer | no | `0` | field-goal attempts in the cell |
| `fgm` | integer | no | `0` | field goals made in the cell |
| `fg3a` | integer | no | `0` | 3-point attempts in the cell |
| `fg3m` | integer | no | `0` | 3-point makes in the cell |
| `computed_at` | timestamp | no | `now()` | |
| `external_cell_key` | varchar | no | — | **unique**; deterministic key for idempotent upserts |

**Indexes:** `shot_grid_season_idx (season)`, `shot_grid_team_id_idx (team_id)`,
`shot_grid_season_team_idx (season, team_id)`.

> **Observation (not fixed — read-only migration file):** `drizzle/0008_shot_quality_grid.sql`
> line 22 has a typo, `CREATE INDEIF NOT EXISTS` (missing an `X`), on the `shot_grid_season_idx`
> statement. Since the table was hand-applied directly in the Supabase SQL editor (per the
> file's own header comment) rather than by running this file verbatim, the index may or may
> not actually exist as written here — **[Unknown]**, not re-verified against the live DB in
> this pass. Flagged for the human; this doc does not modify the SQL file.

## Table: `shot_value_surface` (Shot Quality — model output)

Model-output surface: predicted make probability / expected efficiency per grid cell, one row
per `(season, cell_x, cell_y, model_version)`. **Not declared in `schema.ts`**; created by
`drizzle/0008_shot_quality_grid.sql`; written by `scripts/sq5_write_surface.py` (SQ-5) from a
model trained on the **full** season range (not a single walk-forward fold — see
[SHOT_QUALITY_DESIGN.md](SHOT_QUALITY_DESIGN.md) §8); read by
`src/lib/db/queries.ts::getShotQualityGrid`, which LEFT JOINs this table twice (once per
`model_version`) onto `shot_grid`.

| Column | Type | Null | Default | Notes |
|--------|------|------|---------|-------|
| `id` | serial | no | auto | **PK** |
| `season` | varchar | no | — | `"YYYY-YY"` label |
| `cell_x` | smallint | no | — | matches `shot_grid.cell_x` |
| `cell_y` | smallint | no | — | matches `shot_grid.cell_y` |
| `model_version` | varchar | no | — | `"gbm-v1"` or `"baseline-zone-v1"` (`SHOT_MODEL_GBM` / `SHOT_MODEL_BASELINE` in `queries.ts`) |
| `p_make` | numeric | yes | — | predicted `P(make)`, `[0, 1]` |
| `expected_efg` | numeric | yes | — | expected effective FG% for the cell |
| `xpps` | numeric | yes | — | expected points per shot |
| `created_at` | timestamp | no | `now()` | |
| `external_surface_key` | varchar | no | — | **unique**; deterministic key for idempotent upserts |

**Indexes:** `shot_value_surface_season_idx (season)`,
`shot_value_surface_season_model_idx (season, model_version)`.

**Verified (`ml/shot_value/sq5_surface_summary.txt`, `ml/shot_value/sq5_db_verify.txt`):**
55,036 league-wide `shot_grid` cells across 30 seasons (1996-97…2025-26); **110,072**
`shot_value_surface` rows (55,036 cells × 2 model versions); DB reconciliation reported
**PASS** with `distinct_keys = 110072 = total_rows`; `p_make`/`expected_efg`/`xpps` values
confirmed within their `[0, 1]` / `[0, 3]` bounds for both model versions.

## Row-Level Security — `drizzle/0004_enable_rls.sql`

RLS is **enabled** on all four tables:

```sql
ALTER TABLE public.teams           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fatigue_scores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions     ENABLE ROW LEVEL SECURITY;
```

Policies (identical wording per table):

| Policy name | Command | Using clause |
|-------------|---------|--------------|
| `Allow public read` | `FOR SELECT` | `USING (true)` |
| `Allow service role all` | `FOR ALL` | `USING (auth.role() = 'service_role')` |

So anon clients can read every row; the service role can do everything.

## Data API grants — `drizzle/0005_supabase_grants.sql`

Supabase's Data API (PostgREST/supabase-js) requires explicit grants (enforced for new
projects May 30 2026; existing projects Oct 30 2026). Grants, exactly as written:

```sql
grant select on public.teams          to anon;
grant select on public.games          to anon;
grant select on public.fatigue_scores to anon;
grant select on public.predictions    to anon;

grant select, insert, update, delete on public.teams          to service_role;
grant select, insert, update, delete on public.games          to service_role;
grant select, insert, update, delete on public.fatigue_scores to service_role;
grant select, insert, update, delete on public.predictions    to service_role;
```

| Role | Grant | Used by |
|------|-------|---------|
| `anon` | `SELECT` only | browser reads via supabase-js (Realtime + public browsing) |
| `service_role` | `SELECT, INSERT, UPDATE, DELETE` | API handlers + pipeline scripts (`DATABASE_URL`) |

**When adding a new public table:** add a new migration mirroring `0005` (a `grant select
… to anon` and a `grant select, insert, update, delete … to service_role`) **and** an RLS
block mirroring `0004`, or the Data API won't expose it after the enforcement dates. Apply
migrations manually (e.g. Supabase SQL editor) — nothing in the repo auto-applies them.
`drizzle/0006_playoff_series.sql` is the worked example: it bundles the table, RLS policies,
and grants for `playoff_series` in one standalone file. `0007_playoff_series_predictions.sql`
and `0008_shot_quality_grid.sql` follow the same bundled pattern (`0008` bundles RLS +
grants for **two** tables, `shot_grid` and `shot_value_surface`, in one file).

## Migration history

| File | Effect |
|------|--------|
| `0001_add_game_type.sql` | Add `games.game_type` (`'regular'` default) + backfill `playoffs`/`finals` from `external_id` `004` prefix and month. |
| `0002_fatigue_schedule_road.sql` | Add `games_in_last_30_days`, `road_trip_consecutive_away`, `is_three_in_four`, `is_four_in_six`, `has_coast_to_coast_road_swing` to `fatigue_scores`. |
| `0003_games_moneylines.sql` | Add `home_moneyline`, `away_moneyline` to `games` (not modeled in `schema.ts`). |
| `0004_enable_rls.sql` | Enable RLS + public-read / service-role-all policies on all four tables. |
| `0005_supabase_grants.sql` | Explicit Data API grants for `anon` (SELECT) and `service_role` (CRUD). |
| `0006_playoff_series.sql` | Create `playoff_series` (in-progress Playoff Predictor) + its RLS policies and Data API grants (mirrors `0004`/`0005`). Standalone SQL — not generated by `drizzle-kit`. |
| `0007_playoff_series_predictions.sql` | Create `playoff_series_predictions` (Playoff Predictor model output) + its RLS policies and Data API grants. Standalone SQL. |
| `0008_shot_quality_grid.sql` | Create `shot_grid` + `shot_value_surface` (Shot Quality / Expected Shot Value) + RLS policies and Data API grants for both. Standalone SQL; hand-applied in the Supabase SQL editor per the file's own header comment. |

The **next migration number is `0009`**. `drizzle.config.ts` restricts introspection to
`schemaFilter: ["public"]`,
`tablesFilter: ["teams","games","fatigue_scores","predictions","playoff_series"]` (unchanged
by `0007`/`0008` — see the Conventions note above), and `extensionsFilters: ["postgis"]` (the
last avoids drizzle-kit choking on Supabase-internal schemas/constraints).
