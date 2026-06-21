# Data pipeline & fatigue model

Two halves: **Python** ingests schedule/score/OT data into `games`/`teams`; **TypeScript**
(`tsx`) computes `fatigue_scores` and `predictions` using `src/lib/fatigue.ts`. All
constants below are copied from the source.

## Orchestration: `scripts/daily_update.py`

GitHub Actions entry point (also runnable locally). Time base is **America/New_York**.

Window: `LOOKBACK_DAYS = 7`, `LOOKAHEAD_DAYS = 60` → operates over `[today−7, today+60]`.

Steps:
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
- Regular season only (`gameId` prefix `002`). `games.date` = **UTC calendar date** of
  `gameDateTimeUTC` (the UTC-vs-ET caveat).
- Upsert preserves data already present:
  `home_score = COALESCE(EXCLUDED.home_score, games.home_score)` (same for away) and never
  downgrades a `final` status back to `scheduled`.
- New CDN rows are inserted with `overtime_periods = 0`, `game_type = 'regular'`.
- Optional `utc_month_filter=(year, month)`; `None` = whole regular-season payload.

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

| Scheduler | File | Current (offseason) | Regular season |
|-----------|------|---------------------|----------------|
| GitHub Actions | `.github/workflows/daily-update.yml` | `0 21 * * 1` (Mon 21:00 UTC, weekly) | change to `0 21 * * *` (daily) |
| Vercel cron | `vercel.json` | `0 10 1 * *` (1st of month, 10:00 UTC) | change to `0 10 * * *` (daily) |

The GitHub job also supports `workflow_dispatch` (manual run). The Vercel cron calls
`GET /api/cron/update`, which refreshes live scores and lets Supabase Realtime push changes
to clients.
