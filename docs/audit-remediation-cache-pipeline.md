# Cache and score-pipeline remediation, 2026-10-11

Scope: C3 and C5 from the owner-approved fix proposals and independent design review.
No schema, fatigue coefficient, production database, commit or deployment action was performed.

## Acceptance and implementation

- C3: expiration is absolute from loader start, with an injected monotonic clock for tests.
  Hits and loader completion never extend it. Same key and same stamp share the pending load;
  a changed stamp starts a separate load. A 30-second loader deadline rejects waiters and permits
  retry. Entry identity prevents an old rejection/deadline from removing a newer entry. The
  deadline does not cancel an underlying database query that lacks cancellation support.
- The backtest reads current-season completed rows, so its origin age is five minutes and
  `/api/analysis` uses the in-season edge policy. Season Report and Schedule select five minutes
  for current/upcoming seasons and one hour for historical seasons, evaluated per read.
- C5: every ESPN request has a 25-second abort signal, including body consumption. Successful
  dates remain writable when other dates fail. HTTP, transport, timeout, JSON, or a missing/non-array
  `events` field counts as a failed date. Legal empty `events` and unmatched games remain success.
  Connections close on success and failure. Exit status is 0 for success, 2 for degraded date
  fetches after successful writes (also dry runs), and 1 for fatal database/write failures.
- `daily_update.py` retains exit 2 while continuing context refresh, gap projection and the daily
  pipeline. Later successful steps cannot erase it; a later fatal daily-pipeline result takes
  precedence. Fatal score-sync results stop immediately. Existing nonfatal context/projection
  behavior is preserved.

## Cache composition and limits

| Population | Origin absolute age | Edge fresh | Edge stale revalidation |
| --- | ---: | ---: | ---: |
| Current/upcoming and mixed backtest | 300 seconds | 60 seconds | 60 seconds |
| Historical Season Report/Schedule | 3,600 seconds | 3,600 seconds for Schedule | 300 seconds for Schedule |

Season Report retains its existing shorter in-season edge policy for all selected seasons.
Other existing opt-in edge policies receive the bounded shared constants; unrelated routes were
not given new cache policies. Uncached game/final routes remain uncached.

A stale origin response can be recached at the edge just before origin expiry. Under healthy
requests/revalidation, the nominal current-season cache composition can therefore approach
300 + 60 + 60 = 420 seconds before adding loader/query/network time and the open UI's polling,
focus/reconnect or navigation cadence. Schedule's historical composition is 3,600 + 3,600 +
300 = 7,500 seconds. Source-writer cadence is another independent delay. Errors, absent traffic,
offline/hidden clients and failed revalidation prevent an exact user freshness guarantee.
This fixes indefinite same-stamp retention; it is not complete dependency invalidation or a
five-minute end-to-end freshness guarantee. Actual CDN delivery and production load are unverified.

## Regression-first evidence

Before the product fixes:

- `corepack pnpm exec vitest run src/lib/__tests__/stamped-cache.test.ts`: 14 passed, 3 failed.
  At absolute age 100ms the old value remained; a load finishing after its lifetime gained an
  indefinite lifetime; a never-settling loader timed out the test instead of its waiters.
- `corepack pnpm exec vitest run src/lib/__tests__/sync-scores-espn.test.ts`: 1 passed, 2 failed
  after the fixture was corrected to ESPN's actual `status.type.state` contract. A good date
  produced a write, but the partial-failure and dry-run processes still had no nonzero exit code.
- `python3 -m unittest scripts/tests/test_daily_update.py`: 2 passed, 2 failed. Degraded status
  stopped after one subprocess rather than allowing all four; it hid a later fatal result.
- Additional invalid-body regression: a JSON object without `events` returned success before
  payload validation. An actual empty `events: []` is separately verified as success.

## Self-verification

- Targeted Vitest: eight files, 89 tests passed. Command:
  `corepack pnpm exec vitest run src/lib/__tests__/stamped-cache.test.ts src/lib/__tests__/sync-scores-espn.test.ts src/lib/__tests__/api-route.test.ts src/app/api/__tests__/schedule-disparity.test.ts src/app/api/__tests__/analysis.test.ts src/lib/__tests__/season-report-server.test.ts src/lib/__tests__/schedule-disparity-server.test.ts src/lib/__tests__/rest-advantage-evidence-server.test.ts`.
- `python3 -m unittest discover -s scripts/tests -v`: seven tests passed, including final-status
  retention when context and projection fail nonfatally.
- ESLint on the thirteen changed TypeScript implementation/test files passed.
- A native Node fetch against a local HTTP server that sent headers and a partial JSON body
  then stalled threw `TimeoutError` after 25,007ms with `AbortSignal.timeout(25000)`. This
  exercises the same request/body deadline used by the score writer without an external feed
  wait or any database access.
- Intermediate whole-worktree typechecks exposed an SQL-mock narrowing issue in the new test;
  it was fixed by accepting `unknown[]` and checking the first template chunk's type. Concurrent
  C6 integration/type errors were reported to the root. Final whole-worktree typechecking is
  owned by the root; this report does not claim it passed during the worker's run.
- One targeted run concurrent with typechecking and other workers exceeded the existing 5-second
  dynamic-import test timeout in two server test files, cascading one call-count failure. The
  identical eight-file run without simultaneous typechecking passed all 89 tests in 2.30 seconds.
  No test timeout or assertion was relaxed.
- Read-only authentic ESPN check:
  `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20250619`
  returned one IND/OKC final, `competitions[0].status.type.state = post`, `completed = true`,
  string scores and four `linescores` per side. A separate 20260617 response contained legal
  empty `events`. These were HTTP reads to temporary files, not score-writer executions.

Implemented and exercised: absolute expiry, expiry concurrency, changed-stamp concurrency,
old completion/rejection/deadline identity, retry after failure, key caps, current/historical
policy selection, partial successful writes through a mock SQL port, dry-run failure, invalid
payload, fatal database/write paths, and parent degraded/fatal status propagation.

Unverified here: real database score updates/partial commits,
GitHub Actions job/email behavior, actual deployed CDN response age, database traffic/latency
after shorter TTL, and end-to-end UI freshness. The score-script harness verifies real
`AbortSignal.timeout` creation; the separate stalled HTTP probe verifies native deadline
exhaustion including body consumption.
The root owns consolidated checks, exact-candidate independent review and handoff documentation.
