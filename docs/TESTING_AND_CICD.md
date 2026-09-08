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

For ML contracts, use a virtual environment with `psycopg2-binary` installed under the
`ml/requirements.txt` constraints, then run:

```sh
python -m unittest discover -s ml/tests -p 'test_*.py' -v
```

The Python contracts do not need a live database. Production dependency audit runs last in CI
so advisories do not hide correctness failures. Never change model figures merely to satisfy a test.

Vitest covers domain logic, API contracts, caches, data pinning, and source/design conventions.
See `vitest.config.ts` and the tests themselves for the current inventory. Avoid copying test
counts into this guide; dated release records may report counts observed at a specific commit.

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
| `.github/workflows/ci.yml` | Frozen install, lint, types, unit/Python contracts, production build, dependency audit |
| `.github/workflows/daily-update.yml` | Season-gated daily NBA ingest; manual schedule resync or historical seed |
| `.github/workflows/probe-data-sources.yml` | Provider reachability diagnostics; not proof of successful data ingestion |
| `.github/workflows/officiating-refresh.yml` | Complete L2M source snapshot and reviewable publication update |
| GitHub CodeQL configuration | Code scanning managed on GitHub; not a checked-in workflow |
| `vercel.json` | Vercel region and `/api/cron/update` schedule |

Merging main deploys production. Before merging, verify CI/CodeQL and the actual populated
Vercel preview. Preview protection may require authenticated Vercel access. Do not disable
protection to run tests. Vercel commit-status reporting is disabled in this project; inspect
its deployment readiness and commit directly if no GitHub deployment check appears.

After merging, verify the deployment commit and production alias, `/api/health`, and the changed
user flow. A successful build does not establish database health. Record results in the release
PR, synchronize local main without force-pushing, and stop temporary servers when finished.

The normal CI build has no database credentials. Local builds may have `.env.local`, so the CI
build is a necessary independent gate; do not rename credential files around an unguarded shell
command. Schema changes are manual SQL and require a separate owner application step.

## Documentation captures

```sh
SCREENSHOT_BASE_URL=http://localhost:3110 node scripts/screenshots.mjs
SCREENSHOT_BASE_URL=https://fullcourt-nba.vercel.app node scripts/screenshots.mjs games
node scripts/check-doc-links.mjs
```

The screenshot manifest records the source URL, route, viewport, and capture time. Keep one
current capture per selected route; Git contains old captures. The documentation-link check
catches missing local Markdown targets. Neither command verifies the correctness of a finding.
