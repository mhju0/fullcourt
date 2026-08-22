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
   (`vercel.json` `0 7 * * *`, made year-round in 8b7888e and moved 03:00 → 07:00 UTC in
   798394a). See Section 5.

## 1. What rolls over automatically (no action)

| Concern | Mechanism | File |
|---|---|---|
| Season dropdowns / defaults include 2026-27 | `NBA_SEASONS` derives its upper bound from the ET date (`max(2025, currentSeasonStart)`) | `src/lib/nba-season.ts:8-22` |
| `/schedule` and `/games` can browse 2026-27 from **August**, before the Oct 1 rollover | `browsableSeasons()` = `NBA_SEASONS` + the upcoming season, Aug–Sep only. Deliberately separate from `NBA_SEASONS`, whose `.length` backs the "N-SEASON BACKTEST" copy and must never count an unplayed season | `src/lib/nba-season.ts` |
| `/games` **opens on** the upcoming season once it is browsable | `defaultNbaSeason()` returns the last entry of `browsableSeasons()`; the page's `<SeasonSelector>` is passed the same list, and `/api/games/dates` validates with `browsableSeasonParam` so the board's own default is not a 400 | `src/lib/nba-season.ts`, `src/lib/api-route.ts` |
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
| `cdn.nba.com` liveData (live scores) | 403 | **403** | — |
| ESPN `site.api…/scoreboard?dates=YYYYMMDD` | **200** | **200** | **no** (ESPN event IDs) |
| basketball-reference monthly pages | **200** (residential IP + UA) | **200** | no |
| Supabase (`DATABASE_URL`) | reachable | reachable | — |

**Actions column measured 2026-07-27** by `.github/workflows/probe-data-sources.yml` (runs
`30247134313` / `30248448510`, runner egress San Jose, California). Re-run it any time from
Actions → "Probe NBA data sources"; it reads nothing and writes nothing.

**Both columns re-probed 2026-08-18** (run `32118299181`, runner egress Des Moines, Iowa),
because a season was about to be seeded on the answer. Nothing moved for the NBA-owned sources:
`stats.nba.com` still times out, `cdn.nba.com` still 403s. **ESPN answers a runner** — 200 with
8 events.

That run also corrected a false negative in the probe itself. It had been reporting ESPN as
**403** while the pipeline was reading ESPN successfully: it sent a Chrome User-Agent through
`curl`, i.e. a browser UA with none of a browser's other headers, and Akamai fingerprints the
whole set. The same UA through `fetch` returns 200. ESPN is now probed three ways and the
`node fetch` row is the one that speaks for the pipeline.

**Dev column re-probed 2026-08-06** (Seoul, residential): `cdn.nba.com` staticData still
**403**, ESPN scoreboard still **200**. Nothing in the table moved. The last column's "no" was
re-measured rather than assumed — an ESPN scoreboard payload fetched the same day carries no
`002…`-shaped id anywhere in it (event id `401809238`, `uid s:40~l:46~e:401809238`). That is
worth restating because the id is not merely an identifier here: the `002`/`004`/`005` prefix
**is** the game-type taxonomy, guarded by `scripts/audit_data.ts`, relied on by the playoff and
play-in upsert contracts, and hoopR's `game_id` *is* our `external_id`
(`scripts/fetch_shooting_data.py`). A source that cannot produce that prefix cannot seed a
drop-in row, however reachable it is.

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
- [x] ~~Seed from **basketball-reference**~~ / ~~seed from a US residential IP for `002…` ids.~~
      **Neither was needed. Decided and executed 2026-08-18:** seeded from ESPN with
      `scripts/seed_upcoming_season_espn.ts`, 1,200 games keyed `espn-<eventId>`, cross-checked
      against Fox Sports (agreed on all 1,200).

      The objection to a non-stats key was that "the live-score cron keys on stats `GAME_ID`, so
      the Games page will not match them". **That was fixed rather than worked around.** The
      nightly sync and the cron now match on **(date, away, home)** via
      `src/lib/espn-scoreboard.ts`, so they are blind to the external id and maintain `espn-`
      and `002…` rows identically. Re-keying to `002…` is no longer a prerequisite for anything
      the site publishes — only `scripts/analyze_player_shooting.py` still filters on the shape.

**~October 2026 — season starts:**
- [ ] Confirm the app shows 2026-27 in the season dropdown (automatic).
- [ ] Confirm `vercel.json` still reads `"0 7 * * *"` (changed from `0 3` on 2026-08-18 so the
      one daily run lands after the last final — Section 5).
- [ ] **On the first game day, check the Actions run actually wrote scores** (it is the first
      in-season run of the rewritten pipeline). Every in-season run from 2026-05-11 to the end
      of 2025-26 failed at the old CDN call; the rewrite is verified against historical data
      but has never executed on a live slate.
- [ ] Bump the hardcoded season counts that cannot derive (Section 7).

**~January of the new season:**
- [ ] **Re-key the season's `espn-` ids to canonical `002…` ids** (Section 9). Until this runs,
      Shooting by Rest carries no data for it. Nothing else is affected.
- [ ] After the first week, run the data-integrity re-audit (Section 6) to catch date drift early.

**Fixed 2026-08-06 — was: `/season` could serve a stale empty rollover for weeks.**
`getSeasonReport()` (`src/lib/season-report-server.ts`) used to key its cache on
`getCompletedGamesStamp()`, which counts **final** games — exact for `/api/analysis`, whose
inputs are only final games, and wrong for `/season`, which deliberately also reads scheduled
(not-yet-played) games. On 1 October the season list rolls over and `/season` defaults to
2026-27; no regular-season game goes final until opening night roughly three weeks later, so
the stamp never moved, the cache never invalidated, and the tab's default view served
`0 / 0 · NO GAMES SCHEDULED` even after 2026-27 had been seeded (Section 4). Serverless
recycling on Vercel masked it intermittently — a fresh instance starts with an empty cache, so
it could look fixed on one request and stale on the next.

Closed by the first of the two options that were recorded here: a season-scoped
`getSeasonGamesStamp(season)` (`src/lib/db/queries.ts`) over the same `publishableGames`
population `getSeasonReportRows` reads, returning `scheduled/finals@latestDate`. The row count
moves when a season is seeded, the final count as it is played, the date when a game is
rescheduled. The cache entry is per-season to match, so switching the season in view no longer
discards the others. Rejected: a TTL — it would have hidden a stamp that was simply keying the
wrong population. Verified against the live DB on 2026-08-06: `2025-26 → 1230/1230@2026-04-12`,
`2026-27 → 0/0@none` (the exact pre-seed state the bug hid in), `1996-97 → 1189/1189@1997-04-20`.
Pinned by `src/lib/__tests__/season-report-server.test.ts`, which asserts the stamp keys the
same predicate as the query it stands in for — an in-memory fixture cannot see that drift.

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

- `"schedule": "0 7 * * *"` (daily, 07:00 UTC) — **year-round; nothing to change at rollover.**
  The route does not season-gate, but it early-returns before any ESPN fetch when no game is
  `scheduled`/`live` on either date it checks, so an offseason run costs one indexed query.
- 07:00 UTC = 2 AM EST / 3 AM EDT: **after the last final** in both DST regimes. It moved here
  from 03:00 UTC on 2026-08-18 (798394a) because Vercel **Hobby allows one cron/day** and 03:00
  UTC is 10 PM EST — a west-coast game tipping then was still in its first quarter, so its result
  was missed until the following afternoon. (`0 10 * * *` would fire 5–6 AM ET, before tip-off.)
- **Because it runs after midnight ET, the route reads yesterday *and* today (ET), not today
  alone.** The two are one mechanism and must not be separated. 2 AM ET is already ET date D+1
  while the night's games carry `games.date = D`, so a today-only scope selects games that have
  not tipped off yet: from the schedule move until 2026-08-22 this pass matched nothing and wrote
  nothing on every night of the offseason it could have run. **If you ever move this schedule,
  re-derive the window in `src/app/api/cron/update/route.ts` in the same change** —
  `cron-update.test.ts` → "the after-midnight window" pins it.
- This is a **backstop**, not the live path: live UX comes from Supabase Realtime and the GitHub
  Actions pipeline, whose 7-day lookback (`LOOKBACK_DAYS`, `scripts/daily_update.py`) repairs
  anything this pass misses on its next run.

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
| ~~`docs/social-preview.png`~~ | ~~Baked "40-SEASON BACKTEST" wordmark **and the old logo direction**~~ | **No longer a hand export (2026-08-18).** The file is now a byte-for-byte render of `/opengraph-image` (1200×630, saved with `curl -o docs/social-preview.png http://localhost:3000/opengraph-image` against a running dev server), so it can no longer drift from the card the site actually serves — it picks up `NBA_SEASONS.length` and the current divider lean for free. The **re-upload is still manual**: GitHub → Settings → Social preview, because GitHub serves it from repo settings, not from the tree. Re-render and re-upload whenever the OG card changes. |
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

## 9. Re-key an ESPN-seeded season to canonical `002…` ids (January of that season)

A season seeded before it was played carries `espn-<eventId>` external ids, because no reachable
source has the canonical ones for a schedule that has not happened yet (§4). 2026-27 is the first
season in that state.

**What actually depends on the key** — one thing, and it is not on the published critical path:

| consumer | keyed on | affected |
|---|---|---|
| nightly score sync, `/api/cron/update` | `(date, away, home)` | no — deliberately blind to the id |
| `fatigue_scores`, `predictions` | `games.id` (integer PK) | no |
| `analyze_player_shooting.py` | `external_id LIKE '002%'` + joins hoopR box scores on it | **yes — finds nothing** |

So the only symptom is that **Shooting by Rest carries no data for that season.** That module
needs a few months of games to clear its volume floor, which is why this is a January job rather
than an opening-night one.

**Run it:**

```bash
python scripts/fetch_shooting_data.py --only teams        # refresh the hoopR cache first
pnpm exec tsx scripts/rekey_season_from_hoopr.ts 2026-27  # dry run — read the counts
pnpm exec tsx scripts/rekey_season_from_hoopr.ts 2026-27 --apply
```

**Dry run is the default** and `--apply` is required, because `external_id` is the only
uniqueness guard on `games`. Read the dry run before applying: it prints how many rows matched,
which ones did not, and aborts outright if any target id already belongs to another row.

**Expect to run it more than once.** Only `final` games can be matched — the key includes both
final scores — so a January run converts what has been played and leaves the rest. Re-run after
the season ends to finish the job. A season with mixed `002…` and `espn-` keys is a valid
intermediate state; nothing breaks, and the shooting pipeline simply sees the games that have
been converted, which are exactly the ones it can use.

**Unmatched rows are normal mid-season**, since hoopR publishes on its own cadence and the most
recent games may not be in the cached file. Refresh the cache and re-run rather than forcing it.
