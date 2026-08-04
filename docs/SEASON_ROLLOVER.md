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
dates and team pairs, so it works fully off a b-ref seed; the Games page's live scoring does not.

**Why the source matters:** `games.external_id` is the 10-digit stats ID (`002…` regular).
The live-score cron and the playoff/shot modules key on it. ESPN and B-Ref do **not** expose
that ID, so they can seed *dates/teams/scores* but not a drop-in row that the rest of the
app joins cleanly (the 2024-25 gap fix used synthetic `bref-…` IDs — fine for the backtest,
not for live scoring). **Prefer a stats-ID source (`stats.nba.com`) for a live season.**

## 3. Rollover checklist

**~August 2026 — schedule releases:**
- [x] ~~Test `stats.nba.com` reachability from GitHub Actions.~~ **Answered 2026-07-27: it times
      out there too** (25s, 0 bytes, runner in San Jose) — a datacenter block, not a geo block.
      There is **no clean `002…`-ID path**. Re-run `probe-data-sources.yml` before relying on
      this, since Akamai policy can change.
- [ ] Seed from **basketball-reference**, which the same probe measured at **200 from GitHub
      Actions** as well as from the dev machine (§2). Rows carry synthetic `bref-…` external
      ids, so they are complete for the backtest, Model Results and `/schedule` — but the
      live-score cron keys on stats `GAME_ID`, so the Games page will not match them.
- [ ] If live scoring for the new season matters, seed instead from a US **residential** IP
      using nba_api, which is the only route left that yields `002…` ids.

**~October 2026 — season starts:**
- [ ] Confirm the app shows 2026-27 in the season dropdown (automatic).
- [ ] Confirm `vercel.json` still reads `"0 3 * * *"` (no change expected — Section 5).
- [ ] Bump the hardcoded season counts that cannot derive (Section 7).
- [ ] After the first week, run the data-integrity re-audit (Section 6) to catch date drift early.

**Known limitation, not fixed: `/season` can serve a stale empty rollover for weeks.**
`getSeasonReport()` (`src/lib/season-report-server.ts`) keys its cache on
`getCompletedGamesStamp()`, which counts **final** games — exact for `/api/analysis`, whose
inputs are only final games. `/season` deliberately also reads scheduled (not-yet-played)
games, so the stamp is not exact for it. On 1 October the season list rolls over and
`/season` defaults to 2026-27. The first request that season caches a report off whatever
`getCompletedGamesStamp()` reads at that moment — and no regular-season game goes final
until opening night, roughly three weeks later. Until then the stamp never moves, so the
cache never invalidates, and the new nav tab's default view serves `0 / 0 · NO GAMES
SCHEDULED` even after 2026-27 has been seeded (Section 4). Serverless recycling on Vercel
masks this intermittently, since a fresh instance starts with an empty cache — which is why
it can look fixed on one request and stale on the next.
Two ways to close it, neither done here: widen the stamp to also count scheduled games for
the season in view (still cheap — an indexed `count`), so a newly-seeded schedule moves the
stamp even with nothing final yet; or put a TTL on the cache entry so it self-expires without
needing a stamp change at all.

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
| ~~`README.md`~~ | ~~"41 seasons" / "41-season backtest" / "every one of the 41 seasons"~~ | **No longer a rollover chore (2026-07-31).** All three were rewritten to phrasing that cannot age — "every NBA season since 1985-86", "the full-history backtest", "every season in the database". A season count in prose is a chore that comes back every October; an anchor on the *first* season is equally precise and never does. Prefer that phrasing for any new copy, and leave the live `NBA_SEASONS.length` readouts alone — those already derive themselves. |
| ~~`src/components/about-content.tsx`~~ | ~~"38,985 games", "+13.4", "26"~~ | **No longer a rollover chore (2026-07-30).** All three were stale — the game count, the RA≥7 deviation, and a rest-spread figure whose metric had been retired outright. `/about` is now a server component reading `getHistoricalBacktest`, revalidated daily, so these figures track the pipeline rather than the last edit. Nothing to re-read at rollover. |
| `docs/social-preview.png` | Baked "40-SEASON BACKTEST" wordmark **and the old logo direction** | **Stale now, not at rollover:** the site reads 41 since 2019-20 was admitted on 2026-07-30, and the court divider was flipped to lean top-right to bottom-left the same day — this PNG is the one asset still carrying the old lean, because it is a hand export rather than a rendered route. Re-export, then **re-upload** via GitHub → Settings → Social preview. It is referenced by no code, so nothing else will remind you. |
| `docs/screenshots/*.png` + their README alt text | Any figure quoted in an `alt=` attribute | Alt text describes the frozen image, so it is correct until the image is retaken. Retaking a screenshot obliges rewriting its alt text in the same commit — a screen-reader user gets the alt text *instead of* the picture. |

Already derived, for contrast: the in-app CTA (`src/app/page.tsx`) and the OG card
(`src/app/opengraph-image.tsx`) both read `NBA_SEASONS.length`. Note the OG card is cached by
GitHub and every social platform, so a corrected card only appears after they re-crawl.

## 8. Dependency freeze — do not regenerate the lockfile casually

The tree is deliberately frozen (Next 16.2.12 / React 19.2.4). Note that
`eslint-config-next` is intentionally left at 16.2.10: it is a lint package, not part of the
runtime, so it was not moved by the 2026-07-30 security patch.

**Four** security overrides are pinned in `pnpm-workspace.yaml` under `overrides:` (lines 7-14):

```
'@babel/core@<=7.29.0': 7.29.6     ·   postcss@<8.5.18: 8.5.18
sharp@<0.35.0: '>=0.35.0'          ·   ws@>=8.0.0 <8.21.0: '>=8.21.0'
```

Each is a CVE pin, not a preference — `postcss` sits at 8.5.18 rather than the older 8.5.10
because that only covered an earlier advisory, and `sharp` is pinned for libvips CVEs inherited
through Next's image optimizer.

**The migration this section used to warn about is done.** `packageManager` is now
`pnpm@11.8.0`, which reads `pnpm-workspace.yaml` directly, and `package.json` no longer has a
`pnpm` field at all — so the old "delegate to 9.15.9 so it still reads the field" mechanism, and
the expected `[WARN] The "pnpm" field … is no longer read` it produced, are both gone. Build
approval moved with it: pnpm 11 replaced `onlyBuiltDependencies` / `neverBuiltDependencies` with
the `allowBuilds:` map (lines 19-23).

The standing rule is now just this: **keep the overrides in `pnpm-workspace.yaml`, and re-check
each pin against its advisory before regenerating `pnpm-lock.yaml`.** After any regeneration,
confirm the four still resolve — they appear in the lockfile's own `overrides:` block at lines
7-11. Skip that check and a CVE pin can vanish silently, with no error and no failing test.
