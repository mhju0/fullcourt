# API reference

Read routes are defined in `src/app/api/`. `src/lib/api-route.ts` validates inputs with Zod,
formats the `{ data, error }` envelope, and applies explicit cache policies. Response types live
in `src/types/index.ts`; Season Report also uses its domain module types. Those definitions
are authoritative for individual fields, optional values, and units.

## Read endpoints

| GET endpoint | Input | Result | Cache policy |
| --- | --- | --- | --- |
| `/api/games/[date]` | Path date in `YYYY-MM-DD` form, interpreted as Eastern calendar date | Games, teams, stored fatigue and scores for that date | No explicit edge-cache policy |
| `/api/games/dates` | Required browsable `season`; optional integer `month` 1–12 | Date/count index for Games | `inSeason` |
| `/api/games/upcoming` | Optional browsable `season`, nonnegative `minRA` | Upcoming rest-advantage games | No explicit edge-cache policy |
| `/api/game/[id]` | Positive integer database ID | Game and contextual detail; 404 if absent | No explicit edge-cache policy |
| `/api/analysis` | Optional nonnegative `seasonMinRA` | Historical backtest and venue baselines | `historical` |
| `/api/games/search` | Optional `season`, 2–3 letter uppercase `team`, nonnegative `minRA`, `result` (`all`, `correct`, `incorrect`), `page`, `limit` | Paginated historical game evidence; page defaults to 1, limit to 20 and caps at 100 | `inSeason` |
| `/api/season-report` | Optional browsable `season` | Completed results, team records, notable games, and schedule/workload data with source-basis labels | `inSeason` |
| `/api/schedule-disparity` | Optional rankable `season` | Relative team schedule measures and pricing | `historical` |
| `/api/playoffs` | Optional `season` | Bracket, series, and prediction records | `inSeason` |
| `/api/shot-quality` | Required `season`; optional `model` (`gbm-v1`, `baseline-zone-v1`) | Grid cells and display-model hint | `historical` |

Shared numeric rest-advantage parameters default to zero. Season validation uses the calendar
helpers in `src/lib/nba-season.ts`; browsable seasons include a released-but-unplayed season
when allowed by that helper. Schedule Edge applies its own rankable-season exclusions.
`CACHE.inSeason` and `CACHE.historical` define exact TTLs in source; the names do not mean that
all returned games have been played.

Games and upcoming-game endpoints preserve live-score behavior instead of serving a long-lived
edge snapshot. Heavy domain reads also use the stamped server cache, including coalesced
in-flight requests. Do not infer an endpoint's cache semantics from the page's navigation group.

## Response semantics

A failed query is an error, not an empty successful dataset. Missing fatigue stays null and must
not rank as zero. Before completed data exists, Season Report can return schedule-based workload
while result-derived fields remain empty; the fatigue calendar remains completed-game evidence.
The UI gives schedule workload to Schedule Edge, despite sharing this server response.

The rest-advantage headline counts `isCalledSide()` games (rested home teams) against venue
baselines. Rested visitors are reported separately. Game dates use America/New_York, and
published regular-season reads obey `publishableGames()`.

## Artifact-backed surfaces

Shooting uses `public/data/player-rest.json`; Availability uses pinned generated facts; the
historical referee archive uses committed referee artifacts. Officiating imports
`src/data/officiating.json` and loads `/data/officiating/<season>/<report>.json` on expansion.
These are static publication assets, not database-query endpoints. `/referees` redirects to
`/officiating`; the old analysis lives at `/behind-the-data/referees/archive`.

## Operational endpoints

`GET /api/health` executes `select 1` and returns its own shape, outside the data/error envelope:
`{ status: "ok", db: "up", timestamp }` with HTTP 200, or `error`/`down` with HTTP 503. It does
not verify source freshness, row coverage, or scheduled ingest.

`GET /api/cron/update` is an authenticated write operation despite its HTTP method. It requires
the configured cron secret and updates recent scores/status from ESPN. Never use it as a
read-only health probe. Its implementation owns authorization, time windows, timeout, and
stored-final reconciliation rules. See [Data pipeline](DATA_PIPELINE.md) and
[live-season verification](LAUNCH_DAY.md).
