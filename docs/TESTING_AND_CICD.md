# Testing & CI/CD

## Test commands

```bash
pnpm test         # Vitest watch
pnpm test:run     # Vitest once (CI-style)
pnpm test:e2e     # Playwright (auto-starts `pnpm dev`)
pnpm test:e2e:ui  # Playwright UI mode
pnpm lint         # eslint (flat config: next/core-web-vitals + next/typescript)
pnpm typecheck    # strict TypeScript without emitting files
pnpm build        # next build (type-checks as part of the build)
python3 -m unittest discover -s scripts/tests -p 'test_*.py' -v
                   # import-light Python ingestion contract tests
```

## Unit tests — Vitest

Config (`vitest.config.ts`): `environment: "node"`, `include: ["src/**/*.test.ts"]`,
`passWithNoTests: false`, alias `@ → ./src`. `@vitejs/plugin-react` and Testing Library
(`@testing-library/react`, `@testing-library/jest-dom`) are installed; current tests are
pure unit/route tests (no component rendering yet).

Test files and coverage:

| File | Covers |
|------|--------|
| `src/lib/__tests__/fatigue.test.ts` | `calculateFatigue` / `calculateRestAdvantage`: opener baseline, freshness bonus, back-to-back, 3-in-4, density, travel windows + the travel-leg contract, road-trip streak, altitude (`×1.15`), overtime (`+0.5` / `+1.0`), combined compounding. |
| `src/lib/__tests__/haversine.test.ts` | Great-circle distances (LA↔Boston ≈2,591mi, NY↔SF, Dallas↔Denver), symmetry, identical-point = 0. |
| `src/lib/__tests__/nba-season.test.ts` | `pickDefaultGamesDate` (today/postseason/October-start cases), `formatLocalDateKey` and `formatEasternDateKey` (US/Eastern, viewer-timezone-independent), `currentDisplaySeason`, and `isNbaOffSeason`. |
| `src/lib/__tests__/rest-advantage-display.test.ts` | `formatRestAdvantageDisplay` team/neutral labeling + one-decimal formatting. |
| `src/lib/__tests__/team-history.test.ts` | `getTeamBranding` historical eras (SEA/NJN/VAN/NOH/Bobcats/Bullets), current-era logos, fallback behavior. |
| `src/lib/__tests__/fetcher.test.ts` | `apiFetcher` success envelopes, safe API errors, non-JSON HTTP failures, malformed envelopes. |
| `src/lib/__tests__/rest-advantage-evidence.test.ts` | Canonical neutral boundary, historical backtest aggregation, game-explorer outcome filtering/pagination. |
| `src/lib/__tests__/live-score-sync.test.ts` | Scoreboard ID/status normalization and changed-row-only reconciliation. |
| `src/lib/__tests__/daily-refresh.test.ts` | Per-game failure isolation/continuation and neutral open-prediction replacement. |
| `src/app/api/__tests__/analysis.test.ts` | `GET /api/analysis` payload shape, percentage bounds, threshold ordering `[2,3,5,7]`, `seasonMinRA=7` filtering. Mocks `@/lib/db/queries`. |
| `src/app/api/__tests__/games-dates.test.ts` | `GET /api/games/dates` Zod validation (missing/invalid season, invalid month) + query delegation. Mocks `@/lib/db/queries`. |
| `src/app/api/__tests__/games.test.ts` | `GET /api/games/[date]` valid/invalid dates, empty results, `GameResponse` shape. Mocks `@/lib/db/queries`. |
| `src/app/api/__tests__/games-search.test.ts` | `GET /api/games/search` defaults, validation, and query delegation. |
| `src/app/api/__tests__/games-upcoming.test.ts` | `GET /api/games/upcoming` season/threshold validation and query delegation. |

API route tests `vi.mock("@/lib/db/queries")`, so they exercise validation + response
shaping without a real database. These should pass against the current code.

The stdlib `unittest` suite at `scripts/tests/test_schedule_upsert_contract.py` characterizes
the intentional source-authority split between CDN schedule rows and Stats API result rows.
It imports only `schedule_upsert_contract.py`, so CI does not need pipeline dependencies or a
database for this check.

## End-to-end tests — Playwright

Config (`playwright.config.ts`): `testDir: ./e2e`, `baseURL: http://localhost:3000`,
`chromium` only, `fullyParallel`, reporters `list` + `html` (no auto-open). `webServer` runs
`pnpm dev` (reuses an existing server unless `CI`); in CI `retries: 2`, `workers: 1`,
`forbidOnly`. Existing specs receive a completed onboarding storage state so the first-visit
dialog cannot block their legacy interactions; `e2e/onboarding.spec.ts` overrides that state with
an empty browser. Specs: `e2e/home.spec.ts`, `e2e/analysis.spec.ts`, `e2e/navigation.spec.ts`,
`e2e/onboarding.spec.ts`.

> **The e2e specs target the current terminal UI** (they are **not** stale — they assert the live
> markup, including the `Today's Matchups` / `Rest Advantage Analysis` headings and the
> `TODAY'S GAMES`/`ANALYSIS`/`PICKS` nav; none reference a removed `/tracker` route). They still
> need a running server **and** a populated database to pass — the suite drives real
> `/api/games/*` and `/api/analysis` responses, so it is not a build-time check, and it runs only
> on demand (`pnpm test:e2e`), never in CI.
>
> - **`navigation.spec.ts`** — nav links `TODAY'S GAMES` / `ANALYSIS` / `PICKS` →
>   `/` / `/analysis` / `/upcoming`. The active link is asserted via its `aria-current="page"`
>   attribute (the amber-underline active state), and inactive links are checked to lack it.
> - **`home.spec.ts`** — the heading is the `<h1>` **"Today's Matchups"** (`REST ADVANTAGE
>   DASHBOARD` is an eyebrow `<span>`); controls use `getByLabel("Season")`, the
>   `selected-date-display` placeholder `PICK A DATE`, and the empty state `NO GAMES SCHEDULED`.
> - **`analysis.spec.ts`** — terminal markup: heading "Rest Advantage Analysis" plus the
>   section dividers "WIN RATE BY RA THRESHOLD", "HOME TEAM MORE RESTED", and
>   "WIN RATE BY SEASON" (no `text-7xl` hero).
> - **`onboarding.spec.ts`** — a fresh browser sees all five page explanations; closing the
>   guide persists through reload, the `GUIDE` footer control reopens it, and Escape restores
>   focus to that control.

## CI/CD

### GitHub Actions — `.github/workflows/ci.yml`

Pushes to `main` and pull requests run a non-DB quality gate on Node 22 and Python 3.11 with
the repository's pinned pnpm: frozen install → lint → type-check → Vitest → Python schedule
contract tests → production build. The workflow uses read-only repository permissions and
cancels superseded runs. Playwright remains local because its integration-style specs require
a populated database.

### GitHub Actions — `.github/workflows/daily-update.yml`

- **Name:** "Daily NBA update". **Triggers:** `schedule` cron **`0 21 * * *`** (daily, 21:00
  UTC, **year-round**) and manual `workflow_dispatch`. `daily_update.py` self-gates on the NBA
  season (`season_window.is_in_season`) and exits 0 in the offseason, so the daily cron needs no
  seasonal cadence switch.
- **Job `update`** (`ubuntu-latest`): checkout (`actions/checkout@v5`) → install pnpm
  (`pnpm/action-setup@v5`) → Node **22** (`actions/setup-node@v5`, with pnpm cache) → Python
  **3.11** (`actions/setup-python@v6`) → `pnpm install --frozen-lockfile` →
  `pip install -r scripts/requirements.txt` → `python scripts/daily_update.py`.
- **Secret:** `DATABASE_URL` (the only one the workflow uses, and only the in-season path needs
  it). `daily_update.py` shells out to `pnpm exec tsx scripts/run-daily.ts`, so both Node and
  Python toolchains are required in the runner.

The data workflow is independent from `.github/workflows/ci.yml`; failures in ingestion do not
disable the code-quality gate. Playwright, Playoff Predictor scripts, and the `ml/` pipeline are
still verified on demand rather than in CI.

### Vercel cron — `vercel.json`

```json
{ "crons": [ { "path": "/api/cron/update", "schedule": "0 10 1 * *" } ] }
```

- Current schedule **`0 10 1 * *`** = 10:00 UTC on the 1st of each month (offseason). Switch
  to **`0 10 * * *`** (daily) in-season. `vercel.json` is the source of truth for the deployed
  cadence; the season-rollover runbook explains when to change it.
- The cron hits `GET /api/cron/update` with `Authorization: Bearer <CRON_SECRET>`; the route
  refreshes live scores from the NBA CDN and updates `games`, which Supabase Realtime pushes
  to clients. On Vercel Hobby, crons are limited to once per day.

### Deployment

Vercel auto-deploys from `main`. DB-backed routes are `force-dynamic` + `runtime = "nodejs"`
so the build doesn't require `DATABASE_URL` and queries never run on Edge. `next.config.ts`
allow-lists remote image hosts (`cdn.nba.com/logos/**`, `a.espncdn.com/i/teamlogos/nba/**`)
and sets security headers: `Content-Security-Policy` (default-src `'self'`, `frame-ancestors
'none'`, `object-src 'none'`, connect-src scoped to Supabase, img-src to the two logo CDNs;
`'unsafe-eval'` is dev-only), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(),
microphone=(), geolocation=()`.
