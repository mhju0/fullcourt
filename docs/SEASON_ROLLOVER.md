# Season rollover runbook (NBA 2026-27 and beyond)

How FullCourt moves to a new NBA season. **Most of it is automatic.** The one manual
step is seeding the new schedule, because the NBA CDN blocks the environments that
could otherwise fetch it. Written after the 2026-07 full-schedule audit; keep it current.

## TL;DR

1. **Nothing breaks and no code edit is needed for the app to *recognize* 2026-27** — the
   season list, defaults, offseason gate, and seed/backfill ranges all derive from the ET
   clock and roll over on **Oct 1, 2026** by themselves.
2. **The new schedule will NOT auto-ingest.** `fetch_nba_schedule_cdn.py` reads
   `cdn.nba.com`, which returns **403** from Seoul *and* GitHub Actions. Seeding 2026-27 is
   a manual step (below).
3. Flip the **Vercel cron cadence** to daily for in-season live scores.

## 1. What rolls over automatically (no action)

| Concern | Mechanism | File |
|---|---|---|
| Season dropdowns / defaults include 2026-27 | `NBA_SEASONS` derives its upper bound from the ET date (`max(2025, currentSeasonStart)`) | `src/lib/nba-season.ts:8-22` |
| "Today", season default, offseason check use ET | `formatEasternDateKey()` | `src/lib/nba-season.ts` |
| Daily pipeline skips the offseason, runs in-season | `season_window.is_in_season()` (generic, no hardcoded year) | `scripts/season_window.py:91` |
| Historical seed range extends to the current season | `range(1985, current_season_start_year() + 1)` | `scripts/fetch_schedule.py` |
| Shot-Quality collector's "current season" | `CURRENT_SEASON_START_YEAR = current_season_start_year()` | `scripts/collect_shot_data.py` |

`current_season_start_year()` (`scripts/season_window.py`) is the single Python source of
truth and mirrors the TS logic, so both agree on "the current season".

## 2. Data-source reachability (verified 2026-07-11/12 — re-check before relying on it)

| Source | From Seoul (dev) | From GitHub Actions (US) | Gives stats `002…` game IDs? |
|---|---|---|---|
| `cdn.nba.com` staticData schedule | **403** | **403** | yes (but unreachable) |
| `stats.nba.com` (nba_api) | **times out** | **untested** — try this first | yes |
| `cdn.nba.com` liveData (live scores) | 403 | untested | — |
| ESPN `site.api…/scoreboard?dates=YYYYMMDD` | **200** | 200 (expected) | **no** (ESPN event IDs) |
| basketball-reference monthly pages | **200** (residential IP + UA) | 403 (datacenter) | no |
| Supabase (`DATABASE_URL`) | reachable | reachable | — |

**Why the source matters:** `games.external_id` is the 10-digit stats ID (`002…` regular).
The live-score cron and the playoff/shot modules key on it. ESPN and B-Ref do **not** expose
that ID, so they can seed *dates/teams/scores* but not a drop-in row that the rest of the
app joins cleanly (the 2024-25 gap fix used synthetic `bref-…` IDs — fine for the backtest,
not for live scoring). **Prefer a stats-ID source (`stats.nba.com`) for a live season.**

## 3. Rollover checklist

**~August 2026 — schedule releases:**
- [ ] Test `stats.nba.com` reachability from a GitHub Actions run (a one-off `workflow_dispatch`
      that curls `stats.nba.com/stats/scheduleleaguev2`). If it responds, the existing
      `fetch_schedule.py` (nba_api) can seed 2026-27 with correct `002…` IDs from CI — the
      clean path.
- [ ] If `stats.nba.com` is also blocked from CI: seed from a reachable environment (dev
      machine / a US residential IP) using nba_api, or fall back to ESPN/B-Ref with synthetic
      IDs (acceptable for backtest-only; degrades live-score matching).

**~October 2026 — season starts:**
- [ ] Confirm the app shows 2026-27 in the season dropdown (automatic).
- [ ] Flip the Vercel cron cadence (Section 5).
- [ ] After the first week, run the data-integrity re-audit (Section 6) to catch date drift early.

## 4. Seeding the new schedule (manual)

From a reachable environment with `DATABASE_URL` set, run from the repo root:

```bash
python scripts/fetch_schedule.py            # full nba_api seed (auto-includes 2026-27)
python scripts/fetch_nba_schedule_cdn.py    # current+future via CDN — only if CDN is reachable
pnpm exec tsx scripts/backfill_fatigue.ts   # compute fatigue for the new rows
pnpm exec tsx scripts/backfill_predictions.ts
```

`fetch_nba_schedule_cdn.py` upserts on `external_id` and sets `date = EXCLUDED.date`, so a
later re-run self-heals any mis-dated rows (this is what fixed the 2026-04 UTC-date bug).

## 5. Vercel cron cadence (offseason ↔ in-season)

`vercel.json` runs `/api/cron/update` (live scores). JSON has no comments — the file is the
source of truth.

- Offseason (current): `"schedule": "0 10 1 * *"` (1st of month) — the route finds no games.
- **In-season: change to `"0 10 * * *"` (daily)** so live scores refresh each game day.

GitHub Actions (`.github/workflows/daily-update.yml`) runs daily **year-round** already and
self-gates via `is_in_season`, so there is no GitHub cadence to change.

## 6. Data-integrity re-audit (recommended each season)

The method proven in `audit/schedule-date-audit-2026-07-12.md`: from the dev machine, fetch
basketball-reference monthly pages (`leagues/NBA_<endYear>_games-<month>.html`), parse the
`csk="YYYYMMDD<home-tricode>"` key, and diff per-date game **counts** vs the DB (team-agnostic,
so franchise-code churn doesn't matter). Cross-check any flagged date against ESPN. This
catches the UTC-vs-ET date-shift class of bug that a sampled spot-check misses. Note the three
NBA Cup finals (neutral-site, T-Mobile Arena) are correctly excluded from the 82-game record.
