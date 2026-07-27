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
`passWithNoTests: false`, alias `@ → ./src`. There is **no** React plugin and no Testing
Library — neither is in `package.json`, and nothing renders a component. Every test is a
node-environment unit or route test; the two that import from a component module import
only exported pure functions.

Test files and coverage:

| File | Covers |
|------|--------|
| `src/lib/__tests__/fatigue.test.ts` | `calculateFatigue` / `calculateRestAdvantage`: opener baseline, freshness bonus, back-to-back, 3-in-4, density, travel windows + the travel-leg contract, road-trip streak, altitude (`×1.15`), overtime (`+0.5` / `+1.0`), combined compounding. |
| `src/lib/__tests__/haversine.test.ts` | Great-circle distances (LA↔Boston ≈2,591mi, NY↔SF, Dallas↔Denver), symmetry, identical-point = 0. |
| `src/lib/__tests__/nba-season.test.ts` | `pickDefaultGamesDate` (today/postseason/October-start cases), `formatLocalDateKey` and `formatEasternDateKey` (US/Eastern, viewer-timezone-independent), `currentDisplaySeason`, and `isNbaOffSeason`. |
| `src/lib/__tests__/rest-advantage-display.test.ts` | `formatRestAdvantageDisplay` team/neutral labeling + one-decimal formatting, and `buildRestAdvantageEvidence`: cumulative-bucket selection (a 4.1 gap resolves to "3 or more", **not** the RA≥5 rate), threshold boundaries, the sub-2 overall fallback, the 0.5 call boundary, zero-denominator refusal, and signed counterfactual wording. Discriminating: sorting the cleared buckets ascending fails exactly the two selection tests. |
| `src/lib/__tests__/game-slate-machine.test.ts` | The game-slate reducer (25 cases): the month deriving from `selectedDate` across month and year boundaries, `MONTH_SELECTED` resolving from memory without re-entering `loadingDays`, stale slate responses being dropped, `slateEmpty` vs `slateError` separation, season invalidation, no-op events returning the same state **by identity**, `monthTabs` counting never-played months as `dayCount: 0`, and `calendarView` being total over all seven statuses — the property the old `errorGames ?? errorDates` bug violated. Discriminating: removing the stale-response guard fails 1 test; storing the month instead of deriving it fails 6. Runs in the `node` environment with no DOM, because the reducer has no React in it. |
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
| `src/app/api/__tests__/health.test.ts` | `GET /api/health` liveness up/down, via a mocked `db.execute`. |
| `src/app/api/__tests__/playoffs.test.ts` | `GET /api/playoffs` response shape + season validation. |
| `src/lib/__tests__/api-errors.test.ts` | `getPublicApiErrorMessage`: `PublicApiError` passthrough vs. the generic fallback for unknown throwables. |
| `src/lib/__tests__/nba-team-colors.test.ts` | `readableTextOn` luminance-based chip text — guards the light-theme fix where a pale primary (SAS `#C4CED4`) rendered white-on-white. |
| `src/components/__tests__/analysis-deviation.test.ts` | Deviation-column encoding: `deviationFill` sign mapping, `deviationScale` tick derivation, and the `minPointSize` zero-stub. |
| `src/components/__tests__/matchup-card-confidence.test.ts` | **Invariant:** anything `classifyRestAdvantage` calls for a team is never labelled `NEUTRAL` by `getConfidence`. Sweeps −3.0…3.0 in 0.1 steps and asserts the contradiction set is empty, plus the tier boundaries (0.5 `low` / 1.0 `med` / 2.0 `high`). Discriminating: with the pre-fix tiers it fails listing exactly `[-0.9…-0.5, 0.5…0.9]`. |

API route tests `vi.mock("@/lib/db/queries")`, so they exercise validation + response
shaping without a real database. These should pass against the current code.

The stdlib `unittest` suite at `scripts/tests/test_schedule_upsert_contract.py` characterizes
the intentional source-authority split between CDN schedule rows and Stats API result rows.
It imports only `schedule_upsert_contract.py`, so CI does not need pipeline dependencies or a
database for this check.

## End-to-end tests — Playwright

Config (`playwright.config.ts`): `testDir: ./e2e`, `baseURL: http://localhost:3000`,
`chromium` only, reporters `list` + `html` (no auto-open). `webServer` runs
`pnpm dev` (reuses an existing server unless `CI`); in CI `retries: 2` and `forbidOnly`.
**`workers: 1` everywhere**, not only in CI: the suite drives one dev server, so parallel
workers race for cold Turbopack compiles rather than for CPU. Measured 18 passed in 16.8s
serially against 26s *and* readiness-gate failures on `/schedule` at the default worker count —
parallelism bought negative time here. (`fullyParallel` is left on; with one worker it only
affects ordering.) Existing specs receive a completed onboarding storage state so the first-visit
dialog cannot block their legacy interactions; `e2e/onboarding.spec.ts` overrides that state with
an empty browser. Specs (7): `e2e/home.spec.ts`, `e2e/analysis.spec.ts`, `e2e/navigation.spec.ts`,
`e2e/onboarding.spec.ts`, `e2e/playoffs.spec.ts`, `e2e/schedule-disparity.spec.ts`,
`e2e/shot-quality.spec.ts`.

> **The e2e specs target the current terminal UI** (they are **not** stale — they assert the live
> markup, including the `Games` / `Rest Advantage Analysis` headings and the
> `GAMES`/`MODEL RESULTS`/`SCHEDULE EDGE` nav; none reference a removed `/tracker` or
> `/upcoming` route).
> They still
> need a running server **and** a populated database to pass — the suite drives real
> `/api/games/*` and `/api/analysis` responses, so it is not a build-time check, and it runs only
> on demand (`pnpm test:e2e`), never in CI.
>
> - **`navigation.spec.ts`** — nav links `GAMES` / `MODEL RESULTS` / `SCHEDULE EDGE` →
>   `/` / `/analysis` / `/schedule`. The active link is asserted via its `aria-current="page"`
>   attribute (the amber-underline active state), and inactive links are checked to lack it.
>   The link count is pinned at **5**, so a resurrected sixth tab fails here.
> - **`home.spec.ts`** — the heading is the `<h1>` **"Games"** (`REST ADVANTAGE
>   DASHBOARD` is an eyebrow `<span>`); controls use `getByLabel("Season")`, the
>   `selected-date-display` placeholder `PICK A DATE`, and the empty state `NO GAMES SCHEDULED`.
>   One spec covers the retired `/upcoming` route: it asserts the redirect lands on `/` **and**
>   that the view toggle swaps the body (the `Previous day` control disappears under UPCOMING
>   and returns under BY DATE) — a redirect-only assertion would pass on a broken toggle.
>   Two specs pin the season-wide day fetch introduced with `useGameSlate`: one waits for a
>   `/api/games/dates` response carrying `season=` and asserts the **absence** of `month=`, so a
>   regression to per-month fetching fails rather than passing quietly; the other steps the
>   arrows past the end of December and asserts the `JAN` tab takes `aria-pressed="true"`,
>   covering the derived month across a boundary.
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
{ "crons": [ { "path": "/api/cron/update", "schedule": "0 3 * * *" } ] }
```

- Schedule **`0 3 * * *`** = 03:00 UTC daily, **year-round** — 10 PM EST / 11 PM EDT, i.e.
  mid-slate and still ET date D under both DST regimes. Offseason runs early-return before any
  CDN fetch, so there is **no seasonal cadence switch**. Vercel **Hobby fires crons once a day**
  (within the hour), so this is a backstop, not live polling. `vercel.json` is the source of
  truth for the deployed cadence.
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
