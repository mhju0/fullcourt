# Season rollover runbook (NBA 2026-27 and beyond)

> **Local working artifacts.** Citations to files under `ml/` (probe dumps,
> `*_metrics.txt`, `sq5_*.txt`) and `docs/audit/` refer to unpublished analysis
> artifacts kept out of the repository. Each is reproducible by the script named
> alongside it, and is cited as provenance for the numbers rather than as a
> browsable link.

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
3. **Nothing to change on the Vercel cron** — it is already daily and year-round
   (`vercel.json` `0 3 * * *`, set in 8b7888e). See Section 5.

## 1. What rolls over automatically (no action)

| Concern | Mechanism | File |
|---|---|---|
| Season dropdowns / defaults include 2026-27 | `NBA_SEASONS` derives its upper bound from the ET date (`max(2025, currentSeasonStart)`) | `src/lib/nba-season.ts:8-22` |
| `/schedule` can browse 2026-27 from **August**, before the Oct 1 rollover | `browsableSeasons()` = `NBA_SEASONS` + the upcoming season, Aug–Sep only. Deliberately separate from `NBA_SEASONS`, whose `.length` backs the "N-SEASON BACKTEST" copy and must never count an unplayed season | `src/lib/nba-season.ts` |
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
| `stats.nba.com` (nba_api) | **times out** | **times out** | yes (but unreachable) |
| `cdn.nba.com` liveData (live scores) | 403 | untested | — |
| ESPN `site.api…/scoreboard?dates=YYYYMMDD` | **200** | **200** | **no** (ESPN event IDs) |
| basketball-reference monthly pages | **200** (residential IP + UA) | **200** | no |
| Supabase (`DATABASE_URL`) | reachable | reachable | — |

**Actions column measured 2026-07-27** by `.github/workflows/probe-data-sources.yml` (runs
`30247134313` / `30248448510`, runner egress San Jose, California). Re-run it any time from
Actions → "Probe NBA data sources"; it reads nothing and writes nothing.

Two results changed the plan:

- **`stats.nba.com` is unreachable from CI as well**, timing out after 25s with 0 bytes exactly
  as it does from Seoul. It is a datacenter block, not a geo block, so there is **no clean
  `002…`-ID path** for seeding 2026-27. The "try this first" step in §3 is answered: it fails.
- **basketball-reference returns 200 from GitHub Actions** (518 KB). This table previously
  recorded it as 403 from datacenters — true of Anthropic/subagent IPs, but not of GitHub's
  runners. So b-ref is reachable from *both* environments and is the practical seeding source.

The trade is unchanged: a b-ref seed carries no stats `GAME_ID`, so those rows use synthetic
`bref-…` external ids and the live-score cron cannot key on them. Schedule Disparity needs only
dates and team pairs, so it works fully off a b-ref seed; Today's Games live scoring does not.

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
- [ ] Confirm `vercel.json` still reads `"0 3 * * *"` (no change expected — Section 5).
- [ ] Bump the hardcoded season counts that cannot derive (Section 7).
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

## 5. Vercel cron cadence (year-round — no seasonal switch)

`vercel.json` runs `/api/cron/update` (live scores). JSON has no comments — the file is the
source of truth.

- `"schedule": "0 3 * * *"` (daily, 03:00 UTC) — **year-round; nothing to change at rollover.**
  The route does not season-gate, but it early-returns before any CDN fetch when no game is
  `scheduled`/`live` for today(ET), so an offseason run costs one indexed query.
- 03:00 UTC = 10 PM EST / 11 PM EDT: mid-slate, and still ET **date D** in both DST regimes.
  (`0 10 * * *` would fire 5–6 AM ET, before tip-off; `0 4 * * *` would cross midnight ET under
  EDT and query the wrong date.) Vercel **Hobby allows one cron/day**, so this is a backstop —
  live UX comes from Supabase Realtime and the GitHub Actions pipeline.

GitHub Actions (`.github/workflows/daily-update.yml`) runs daily **year-round** already and
self-gates via `is_in_season`, so there is no GitHub cadence to change.

## 6. Data-integrity re-audit (recommended each season)

The method proven in `docs/audit/schedule-date-audit-2026-07-12.md`: from the dev machine, fetch
basketball-reference monthly pages (`leagues/NBA_<endYear>_games-<month>.html`), parse the
`csk="YYYYMMDD<home-tricode>"` key, and diff per-date game **counts** vs the DB (team-agnostic,
so franchise-code churn doesn't matter). Cross-check any flagged date against ESPN. This
catches the UTC-vs-ET date-shift class of bug that a sampled spot-check misses. Note the three
NBA Cup finals (neutral-site, T-Mobile Arena) are correctly excluded from the 82-game record.

## 7. Manual copy that does NOT derive (bump at rollover)

Most season-dependent values derive themselves (Section 1). These do not, and nothing in the
pipeline will flag them — they simply become wrong the moment the ET clock rolls the season:

| Where | What | Note |
|-------|------|------|
| `README.md:18`, `:32`, `:121` | "roughly 40 seasons" / "40-season backtest" / "every one of the 40 seasons" | `NBA_SEASONS` = 1985..current minus 2019-20. 40 today; 41 from 2026-10-01. |
| `docs/social-preview.png` | Baked "40-SEASON BACKTEST" wordmark | Re-export, then **re-upload** via GitHub → Settings → Social preview. It is referenced by no code, so nothing else will remind you. |
| `docs/screenshots/*.png` + their README alt text | Any figure quoted in an `alt=` attribute | Alt text describes the frozen image, so it is correct until the image is retaken. Retaking a screenshot obliges rewriting its alt text in the same commit — a screen-reader user gets the alt text *instead of* the picture. |

Already derived, for contrast: the in-app CTA (`src/app/page.tsx`) and the OG card
(`src/app/opengraph-image.tsx`) both read `NBA_SEASONS.length`. Note the OG card is cached by
GitHub and every social platform, so a corrected card only appears after they re-crawl.

## 8. Dependency freeze — do not regenerate the lockfile casually

The tree is deliberately frozen (Next 16.2.10 / React 19.2.4). Three security overrides are
pinned in `package.json` under the `pnpm` field:

```
"ws@>=8.0.0 <8.21.0": ">=8.21.0"   ·   "postcss@<8.5.10": "8.5.10"   ·   "@babel/core@<=7.29.0": "7.29.6"
```

**pnpm 10 and later do not read that field at all.** Any modern pnpm prints
`[WARN] The "pnpm" field in package.json is no longer read by pnpm` on every script — that
warning is expected, not a fault. The pins survive today only because two things hold:

1. `packageManager: "pnpm@9.15.9"` in `package.json`, which makes a pnpm ≥10 client delegate
   to 9.15.9, the version that *does* read the field; and
2. `pnpm install --frozen-lockfile` in CI against a committed `pnpm-lock.yaml` whose
   `overrides:` block (lines 11-14) already resolves `ws@8.21.0`.

So: **do not bump `packageManager`, and do not regenerate `pnpm-lock.yaml`, without moving
`overrides` + `neverBuiltDependencies` into `pnpm-workspace.yaml` in the same change**
(workspace-level overrides need pnpm ≥10.4). Skip that and all three CVE pins vanish silently,
with no error and no failing test. Do **not** move them while `packageManager` still says
9.15.9 — that version does not read the workspace file, so the pins would break the other way.
