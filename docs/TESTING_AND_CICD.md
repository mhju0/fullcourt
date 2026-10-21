# Testing and CI/CD

Use the pnpm version pinned in `package.json`. GitHub CI uses Node 22 and Python 3.11;
workflow files are the authority for exact commands and versions.

## Local checks

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build
pnpm audit --prod
python3 -m unittest discover -s scripts/tests -p 'test_*.py' -v
```

Both Python contract suites import producers that require `psycopg2-binary`. Install
`ml/requirements.txt` in the virtual environment before running either discovery command;
CI installs that same pinned environment before schedule and ML contracts. For ML contracts, run:

```sh
python -m unittest discover -s ml/tests -p 'test_*.py' -v
```

The Python contracts do not need a live database. Production dependency audit runs last in CI
so advisories do not hide correctness failures. Never change model figures merely to satisfy a test.

Vitest covers domain logic, API contracts, caches, data pinning, and source/design conventions.
See `vitest.config.ts` and the tests themselves for the current inventory. Avoid copying test
counts into this guide; dated release records may report counts observed at a specific commit.

The three historical correction suites (`scripts/{history,overtime,arena}-correction/`) sit
outside `vitest.config.ts` and run in CI through their own configs; their real-PostgreSQL
contracts skip there because no contract database URL is set.

The historical arena transition has separate real-PostgreSQL contracts and an unchanged-old /
new-engine replay gate; see [its runbook](../scripts/arena-correction/README.md). Its independent
source-script packet and before/after numeric oracle are retained with the dated local audit.
Calculation parity does not establish historical source accuracy; review the
[venue evidence](research/2026-10-20-arena-shooting/README.md) separately. Apply/rollback tests
must use the dedicated local clone and never a production URL.

## Browser verification

```sh
pnpm test:e2e
PLAYWRIGHT_BASE_URL=http://localhost:3110 pnpm test:e2e e2e/games.spec.ts
```

Without `PLAYWRIGHT_BASE_URL`, Playwright starts its own dev server; use `PLAYWRIGHT_PORT` to
choose another port. Database-backed checks require a populated database. An explicit base URL
tests an existing local production server or hosted preview. Keep runs serial against a shared
server. Do not run `pnpm build` while a dev-server browser run is active: they share `.next`.

The suites cover routes, keyboard controls, source/error states, URL/history restoration,
responsive layout, motion, and axe accessibility scans. Run relevant checks after changes and
review rendered screenshots. Physical-device and human screen-reader testing remain separate.

`pnpm audit:alignment` is an advisory measurement report, not an assertion gate. Long-lived
polling can prevent network idle. Regression assertions are in `alignment-law.spec.ts` and
`layout-integrity.spec.ts`; do not report an unfinished advisory sweep as a pass.

## Workflows and deployment

| Workflow | Purpose |
| --- | --- |
| `.github/workflows/ci.yml` | Correctness/build checks, secret-free browser smoke, real disposable PostgreSQL contracts; required `verify` aggregates all three |
| `.github/workflows/daily-update.yml` | Season-gated daily ingest at 21:17 UTC; blocked manual sources reject before secret use |
| `.github/workflows/probe-data-sources.yml` | Provider reachability diagnostics; not proof of successful data ingestion |
| `.github/workflows/officiating-refresh.yml` | Complete L2M source snapshot and reviewable publication update |
| `.github/workflows/maintenance-health.yml` | Daily scheduled-run completion monitor; weekly full dependency audit |
| GitHub CodeQL configuration | Code scanning managed on GitHub; not a checked-in workflow |
| `vercel.json` | Vercel region and `/api/cron/update` schedule |

Merging main builds production; the imported GitHub `verify` check now blocks production-domain
assignment until it passes. This is a check gate, not an owner-approval gate. Before merging, verify CI/CodeQL and the actual populated
Vercel preview. Preview protection may require authenticated Vercel access. Do not disable
protection to run tests. Vercel commit-status reporting is disabled in this project; inspect
its deployment readiness and commit directly if no GitHub deployment check appears.

After merging, verify the deployment commit and production alias, `/api/health`, and the changed
user flow. A successful build does not establish database health. Record results in the release
PR, synchronize local main without force-pushing, and stop temporary servers when finished.

The normal CI build has no database credentials. Local builds may have `.env.local`, so the CI
build is a necessary independent gate; do not rename credential files around an unguarded shell
command. Schema changes are manual SQL and require a separate owner application step.

### Sentry source maps

Vercel's shipping Production and Preview builds require `SENTRY_AUTH_TOKEN`, stored as a
Vercel Secret (previously Sensitive) in both environments. It is a build-only organization
upload token for `michael-ju-46` / `javascript-nextjs`; it is distinct from the public DSN.
Never expose it through `NEXT_PUBLIC_`, Next's `env` config, logs, or Git.

`next.config.ts` wraps production compilation with the installed Sentry SDK. The shipping
Turbopack build emits Debug IDs and uploads its client and server maps before deployment.
Missing deployment tokens, absent client/server maps, upload failures, or public maps left
after upload fail the build. Successful upload deletes maps and mapping comments under
`.next/static`; private `.next/server` maps remain for runtime error reporting.
The source-map change creates no Sentry release, commit link or deploy record (events carry the
commit SHA as their release name) and does not enable tracing, replay, cron monitors, a tunnel route, or
additional automatic runtime instrumentation. Existing DSN/error/privacy settings remain.

Local and ordinary GitHub CI builds without a token explicitly skip upload and do not enable
public browser maps. `next dev` and `next start` never require the upload token.
After an authorized token-backed preview/deploy, inspect the actual build upload log and
artifact bundle, check that a real client map URL returns 404, then verify source file/line
and context on a **new first-party bundled event** from that build. Verify client and server
coverage separately; errors created only in browser developer tools do not establish it.
An old event cannot prove the new upload. [Local evidence and remaining gates](research/2026-10-12-sentry-source-maps.md).

On 2026-10-18 the owner-authorized isolated-browser test on production `69b5e02` produced
Sentry event `d2332a304dab43edbf15ef15bcdb025a` (JAVASCRIPT-NEXTJS-9). A local-only
malformed Analysis response triggered the existing bundled error boundary; Sentry resolved it
to `src/lib/analysis-claims.ts:216:42` with source context. The deliberate test issue was resolved
after readback. This verifies client symbolication for that deployed build, not server-event
symbolication or later releases. No site code or database was changed by the probe.

## Documentation captures

```sh
SCREENSHOT_BASE_URL=http://localhost:3110 node scripts/screenshots.mjs
SCREENSHOT_BASE_URL=https://fullcourt.fyi \
SCREENSHOT_DEPLOYMENT_SHA='<verified-production-commit>' \
SCREENSHOT_DEPLOYMENT_ID='<verified-ready-deployment>' \
node scripts/screenshots.mjs games shooting-mobile-402
node scripts/check-doc-links.mjs
```

The screenshot manifest records the source URL, route, viewport, capture time, browser,
page width and supplied deployment identity. Verify the alias and commit before supplying them.
The default run captures all desktop and phone views; see [capture details](screenshots/README.md).
Keep one current capture per selected view; Git contains old captures. The documentation-link check
catches missing local Markdown targets. Neither command verifies the correctness of a finding.

## Prospective refresh integrity replay

`scripts/tests/prospective-refresh.pg.ts` uses two independent connections and a private test
schema copied from an isolated backup restore. It never loads `.env.local`; its explicit local
URL guard rejects production. Restore PostgreSQL 18 at port 55432 with database
`fullcourt_remediation`, then run:

```sh
FULLCOURT_TEST_DATABASE_URL=postgresql://michaelju@127.0.0.1:55432/fullcourt_remediation corepack pnpm exec tsx scripts/tests/prospective-refresh.pg.ts
```

The named local database must be disposable. The harness creates/drops only its own test schema.
It verifies parent-lock ordering, atomic rollback, resolved-pick protection, missing-side repair
and actual-clock eligibility. It is not a production load test or an opening-night verification.

The application writer fixtures use the actual node-postgres pool/Drizzle adapter. For a fresh
disposable `fullcourt_pool_test` database owned by `correction_owner` on port 55434, the guard
also accepts `postgresql://correction_owner@127.0.0.1:55434/fullcourt_pool_test`; the prospective
harness first installs the CI bootstrap there. Never point these checks at the corrected archive.
`scripts/tests/serverless-pool.pg.ts` uses the same explicit URL guard and verifies concurrent
read identity, temporary-table commit/rollback, transaction-local timeouts, acquisition timeout
recovery and reconnection after an interrupted transaction. It makes no persistent table writes.

## Bounded CI gates and operational summaries

`pnpm exec playwright test --config playwright.smoke.config.ts` exercises a built application
at loopback ports 3100/3101 with deterministic API fixtures. It covers Games filters and opened
matchup details, desktop/mobile calendar, opened-state axe, reduced motion, command palette
Escape/shortcut focus return and rapid close/reopen. It aborts non-loopback browser requests.
It does not prove hosted preview connectivity, provider data, physical-device behavior or
accessibility outside those flows. The fixture spec is excluded from the full connected suite.

CI transfers only its credential-free `.next` build to the browser job, excluding cache; test
failure reports are retained seven days. The disposable PostgreSQL 18 service uses fixed
loopback port 55433 and `fullcourt_ci_disposable`. Test-only SQL initializes an empty service;
it is never a production schema migration. The legacy restore replay URL guard is preserved.
`verify` rejects failed, cancelled, skipped and missing prerequisites. No PR job receives
production secrets; checkout credentials are not persisted. Third-party Actions use reviewed
commit pins, maintained by monthly grouped Dependabot updates (security updates arrive as soon as an advisory lands; `@types/node` stays at or below the Node 22 runtime). Keep the Next build cache disabled.

Main requires up-to-date `verify` results and enforces the check for administrators. A second
human review is not made impossible for the solo owner; independent agent review, exact-SHA
preview verification and explicit merge approval remain the release procedure. CodeQL default
setup remains active and must be inspected before release; this change does not add separate
CodeQL required contexts or weaken its configuration.

Daily writers share a non-cancelling GitHub concurrency group and a 25-minute job deadline.
They still rely on existing database locks for overlap with Vercel. The normal Python wrapper
uses stdlib, so no pipeline pip installation is needed. Disabled manual source tasks cannot
reach dependency installation or database-secret steps; follow the
[pipeline operations record](research/2026-10-15-pipeline-operations.md).

Daily artifacts distinguish critical failure, optional degraded stages, attempted ET date
windows, row counts and provider fallback. Scoped row-age estimates include missing-row counts
and the timestamp interpretation caveat; they are not proof of global database freshness.
Future timestamps and non-UTC observations cannot look perfectly fresh. Metadata API failure
leaves timing unknown and data work continues with a degraded summary.

The scheduled-run monitor checks the due scheduled main run (not a manual substitute) and
actual job-completion timestamps against a six-hour deadline. It fails for missing, late,
unfinished or failed executions and invalid API evidence. It shares GitHub's scheduler;
workflow notifications do not prove email delivery. No production data query is made by it.

The full dependency audit is weekly/manual and advisory for known development findings; audit
transport/parsing failures fail the workflow. The production audit remains required. JSON and
counts retain scope, commit and pnpm version. Do not blanket-override all transitive findings.
All these workflows require integration into main before scheduled behavior can be observed.

The Node-only maintenance monitor and provider probe disable setup-node package-manager auto-caching. Neither installs pnpm; the pinned action otherwise detects the root packageManager and fails before the monitor starts. The dependencies job retains its pnpm setup/cache. The release-gate contracts scan all workflow jobs for this boundary, preserving cache use only where pnpm is installed first.
