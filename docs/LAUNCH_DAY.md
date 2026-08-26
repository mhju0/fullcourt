# Launch-day runbook (the first live slate, 2026-10-20)

Written on 2026-08-27, eight weeks early, because the check it describes cannot be rehearsed.

**Why it exists.** Every in-season run of the old nightly pipeline from at least 2026-05-11 to
the end of 2025-26 failed on its first network call and the workflow still read green, because
the offseason runs either side of a season exit 0 at the season gate. The pipeline was rewritten
onto ESPN on 2026-08-18 and verified against historical data — dry runs needing 0 writes over
dates already correct, and a deliberately perturbed row repaired exactly — but **it has never
executed on a live slate.** So the release criterion is a hand-check, not a green tick.

The season is seeded: 1,200 games, `2026-10-20` → `2027-04-11`, verified against the database on
2026-08-27. Opening night carries **3 games**; the night after carries 11.

---

## 0. The release criterion, in one line

**The first in-season Actions run wrote scores.** Section 3 is what that looks like; Section 4
is the three greens that are not that.

---

## 1. The two writers, and when each fires

Two independent processes write scores. They are not redundant — they run at different hours and
do different amounts of work.

| Writer | Schedule | ET on opening week (EDT) | What it does | Where the log is |
|---|---|---|---|---|
| **GitHub Actions** — `Daily NBA update` (`.github/workflows/daily-update.yml` → `scripts/daily_update.py`) | `0 21 * * *` UTC | **5 PM — before tip-off** | 7-day score/status/OT sync, game context, projected-fatigue gap fill, then fatigue + predictions for `[today, today+14]` | GitHub → repo → **Actions** → *Daily NBA update* |
| **Vercel cron** — `/api/cron/update` (`vercel.json:7`) | `0 7 * * *` UTC | **3 AM — after the last final** | status/score/OT for **yesterday and today (ET)** only. Recomputes no fatigue. | Vercel → project → **Logs**, filtered to `/api/cron/update` |

**The consequence for opening night, and it is the thing most likely to be misread:** the Actions
run *on* 2026-10-20 fires at 5 PM ET, before any of the three games tips. It correctly writes
nothing. The first writer that sees a final is the Vercel cron at ~3 AM ET on **2026-10-21**. The
first Actions run that both writes scores and recomputes fatigue is 5 PM ET on **2026-10-21**.

> **Check the run of 2026-10-21, not 2026-10-20.** An empty run on opening night is the schedule
> working, not the pipeline failing.

The Actions run's 7-day lookback (`LOOKBACK_DAYS`, `scripts/daily_update.py`) means a missed
night repairs itself on any of the next seven runs. The Vercel pass is a backstop for the
overnight board; the Actions run is the one that moves the model.

---

## 2. Where the run appears

GitHub → repo → **Actions** → **Daily NBA update**. On the cron path only the step named
**`Run daily update`** executes; `Resync schedule dates` and `Seed one season` are
`workflow_dispatch` paths and stay grey.

From the terminal:

```bash
gh run list --workflow daily-update.yml --limit 5
gh run view <run-id> --log | grep -E '^\[|sync-scores|run-daily'
```

GitHub retains logs for ~90 days. That retention is how the old failure stayed invisible: by
August, every in-season log had aged out and only offseason no-ops remained. **If you are ever
asked whether a season-gated job works, look at an in-season run or you have learned nothing.**

---

## 3. What a good in-season run looks like

Expected shape of `Run daily update` on 2026-10-21 (values will differ; the lines will not):

```
[season-gate] CDN schedule fetch failed (HTTP Error 403: Forbidden); using calendar fallback.
[daily_update] ET now=2026-10-21T17:00:00-04:00 window=2026-10-14..2026-10-21
[daily_update] syncing scores for 2026-10-14..2026-10-21 …
[sync-scores] 14 stored games across 2 dates
[sync-scores] 3 row(s) to write — 3 final, 0 live
[sync-scores]   overtime games: 0
[sync-scores]   stored rows ESPN did not carry: 0
[sync-scores]   stored finals ESPN contradicted (refused): 0
[sync-scores]   date fetch errors: 0
[sync-scores] done — 3 row(s) updated
[daily_update] refreshing game context for the 7d lookback …
3 final games across 2 dates, 2002-03+
matched 3, unmatched 0, date errors 0
  overtime games: 0 (max 0 OT)
  no line score (OT left as-is): 0
  neutral-site games: 0
  tip-off times: 3
[daily_update] projecting fatigue for any unscored scheduled game …
[project-fatigue] 2026-27: nothing to project — every scheduled game already has fatigue rows.
[daily_update] running Node pipeline for 2026-10-21 …
[run-daily] 2026-10-21–2026-11-04: games refreshed=…, fatigue rows written=…, predictions written=…, failures=0
[daily_update] completed successfully.
```

Read it in this order:

1. **`[sync-scores] done — N row(s) updated` with N > 0.** This is the release criterion. It is
   the line that did not exist for an entire half-season.
2. **`failures=0` on the `[run-daily]` line**, and `fatigue rows written` above zero. A non-zero
   `failures` sets the process exit code to 1, so the job also goes red.
3. **`[daily_update] completed successfully.`** The last line. Its absence with a green tick is
   impossible — the two fatal steps exit non-zero — but its absence with a red tick tells you
   which step stopped.

**The `[season-gate] … 403 … using calendar fallback.` line is expected, not a failure.** The
gate prefers the live CDN schedule; `cdn.nba.com` returns 403 from GitHub's runners (a datacenter
block, not a geo one), so it falls back to a coarse Oct 1 – Apr 30 calendar check. That fallback
is correct for the whole regular season. It is also why the job starts running on **Oct 1**, 19
days before there is anything to write.

Two steps are deliberately non-fatal and log a `WARNING` rather than stopping the run:

- `[daily_update] WARNING: game context refresh failed; continuing.` — costs tip-off times and
  the neutral-site flag for those few games. **Not** the overtime term: step 1 already wrote
  `overtime_periods` from the same payload.
- `[daily_update] WARNING: fatigue projection failed; continuing.` — a game with no fatigue row
  renders an em dash, which is honest. Failing the whole run over it would also discard the score
  sync that already succeeded.

---

## 4. The three greens that are not green

- **Offseason green.** `[daily_update] Offseason (2026-09-30 ET) — skipping daily update.`,
  exit 0, no secret needed. This is the exact shape that hid a dead pipeline for a season. Every
  run before Oct 1 reads like this.
- **In-season green that wrote 0 rows.** Correct on any night where nothing changed — including
  every run from Oct 1 to Oct 20, when the season is seeded but unplayed. `reconcileScores`
  emits an update only when status, score or overtime actually differ
  (`src/lib/espn-scoreboard.ts:220`), so an unchanged night writes nothing by design. **After a
  night with finals, a 0 is a defect.**
- **Green that never reached the data.** `[sync-scores] no games stored in <from>..<to>; nothing
  to do.` means the lookback window found no rows at all. That is a schedule problem, not a score
  problem — check that 2026-27 is still seeded before looking anywhere else.

---

## 5. The matching rule to check against

**The writer never matches on `external_id`. It matches on (ET date, away abbreviation, home
abbreviation).**

`external_id` is the only uniqueness guard on `games`, and 2026-27 is keyed `espn-<eventId>`
because no reachable source had canonical `002…` ids for an unplayed schedule. An id-keyed writer
fed from ESPN would have **inserted a duplicate of all 1,200 rows** instead of updating them.
Pairing-matching makes the writer blind to the key, so `espn-` and `002…` rows are maintained
identically. One matcher — `src/lib/espn-scoreboard.ts` — is shared by the Actions script and the
Vercel route, so they cannot drift apart.

ESPN's `?dates=YYYYMMDD` scoreboard groups by **ET calendar date**, which is exactly what
`games.date` stores, so the two agree by construction. To check one game by hand:

```bash
curl -s "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261020" \
  | python3 -c 'import json,sys; [print(e["shortName"], e["status"]["type"]["name"]) for e in json.load(sys.stdin)["events"]]'
```

The three counters that report a pairing failure, and what each means:

| Log line | Meaning | What to do |
|---|---|---|
| `stored rows ESPN did not carry: N` | A stored row's (away, home) had no ESPN match on that ET date | Postponed, moved to another date, or an abbreviation drift. Check the date first. |
| `N ESPN event(s) have no stored row — re-run scripts/seed_upcoming_season_espn.ts …` | The reverse: ESPN has a fixture the database does not | How a resolved NBA Cup knockout announces itself. **Seeding is deliberately not automatic.** Re-run the seeder if they are real fixtures. |
| `stored finals ESPN contradicted (refused): N` | The writer refused to downgrade a stored `final` | Never auto-repaired. Investigate before touching the row. |

A tricode rename shows up as **both** unmatched counters rising together on the same date — the
game is there twice, under two names. The abbreviation map is in `src/lib/espn-scoreboard.ts`.

---

## 6. Who to believe when the probe says ESPN is down

`.github/workflows/probe-data-sources.yml` tests ESPN **three ways**, and only one of them speaks
for the pipeline.

**Believe the `ESPN scoreboard (node fetch)` row.** Akamai fingerprints the whole header set, not
the User-Agent: `curl -A '<Chrome UA>'` is a browser UA with none of a browser's other headers and
gets a 403, while the *same* UA through node `fetch` gets a 200. The probe reported ESPN as
blocked for three weeks in August 2026 while the pipeline was reading it fine every day. The
workflow's own footer says this; read it before reacting.

| Probe row | Normal state | Reading |
|---|---|---|
| `ESPN scoreboard (node fetch)` | **200** | The only row that matches how the pipeline calls ESPN |
| `ESPN scoreboard (curl, Chrome UA)` | 403 | Header-fingerprint artefact, not an outage |
| `ESPN scoreboard (curl, default UA)` | 200 | Kept to show the fingerprint effect |
| `cdn.nba.com` | **403** | Normal from every environment we have. Not on the live path. |
| `stats.nba.com` | **timeout / 000** | Normal, from Seoul and from US runners alike. Not on the live path. |

A real ESPN outage is: node-fetch row non-200 **and** the Actions run failed at the score-sync
step. One without the other is not.

---

## 7. If the first run did not write

Cheapest first. Nothing here is time-critical — the 7-day lookback repairs the night on any of
the next seven runs, so a wrong repair costs more than a slow one.

1. **Re-run the job.** Actions → *Daily NBA update* → **Run workflow**, task `daily`. Idempotent.
2. **Run it locally** from the repo root, against the same database (`DATABASE_URL` in
   `.env.local`):
   ```bash
   python scripts/daily_update.py
   ```
   Or the score step alone, dry first — it prints exactly what it would write and touches nothing:
   ```bash
   pnpm exec tsx scripts/sync_scores_espn.ts 2026-10-20 2026-10-21 --dry-run
   ```
3. **Check the secret.** The in-season path needs `DATABASE_URL` (repo → Settings → Secrets and
   variables → Actions). The offseason path does not — which is a third way a green run can mean
   nothing.
4. **Check the Vercel pass separately.** Its JSON body carries `checkedGames`, `checkedDates`,
   `espnGamesAvailable` and `refusedDowngrades`:
   - `espnGamesAvailable: 0` with `checkedGames > 0` → ESPN returned an empty slate for that ET
     date. A date problem, not a score problem.
   - `502` with `Live score feed unavailable` → ESPN answered non-200. See Section 6 first.
   - `401` → `CRON_SECRET` drifted between Vercel's cron invoker and the project env.
   - `503` with the misconfiguration message → `CRON_SECRET` is unset in production.

---

## 8. After the scores land — the two checks that follow

- **`/games` agrees with the box scores** for opening night: score, `final`, and any overtime.
- **Fatigue was recomputed, and Upcoming Edges is now reading measured rest.** The
  `[run-daily]` line shows `fatigue rows written` above zero, and the next night's games carry a
  rest advantage derived from games actually played rather than the projection. Spot-check one
  called game's rest numbers against the real schedule.
  **Opening night itself is correctly 0.0 for every team** — nobody has travelled yet. That is
  the expected board, not a missing computation; it was sighted in the 2026-08-22 screenshot pass.

---

## 9. Deliberately not launch-day work

- **The `002…` re-key** — [SEASON_ROLLOVER §9](SEASON_ROLLOVER.md). The script can only convert
  games that have been **played**, so it runs from January 2027.
- **Shooting by Rest carries no 2026-27 data until that re-key.** `analyze_player_shooting.py`
  filters `external_id LIKE '002%'`. Expected, recorded, not a launch defect.
- **The data-integrity re-audit** — [SEASON_ROLLOVER §6](SEASON_ROLLOVER.md), after the first
  week, which is when a date-shift bug is cheap to catch.
- **The season-count copy bump** — [SEASON_ROLLOVER §7](SEASON_ROLLOVER.md). Note most of it has
  been dissolved rather than deferred: the prose was rewritten so it cannot age.

---

## 10. The rails that do not relax on launch day

A live-slate defect is exactly the pressure these exist for.

- **No ratified-constant change in `src/lib/fatigue.ts`.** Tuning a coefficient against a result
  the site publishes makes it circular. Escalate instead.
- **No `drizzle-kit push` / `generate`.** Schema changes are manual SQL, handed over and applied
  by the human in Supabase.
- **Do not regenerate the lockfile** — [SEASON_ROLLOVER §8](SEASON_ROLLOVER.md). Four CVE pins
  live in `pnpm-workspace.yaml` and vanish silently if the overrides are lost.
- **Published figures stay pinned to generated artifacts.** A launch-day copy fix is the most
  tempting moment in the project to hand-type a number. Phrase it so it cannot age instead.
- **Run `pnpm test:e2e` by hand** after any launch-day fix that moves a route or header copy — it
  is outside the four-command commit gate. Check `lsof -nP -iTCP:3000` first: a squatting dev
  server makes the whole suite pass against the wrong app.
