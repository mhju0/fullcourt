# API reference

Eight route handlers under `src/app/api/`, all **`GET`**. Every app route returns the
`{ data, error }` envelope (`/api/cron/update` also adds `meta`). Errors are passed through
`getPublicApiErrorMessage` (`src/lib/api-errors.ts`): in production it hides internals
unless the message contains `invalid` / `validation` / `not found`; in dev it returns the
raw message. Client code unwraps the envelope via `apiFetcher` (`src/lib/fetcher.ts`),
which throws when `error` is non-null.

Response envelope (`ApiResponse<T>` in `src/types/index.ts`):

```ts
{ data: T; error: string | null; meta?: Record<string, unknown> }
```

| Route | Params | Returns (`data`) | DB query |
|-------|--------|------------------|----------|
| `GET /api/games/[date]` | path `date` | `GameResponse[]` | `getGamesByDate` |
| `GET /api/games/dates` | `season`, `month?` | `GameDateCount[]` | `getRegularSeasonGameDatesWithCounts` |
| `GET /api/games/search` | `minRA?`,`team?`,`season?`,`result?`,`page?`,`limit?` | `GameSearchResponse` | `searchRegularSeasonGames` |
| `GET /api/games/upcoming` | `minRA?`,`season?` | `UpcomingGameWithRA[]` | `getUpcomingGamesWithRA` |
| `GET /api/game/[id]` | path `id` | `GameDetailResponse \| null` | `getGameDetailById` |
| `GET /api/analysis` | `seasonMinRA?` | `AnalysisResponse` | `getCompletedGamesWithFatigue` |
| `GET /api/analysis/accuracy` | none | `AccuracyResponse` | `getResolvedPredictions` + `getUpcomingPredictionsForSeason` |
| `GET /api/cron/update` | (Bearer auth) | `{ gamesUpdated }` | reads/updates `games` |

Routes that touch the DB declare `export const runtime = "nodejs"` and (where applicable)
`dynamic = "force-dynamic"` so they aren't prerendered at build (no `DATABASE_URL` needed
during `next build`) and don't run on Edge (postgres-js needs Node).

---

## `GET /api/games/[date]`

Games for one calendar date.

- **Path param:** `date` — validated by Zod `^\d{4}-\d{2}-\d{2}$`.
- **Success:** `200` `{ data: GameResponse[], error: null }`.
- **Errors:** `400` invalid date (`{ data: [], error }`); `500` on failure.
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

- **Query params** (plain parsing, not Zod):
  - `minRA` — float; only `> 0` applies (`abs(awayFatigue − homeFatigue) ≥ minRA` in SQL).
  - `team` — abbreviation; matches home **or** away.
  - `season` — `"YYYY-YY"`.
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

Scheduled regular-season games from today onward, with their open-prediction edge. Powers
Future Games. `runtime = "nodejs"`, `dynamic = "force-dynamic"`.

- **Query:** `minRA` (float, floored at 0), `season` (default **`"2025-26"`**).
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

- **Query:** `seasonMinRA` (float, floored at 0) — when `> 0.5`, the season win-rate
  breakdown uses `|differential| ≥ seasonMinRA` instead of the default decidable set.
- **Constants:** `NEUTRAL_THRESHOLD = 0.5`, `THRESHOLDS = [2, 3, 5, 7]`.
- **Computation:** for each game `differential = awayFatigue − homeFatigue`, rested side =
  home if `≥ 0` else away, `restedTeamWon` from the final score. "Decidable" = `|diff| ≥ 0.5`.
- **Success:** `{ data: AnalysisResponse, error: null }`:
  - `totalGames`, `overallWins`, `overallWinRate`
  - `thresholds: ThresholdBucket[]` (one per `[2,3,5,7]`: `threshold, games, restedTeamWins,
    winPct`)
  - `homeAwayBreakdown` (`homeTeamMoreRested` / `awayTeamMoreRested`: `games, restedTeamWins,
    winPct`)
  - `monthlyTrends: MonthlyTrend[]` (`"YYYY-MM"`, ascending)
  - `seasonWinRates` (per season: `season, games, restedTeamWins, winPct`)
- All `winPct` values are 0–100 with one decimal.

---

## `GET /api/analysis/accuracy`

Per-prediction accuracy from the **`predictions`** table plus the upcoming open slate.
`runtime = "nodejs"`, `dynamic = "force-dynamic"`. No params.

> **Note:** this endpoint is fully implemented but **not consumed by any current page** — it
> backed a "Prediction Tracker" route that no longer exists. The current nav's "PICKS" links
> to `/upcoming`, which uses `/api/games/upcoming` instead.

- **Queries:** `getResolvedPredictions()` (latest resolved prediction per game, joined to
  teams, regular-season calendar) and `getUpcomingPredictionsForSeason(trackerSeason,
  today)` where `trackerSeason = defaultNbaSeason()`.
- **Success:** `{ data: AccuracyResponse, error: null }`:
  `totalPredictions, correctPredictions, accuracyPct`, `tiers` (low `0–2`, medium `2–5`,
  high `5+` by absolute differential), `seasonAccuracyTrend`, `recentPredictions` (last 20,
  newest first), `trackerSeason`, `upcomingPicks`.

---

## `GET /api/cron/update`

Vercel-cron live-score refresh. `runtime = "nodejs"`, `dynamic = "force-dynamic"`.

- **Auth:** required when `VERCEL` is set **or** `CRON_SECRET` is present. Then the request
  must send `Authorization: Bearer <CRON_SECRET>`; mismatch → `401`. If auth is required but
  `CRON_SECRET` is unset → `503` (misconfiguration). Without `VERCEL`/`CRON_SECRET` (local)
  the route is open.
- **Behavior:** find today's `scheduled`/`live` games → fetch the NBA CDN scoreboard
  (`todaysScoreboard_00.json`) → match by normalized 10-digit `external_id` → `UPDATE games`
  when status/score changed. Scores of `0` are written as `null`. NBA CDN status codes map
  `2 → live`, `3 → final`, else `scheduled`.
- **Success:** `{ data: { gamesUpdated }, error: null, meta: { checkedGames,
  nbaGamesAvailable } }`. With nothing to do: `gamesUpdated: 0` + a `meta.message`. NBA CDN
  non-200 → `502`; other failures → `500`.
- Updates propagate to browsers via Supabase Realtime (`useLiveGames`).
