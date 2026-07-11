# Data pipeline & fatigue model

Two halves: **Python** ingests schedule/score/OT data into `games`/`teams`; **TypeScript**
(`tsx`) computes `fatigue_scores` and `predictions` using `src/lib/fatigue.ts`. All
constants below are copied from the source.

## Orchestration: `scripts/daily_update.py`

GitHub Actions entry point (also runnable locally). Time base is **America/New_York**.

Window: `LOOKBACK_DAYS = 7`, `LOOKAHEAD_DAYS = 60` → operates over `[today−7, today+60]`.

Steps:
0. **Season gate (runs first, stdlib-only).** `season_window.is_in_season(today ET)` reads the
   live NBA CDN schedule (regular-season `002` tip dates, ±`SEASON_BUFFER_DAYS = 3`), with a
   coarse Oct 1–Apr 30 calendar fallback on any fetch/parse failure or empty payload. In the
   offseason it logs and `sys.exit(0)` **before** resolving `DATABASE_URL` or importing any
   DB-coupled module — so the offseason run needs no secret and never hits an NBA API.
1. **Resolve `DATABASE_URL`** from the process env, else `.env.local`, else `scripts/.env`
   (`resolve_database_url`).
2. **Seed future games from the NBA CDN** — `fetch_cdn_schedule()` → `build_cdn_records(…,
   utc_month_filter=None)` → `upsert_cdn_records` (idempotent upsert).
3. **Pull the windowed slate from `nba_api`** — `fetch_league_df_date_range(start, end)`
   (`LeagueGameFinder`, 3 retries on timeout). On repeated timeout it logs a warning and
   continues with an empty frame. Rows are paired with `pair_games_from_date_range_df(…,
   force_skip_ot=True)` (skips per-game OT during the bulk pass) and upserted.
4. **Refresh OT for recent finals** — `refresh_ot_lookback_finals` updates
   `overtime_periods` for finals dated in `[today−7, today)` via `fetch_overtime_periods`
   (bounded BoxScore calls), keeping prior-game OT accurate for fatigue.
5. **Run the Node modeling step** — `pnpm exec tsx scripts/run-daily.ts <today ET>`; a
   non-zero exit fails the job.

## Python ingest scripts

### `fetch_schedule.py` — full historical seed
- Seasons **1985-86 → 2025-26**, **excluding 2019-20** (COVID bubble). `SEASON_TYPES =
  ["Regular Season"]` only; playoffs never fetched.
- Each game appears twice in `LeagueGameFinder` (one row per team); rows are paired by
  `GAME_ID` using `MATCHUP` (`vs.` = home, `@` = away).
- Keeps only regular-season IDs (`is_regular_season_game_id` → `002` prefix); normalizes
  abbreviations via `ABBR_ALIASES` (e.g. `CHO/CHH→CHA`, `SEA→OKC`, `VAN→MEM`, `NJN→BKN`,
  `GOS→GSW`, `PHL→PHI`, `SAN→SAS`, `UTH→UTA`).
- `get_game_type` tags `finals` (`004` prefix + month ≥ 6) / `playoffs` (`004`) / `regular`.
- Upsert: `INSERT … ON CONFLICT (external_id) DO UPDATE` refreshing `home_score`,
  `away_score`, `status`, `overtime_periods`, `game_type`.
- `API_DELAY_SECONDS = 1`. `NBA_SEED_SKIP_OT=1` skips BoxScore OT (OT stays 0; much faster).
- Also exports the date-range helpers (`fetch_league_df_date_range`,
  `pair_games_from_date_range_df`, `upsert_game_records`) reused by `daily_update.py`.

### `fetch_nba_schedule_cdn.py` — current/future schedule
- Source: `https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json`
  (`leagueSchedule.gameDates[].games[]`).
- Regular season only (`gameId` prefix `002`). `games.date` = **US/Eastern calendar date**
  of `gameDateTimeUTC` — the NBA's scheduling day, same convention as nba_api's
  `GAME_DATE`. (Historically this stored the *UTC* date, pushing every ~8 PM ET tip onto
  the next day — e.g. the Apr 12, 2026 finale rendered as 7 + 8 games across two days;
  fixed 2026-07-11, repaired via the self-healing upsert below.)
- Upsert: `date = EXCLUDED.date` (schedule truth wins — self-heals mis-dated rows),
  `home_score = COALESCE(EXCLUDED.home_score, games.home_score)` (same for away) and never
  downgrades a `final` status back to `scheduled`. `main()` logs a pre-upsert
  date-mismatch report so CI runs show exactly which rows were repaired.
- New CDN rows are inserted with `overtime_periods = 0`, `game_type = 'regular'`.
- Optional `month_filter=(year, month)` (ET); `None` = whole regular-season payload.
- Manual repair: dispatch the GitHub Actions workflow with `task=resync-schedule`
  (bypasses the season gate; the CDN geo-blocks non-US IPs, so run it from CI).

### `nba_ot_periods.py` — overtime detection
- `fetch_overtime_periods(game_id, delay_seconds=0.65)` calls `BoxScoreSummaryV2`, reads
  the last `PERIOD`, returns `max(0, period − 4)` (period 5 ⇒ 1 OT). Returns `0` on any
  failure. Rate-limited by a sleep before each call.

### `seed_teams.py` — teams + geography
- Inserts all 30 teams (`abbreviation, name, city, conference, latitude, longitude,
  altitude_flag`) with `ON CONFLICT (abbreviation) DO NOTHING`.
- **`altitude_flag = True` only for DEN (Denver, ~5,280 ft) and UTA (Salt Lake City,
  ~4,226 ft).** All others `False`. Coordinates are the arena lat/long used by the
  haversine travel model.

### `backfill_historical.py` — one-shot older-seasons seed
- Seasons **2005-06 → 2014-15** (regular season only), retries + exponential backoff,
  batched inserts (`INSERT_BATCH_SIZE = 300`, `ON CONFLICT DO NOTHING`).
- After a clean ingest, invokes `scripts/backfill_fatigue.ts 2005-10-01 2015-06-30`.
- Flags: `--dry-run` (first season, no writes), `--skip-fatigue`. `NBA_API_DELAY_SECONDS`
  (default `1.0`) and `NBA_SEED_SKIP_OT=1` recommended. Prints a per-season validation
  table (expected ≈1230 regular games; 990 for the 2011-12 lockout). Exposed as
  `pnpm backfill:historical`.

### `backfill_game_types.py` — tag playoffs/finals
- Re-derives `game_type` for rows whose `external_id LIKE '004%'` (finals if month ≥ 6,
  else playoffs); leaves `regular` rows untouched. Prints a `game_type` breakdown.

### `season_window.py` — season gate (used by `daily_update.py`)
- `is_in_season(today)` returns whether today (ET) is inside the active NBA regular season.
  Primary signal: the live NBA CDN schedule (`scheduleLeagueV2.json`, `002` gameId dates) parsed
  with **stdlib only** (no DB import, no secret) so it can run before `daily_update.py` touches
  `DATABASE_URL`; coarse **Oct 1–Apr 30** fallback on any failure. `SEASON_BUFFER_DAYS = 3`
  absorbs UTC-vs-ET boundary fuzz. Runnable standalone for a quick in/out-of-season check.

## Playoff Predictor pipeline (complete)

A **separate, isolated** ingestion + series-build path for the Playoff Predictor module (design:
[PLAYOFF_PREDICTOR_DESIGN.md](PLAYOFF_PREDICTOR_DESIGN.md); status + remaining phases:
[ROADMAP.md](ROADMAP.md)). These scripts are **not** part of `daily_update.py` — they are run
manually. They never modify regular-season (`002`) rows, never touch `fatigue.ts`, and never
rename the rest-advantage metric. **Verified 2026-07-02** (read-only `SELECT`): 2,827 `playoffs`
+ 318 `finals` (`004`) + 36 `play_in` (`005`) game rows are present; the skeleton pass built
**600 series**, the feature pass populated all four feature columns (599 trainable), and a
walk-forward logistic model persisted **1,049** predictions; the tag-integrity guard reports
**0** prefix↔`game_type` mismatches. Full build record:
[PLAYOFF_PREDICTOR_DESIGN.md](PLAYOFF_PREDICTOR_DESIGN.md).

### `scripts/fetch_playoffs.py` — ingest playoff/finals games (Phase 1)
- nba_api `LeagueGameFinder` with `season_type_nullable="Playoffs"` for each in-scope season
  (1985-86 → current, **2019-20 excluded**; season list imported from `fetch_schedule.SEASONS`).
- Reuses `fetch_schedule.py`'s `_pair_games_dataframe` / `ABBR_ALIASES` / `get_game_type` /
  `INSERT … ON CONFLICT (external_id) DO UPDATE`. Keeps **only `004`-prefixed** IDs via
  `is_playoff_game_id` (the playoff analogue of the `002` gate). `get_game_type` tags `finals`
  (month ≥ 6) / `playoffs`. Dates use nba_api **ET** `GAME_DATE` (so first-round entry-rest day
  counts line up with regular-season rows). Flags: `--season YYYY-YY`, `--dry-run`.

### `scripts/fetch_play_in.py` — ingest play-in games (Phase 1b)
- Mirrors `fetch_playoffs.py` for the play-in tournament: `season_type_nullable="PlayIn"`,
  **`005`-prefixed** IDs (`is_play_in_game_id`), seasons **2020-21 → current**. Forces
  `game_type='play_in'` via a `game_type_override` (so play-in rows are not folded under
  `playoffs`). Play-in games are per-game substrate **only** (they feed first-round entry-rest);
  they are never series targets. Note: play-in dates fall **inside** the Oct 1–Apr 30 calendar
  guard, so the `play_in` tag is the only thing keeping them out of the regular-season product —
  the script audits + re-tags any pre-existing mislabeled `005` rows on upsert.

### `ml/build_series_dataset.py` — series skeleton builder (Phase 2b-i)
- Reads `games` rows with `game_type IN ('playoffs','finals')` (excludes `005` play-in and the
  `2019-20` bubble), groups them into series by `(season, unordered team-pair)`, sets the
  home-court team from the chronological opener's host, and tallies wins from **final** games.
- Derives `round` (1–4) via a **backward bracket walk** (Finals = latest-starting series; each
  advancing team's latest unassigned *won* series feeds the prior round — deliberately avoiding
  the naive "winner ∈ finalists" over-match), validated against `[8,4,2,1]` per season; sets
  `is_best_of_7` (bo5 only for first round with season start year ≤ 2001), `conference`, and the
  resolved `series_winner_team_id` (with win-count sanity warnings).
- Idempotent `ON CONFLICT (external_series_key) DO UPDATE` that refreshes **only** the skeleton
  columns — the four feature columns (`seed_diff`, `win_pct_diff`, `entry_rest_diff`, `h2h_diff`)
  are left NULL here and populated by the **2b-ii feature pass** (`ml/compute_series_features.py`,
  built), after which `ml/train_series_model.py` (walk-forward logistic) and `ml/predict_series.py`
  persist predictions — the full chain is documented in
  [PLAYOFF_PREDICTOR_DESIGN.md](PLAYOFF_PREDICTOR_DESIGN.md). `--dry-run` computes + validates
  without writing; a completed season that fails the 15-series/all-resolved invariant exits non-zero.

## Shot Quality pipeline — Expected Shot Value (xeFG%)

A **separate, isolated** ingestion + modeling + surface-write path for the Shot Quality
module (design: [SHOT_QUALITY_DESIGN.md](SHOT_QUALITY_DESIGN.md)). These scripts are **not**
part of `daily_update.py` — they are run manually, once, from the **`ml/.venv`** isolated
virtualenv (`ml/requirements.txt`, which is the only place `scikit-learn` is pinned — not the
root/`scripts/` requirements files). Raw per-shot data never reaches Postgres; only aggregated
counts (`shot_grid`) and model output (`shot_value_surface`) do. They never touch
`fatigue.ts` and never rename the rest-advantage metric.

### `scripts/collect_shot_data.py` — bulk shot collector (Phase SQ-2)
- Resumable per-team-season collector for nba_api's `ShotChartDetail`. Writes **local-only**
  gzip-CSV caches to `ml/data/shots/{season}/{team_abbr}.csv.gz` — never connects to
  Postgres. `DELAY_SECONDS = 1.5`. A call that succeeds with 0 rows still writes a
  header-only placeholder file (so resumed runs don't re-query it); only exceptions/timeouts/
  malformed columns go to `_failures.log`. Flags: `--dry-run` (current season, all 30 teams),
  `--season YYYY-YY`, `--force` (re-pull and overwrite).

### `scripts/aggregate_shot_grid.py` — spatial grid aggregation (Phase SQ-3)
- Reads the SQ-2 local cache and folds it into a **1ft × 1ft grid** of atomic counts
  (`fga`/`fgm`/`fg3a`/`fg3m`) per cell: `cell_x = floor(LOC_X/10)`, `cell_y = floor(LOC_Y/10)`
  (origin = the rim; grid is unfolded, no left/right mirroring). Half-court clip:
  `LOC_X ∈ [-250, 250)`, `LOC_Y ∈ [-50, 420)`; out-of-grid shots are dropped and counted.
  Aggregates at two grains — per `(season, team)` and league-wide (`team_id IS NULL`) per
  season. Idempotent upsert on `external_cell_key = "{season}:{team_id or 'LG'}:{cell_x}:{cell_y}"`.
  A **measure → aggregate → integrity-check → upsert-with-reconciliation** pipeline: it probes
  the cache first (`_grid_probe.txt`), asserts `fgm ≤ fga` / `fg3m ≤ fg3a` / `fg3a ≤ fga` /
  `fg3m ≤ fgm` per row, and re-reads DB counts post-upsert to compare against the local
  aggregate before committing — any mismatch rolls back. Flags: `--dry-run`,
  `--measure-only`. **2019-20 is included** (no travel dependence — see §2 of the design doc).

### `scripts/sq4_train_shot_value.py` — baseline + logistic bake-off (Phase SQ-4)
- Trains/evaluates on the **local** per-shot cache only — never touches Postgres. Target =
  `SHOT_MADE_FLAG` → `P(make)`. Features (no tracking, no player identity): distance, angle
  (folds left/right), `is3`, `period`, `home` (dropped if its HTM/VTM match rate is too low).
  Two models: an empirical zone-average **baseline** (`SHOT_ZONE_BASIC × SHOT_ZONE_RANGE`) and
  a **logistic regression** (`sklearn`, `penalty='l2', C=1.0`). **Validation:** expanding-
  window walk-forward by season, val seasons **1997-98…2025-26 (29 folds)**, train = every
  earlier season. Metrics: log-loss/Brier (primary) + accuracy (secondary) + a calibration
  curve + expected-vs-actual eFG% by season/zone. Outputs land in `ml/shot_value/`
  (`sq4_metrics.txt`, `sq4_folds.csv`, `sq4_calibration.csv`, plus local-only pickles).

### `scripts/sq4b_train_gbm.py` — GBM bake-off (Phase SQ-4b)
- Adds a third location-only candidate, `sklearn.HistGradientBoostingClassifier`, under the
  **identical** walk-forward protocol. Imports SQ-4's loader/features/standardization/
  baseline/logit prediction paths verbatim and **re-derives SQ-4's pooled numbers as a
  hard-fail reproduction check** before reporting new GBM numbers — the machine-checked proof
  the three-way comparison is apples-to-apples. Same features as SQ-4 (only the model family
  changes); one frozen hyperparameter set (no per-fold tuning). Writes
  `ml/shot_value/sq4b_gbm_full.pkl` — the GBM fit on **all** loaded seasons (not a single
  walk-forward fold) — for SQ-5 to serve.

### `scripts/sq5_write_surface.py` — write the model-output surface (Phase SQ-5)
- **First DB-writing step.** Combines the local SQ-4/SQ-4b pickles with the read-only,
  league-grain `shot_grid` cells to compute a per-cell surface, upserted into
  `shot_value_surface` for two model versions per cell: **`gbm-v1`** (the adopted model —
  beat the zone baseline on pooled log-loss/Brier across all 29 folds) from
  `sq4b_gbm_full.pkl`, and **`baseline-zone-v1`** (the comparison floor — the zone-rate table
  embedded in `sq4_logit_full.pkl`). A grid cell has no period/home-away, so those two features
  are neutralized (period → the training mean; home → 0.5) when scoring a cell; only
  distance/angle carry real cell information. Per-cell 3PT weighting blends `P(make | is3=0)`
  and `P(make | is3=1)` by the cell's 3PA share. **DB contract:** the only table written is
  `shot_value_surface` (`shot_grid` is read-only; no TRUNCATE/DROP/ALTER). Idempotent upsert on
  `external_surface_key = "{model_version}:{season}:{cell_x}:{cell_y}"`. Flags:
  `--measure-only`, `--dry-run`, then a real run (compute + upsert + reconcile).

**Verified (`ml/shot_value/sq5_surface_summary.txt`, `ml/shot_value/sq5_db_verify.txt`,
`ml/shot_value/sq4b_metrics.txt`):** 55,036 league-wide `shot_grid` cells across 30 seasons
(1996-97…2025-26); 110,072 `shot_value_surface` rows (55,036 × 2 model versions), DB
reconciliation **PASS**. SQ-4b pooled walk-forward metrics (5,922,214 valid shots, 29 folds):
baseline log-loss `0.665382` / accuracy `61.59%`; logit log-loss `0.669353` / accuracy
`60.52%` (logit does **not** beat the baseline); GBM log-loss `0.660022` / accuracy `61.93%`
— GBM beats the baseline by **+0.81% log-loss / +1.06% Brier / +0.34pp accuracy**: a
calibration win, not a large accuracy win, consistent with the design doc's "coin-flip
per-shot" framing.

## TypeScript modeling scripts

### `scripts/run-daily.ts` — daily refresh
- Args: a single `YYYY-MM-DD`. Operates over `[date, date+14]`.
- Deletes existing `fatigue_scores` for those games, then recomputes both teams via
  `calculateFatigue` (recent games from `fetchRecentGamesForTeam`) and inserts fresh rows.
- For `scheduled` games in the window: deletes **open** predictions
  (`actual_winner_id IS NULL`) and re-inserts one per game where `|RA| ≥ 0.5`
  (`NEUTRAL_THRESHOLD = 0.5`); the predicted team is the lower-fatigue side.

### `scripts/backfill_fatigue.ts` — bulk fatigue
- Default: only games missing a home-side `fatigue_scores` row (idempotent). Optional
  `YYYY-MM-DD YYYY-MM-DD` range. `--force` wipes all `fatigue_scores` and recomputes every
  game. Chronological order (fatigue depends on prior games).
- `assertFatigueScoresSchema` fails fast if the `0002` columns are missing.

### `scripts/backfill_predictions.ts` — resolved predictions
- For every **final, regular** game with both fatigue rows and no existing prediction:
  predicts the lower-fatigue team, skips `|RA| < 0.5`, sets `actual_winner_id` from the
  final score, and stamps `created_at` with the game date. Prints overall backfill accuracy.

### `scripts/audit_data.ts` — coverage report
- Counts final-regular games missing home/away/either fatigue rows, scheduled games missing
  fatigue, total rows, and the `computed_at` range. Suggests `backfill_fatigue.ts --force`.

### Shared loaders
- `src/lib/fatigue-recent-games.ts::fetchRecentGamesForTeam` — final games in
  `[date − FATIGUE_RECENT_LOOKBACK_DAYS, date)` for a team, oldest→newest, mapped to
  `RecentGame` (team/opponent coords, `opponentAltitudeFlag`, `overtimePeriods`).
- `src/lib/load-env-local.ts::loadEnvLocal` — merges `.env.local` into `process.env` for
  `tsx` scripts (Next env isn't auto-loaded there).

## The fatigue model (`src/lib/fatigue.ts`)

`calculateFatigue(gameDate, recentGames, isVisitingAltitude, teamHomeLat, teamHomeLon,
currentVenueLat, currentVenueLon, currentGameIsHome) → FatigueResult`.

### Constants

| Name | Value | Meaning |
|------|-------|---------|
| `FATIGUE_RECENT_LOOKBACK_DAYS` | `30` | recent-games window loaded for the model |
| `TRAVEL_LOOKBACK_DAYS` | `7` | calendar window for summing travel legs |
| `DECAY_LOOKBACK_DAYS` | `30` | days of prior games included in decay load |
| `DECAY_RATE` | `0.52` | exponential decay rate per day |
| `GAME_BASE_COST` | `2.65` | per-game base fatigue before decay |
| `TRAVEL_SCALE` | `1.75` | travel load coefficient |
| `TRAVEL_REFERENCE_MILES` | `1000` | reference distance in the log term |
| `B2B_MULTIPLIER` | `1.38` | back-to-back multiplier |
| `ALTITUDE_MULTIPLIER` | `1.15` | visiting-altitude multiplier (DEN/UTA) |
| `FRESHNESS_MAX_BONUS` | `-2.0` | max (most negative) rest discount |
| `FRESHNESS_PLATEAU_DAYS` | `3` | rest-days plateau constant |
| `OVERTIME_SINGLE_BONUS` | `0.5` | prior game = 1 OT |
| `OVERTIME_MULTI_BONUS` | `1.0` | prior game ≥ 2 OT |
| `SCHEDULE_STRESS_MAX_MULT` | `1.42` | cap on the density multiplier |
| `SCHEDULE_STRESS_CURVE` | `0.058` | density slope per stress point |
| `ROAD_STREAK_SOFT` | `2` | free consecutive away games before road load starts |
| `ROAD_STREAK_PER_GAME` | `0.34` | road load per away game beyond the soft cap |
| `ROAD_COAST_TO_COAST_BONUS` | `0.88` | flat add for a coast-to-coast swing |
| `COAST_LON_SPREAD_DEG` | `26` | min longitude spread (deg) to flag a coast swing |
| `SAME_ARENA_MILES` | `1` | distance under which two venues count as the same |
| `EARTH_RADIUS_MILES` | `3958.8` | haversine radius (`src/lib/haversine.ts`) |

`WINDOW_STRESS` anchors (games in the last *days*, before tip): `{30: tough 18 / baseline
11}`, `{15: 9/6}`, `{12: 8/5}`, `{7: 5/3}`, `{6: 4/3}`.

### Components

**1. Decay load** — for each prior game `1 ≤ daysAgo ≤ 30`:

```
decayLoad += GAME_BASE_COST * exp(-DECAY_RATE * daysAgo)        // 2.65 * e^(-0.52 * daysAgo)
```
(rounded to 2 dp). Recent games dominate; an older game contributes exponentially less.

**2. Travel load** — great-circle (haversine) miles, summed over legs in the 7-day window,
then log-scaled:

```
travelLoad = totalMiles > 0 ? TRAVEL_SCALE * ln(1 + totalMiles / TRAVEL_REFERENCE_MILES) : 0
           = 1.75 * ln(1 + miles / 1000)
```
Travel legs follow this contract (no phantom "fly home" between two road games — a team
only flies home when its *next* game is at home):

| Previous | Current | Leg distance |
|----------|---------|--------------|
| Home | Away | home arena → opponent arena |
| Away | Away (other city) | previous road arena → opponent arena |
| Away | Home | previous road arena → home arena |
| Home | Home | 0 (home stand) |
| identical coords (< `SAME_ARENA_MILES`) | — | 0 |
| no prior game | Away | home → tonight's arena; Home → 0 |

**3. Road-segment load** — consecutive away games (incl. tonight when away):

```
roadLoad = ROAD_STREAK_PER_GAME * max(0, streak - ROAD_STREAK_SOFT) + (coast ? ROAD_COAST_TO_COAST_BONUS : 0)
         = 0.34 * max(0, streak - 2) + (coast ? 0.88 : 0)
```
`coast` is true when the longitude spread across home + road venues on the trip ≥ 26°.

**4. Schedule-density (stress) multiplier** — per `WINDOW_STRESS` window, count prior games;
if above `baseline`, add `min(1.15, (n − baseline)/(tough − baseline))` stress points; then:

```
densityMultiplier = 1 + min(SCHEDULE_STRESS_MAX_MULT - 1, stressPoints * SCHEDULE_STRESS_CURVE)
                  = 1 + min(0.42, stressPoints * 0.058)          // stored as density_multiplier
```

**5. Multipliers** — back-to-back (`daysSinceLastGame === 1` ⇒ `×1.38`) and altitude
(visiting DEN/UTA ⇒ `×1.15`).

**6. Freshness bonus** — when `daysSinceLastGame ≥ 3`:

```
freshnessBonus = FRESHNESS_MAX_BONUS * (1 - exp(-daysSinceLastGame / FRESHNESS_PLATEAU_DAYS))
               = -2.0 * (1 - e^(-daysRest / 3))                  // diminishing toward -2.0
```

**7. Overtime penalty** — from the **prior** game: `+1.0` if ≥ 2 OT, `+0.5` if exactly 1 OT,
else `0`.

### Final score

```
baseLoad      = decayLoad + travelLoad + roadLoad
multiplied    = baseLoad * b2bMult * altMult * densityMult
finalScore    = max(0, multiplied + freshnessBonus + overtimeBonus)     // rounded to 2 dp
```

Special cases:
- **No prior games + home tonight:** score `0` (fully rested baseline).
- **No prior games + away tonight (opener on the road):** score `= max(0, roadLoad for a
  1-game streak)`; multipliers/freshness/OT are not applied to the opener score (altitude is
  reported but not folded into this opener score).

### Rest advantage

```
restAdvantage differential = awayFatigue.score - homeFatigue.score   // calculateRestAdvantage, 2 dp
```
Sign/labeling (`buildRestAdvantage` in `queries.ts`, `NEUTRAL_THRESHOLD = 0.5`):
`diff > 0.5` ⇒ **home** advantaged, `diff < -0.5` ⇒ **away** advantaged, otherwise
**neutral** (no call). Positive differential means the away team is more fatigued.

## Historical team branding (`src/lib/team-history.ts`)

DB rows use **current** abbreviations; `getTeamBranding(currentAbbrev, season, fallback?)`
maps `(abbrev, season)` → display abbreviation/name/city/logo for relocated/renamed
franchises. Rules (by season start year):

| Current | Era → display | Years |
|---------|----------------|-------|
| BKN | New Jersey Nets (`NJN`) | 1985–2011 |
| OKC | Seattle SuperSonics (`SEA`) | 1985–2007 |
| MEM | Vancouver Grizzlies (`VAN`) | 1995–2000 |
| NOP | New Orleans Hornets (`NOH`) | 2002–2004, 2007–2012 |
| NOP | New Orleans/OKC Hornets (`NOK`) | 2005–2006 |
| CHA | Charlotte Bobcats | 2004–2013 |
| WAS | Washington Bullets (`WSB`) | 1985–1996 |

Logos: **historical** eras use ESPN PNGs
(`a.espncdn.com/i/teamlogos/nba/500/{abbr}.png`); **current** eras use the NBA CDN SVG
(`cdn.nba.com/logos/nba/{nbaId}/global/L/logo.svg`) where `nbaId` comes from
`src/lib/nba-team-ids.ts` (which also maps the historical codes to their franchise IDs).

## Cron cadence

| Scheduler | File | Schedule | Notes |
|-----------|------|----------|-------|
| GitHub Actions | `.github/workflows/daily-update.yml` | `0 21 * * *` (daily, 21:00 UTC, **year-round**) | `daily_update.py` self-gates on the season (`season_window.is_in_season`) and exits 0 in the offseason — **no cadence switch needed**. |
| Vercel cron | `vercel.json` | `0 10 1 * *` (1st of month, 10:00 UTC) | Offseason cadence; the `/api/cron/update` route does **not** season-gate, so switch to `0 10 * * *` (daily) for in-season live scores. |

The GitHub job also supports `workflow_dispatch` (manual run). The Vercel cron calls
`GET /api/cron/update`, which refreshes live scores and lets Supabase Realtime push changes
to clients.
