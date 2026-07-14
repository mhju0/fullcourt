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
│ nba_api / stats.nba.com   │─────▶│ nba_ot_periods.py            │   │  fatigue_scores  │
│  (LeagueGameFinder,       │      │  → overtime periods          │   │  predictions     │
│   BoxScoreSummaryV2)      │      │ seed_teams.py → 30 teams     │   └──────────────────┘
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
│ app/api/**/route.ts  ── Zod-validated, { data, error } envelope                    │
│        ▲                                                                            │
│ Server pages (analysis/page.tsx, upcoming/page.tsx) → dynamic client components    │
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
| nba_api (stats.nba.com) | `BoxScoreSummaryV2` | Overtime-period detection (`nba_ot_periods.py`). |
| NBA CDN logos | `https://cdn.nba.com/logos/nba/{teamId}/global/L/logo.svg` | Current-era team logos (`src/lib/team-history.ts`, `nba-team-ids.ts`). |
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
historical-evidence layer (`|RA| < 0.5` is neutral; exactly `±0.5` is decisive):

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

Nine `route.ts` handlers, all `GET`, all returning `{ data, error }` (cron adds `meta`).
Inputs validated with Zod; DB access goes through `src/lib/db/queries.ts`. DB-backed routes
set `export const runtime = "nodejs"` and `dynamic = "force-dynamic"` to avoid build-time
prerender and Edge (postgres-js needs Node). Full list in [API.md](API.md).

### 6. Frontend (Next.js App Router + React 19)

- `app/layout.tsx` — Inter (body) + Outfit (headings) fonts, `<NavBar>`, footer, metadata.
- `app/page.tsx` — **Today's Games** (client): season/month/day pickers → `/api/games/dates`
  then `/api/games/[date]`, with live merges from `useLiveGames`.
- `app/analysis/page.tsx` / `app/upcoming/page.tsx` / `app/playoffs/page.tsx` /
  `app/shot-quality/page.tsx` — thin server wrappers that render client content via
  `next/dynamic` (`ssr: false`) with skeleton fallbacks.
- Client data fetching uses SWR through `src/lib/fetcher.ts`; live updates use Supabase
  Realtime via `src/hooks/useLiveGames.ts`.

Design system and component props in [FRONTEND.md](FRONTEND.md).

### 7. CI/CD

- **GitHub Actions** `daily-update.yml` runs `daily_update.py` on a **daily, year-round** cron
  (`0 21 * * *`); the script self-gates on the NBA season (`season_window.is_in_season`) and
  exits 0 cleanly in the offseason — so there is no cadence to switch.
- **Vercel cron** (`vercel.json`) hits `GET /api/cron/update` to refresh live scores, which
  then propagate to clients through Supabase Realtime (currently monthly in the offseason; the
  route does not season-gate).
- **GitHub Actions** `ci.yml` runs frozen install, lint, strict type-check, Vitest, the
  import-light Python schedule-contract tests, and the production build on pushes to `main`
  and pull requests. Playwright remains local because it requires a populated database.
- **Vercel** auto-deploys from `main` after its own production build.

Details in [TESTING_AND_CICD.md](TESTING_AND_CICD.md).

## Request lifecycle examples

**Today's Games:** browser → `app/page.tsx` → `fetch('/api/games/dates?season=&month=')` →
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
  pipeline writers.
- **Single rest-advantage evidence contract** in `src/lib/rest-advantage-evidence.ts`, shared
  by analysis, game search, API matchup reads, and resolved/open prediction writers.
- **Lazy DB proxy** so importing `@/lib/db` during build is side-effect-free.
- **Regular-season calendar guard** (`gameDateWithinRegularSeasonCalendar` in `queries.ts`)
  re-filters by Oct 1–Apr 30 even though ingest already excludes non-`002` IDs, defending
  against mis-tagged source rows.
- **Design system unified (2026-06-29):** Today's Games, Analysis, Future Games
  (`upcoming-content.tsx`) and the game-detail modal (`explore-game-detail-modal.tsx`) all use
  one flat design system; the earlier glassmorphism look has been fully migrated out. (This
  "Bloomberg Terminal" light style was later superseded by the dark "Broadcast" redesign, which
  kept the flat/token architecture — see [FRONTEND.md](FRONTEND.md).)
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

## Playoff Predictor (complete) — data flow

A **separate, isolated** module that predicts the winner of each playoff *series*. Design and
rationale live in [PLAYOFF_PREDICTOR_DESIGN.md](PLAYOFF_PREDICTOR_DESIGN.md); the build record is
in [ROADMAP.md](ROADMAP.md). It never touches `fatigue.ts`, never renames the rest-advantage
metric, and the regular-season pages never read its data (every existing read pins
`game_type = 'regular'` + the Oct 1–Apr 30 calendar guard).

Full pipeline, ingest through the served page (live DB **verified 2026-07-02**, read-only
`SELECT`s: 3,145 `004` + 36 `005` game rows; 600 `playoff_series` rows, all four feature columns
non-NULL, 599 trainable; 1,049 `playoff_series_predictions` rows):

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
                                                       ▼
                         playoff_series  (600 rows, all 4 features populated, 599 trainable)
                                                       │
                              ml/train_series_model.py (walk-forward-by-season logistic bake-off
                                                         → ml/PHASE3_REPORT.md, model of record:
                                                         unregularized logistic)
                                                       │
                              ml/predict_series.py --write (full_insample + walk_forward_oos
                                                             P(home-court wins), logistic_unreg_v1)
                                                       ▼
                         playoff_series_predictions   (1,049 rows: 599 full_insample +
                                                         450 walk_forward_oos)
                                                       │
                              GET /api/playoffs  →  getPlayoffSeriesWithPredictions()
                                                       ▼
                         /playoffs page  →  PlayoffsContent  →  bracket of expandable SeriesCards
                                             (OOS-vs-in-sample accuracy header, per-series feature grid)
```

- **Ingest** reuses `fetch_schedule.py`'s pairing/upsert helpers, gated to `004` (`is_playoff_game_id`)
  and `005` (`is_play_in_game_id`) stats-ID prefixes, so a regular-season `002` row can never be
  written or mutated. Play-in rows fall **inside** the Oct 1–Apr 30 calendar window, so their
  `game_type='play_in'` tag is the sole thing keeping them out of the regular-season product.
- **Series build** groups `004` games by `(season, unordered team-pair)`, sets the home-court team
  from the opener's host, tallies wins from final games, and derives `round` via a backward bracket
  walk validated against `[8,4,2,1]` per season.
- **Feature pass** (`ml/compute_series_features.py`) computes `win_pct_diff`/`h2h_diff` from
  regular-season-only games, `entry_rest_diff` from the most recent final game strictly before
  Game 1, and `seed_diff` as a regular-season Win%-rank proxy — no feature reads
  `series_winner_team_id` [Verified `ml/PHASE3_REPORT.md:148-157`, leakage audit].
- **Model** (`ml/train_series_model.py`): expanding-window walk-forward by season (never random
  k-fold — same-season series share one bracket and would leak), 30 eval folds (1995-96…2025-26),
  450 pooled eval predictions. The unregularized logistic is the model of record: pooled accuracy
  0.7467 vs. the 0.7444 majority-home-court baseline (**not distinguishable** — paired per-season
  W/T/L is 11/11/8), but log-loss improves 0.5696 → 0.4959 (≈13% relative) and Brier 0.1907 →
  0.1638 (≈14% relative) — a **calibration** win, not a classification win [Verified
  `ml/PHASE3_REPORT.md` §5, "Honest headline"].
- **Predictions** (`ml/predict_series.py --write`) persist both an in-sample fit (all 599 trainable
  rows, for display on seasons too early for OOS) and the walk-forward OOS probability (only for
  the 450 series in the 30 eval-fold seasons; the first 10 min-train seasons have no OOS score) —
  `/playoffs` shows both side by side and labels which one backs each series' correctness badge.

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
