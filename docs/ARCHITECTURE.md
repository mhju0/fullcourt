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
[DATA_PIPELINE.md](DATA_PIPELINE.md).

### 3. Modeling (TypeScript via `tsx`, `scripts/` + `src/lib/`)

Fatigue math lives **only** in `src/lib/fatigue.ts` (`calculateFatigue`,
`calculateRestAdvantage`) and is reused by every writer so Python never duplicates it:

- `run-daily.ts` — recomputes `fatigue_scores` for a `[date, date+14]` window and
  regenerates **open** (ungraded) predictions for scheduled games.
- `backfill_fatigue.ts` — bulk/idempotent fatigue computation (chronological; `--force`
  wipes and recomputes all).
- `backfill_predictions.ts` — retroactively inserts **resolved** predictions for finished
  regular-season games (with `actualWinnerId`).

Recent games for the model are loaded by `src/lib/fatigue-recent-games.ts`
(`fetchRecentGamesForTeam`, 30-day lookback).

### 4. Storage (Supabase PostgreSQL)

Four tables — `teams`, `games`, `fatigue_scores`, `predictions` — defined in
`src/lib/db/schema.ts`. RLS + Data API grants are in migrations `0004`/`0005`. Full schema
in [DATABASE.md](DATABASE.md). The DB client (`src/lib/db/index.ts`) is a **lazy
`Proxy`** over a `postgres-js` connection (created on first use so `next build` doesn't
require `DATABASE_URL`), with `prepare: false` and a pool size of `DB_POOL_MAX` (default
`1` on Vercel, `5` locally) cached on `globalThis` to survive HMR/serverless reuse.

### 5. API (Next.js route handlers, `src/app/api/`)

Eight `route.ts` handlers, all `GET`, all returning `{ data, error }` (cron adds `meta`).
Inputs validated with Zod; DB access goes through `src/lib/db/queries.ts`. DB-backed routes
set `export const runtime = "nodejs"` and `dynamic = "force-dynamic"` to avoid build-time
prerender and Edge (postgres-js needs Node). Full list in [API.md](API.md).

### 6. Frontend (Next.js App Router + React 19)

- `app/layout.tsx` — Inter (body) + Outfit (headings) fonts, `<NavBar>`, footer, metadata.
- `app/page.tsx` — **Today's Games** (client): season/month/day pickers → `/api/games/dates`
  then `/api/games/[date]`, with live merges from `useLiveGames`.
- `app/analysis/page.tsx` / `app/upcoming/page.tsx` — thin server wrappers that render
  client content via `next/dynamic` (`ssr: false`) with skeleton fallbacks.
- Client data fetching uses SWR through `src/lib/fetcher.ts`; live updates use Supabase
  Realtime via `src/hooks/useLiveGames.ts`.

Design system and component props in [FRONTEND.md](FRONTEND.md).

### 7. CI/CD

- **GitHub Actions** `daily-update.yml` runs `daily_update.py` on a cron (offseason weekly).
- **Vercel cron** (`vercel.json`) hits `GET /api/cron/update` to refresh live scores, which
  then propagate to clients through Supabase Realtime.
- **Vercel** auto-deploys from `main`.

Details + the stale-test warnings in [TESTING_AND_CICD.md](TESTING_AND_CICD.md).

## Request lifecycle examples

**Today's Games:** browser → `app/page.tsx` → `fetch('/api/games/dates?season=&month=')` →
`getRegularSeasonGameDatesWithCounts` → render day chips → on select
`fetch('/api/games/{date}')` → `getGamesByDate` (joins `games`+`teams`+ latest
`fatigue_scores`, computes `restAdvantage`) → `MatchupCard` list → `useLiveGames`
subscribes to `games` UPDATE events and merges score/status changes.

**Live score cron:** Vercel → `GET /api/cron/update` (Bearer `CRON_SECRET`) → query
today's scheduled/live games → fetch NBA CDN scoreboard → `UPDATE games` on change → Supabase
Realtime pushes the row change → connected clients update in place.

## Notable architectural decisions & current discrepancies

- **Single source of fatigue math** in `src/lib/fatigue.ts`, shared by API reads and all
  pipeline writers.
- **Lazy DB proxy** so importing `@/lib/db` during build is side-effect-free.
- **Regular-season calendar guard** (`gameDateWithinRegularSeasonCalendar` in `queries.ts`)
  re-filters by Oct 1–Apr 30 even though ingest already excludes non-`002` IDs, defending
  against mis-tagged source rows.
- **Design migration in progress:** Today's Games and Analysis use the new "Bloomberg
  Terminal" flat style; **Future Games (`upcoming-content.tsx`) and the game-detail modal
  (`explore-game-detail-modal.tsx`) still use the older glassmorphism style.** The README's
  "Glassmorphism design system" line reflects the old direction.
- **Unused endpoint:** `/api/analysis/accuracy` (and the `predictions`-backed accuracy
  types) is fully implemented but **not fetched by any current page** — it powered a
  "Prediction Tracker" page that no longer exists (only the stale `e2e/navigation.spec.ts`
  still references `/tracker`).
- **Version drift in README:** README says "Next.js 15" / "21:00 UTC daily" / references
  `fetch_odds.ts`; the code is Next **16.2.1**, the GitHub cron is weekly offseason, and no
  `fetch_odds.ts` exists.
