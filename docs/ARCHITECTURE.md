# Architecture

End-to-end system architecture and data flow for FullCourt. Everything here is
derived from the actual code; where a doc/comment disagrees with code, the code wins and
the discrepancy is called out.

## High-level flow

```
        DATA SOURCES                         INGEST (Python)                 STORE
┌──────────────────────────┐      ┌──────────────────────────────┐   ┌──────────────────┐
│ NBA CDN schedule JSON     │─────▶│ fetch_nba_schedule_cdn.py    │   │ Supabase         │
│ (scheduleLeagueV2.json)   │      │  → future/current slate      │   │ PostgreSQL       │
│ NBA CDN live scoreboard   │      │ fetch_schedule.py            │──▶│  teams           │
│ (todaysScoreboard_00.json)│      │  → historical seasons        │   │  games           │
│ nba_api / stats.nba.com   │─────▶│ seed_teams.py → 30 teams     │   │  fatigue_scores  │
│  (LeagueGameFinder)       │      │                              │   │  predictions     │
│ ESPN site.api scoreboard  │─────▶│ fetch_game_context.ts        │   └──────────────────┘
│  (overtime, tip-off,      │      │  → overtime / tip / neutral  │
│   neutral site)           │      │                              │
└──────────────────────────┘      └──────────────┬───────────────┘             │
                                                  │ orchestrated by             │
                                                  │ daily_update.py             │
                                                  ▼                             │
                                   ┌──────────────────────────────┐            │
        MODELING (TypeScript via tsx)│ run-daily.ts                │            │
                                   │  → recompute fatigue_scores  │◀───────────┘
                                   │  → (re)generate predictions  │
                                   │ backfill_fatigue.ts (bulk)   │
                                   │ backfill_predictions.ts      │
                                   │ uses src/lib/fatigue.ts      │
                                   └──────────────┬───────────────┘
                                                  ▼
        SERVE (Next.js 16 on Vercel)
┌─────────────────────────────────────────────────────────────────────────────────┐
│ src/lib/db (Drizzle + postgres-js, lazy singleton)                                 │
│   └─ src/lib/db/queries.ts  ── typed, aliased multi-table joins                    │
│        ▲                                                                            │
│ app/api/**/route.ts  ── schema + operation, via jsonRoute (src/lib/api-route.ts)   │
│        ▲                                                                            │
│ Server pages (analysis/page.tsx, playoffs/page.tsx) → dynamic client components   │
│ Client page app/page.tsx + SWR (src/lib/fetcher.ts) + Supabase Realtime hook       │
└─────────────────────────────────────────────────────────────────────────────────┘
                                                  ▲
                                   ┌──────────────┴───────────────┐
        CI/CD                      │ GitHub Actions cron → daily_update.py            │
                                   │ Vercel cron → GET /api/cron/update (live scores) │
                                   │ Vercel deploy from main                          │
                                   └──────────────────────────────────────────────────┘
```

## Layers

### 1. Data sources (external)

| Source | URL / library | Used for |
|--------|---------------|----------|
| NBA CDN schedule | `https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json` | Current-season + future games (`fetch_nba_schedule_cdn.py`). No auth. |
| NBA CDN live scoreboard | `https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json` | Live score/status refresh (`/api/cron/update`). |
| nba_api (stats.nba.com) | `LeagueGameFinder` | Historical + windowed schedules and final scores (`fetch_schedule.py`, `daily_update.py`, `backfill_historical.py`). |
| ESPN site.api | `/scoreboard?dates=` | Overtime periods, tip-off times, neutral-site venues (`fetch_game_context.ts`), 2002-03 on. One call per game date returns all three. |
| ~~nba_api (stats.nba.com)~~ | ~~`BoxScoreSummaryV2`~~ | **Retired 2026-07-30** as the overtime source. `stats.nba.com` is unreachable from outside the US, so `nba_ot_periods.py` silently returned 0 for every game and the fatigue model's overtime term never fired. Still imported by `fetch_schedule.py`; no longer used by `daily_update.py`. |
| ESPN logos | `https://a.espncdn.com/i/teamlogos/nba/500/{slug}.png` | Every team logo, current and historical (`src/lib/team-history.ts`). Dark-on-light for all 30; the NBA CDN ships no light-background mark for BKN or SAS, and 403s from Seoul and CI. |
| ESPN CDN logos | `https://a.espncdn.com/i/teamlogos/nba/500/{abbr}.png` | Historical/relocated-era logos. |

### 2. Ingestion (Python, `scripts/`)

Python pulls schedules/scores/OT and writes rows into `games` (and `teams`). The
orchestrator `daily_update.py` is the GitHub Actions entry point; it seeds the CDN
schedule, upserts a rolling `[today−7, today+60]` window from `nba_api`, refreshes OT for
recent finals, then shells out to the TypeScript modeling step. Full per-script detail in
[DATA_PIPELINE.md](DATA_PIPELINE.md). `schedule_upsert_contract.py` explicitly records the
two source-authority policies: CDN data may repair ET game dates while preserving final
results; Stats API data refreshes scores/status/OT/game type without moving game dates.

### 3. Modeling (TypeScript via `tsx`, `scripts/` + `src/lib/`)

Fatigue math lives **only** in `src/lib/fatigue.ts` and is reused by every writer so Python
never duplicates it. `src/lib/rest-advantage-evidence.ts` is the canonical boundary and
historical-evidence core (`|RA| < 0.5` is neutral; exactly `±0.5` is decisive), while
`rest-advantage-evidence-server.ts` owns the complete DB-backed operations used by routes:

- `run-daily.ts` — recomputes `fatigue_scores` for a `[date, date+14]` window and
  regenerates **open** (ungraded) predictions for scheduled games through
  `src/lib/daily-refresh.ts`. Each game's two fatigue rows and optional prediction are
  replaced in one transaction after computation succeeds; a failed game keeps its prior
  rows while later games still run, and the process reports failure after the batch.
- `backfill_fatigue.ts` — bulk/idempotent fatigue computation (chronological; `--force`
  wipes and recomputes all).
- `backfill_predictions.ts` — retroactively inserts **resolved** predictions for finished
  regular-season games (with `actualWinnerId`).

Recent games for the model are loaded by `src/lib/fatigue-recent-games.ts`
(`fetchRecentGamesForTeam`, 30-day lookback).

### 4. Storage (Supabase PostgreSQL)

Eight tables: the core four — `teams`, `games`, `fatigue_scores`, `predictions` — plus two
additive/isolated modules. **Playoff Predictor:** `playoff_series` (`0006`) and
`playoff_series_predictions` (`0007`, model output); both declared in `src/lib/db/schema.ts`
even though they're hand-applied SQL. **Shot Quality:** `shot_grid` and `shot_value_surface`
(`0008`); **intentionally not declared in `schema.ts`** — read via raw SQL in `queries.ts`
(see [DATABASE.md](DATABASE.md) for why). None of the four additive tables are read by any
existing regular-season query. RLS + Data API grants are in migrations `0004`/`0005` (core),
`0006`/`0007` (Playoff Predictor), `0008` (Shot Quality). Full schema in
[DATABASE.md](DATABASE.md). The DB client (`src/lib/db/index.ts`) is a **lazy `Proxy`** over a
`postgres-js` connection (created on first use so `next build` doesn't require `DATABASE_URL`),
with `prepare: false` and a pool size of `DB_POOL_MAX` (default `1` on Vercel, `5` locally)
cached on `globalThis` to survive HMR/serverless reuse.

### 5. API (Next.js route handlers, `src/app/api/`)

Twelve `route.ts` handlers, all `GET`, all returning `{ data, error }` (cron adds `meta`).
Ten of them are one call to `jsonRoute` (`src/lib/api-route.ts`) with a Zod schema and an
operation: the module owns param reading, validation, the 400, the 500 and the logging, so
those five decisions are made once rather than per route. `/api/health` and `/api/cron/update`
keep their own contracts and stay outside it. `data` is `null` on any error — the envelope is
a discriminated union, not a nullable `error` beside a `T` that isn't there. DB access goes
through `src/lib/db/queries.ts`. DB-backed routes set `export const runtime = "nodejs"` and
`dynamic = "force-dynamic"` to avoid build-time prerender and Edge (postgres-js needs Node).
Full list in [API.md](API.md).

### 6. Frontend (Next.js App Router + React 19)

- `app/layout.tsx` — Inter (body) + Space Grotesk (headings) + IBM Plex Mono (data/labels) fonts,
  `<NavBar>`, footer, metadata.
- `app/page.tsx` — **Games** (client, nav label `GAMES`): season/month/day pickers → `/api/games/dates`
  then `/api/games/[date]`, with live merges from `useLiveGames`. Its UPCOMING view mounts
  `upcoming-content.tsx`, absorbed from the retired `/upcoming` route (now a redirect
  to `/` in `next.config.ts`). The browsing state machine lives in `hooks/useGameSlate.ts` over
  the pure reducer `lib/game-slate-machine.ts` — see the decision entry below.
- `app/analysis/page.tsx` / `app/playoffs/page.tsx` /
  `app/schedule/page.tsx` / `app/shot-quality/page.tsx` / `app/shooting/page.tsx` /
  `app/season/page.tsx` — thin server wrappers that render client content via `next/dynamic`
  (`ssr: false`) with skeleton fallbacks. `/shooting` is built entirely on a **static asset**
  (`public/data/player-rest.json`) rather than an API route: its export changes once a season,
  so a Postgres round trip could only ever return the same numbers. `/season`'s last section
  (zero-rest workload) reads the same static file for the same reason — `/shooting` is no
  longer the only surface that does.
- `app/about/page.tsx` — **the landing / explainer page**, outside the product surfaces.
  Visuals are CSS and inline SVG only, so `img-src` did not have to widen, and GSAP is imported
  *inside* an effect, keeping it out of the shared bundle. It is a **server component as of
  2026-07-30**: it reads `getHistoricalBacktest` and passes the evidence figures down, because
  the three it used to hardcode had all gone stale. Revalidated daily.
- `app/availability/page.tsx` — **Availability Cost** (nav label `AVAILABILITY COST`, under
  `OTHER`). A pure server component with no fetch, no client bundle and no loading state: every
  figure is a published constant from `src/lib/availability-facts.ts`. Same shape as the Playoff
  Rest argument, for the same reason — it renders a finished measurement, not a query.
- `app/behind-the-data/**` — **the reference section**, eight static routes (an index plus one per
  model) documenting each model's terms, constants and limits. No data fetching: constants are
  imported from source (`FATIGUE_CONSTANTS` and friends) so the prose cannot drift from the code,
  and measured figures carry the date they were measured.
- `app/referees/page.tsx` — **a placeholder** since 2026-07-30. The whistle findings were inside
  noise; the ingest and dataset test remain so it can return without a re-ingest.
- Client data fetching uses SWR through `src/lib/fetcher.ts`; live updates use Supabase
  Realtime via `src/hooks/useLiveGames.ts`.

Design system and component props in [FRONTEND.md](FRONTEND.md).

### 7. CI/CD

- **GitHub Actions** `daily-update.yml` runs `daily_update.py` on a **daily, year-round** cron
  (`0 21 * * *`); the script self-gates on the NBA season (`season_window.is_in_season`) and
  exits 0 cleanly in the offseason — so there is no cadence to switch.
- **Vercel cron** (`vercel.json`) hits `GET /api/cron/update` to refresh live scores, which
  then propagate to clients through Supabase Realtime (daily, year-round — the route does not
  season-gate, but it early-returns before any CDN fetch when today's ET date has no
  `scheduled`/`live` rows).
- **GitHub Actions** `ci.yml` runs frozen install, lint, strict type-check, Vitest, the
  import-light Python schedule-contract tests, and the production build on pushes to `main`
  and pull requests. Playwright remains local because it requires a populated database.
- **Vercel** auto-deploys from `main` after its own production build.

Details in [TESTING_AND_CICD.md](TESTING_AND_CICD.md).

## Request lifecycle examples

**Games (BY DATE view):** browser → `app/page.tsx` → `fetch('/api/games/dates?season=&month=')` →
`getRegularSeasonGameDatesWithCounts` → render day chips → on select
`fetch('/api/games/{date}')` → `getGamesByDate` (joins `games`+`teams`+ latest
`fatigue_scores`, computes `restAdvantage`) → `MatchupCard` list → `useLiveGames`
subscribes to `games` UPDATE events and merges score/status changes.

**Live score cron:** Vercel → `GET /api/cron/update` (Bearer `CRON_SECRET`) → query today's
scheduled/live games with stored scores → fetch NBA CDN scoreboard →
`reconcileLiveScores` returns only changed rows → `UPDATE games` → Supabase Realtime pushes
the row change → connected clients update in place.

## Notable architectural decisions & current discrepancies

- **Single source of fatigue math** in `src/lib/fatigue.ts`, shared by API reads and all
  pipeline writers. Since 2026-08-01 that includes the *geometry*: `scoreGameFatigue` resolves
  era coordinates, the neutral venue and altitude for both sides, rather than each writer
  assembling them. Until then `backfill_fatigue.ts` applied `eraCoordinates` and
  `daily-refresh.ts` did not — its team type carried no `abbreviation` to look one up with — and
  nothing asserted the two agreed. See
  [ADR 0005](adr/0005-fatigue-model-resolves-its-own-geometry.md).
- **Single rest-advantage evidence contract** in `src/lib/rest-advantage-evidence.ts`, shared
  by analysis, game search, API matchup reads, and resolved/open prediction writers.
- **Lazy DB proxy** so importing `@/lib/db` during build is side-effect-free.
- **Season-regime guard** (`gameIsNormallyPlayed` in `queries.ts`, built from
  `ABNORMAL_STRETCHES` in `season-regime.ts`), applied at one seam: the private
  `publishableGames(...extra)` folds it in with `game_type = 'regular'`, and ten readers compose
  on top. It was hand-written per call site until 2026-08-01, and four readers had omitted it —
  `getGameById` served a bubble game carrying a rest advantage, two clicks from the Games
  browser. The two schedule-density helpers stay outside it deliberately. It excludes games that
  were not reached by
  travelling to them — currently only the 2019-20 Orlando bubble. It replaced an Oct 1–Apr 30
  calendar window on 2026-07-30, which caught the bubble by coincidence of dates and dropped 179
  legitimate games from two seasons that overran April. See
  [ADR 0004](adr/0004-season-exclusions-belong-to-modules-not-ingest.md).
- **Design system unified (2026-06-29):** the home page, the analysis page, the upcoming table
  (`upcoming-content.tsx`) and the game-detail modal (`explore-game-detail-modal.tsx`) all use
  one flat design system; the earlier glassmorphism look has been fully migrated out. (This
  "Bloomberg Terminal" light style was later superseded by the dark "Broadcast" redesign, and
  the theme was then flipped back to light on 2026-07-17 for legibility — every step kept the
  same flat/token architecture and the same components, moving only token values. See
  [FRONTEND.md](FRONTEND.md).)
- **Removed (2026-06-29):** the dead `/api/analysis/accuracy` endpoint and its orphaned query fns
  (`getResolvedPredictions`, `getUpcomingPredictionsForSeason`) + `Accuracy*` types — nothing else
  imported them, so the route + dead code were deleted rather than rewired.
- **Versions (verified against code):** Next.js **16.2.10**, React **19.2.4**; the GitHub cron is
  `0 21 * * *` (daily, year-round, season self-gated); live site
  https://fullcourt-nba.vercel.app, and no `fetch_odds.ts` exists.
- **Playoff Predictor (complete):** an additive, isolated module — see the subsection below and
  [ROADMAP.md](ROADMAP.md).
- **Shot Quality (complete):** an additive, isolated module — see the subsection below and
  [SHOT_QUALITY_DESIGN.md](SHOT_QUALITY_DESIGN.md).
- **Schedule Disparity (complete):** the most isolated module of the three — **read-only**, with
  no migration, no table and no ingest. See the subsection below and
  [its design spec](superpowers/specs/2026-07-27-schedule-disparity-design.md).
- **Game slate extracted to a pure reducer (2026-07-27):** browsing state moved out of
  `app/page.tsx` (672 → 490 lines) into `lib/game-slate-machine.ts`, with `hooks/useGameSlate.ts`
  as a thin React shell owning only the two fetches, the Realtime overlay and date formatting.
  Two decisions do the work: **`selectedDate` is the only stored position and the month is
  derived from it**, which deletes the `setState`-during-render sync that existed to keep two
  values agreeing; and **days are fetched per season rather than per month**, which makes a
  month click resolve from memory and so deletes both `pendingSelectionResetRef` (no round trip
  to race) and `isFirstDatesFetchRef` (the monthless fetch is now the only fetch). Status became
  one tagged union instead of four booleans, removing the `errorGames ?? errorDates` patch by
  making its state unnameable. Keeping the reducer free of React is what lets it be unit-tested
  (25 cases) **without adding a DOM environment or `@testing-library`** — the dependency tree
  stays frozen. Three designs were generated and compared first; the shipped one is a synthesis.
- **Architecture pass: five deepenings (2026-07-28):** each collapses a shape that had been
  duplicated per caller.
  1. **One request module for the ten read routes** (`lib/api-route.ts`). The handlers were
     shallow — parse, validate, 400, 500, log was larger than the operation — and had drifted
     into six copies of the season validator and six fallback messages. `ApiResponse<T>` became
     a discriminated union: it had declared `data` non-null while every error path wrote
     `null as unknown as T`, and `/api/games/search` returned a successful-looking
     `{ games: [], total: 0 }` that a client ignoring `error` would read as zero results.
     `PublicApiError` had been defined and tested but never thrown; `jsonRoute` honours it and
     `/api/game/[id]` uses it for its 404.
  2. **One game-with-fatigue read** (`queries.ts`). `getGamesByDate` and `getGameById` each had
     their own 40-column projection and their own fatigue dedup — LATERAL in one, DISTINCT ON in
     the other — held equal by a comment. Both now go through `selectGamesWithFatigue`, and the
     row type is derived from that query rather than hand-declared as a third copy of the column
     list. `readFatigueSide` is the only place `decimal`-as-string stops being true. Verified
     against the live DB: 60 recent games read both ways, 0 mismatches.
  3. **The backtest holds its answer** until a game goes final (see §5 and API.md) — the read has
     no `LIMIT` and three surfaces ask for it.
  4. **Explore Games got the reducer treatment** the game slate already had —
     `lib/explore-games-machine.ts` + `hooks/useExploreGames.ts`. It was carrying the same eight
     `useState` values and render-time reconciliation the slate work deleted, with the search URL
     and pagination arithmetic assembled where no test could reach them.
  5. **One `PageHeader`, one `lazyContent`.** `PageHeader` had two hand-maintained copies of its
     markup; the seven `*-lazy` modules each restated `dynamic(..., { ssr: false })` around the
     one part that differs.
- **Architecture pass: four deepenings (2026-08-01):** each replaces a rule that was restated
  per caller with one place it lives.
  1. **`publishableGames` in `queries.ts`.** The season-regime predicate and
     `game_type = 'regular'` were hand-written at each call site, and four readers had omitted
     the first: `getGameById`, `getTeamRecentFinalResults`, `getCompletedGamesStamp` and
     `getRegularSeasonScheduleForDisparity`. Reachable, not theoretical — the recent-results
     strip returned a team's Orlando bubble games and each row links into `/api/game/[id]`,
     which served one as a card carrying a rest advantage. Ten readers now compose on the
     helper; the two schedule-density helpers deliberately do not, because they count physical
     schedule load and must agree with the unfiltered `fatigue-recent-games.ts`.
     `publishable-games.test.ts` fails if either predicate is written a second time.
  2. **`lib/signed-number.ts`.** Eleven hand-rolled signed formatters had drifted three ways:
     two emitted the ASCII hyphen — including `/playoffs`, whose sibling `/schedule` formatter
     carried a unit test for exactly that rule — three signed an exact zero, and one could
     render `−0`. `signedNumber(value, decimals?)` is the whole interface; units stay at the
     call site, because every numeric column names its own.
  3. **`scoreGameFatigue` and a named `FatigueInput`** (ADR 0005). Nine positional parameters,
     four of them adjacent bare `number`s for two different coordinate pairs, became one named
     object; the geometry moved inside the model, closing the era-coordinate fork between the
     two pipeline writers. `RecentGame` shed three fields no code read.
  4. **`components/ui/message-card.tsx`.** Nine failure branches in five visual shapes, one
     discarding the error message, `role="alert"` on two of them. `MessageCard` was already the
     right answer inside `shot-quality-content`; it now serves every surface and announces the
     error tone. `errMsg` in `fetcher.ts` replaced eight copies of one ternary whose fallback
     was unreachable in all eight.
- **Nav renamed to plain-noun tabs (2026-07-27):** `GAMES`, `SCHEDULE EDGE`,
  `MODEL RESULTS`, `PLAYOFF REST`, `SHOT VALUE` — joined by `PLAYER SHOOTING` when
  `/shooting` shipped (2026-07-28). That one is qualified rather than bare `SHOOTING` because
  on Basketball-Reference and NBA.com that word already means shot *location*, which is
  `SHOT VALUE`. It shipped as `REST & SHOOTING`, on the narrower reasoning that the two would
  read as near-synonyms side by side in the bar; once `SHOT VALUE` moved behind the `OTHER`
  menu that reasoning expired, and the label was rewritten to separate the two by subject —
  people here, court cells there — which holds whether or not they share the bar. Not
  `PLAYER REST`: the rest tab is `SCHEDULE EDGE`, and colliding with our own vocabulary
  misroutes worse than colliding with someone else's.
  The old six mixed three naming axes —
  time (`TODAY'S GAMES`, `UPCOMING EDGES`), method (`ANALYSIS`, `SHOT QUALITY`) and domain
  (`PLAYOFFS`, `SCHEDULE`) — and collided twice. `/upcoming` was folded into `GAMES` as a view
  toggle rather than kept as a sixth tab, since it and `/` render the same object under
  different filters. **Module names did not change**: the code, tables, scripts and design
  records still say Playoff Predictor, Shot Quality and Schedule Disparity. Only the nav
  labels, the home `<h1>` and `/analysis`'s metadata title moved.
- **One layout grammar across all five pages (2026-07-28):** Space Grotesk replaced Outfit as
  the display face at weight 500, and every page took the same rhythm — 32px title, `gap-12`
  between chapters, stat tiles ruled on the top edge. Split deliberately: the font family and
  base heading weight are **global** (they cannot sensibly differ per page and live behind the
  existing `--font-heading` indirection), while the layout work was applied per page. Loading
  and error branches carry the same `gap-12` so nothing shifts when data lands. Rules and the
  inline-style gotcha are in [FRONTEND.md §Page rhythm](FRONTEND.md).
- **`/about` added (2026-07-28), and deliberately not a sixth tab.** It explains the product
  rather than serving data. It is the *only* place the dark cinematic treatment lives — restyling
  the five app pages that way was considered and declined, because it would overwrite the light
  Broadcast system and widen the CSP product-wide. `gsap` is the one runtime dependency added
  since the freeze; `@gsap/react` was not added with it, and no remote images were introduced,
  so the CSP is unchanged.

## Playoff Predictor (complete) — data flow

A **separate, isolated** module that predicts the winner of each playoff *series*. Design and
rationale live in [PLAYOFF_PREDICTOR_DESIGN.md](PLAYOFF_PREDICTOR_DESIGN.md); the build record is
in [ROADMAP.md](ROADMAP.md). It never touches `fatigue.ts`, never renames the rest-advantage
metric, and the regular-season pages never read its data (every existing read pins
`game_type = 'regular'`, alongside the season-regime guard).

Full pipeline, ingest through the served page (live DB **verified 2026-07-02**, read-only
`SELECT`s: 3,145 `004` + 36 `005` game rows; 600 `playoff_series` rows, all four feature columns
non-NULL, 599 trainable; and 2,098 `playoff_series_predictions` rows — two `model_version`s ×
(599 + 450) since v1 was retained beside v2 — **verified 2026-07-31**):

```
nba_api Playoffs  → scripts/fetch_playoffs.py  → games (004 rows, game_type playoffs/finals)
nba_api PlayIn    → scripts/fetch_play_in.py   → games (005 rows, game_type='play_in')
                                                       │
                              ml/build_series_dataset.py (series skeleton: round / winner /
                                                           is_best_of_7 / conference)
                                                       ▼
                         playoff_series  (skeleton columns, upserted independently of ↓)
                                                       │
                              ml/compute_series_features.py (writes ONLY the 4 feature columns:
                                                              seed_diff, win_pct_diff,
                                                              entry_rest_diff, h2h_diff)
                              ml/compute_prior_grind.py     (writes ONLY prior_grind_diff)
                                                       ▼
                         playoff_series  (600 rows, all 5 columns populated, 599 trainable;
                                           the model reads 4 of them — entry_rest_diff is
                                           stored and displayed, not fed in)
                                                       │
                              ml/train_series_model.py (walk-forward-by-season logistic bake-off
                                                         → ml/PHASE3_REPORT.md, model of record:
                                                         unregularized logistic)
                                                       │
                              ml/predict_series.py --write (full_insample + walk_forward_oos
                                                             P(home-court wins), logistic_grind_v2)
                                                       ▼
                         playoff_series_predictions   (2,098 rows: 2 model_versions ×
                                                         (599 full_insample +
                                                          450 walk_forward_oos) — v1 retained)
                                                       │
                              GET /api/playoffs  →  getPlayoffSeriesWithPredictions()
                                                       ▼
                         /playoffs page  →  PlayoffRestArgument (the two headline numbers)
                                          +  PlayoffsContent  →  bracket of expandable SeriesCards
                                             (per-side grind line, per-series feature grid)
```

- **Ingest** reuses `fetch_schedule.py`'s pairing/upsert helpers, gated to `004` (`is_playoff_game_id`)
  and `005` (`is_play_in_game_id`) stats-ID prefixes, so a regular-season `002` row can never be
  written or mutated. No date window separates play-in rows from the regular season, so their
  `game_type='play_in'` tag is the sole thing keeping them out of the regular-season product —
  it always was, since they fell inside the old calendar window too.
- **Series build** groups `004` games by `(season, unordered team-pair)`, sets the home-court team
  from the opener's host, tallies wins from final games, and derives `round` via a backward bracket
  walk validated against `[8,4,2,1]` per season.
- **Feature pass** (`ml/compute_series_features.py`, plus `ml/compute_prior_grind.py`) computes
  `win_pct_diff`/`h2h_diff` from regular-season-only games, `seed_diff` as a regular-season
  Win%-rank proxy, and `prior_grind_diff` as format-aware games beyond a sweep in the prior round
  only (`games_played - (4 if is_best_of_7 else 3)`, opponent minus home-court, 0 for every
  Round 1 row). `entry_rest_diff` — days of rest into Game 1, from the most recent final game
  strictly before it — is still computed and stored, but since 2026-07-31 it is not a model
  feature. No feature reads `series_winner_team_id` [Verified `ml/PHASE3_REPORT.md:181-193`,
  leakage audit].
- **Model** (`ml/train_series_model.py`): expanding-window walk-forward by season (never random
  k-fold — same-season series share one bracket and would leak), 30 eval folds (1995-96…2025-26),
  450 pooled eval predictions. `logistic_grind_v2` is the model of record: pooled accuracy
  0.753 vs. the 0.744 majority-home-court baseline (**not distinguishable**), but log-loss
  improves 0.5696 → 0.4939 (≈13% relative) and Brier 0.1907 → 0.1628 (≈15% relative) — a
  **calibration** win, not a classification win. Pooling hides where the accuracy lives: split by
  round the model beats the baseline in rounds 2+ (73.3% vs 69.5%, n=210, paired per-season
  11/16/3) and loses in Round 1 (77.1% vs 78.8%, n=240), where `prior_grind_diff` is 0 for every
  row [Verified `ml/PHASE3_REPORT.md` §3a and §5, "Honest headline"; machine-readable copy at
  `ml/playoff_round_split.json`].
- **Predictions** (`ml/predict_series.py --write`) persist both an in-sample fit (all 599 trainable
  rows, for display on seasons too early for OOS) and the walk-forward OOS probability (only for
  the 450 series in the 30 eval-fold seasons; the first 10 min-train seasons have no OOS score).
  `/playoffs` surfaces the OOS probability as the series `PICK` and labels the in-sample one
  `HINDSIGHT`; the per-season scoreboard shows the hindsight figure **only** for the early seasons
  that have no forecast, rather than beside it. Both DB `prediction_method` values are unchanged —
  the 2026-07-30 repositioning was presentation-only (see [FRONTEND.md](FRONTEND.md) `/playoffs`).
- **Published metrics** live in `src/lib/playoff-model-metrics.ts`, not in the components: pooled
  walk-forward log loss / Brier / accuracy against the base rate, transcribed from
  [`ml/PHASE3_REPORT.md`](../ml/PHASE3_REPORT.md) §3-4. They are constants because they describe a
  fitted model, and they change only when `ml/train_series_model.py` is re-run.

## Shot Quality (Expected Shot Value / xeFG%) — data flow

Another additive, isolated module: no script or route in this flow touches `fatigue.ts`,
renames a rest-advantage identifier, or is read by any existing regular-season query. Full
design in [SHOT_QUALITY_DESIGN.md](SHOT_QUALITY_DESIGN.md); scripts in
[DATA_PIPELINE.md](DATA_PIPELINE.md); schema in [DATABASE.md](DATABASE.md); route in
[API.md](API.md); page in [FRONTEND.md](FRONTEND.md).

```
nba_api ShotChartDetail
        │  scripts/collect_shot_data.py  (ml/.venv is not used here — root venv; local only)
        ▼
ml/data/shots/{season}/{team}.csv.gz   (gitignored, gzip-CSV per-shot cache — never in Postgres)
        │  scripts/aggregate_shot_grid.py  (ml/.venv)
        ▼
public.shot_grid                        (1ft×1ft grid counts, per-team + league-wide, upserted)
        │
        ├─ scripts/sq4_train_shot_value.py / sq4b_train_gbm.py  (ml/.venv, local cache only —
        │  never read shot_grid; fit baseline / logit / GBM, walk-forward evaluated by season)
        │           ▼
        │  ml/shot_value/*.pkl  (local-only trained models; sq4b_gbm_full.pkl = full-data GBM)
        │
        ▼ (league-wide cells only, read-only)
        scripts/sq5_write_surface.py  (ml/.venv — combines shot_grid + the local pickles)
        ▼
public.shot_value_surface                (p_make / expected_efg / xpps per cell × model_version)
        │
        ▼
GET /api/shot-quality  →  getShotQualityGrid()  →  ShotQualityResponse
        ▼
/shot-quality page  →  ShotQualityContent  →  half-court hexbin SVG (2 courts value / 1 court diff)
```

- **Two different venvs, by design:** `collect_shot_data.py` runs in the **root** pipeline venv
  (it only needs `nba_api`); every other Shot Quality script runs in the **`ml/.venv`** isolated
  venv (`ml/requirements.txt` — the only place `scikit-learn` is pinned, not root/`scripts/`
  requirements). Neither venv choice is enforced by tooling — it's a manual convention.
- **Hybrid storage is the load-bearing design decision:** millions of raw per-shot rows never
  reach Postgres; only aggregated grid counts (`shot_grid`) and model output
  (`shot_value_surface`) do. `shot_grid` is read-only from `sq5_write_surface.py`'s perspective —
  the only table any Shot Quality script writes downstream of aggregation is
  `shot_value_surface`.
- **Model comparison, not a single model:** the shipped surface carries **both**
  `gbm-v1` (the adopted model — `HistGradientBoostingClassifier`, beat the zone baseline on
  pooled walk-forward log-loss/Brier across 29 folds) and `baseline-zone-v1` (the empirical
  zone-average floor) per cell, so the frontend can render the comparison rather than a single
  "black box" number — see [DATA_PIPELINE.md](DATA_PIPELINE.md) for the exact metrics.
  A plain logistic-regression candidate (SQ-4) was evaluated and **rejected** (it did not beat
  the baseline) — it is not one of the two model versions actually served.
- **Design-vs-build divergence:** the production surface is scored by the model trained on
  **all** seasons (`sq4b_gbm_full.pkl`), not per-fold walk-forward models — walk-forward is used
  for *evaluating* the model choice, not for serving distinct per-season predictions. The
  frontend's diff view is a **single** court (GBM − baseline), not the two-court diff view
  sketched in the original design doc's wireframe.

## Schedule Disparity — data flow

The most isolated of the additive modules: it is **read-only**. No migration, no new table, no
ingest script, no pipeline change. It reads `games` and `fatigue_scores` and nothing reads what
it produces.

```
GET /api/schedule-disparity  →  getScheduleDisparity()
                                  ├─ getRegularSeasonScheduleForDisparity(season)   (~1,230 rows)
                                  ├─ getTeamDirectory()
                                  └─ computeScheduleDisparity()   (pure, src/lib/schedule-disparity.ts)
                                       →  ScheduleDisparityResponse
```

The arithmetic runs in a pure TypeScript module rather than in SQL. At one season's row count
the aggregation is negligible, and it makes every metric directly assertable in unit tests
instead of requiring assertions against generated SQL.

Two definitions deliberately live here rather than being read from `fatigue_scores`:

- **Rest days** are derived from the game dates themselves. `backfill_fatigue.ts` only fills
  games *missing* fatigue rows, so inserting a game into a published schedule leaves its
  neighbours stale — and the NBA does exactly that every season, announcing only 80 of 82 games
  before opening night. See [ADR 0001](adr/0001-derive-rest-days-from-games.md).
- **3-in-4 / 4-in-6** are classified per game ("this game is the third in four nights").
  `fatigue_scores.is_three_in_four` answers a different question — whether a dense stretch
  occurred anywhere in a 30-day lookback — and so cannot be summed into a season count.

A pinning test (`src/lib/__tests__/schedule-disparity.test.ts`) holds the module's rest days
equal to `calculateFatigue`'s `daysSinceLastGame`, without needing a database. If the two
definitions ever drift, that test fails.

Full design in [its spec](superpowers/specs/2026-07-27-schedule-disparity-design.md); route in
[API.md](API.md); page in [FRONTEND.md](FRONTEND.md).

## Availability Cost — data flow

The only module with **no runtime data path at all**. It has no table, no migration, no ingest
script and no API route: the measurement is finished, so the page renders published constants.

```
OFFLINE (run by hand, not on any schedule)     [all inputs under the gitignored ml/data/]
  hoopR player box scores (ml/data/shooting/)  ┐
  fatigue_features.csv                         ├→ ml/availability_cost.py     fixed-effects OLS
  fatigue_model_table.csv                      ┘                              on final margin
                                                  ml/availability_quality.py  sanity + coverage
                                                  ml/availability_facts.py
                                                       →  ml/availability_facts.json  (committed)
                                                               │
COMMITTED                                                      ▼
  src/lib/availability-facts.ts   ── typed, frozen constants, hand-mirrored from that JSON
       ▲ pinned by src/lib/__tests__/availability-facts.test.ts
       │
  app/availability/page.tsx (server component, no fetch)  →  AvailabilityContent
```

Two structural decisions:

- **No table.** A database row would imply the numbers are queried per request and could change
  between them. They cannot — they move only when `ml/availability_facts.py` is re-run. Same
  pattern, and the same reasoning, as `src/lib/playoff-rest-facts.ts`.
- **The test is the seam.** `availability-facts.test.ts` reads `ml/availability_facts.json` and
  asserts the TypeScript constants match it, so a figure edited in one place and not the other
  fails the suite. The figures on the Playoff Rest page were once retyped into three files and
  drifted; this is the fix for that class of bug.

**Retrospective by construction.** Absence is inferred from prior participation — a player in the
last five games at 15+ minutes who is missing from tonight's box score — because a long-term
injured player may not be listed at all. That inference is only available *after* the game, so
nothing here forecasts availability, and the page copy is required to say so.

Page in [FRONTEND.md](FRONTEND.md); the measurement itself in
[DATA_PIPELINE.md](DATA_PIPELINE.md); the reader-facing method at
`/behind-the-data/availability`.
