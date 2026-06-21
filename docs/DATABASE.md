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
- Base tables are created by `pnpm drizzle-kit push` from `schema.ts`. The `drizzle/`
  folder contains only **incremental** migrations `0001`–`0005` (there is **no committed
  `0000` initial migration** and no `meta/` snapshot folder).

## ER overview

```
teams (1) ──────< games.home_team_id           (FK)
teams (1) ──────< games.away_team_id           (FK)
teams (1) ──────< fatigue_scores.team_id       (FK)
teams (1) ──────< predictions.predicted_advantage_team_id (FK)
teams (1) ──────< predictions.actual_winner_id (FK, nullable)

games (1) ──────< fatigue_scores.game_id       (FK)  — 2 rows per game (home + away)
games (1) ──────< predictions.game_id          (FK)  — 0..n rows per game (latest wins)
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

## Migration history

| File | Effect |
|------|--------|
| `0001_add_game_type.sql` | Add `games.game_type` (`'regular'` default) + backfill `playoffs`/`finals` from `external_id` `004` prefix and month. |
| `0002_fatigue_schedule_road.sql` | Add `games_in_last_30_days`, `road_trip_consecutive_away`, `is_three_in_four`, `is_four_in_six`, `has_coast_to_coast_road_swing` to `fatigue_scores`. |
| `0003_games_moneylines.sql` | Add `home_moneyline`, `away_moneyline` to `games` (not modeled in `schema.ts`). |
| `0004_enable_rls.sql` | Enable RLS + public-read / service-role-all policies on all four tables. |
| `0005_supabase_grants.sql` | Explicit Data API grants for `anon` (SELECT) and `service_role` (CRUD). |

`drizzle.config.ts` restricts introspection to `schemaFilter: ["public"]`,
`tablesFilter: ["teams","games","fatigue_scores","predictions"]`, and
`extensionsFilters: ["postgis"]` (the last avoids drizzle-kit choking on Supabase-internal
schemas/constraints).
