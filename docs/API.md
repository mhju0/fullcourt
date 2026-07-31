# API reference

Twelve route handlers live under `src/app/api/`, all **`GET`**. Product-data routes return the
`{ data, error }` envelope (`/api/cron/update` also adds `meta`); `/api/health` intentionally
uses a dedicated liveness shape. `getPublicApiErrorMessage` (`src/lib/api-errors.ts`) exposes
only explicit `PublicApiError` messages in production and otherwise returns a generic error;
development mode may include the raw `Error.message`. Client code unwraps product envelopes via
`apiFetcher` (`src/lib/fetcher.ts`), which throws when `error` is non-null.

Response envelope (`ApiResponse<T>` in `src/types/index.ts`) — a discriminated union, so a
failed request carries no `data` at all:

```ts
| { data: T;    error: null;   meta?: Record<string, unknown> }
| { data: null; error: string; meta?: Record<string, unknown> }
```

Every product route is built by `jsonRoute` (`src/lib/api-route.ts`), which owns the whole
envelope: it merges search params and dynamic segments into one record (empty strings read as
absent), validates them against the route's Zod schema, returns `400` with the first issue's
message, and maps a thrown error to `500` — or, for a `PublicApiError`, to that error's own
status and message. A route supplies only its schema and its operation. `season` and `minRA`
are validated by the shared `seasonParam` / `minRAParam`.

| Route | Params | Returns (`data`) | DB query |
|-------|--------|------------------|----------|
| `GET /api/games/[date]` | path `date` | `GameResponse[]` | `getGamesByDate` |
| `GET /api/games/dates` | `season`, `month?` | `GameDateCount[]` | `getRegularSeasonGameDatesWithCounts` |
| `GET /api/games/search` | `minRA?`,`team?`,`season?`,`result?`,`page?`,`limit?` | `GameSearchResponse` | `searchRegularSeasonGames` |
| `GET /api/games/upcoming` | `minRA?`,`season?` | `UpcomingGameWithRA[]` | `getUpcomingGamesWithRA` |
| `GET /api/game/[id]` | path `id` | `GameDetailResponse \| null` | `getGameDetailById` |
| `GET /api/analysis` | `seasonMinRA?` | `AnalysisResponse` | `getCompletedGamesWithFatigue` |
| `GET /api/playoffs` | `season?` | `PlayoffsResponse` | `getPlayoffSeriesWithPredictions` |
| `GET /api/shot-quality` | `season`, `model?` | `ShotQualityResponse` | `getShotQualityGrid` |
| `GET /api/schedule-disparity` | `season?` | `ScheduleDisparityResponse` | `getScheduleDisparity` |
| `GET /api/season-report` | `season?` | `SeasonReportResponse` | `getSeasonReportRows` |
| `GET /api/cron/update` | (Bearer auth) | `{ gamesUpdated }` | reads/updates `games` |
| `GET /api/health` | none | dedicated `{ status, db, timestamp }` | `select 1` |

Routes that touch the DB declare `export const runtime = "nodejs"` and (where applicable)
`dynamic = "force-dynamic"` so they aren't prerendered at build (no `DATABASE_URL` needed
during `next build`) and don't run on Edge (postgres-js needs Node).

> **Playoff Predictor:** `GET /api/playoffs` is complete and serving live predictions —
> `playoff_series_predictions` holds **1,049 rows** (599 `full_insample` + 450 `walk_forward_oos`,
> `model_version = "logistic_unreg_v1"`) [Verified, live DB SELECT, 2026-07-02]. See
> [ml/PHASE3_REPORT.md](../ml/PHASE3_REPORT.md) for the model's walk-forward accuracy/log-loss/Brier
> numbers and the honest calibration-vs-accuracy framing.

---

## `GET /api/games/[date]`

Games for one calendar date.

- **Path param:** `date` — validated by Zod `^\d{4}-\d{2}-\d{2}$`.
- **Success:** `200` `{ data: GameResponse[], error: null }`.
- **Errors:** `400` invalid date; `500` on failure. Both send `data: null`.
- **Query:** `getGamesByDate(date)` — joins `games` + home/away `teams` + latest
  `fatigue_scores` per side, filtered to `game_type = 'regular'`; also computes per-team
  `is4In6` and games-in-last-30 in JS, then builds `homeFatigue`/`awayFatigue`
  (`FatigueInfo`) and `restAdvantage`.

`GameResponse` (`src/types/index.ts`): `id, externalId, date, season, status,
homeTeam/awayTeam (TeamInfo), homeScore, awayScore, homeFatigue, awayFatigue,
restAdvantage`. `FatigueInfo` includes `score, isBackToBack, is3In4, travelDistanceMiles,
altitudePenalty, altitudeArenaLabel, daysRest, gamesInLast7Days, gamesInLast30Days, is4In6,
isOvertimePenalty, roadTripConsecutiveAway, hasCoastToCoastRoadSwing`. `RestAdvantage` =
`{ differential, advantageTeam: "home" | "away" | "neutral" }`.

---

## `GET /api/games/dates`

Days in a season (optionally one month) that have regular-season games, with counts. Powers
the home-page day chips.

- **Query (Zod):** `season` (must be in `NBA_SEASONS`), `month?` (int 1–12). Missing/invalid
  → `400`.
- **Success:** `{ data: GameDateCount[], error: null }` where
  `GameDateCount = { date, gameCount }`.
- **Query:** `getRegularSeasonGameDatesWithCounts(season, month?)` — intersects
  `regularSeasonDateBounds(season)` with `monthCalendarBounds(season, month)`, groups by
  date, counts `game_type = 'regular'` games.

---

## `GET /api/games/search`

Filtered, paginated search over **final, regular** games. Powers the Analysis "Explore
Games" table.

- **Query params** (Zod; invalid input → `400` without querying):
  - `minRA` — finite nonnegative number; only `> 0` applies
    (`abs(awayFatigue − homeFatigue) ≥ minRA` in SQL).
  - `team` — uppercase 2–3 letter abbreviation; matches home **or** away.
  - `season` — must be in `NBA_SEASONS`.
  - `result` — `all` (default) / `correct` (rested team won) / `incorrect`.
  - `page` — default `1` (min 1).
  - `limit` — default `20` (`DEFAULT_LIMIT`), capped at `100` (`MAX_LIMIT`).
- **Logic:** `searchRegularSeasonGames` returns final-regular rows; the handler computes
  `diff = awayFatigue − homeFatigue`, **excludes neutral** (`|diff| < 0.5`), derives
  `advantageTeam`/`restedTeamWon`, filters by `result`, then paginates in JS.
- **Success:** `{ data: GameSearchResponse, error: null }` where `GameSearchResponse =
  { games: GameSearchResult[], total, page, limit }`. `GameSearchResult` carries
  `gameId, date, season, home/away abbreviations + scores + fatigue, restAdvantageDifferential
  (absolute), advantageTeam, restedTeamWon`.

---

## `GET /api/games/upcoming`

Scheduled regular-season games from today onward, with their open-prediction edge. Powers the
UPCOMING view on `/` (formerly the standalone `/upcoming` route, now a redirect — the endpoint
itself is unchanged). `runtime = "nodejs"`, `dynamic = "force-dynamic"`.

- **Query (Zod):** `minRA` (finite nonnegative number), `season` (must be in
  `NBA_SEASONS`; defaults through `currentDisplaySeason()`). Invalid input → `400`.
- **Query fn:** `getUpcomingGamesWithRA(season, minRA)` — scheduled regular games with an
  open prediction, `date ≥ today`, within the regular-season calendar, optionally filtered
  to `|differential| ≥ minRA`.
- **Success:** `{ data: UpcomingGameWithRA[], error: null }`:
  `gameId, date, season, homeTeam/awayTeam, homeFatigueScore, awayFatigueScore,
  restAdvantageDifferential, predictedAdvantageAbbreviation`.

---

## `GET /api/game/[id]`

Single game detail for the explore modal (game card + last-5 results for both teams).

- **Path param:** `id` — Zod `coerce.number().int().positive()`. Invalid → `400`
  (`"Invalid game id"`).
- **Query:** `getGameDetailById(id)` = `getGameById` (regular only) + `getTeamRecentFinalResults`
  (last 5 finals before the game date) for each team.
- **Success:** `{ data: GameDetailResponse, error: null }` where `GameDetailResponse =
  { game: GameResponse, homeRecentWeek: TeamRecentResultGame[], awayRecentWeek:
  TeamRecentResultGame[] }`. **Not found** → `404` `{ data: null, error: "Game not found" }`.

---

## `GET /api/analysis`

Historical backtest over **final, regular** games that have fatigue for both teams.
`runtime = "nodejs"`, `dynamic = "force-dynamic"`. **Reads game outcomes — it does not read
the `predictions` table.**

- **Query (Zod):** `seasonMinRA` (finite nonnegative number; default `0`) — when `> 0.5`, the season win-rate
  breakdown uses `|differential| ≥ seasonMinRA` instead of the default decidable set.
- **Constants:** `NEUTRAL_THRESHOLD = 0.5`, `THRESHOLDS = [2, 3, 5, 7]`.
- **Computation:** for each game `differential = awayFatigue − homeFatigue`, rested side =
  home if `≥ 0` else away, `restedTeamWon` from the final score. "Decidable" = `|diff| ≥ 0.5`.
- **Held until a game goes final.** The read has no `LIMIT` — it is every final regular-season
  game with fatigue on both sides — so `getHistoricalBacktest`
  (`src/lib/rest-advantage-evidence-server.ts`) keeps its answer keyed by `seasonMinRA` and
  discards it when `getCompletedGamesStamp()` (a `count` + `max(date)` over final regular-season
  games) changes. Three client surfaces request this payload; without that, each request
  re-read and re-reduced the whole set. The cache is per server instance and bounded, because
  `seasonMinRA` arrives from a query string.
- **Success:** `{ data: AnalysisResponse, error: null }`:
  - `totalGames`, `overallWins`, `overallWinRate`
  - `thresholds: ThresholdBucket[]` (one per `[2,3,5,7]`: `threshold, games, restedTeamWins,
    winPct`)
  - `homeAwayBreakdown` (`homeTeamMoreRested` / `awayTeamMoreRested`: `games, restedTeamWins,
    winPct`)
  - `seasonWinRates` (per season: `season, games, restedTeamWins, winPct`)
- All `winPct` values are 0–100 with one decimal.

---

## `GET /api/playoffs`

Playoff Predictor bracket + predictions for one season. `runtime = "nodejs"`,
`dynamic = "force-dynamic"`. Backend is complete and live (see caution above for verified
row counts).

- **Query:** `season` (must be in `NBA_SEASONS`; defaults to `currentDisplaySeason()`
  (`src/lib/nba-season.ts`) if omitted). Invalid
  season → `400`.
- **Query fn:** `getPlayoffSeriesWithPredictions(season)` — joins `playoff_series` to
  `playoff_series_predictions` (aliased self-joins for the two prediction methods) and to
  `teams` for home-court/opponent/winner display names.
- **Success:** `{ data: PlayoffsResponse, error: null }`:
  - `season`
  - `rounds: PlayoffRoundGroup[]` — series grouped by `round` (ascending), each with a
    `roundLabel` (`"First Round"` / `"Conference Semifinals"` / `"Conference Finals"` /
    `"Finals"`) and the series list (`PlayoffSeriesWithPredictions[]`: teams, `isBestOf7`,
    win counts, the four raw features `seedDiff`/`winPctDiff`/`entryRestDiff`/`h2hDiff`, plus
    `priorGrindDiff` (the model's current feature — `entryRestDiff` is retained but no longer
    fed to it) and `homeCourtPriorGames`/`opponentPriorGames` (each side's prior-round game
    count, `null` in Round 1) beside `homeCourtPriorIsBestOf7`/`opponentPriorIsBestOf7` (that
    prior series' own format — Round 1 was best-of-five through 2001-02, so a game count is
    unreadable without it, and it is **not** the same as this series' `isBestOf7`), and a
    `predictions` object with `fullInsample` /
    `walkForwardOos` — either may be `null` for a given series).
  - `summary: { fullInsample, walkForwardOos }` — each a `PlayoffMethodSummary`
    (`knownWinnerGames`, `predictedCorrect`, `accuracy` 0–100) computed only over series that
    have both a known winner and a non-null prediction for that method. **Per-season and
    therefore small** (~15 series), which is why the UI presents these as one bracket's result
    rather than as a model metric — `walkForwardOos.knownWinnerGames === 0` is also how the page
    detects a season too early to have any honest forecast. The model's published metrics are
    pooled constants in `src/lib/playoff-model-metrics.ts`, not derived from this response.
- **Errors:** `500` + `getPublicApiErrorMessage` on failure.

## `GET /api/shot-quality`

Expected Shot Value (xeFG%) grid + model surface for one season. `runtime = "nodejs"`,
`dynamic = "force-dynamic"`.

- **Query (Zod):** `season` (required; must be in `NBA_SEASONS`) — invalid/missing → `400`.
  `model?` — `"gbm-v1"` or `"baseline-zone-v1"`, default `"gbm-v1"` (`DEFAULT_MODEL`); a
  **display hint only** — both model surfaces are always returned per cell, not just the
  requested one.
- **Query fn:** `getShotQualityGrid(season)` — reads league-wide (`team_id IS NULL`)
  `shot_grid` rows LEFT JOINed twice to `shot_value_surface` (once per `model_version`) on
  `(season, cell_x, cell_y, model_version)`. Raw SQL, not Drizzle — `shot_grid` /
  `shot_value_surface` aren't in `schema.ts` (see [DATABASE.md](DATABASE.md)).
- **Success:** `{ data: ShotQualityResponse, error: null }`:
  - `season`, `activeModel` (echoes the requested `model`)
  - `cells: ShotQualityCell[]` — per cell: `cellX`, `cellY`, `zoneBasic`/`zoneRange`/
    `zoneArea`, `fga`/`fgm`/`fg3a`/`fg3m` (atomic counts), and `gbm`/`baseline`
    (`{ pMake, expectedEfg, xpps } | null` — `null` when that model has no surface row for
    the cell).
  - `meta: { cellCount, totalFga }` — computed in the handler from `cells`.
- **Errors:** `500` + `getPublicApiErrorMessage` on failure. An unknown/future season with no
  grid rows returns `{ cells: [], meta: { cellCount: 0, totalFga: 0 } }`, not an error.

---

## `GET /api/season-report`

One season, reported through the site's rest-advantage lens. Powers `/season`.
`runtime = "nodejs"`, `dynamic = "force-dynamic"`.

- **Query (Zod):** `season?` — must be in `NBA_SEASONS`; defaults to the newest season with
  data (`NBA_SEASONS[NBA_SEASONS.length - 1]`), since this page reports games that were
  played rather than the browsable-including-upcoming list.
- **Query fn:** `getSeasonReportRows(season)` — every regular-season game in the season with
  both sides' latest fatigue row (LEFT joined, so unplayed games are included for the
  progress tile), reduced by the pure `buildSeasonReport` in `src/lib/season-report.ts`.
  Completion is decided once, in that reducer: a row counts toward every aggregate only when
  `status === "final"` and both scores and both fatigue sides are present — not in the query,
  so the same fixture tests that cover the rest of the module cover it too.
- **Held until a game goes final**, same stamp trick as `/api/analysis`
  (`src/lib/season-report-server.ts`, keyed per season).
- **Success:** `{ data: SeasonReportResponse, error: null }`:
  - `season`, `scheduledGames` (every regular-season game), `completedGames` (final, scored,
    both fatigue sides present)
  - `overall` / `atLeastTwo: SeasonReportRate` — `{ games, restedTeamWins, winPct, band }`,
    the rest-advantage win rate overall and for RA ≥ 2 (the only per-season threshold this
    page publishes; RA ≥ 5 and ≥ 7 run too thin at one season's sample size)
  - `teams: SeasonReportTeamLabelled[]` — per team: rested/tired games+wins+winPct, `swing`
    (rested − tired, null if either arm is empty), and the schedule facts (`travelMiles`,
    `backToBacks`, `threeInFours`, `jetLagGames`)
  - `loudestCalls: SeasonReportCall[]` — the ten games with the largest rest gap, ranked by
    gap rather than margin, each tagged hit/miss
  - `weeks: SeasonReportWeek[]` — league-average fatigue in seven-day buckets from the
    season's first game
- **Errors:** `500` + `getPublicApiErrorMessage` on failure.

---

## `GET /api/cron/update`

Vercel-cron live-score refresh. `runtime = "nodejs"`, `dynamic = "force-dynamic"`.

- **Auth:** required when `VERCEL` is set **or** `CRON_SECRET` is present. Then the request
  must send `Authorization: Bearer <CRON_SECRET>`; mismatch → `401`. If auth is required but
  `CRON_SECRET` is unset → `503` (misconfiguration). Without `VERCEL`/`CRON_SECRET` (local)
  the route is open.
- **Behavior:** find today's `scheduled`/`live` games → fetch the NBA CDN scoreboard with a
  10-second timeout
  (`todaysScoreboard_00.json`) → match by normalized 10-digit `external_id` → compare status
  and both scores through `reconcileLiveScores` → `UPDATE games` only for changed rows.
  Scores of `0` are represented as `null`. NBA CDN status codes map `2 → live`, `3 → final`,
  else `scheduled`; unchanged rows do not generate redundant Supabase Realtime events.
- **Success:** `{ data: { gamesUpdated }, error: null, meta: { checkedGames,
  nbaGamesAvailable } }`. With nothing to do: `gamesUpdated: 0` + a `meta.message`. NBA CDN
  non-200 → `502`; other failures → `500`.
- Updates propagate to browsers via Supabase Realtime (`useLiveGames`).

---

## `GET /api/health`

Public DB-liveness probe for uptime monitors. It intentionally does not use `ApiResponse<T>`.

- **Behavior:** runs `select 1` against the live database.
- **Success:** `200` `{ status: "ok", db: "up", timestamp }`.
- **Failure:** `503` `{ status: "error", db: "down", timestamp }`; the raw DB error is logged
  server-side and never included in the response.
