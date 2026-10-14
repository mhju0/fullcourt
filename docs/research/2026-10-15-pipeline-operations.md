# Daily pipeline telemetry and blocked manual sources

Prepared 2026-10-15 for CI/CD audit findings F3, F4, F5 and F7. This records the
local implementation contract. No Actions writer or production ingest was dispatched.

## Failure policy

The daily wrapper emits one allowlisted `daily-pipeline-summary` JSON artifact and
Actions step summary. Scores, context, gap projection, prospective fatigue and
predictions have separate statuses. Row counts come from the score/context writers
and `refreshProspectiveGames`; missing counts are not converted into zero.

| Stage result | Downstream work | Final process |
| --- | --- | --- |
| Scores exit 1 / launch failure | Stop before dependent work | Fail |
| Scores exit 2 (one or more date fetches failed) | Keep successful scores; refresh downstream | Fail with exit 2 unless a later critical failure overrides it |
| Context exit 2 (provider date failure or unmatched final) | Continue | Degraded; exit 0 if all critical stages succeed |
| Context database / processing failure | Continue useful independent projection and refresh | Fail |
| Gap projection failure | Continue prospective refresh | Degraded; existing optional policy retained |
| Prospective refresh failure/defer | Keep existing transactional failure policy | Fail |

Context is optional only for coverage failures: score sync already supplies overtime
from the same scoreboard, and the additional context values are tip-off and neutral
venue information. Database/processing failures remain critical. Gap projection is
an existing best-effort repair for newly added fixtures; the next stage refreshes the
upcoming 14-day window. Keeping projection optional preserves the prior policy and
surfaces the degradation instead of silently claiming a fully successful pipeline.
This is not proof that missing projections outside that window were repaired.

The artifact includes timestamps, the attempted ET date windows, statuses, exit codes
and allowlisted nonnegative numeric counters. Child stderr, exception strings,
provider bodies, connection URLs and arbitrary child keys are excluded. Fatigue and
predictions share the transactional refresh process but report their own row counts;
a failed process can still report successfully refreshed games.

## Schedule and runtime

The cron is `17 21 * * *` UTC. Expected time is inferred as the preceding daily
21:17 slot relative to Actions run `created_at`; actual start is Actions
`run_started_at`. The wrapper separately records when pipeline work began and
completed. If Actions timing metadata cannot be read, the data pipeline continues,
expected time and lateness remain null, and its summary is degraded. An unusually delayed or rerun event can make the inferred slot ambiguous;
this is telemetry rather than a stronger scheduler guarantee.

GitHub documents that scheduled events can be delayed or dropped under high load,
particularly near the start of an hour. Moving off minute zero is a mitigation that
requires observation of several real scheduled runs before claiming an improvement.
See [GitHub schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Daily writers share a non-cancelling GitHub concurrency group and a 25-minute job
limit. The group prevents simultaneous GitHub daily jobs; GitHub may replace a
pending job and does not serialize Vercel's separate evening writer. Existing DB
transaction locks remain the cross-writer protection. Job timeout/cancellation can
prevent final artifact upload; the independent Actions monitor must detect missing
or unsuccessful completion. See [GitHub concurrency documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).

Normal daily execution needs Python's standard library when DATABASE_URL is supplied
by the workflow. It no longer installs scripts/requirements.txt. Local dotenv fallback
still needs python-dotenv if the variable is not exported. Node's pinned dependencies
are installed with the frozen lockfile. No build cache is added.

After prospective refresh, a bounded read query estimates the latest fatigue row for each
home/away side of scheduled games with a known future tip in the attempted 14-day ET
window. It reports eligible games, expected/present/missing side rows, minimum/maximum
of those latest stored computed_at values, observed UTC time, and oldest/newest row ages.
Historical duplicates are ignored; one newly refreshed side cannot hide an older or
missing side. This does not measure global database freshness or final-score coverage.

`computed_at` is a timestamp without time zone. Ages are emitted only for database
sessions reporting `UTC` or `Etc/UTC`, with this interpretation explicitly attached:
“stored timestamp interpreted as UTC; historical writer session timezone unverified”.
Non-UTC sessions or query failure produce unknown freshness and degrade an otherwise
successful pipeline. Future computed timestamps or invalid counters produce unknown
freshness with a reason and null ages. Consistent UTC readings are labelled estimated,
because historical writer session timezones remain unverified. Missing side rows produce
incomplete freshness. Empty eligible
windows produce no_data with null ages. No schema or writer timezone is changed.
Scheduling latency and real freshness must be assessed after release; no before/after
cost or lateness improvement is claimed.

## Blocked manual-source runbook

`resync-schedule` and `seed-season` are rejected before checkout, dependency installation
or any step receiving DATABASE_URL. CDN HTTP 403 and stats.nba.com timeouts are known
runner access failures; the old geographic explanation is invalid. No replacement
source was selected or simulated as a working ingest path.

Before re-enabling either path:

1. Retrieve an authentic schedule sample read-only from the intended runner/access
   environment. Record HTTP status, retrieval time, source and payload shape without
   retaining secrets. Treat persistent 403 as an access/source decision; bounded
   retries are appropriate only for transient failures.
2. Verify ET calendar dates, away/home pairing, season and game-type coverage,
   postponements, Cup additions and external-ID compatibility against existing rows.
   Preserve ESPN pairing semantics and avoid duplicate fixtures from mixed IDs.
3. Implement provider contracts with real fixture evidence and rehearse ingestion
   against a local restored/disposable database. Compare row identity/counts and
   changed dates/scores, including repeat-run behavior. Prepare rollback evidence.
4. Request owner approval immediately before any production write. Re-enable the
   narrowly verified task only after that decision. Schema changes remain manual SQL.

Upcoming season ESPN seeding is a separate existing script, not a validated replacement
for historical seeding or date repair. Follow [SEASON_ROLLOVER.md](../SEASON_ROLLOVER.md)
and [LAUNCH_DAY.md](../LAUNCH_DAY.md) for their existing evidence and approval boundaries.

## Provider diagnostics

The standalone probe requires Node ESPN scoreboard HTTP 200 with a nonempty `events`
array on the fixed historical sample. Failure, invalid JSON or invalid/empty event
shape is actionable and fails the probe. CDN HTTP 403 and stats HTTP 403/timeout are
expected blocks. Chrome/default curl ESPN and Basketball Reference remain diagnostics;
their failures do not claim that the Node pipeline failed. Unexpected NBA statuses
are labelled diagnostic failures instead of being silently relabelled expected blocks.
The artifact stores provider labels, status classes, numeric HTTP status/event counts
and timeout flags; it excludes URLs, raw bodies and error strings.

Read-only local provider check on 2026-10-15: Node fetch of ESPN's 2025-03-15 scoreboard
returned HTTP 200 and eight events. The sample had competition `date`, `neutralSite`
and home/away competitors with team abbreviations and four period lines. This confirms
that provider shape from the local environment; it does not establish Actions network
reachability or live ingestion.

## Verification

Before implementation, the seven Python reporting contracts failed against missing
telemetry and the original workflow. The Node probe suite failed against the missing
classifier. Two context contracts were then exercised against a temporary copy of
HEAD's original context script: both failed because unmatched/invalid coverage returned
no degraded exit code. That copy was removed after the comparison.

Run the focused checks with:

```sh
python3 -m unittest scripts.tests.test_daily_update scripts.tests.test_pipeline_reporting
node --test scripts/tests/probe-data-sources.test.mjs
pnpm exec vitest run src/lib/pipeline-reporting.test.ts src/lib/daily-freshness.test.ts
pnpm typecheck
```

These mock database/subprocess calls and exercise provider parsing/reporting behavior;
they do not establish production writes, actual scheduled dispatch, missing-run alert
email delivery or successful artifact upload from Actions. Root integration performs
aggregate CI checks and freezes the final candidate for independent review.
