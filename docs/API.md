# API reference

Twelve route handlers live under `src/app/api/`, all **`GET`**. Product-data routes return the
`{ data, error }` envelope (`/api/cron/update` also adds `meta`); `/api/health` intentionally
uses a dedicated liveness shape. `getPublicApiErrorMessage` (`src/lib/api-errors.ts`) exposes
only explicit `PublicApiError` messages in production and otherwise returns a generic error;
development mode may include the raw `Error.message`. Client code unwraps product envelopes via
`apiFetcher` (`src/lib/fetcher.ts`), which throws when `error` is non-null. `errMsg(error)`
ships beside it — the message a surface renders for a thrown value, and what
`components/ui/message-card.tsx` is given. It replaced eight per-surface copies of the same
ternary, every one of whose fallbacks was unreachable: `apiFetcher` only ever throws an
`Error`, and SWR rethrows it unchanged.

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

### Execution ceiling — `maxDuration` (2026-08-07)

Stated per route rather than inherited. **Vercel Hobby defaults to 10s and caps at 60s.**

| Route | `maxDuration` | Why |
|---|---|---|
| `/api/analysis`, `/api/playoffs`, `/api/schedule-disparity`, `/api/season-report`, `/api/shot-quality` | `30` | Worst observed cold read was 4.6s. Headroom for a slow refresh, not a budget to grow into. |
| `/api/cron/update` | `60` | Has an external dependency it does not control (`cdn.nba.com`) and runs once a day, so a slow run costs nothing. |
| everything else | unset (10s) | Light reads and the liveness probe, which should fail fast. |

**`/api/cron/update` carries an invariant: `SCOREBOARD_TIMEOUT_MS` must stay strictly below
`maxDuration`.** It was equal to it — a 10s fetch timeout inside an inherited 10s budget — so the
`AbortSignal` could never fire and a slow CDN killed the function instead of returning the
authored `"Live score feed unavailable"` 502. That 502 path was unreachable in production.

### Edge caching (2026-08-07)

`force-dynamic` leaves `Cache-Control: max-age=0, must-revalidate`, so until 2026-08-07 every
visit executed a function. With traffic too low to keep a lambda warm, 7.8% of invocations hit
the execution-time limit. Five routes now opt into a policy via `jsonRoute`'s fourth argument
(`CACHE` in `src/lib/api-route.ts`):

| Policy | Value | Routes |
|---|---|---|
| `CACHE.historical` | `public, s-maxage=3600, stale-while-revalidate=86400` | `/api/analysis`, `/api/shot-quality`, `/api/schedule-disparity` |
| `CACHE.inSeason` | `public, s-maxage=300, stale-while-revalidate=3600` | `/api/season-report`, `/api/playoffs` |

- **`stale-while-revalidate` is the half that fixed it.** The edge serves the stale copy
  immediately and refreshes behind it, so a cold start costs a background refresh rather than a
  spinner. `s-maxage` alone would not have done that.
- **A policy is applied to 2xx only.** A cached 500 would outlive the outage that produced it by
  up to the `stale-while-revalidate` window. `api-route.test.ts` pins this for 400, 404 and 500.
- **The live-score routes deliberately have none** — `/api/games/*`, `/api/game/[id]`. They are
  read alongside a Supabase Realtime subscription, and an edge-cached score would fight the
  subscription that corrects it. `/api/health` is not a `jsonRoute` and must never be cached.
- **Adding a policy to a route is a claim about what its data is**, not a performance knob.
  A route serving a season in progress takes `inSeason`; `historical` is for tables only a
  pipeline run can move.

**Three product surfaces deliberately have no route in this table**, because nothing about them
is per-request:

| Surface | Served from | Why not a route |
|---|---|---|
| `/shooting` | `public/data/player-rest.json` (committed static asset) | Its export changes once a season, so a Postgres round trip could only ever return the same numbers. `/season`'s zero-rest section reads the same file. |
| `/availability` | `src/lib/availability-facts.ts` (constants, pinned by a test) | A finished measurement, not a query — it moves only when `ml/availability_facts.py` is re-run. The page is a server component with no fetch and no loading state. |
| `/referees` | `src/data/referee-foul-style.json` (committed artifact written by `scripts/fetch_officials.ts`, pinned by `referee-foul-style.test.ts`) | Never a query — the artifact moves only when the ingest is re-run. **The page is currently held back** and renders an in-progress card rather than the table, so it reads only the artifact's coverage figures. Server component, no fetch, no loading state either way. |

> **Playoff Predictor:** `GET /api/playoffs` is complete and serving live predictions —
> `playoff_series_predictions` holds **2,098 rows** — two `model_version`s × (599 `full_insample`
> + 450 `walk_forward_oos`). `logistic_grind_v2` superseded `logistic_unreg_v1` on 2026-07-31 and
> the v1 rows were retained rather than overwritten, so the row count is per version, not total
> [Verified, live DB SELECT, 2026-07-31]. See
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
- **Query:** `getGameDetailById(id)` = `getGameById` + `getTeamRecentFinalResults` (last 5
  finals before the game date) for each team. Both filter through `publishableGames` — regular
  season *and* normally played — so a 2019-20 bubble game is a `404` here rather than a served
  rest advantage, and the recent-results strip no longer links into one.
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
  discards it when `getCompletedGamesStamp()` (a `count` + `max(date)` over the publishable
  final games — the same population the backtest reads) changes. Three client surfaces request this payload; without that, each request
  re-read and re-reduced the whole set. The cache is per server instance and bounded, because
  `seasonMinRA` arrives from a query string.
- **Success:** `{ data: AnalysisResponse, error: null }`:
  - `totalGames`, `overallWins`, `overallWinRate` — the games where the rested team was **also
    at home**, which is narrower than the population on both counts
  - `thresholds: ThresholdBucket[]` (one per `[2,3,5,7]`: `threshold, games, restedTeamWins,
    winPct`)
  - `homeAwayBreakdown` (`homeTeamMoreRested` / `awayTeamMoreRested`: `games, restedTeamWins,
    winPct`)
  - `venueBaseline` (`games, homeWins, homeWinPct, roadWinPct`)
  - `seasonWinRates` (per season: `season, games, restedTeamWins, winPct, homeBaselinePct`)
- All `winPct` values are 0–100 with one decimal.
- **`venueBaseline` counts a wider population than everything else in the payload** (added
  2026-08-06). It is tallied over every scored game — including the neutral ones the rest
  figures drop and the road-rested ones the headline does not publish — because it answers
  "what does this side win *anyway*", and a baseline drawn from the same games as the numerator
  would already carry the effect it exists to subtract. `roadWinPct` comes from the counts, not
  from `100 − homeWinPct`. `seasonWinRates[].homeBaselinePct` is the same figure per season,
  which is not a constant: it runs from 67.9% in 1987-88 to 54.3% in 2023-24.
  Every rate on `/analysis` is rendered against these rather than against 50%.

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

## `GET /api/schedule-disparity`

Which teams a season's schedule favored, ranked by net edge games. Powers `/schedule`.
`runtime = "nodejs"`, `dynamic = "force-dynamic"`.

- **Query (Zod):** `season?` — validated against **`rankableSeasons(browsableSeasons())`**, not
  `NBA_SEASONS`, and this is the one route where that distinction is load-bearing:
  - `browsableSeasons()` admits an **upcoming** season, so a schedule can be requested before
    the season starts;
  - `rankableSeasons()` then removes the **truncated** ones, because this module ranks teams
    *against each other within a season* and a 63-to-67-game spread gives one team fewer
    chances to accumulate an edge (see [ADR 0004](adr/0004-season-exclusions-belong-to-modules-not-ingest.md)).
  - The default is `defaultRankableSeason()` — the newest season **with data**, so a bare
    request never lands on an empty upcoming season.
  - A season beyond the browsable list → `400 Unknown season`.
- **Query fn:** `getScheduleDisparity(season)` → `getRegularSeasonScheduleForDisparity(season)`
  + `getTeamDirectory()`. Read-only: no table, no migration, no ingest — it derives everything
  from the existing `games` and `fatigue_scores` reads.
- **Success:** `{ data: ScheduleDisparityResponse, error: null }` — the 30 ranked teams, the
  summary strip figures, and a provisional flag for a season still in progress.
- **Errors:** `500` + `getPublicApiErrorMessage` on failure.

`src/app/api/__tests__/schedule-disparity.test.ts` pins the two-season-list rule directly.

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
