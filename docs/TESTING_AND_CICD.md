# Testing & CI/CD

## Test commands

```bash
pnpm test         # Vitest watch
pnpm test:run     # Vitest once (CI-style)
pnpm test:e2e     # Playwright (auto-starts `pnpm dev`)
pnpm test:e2e:ui  # Playwright UI mode
pnpm lint         # eslint (flat config: next/core-web-vitals + next/typescript)
pnpm build        # next build (type-checks as part of the build)
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
| `src/lib/__tests__/nba-season.test.ts` | `pickDefaultGamesDate` (today/postseason/October-start cases) and `formatLocalDateKey` (no UTC shift). |
| `src/lib/__tests__/rest-advantage-display.test.ts` | `formatRestAdvantageDisplay` team/neutral labeling + one-decimal formatting. |
| `src/lib/__tests__/team-history.test.ts` | `getTeamBranding` historical eras (SEA/NJN/VAN/NOH/Bobcats/Bullets), current-era logos, fallback behavior. |
| `src/app/api/__tests__/analysis.test.ts` | `GET /api/analysis` payload shape, percentage bounds, threshold ordering `[2,3,5,7]`, `seasonMinRA=7` filtering. Mocks `@/lib/db/queries`. |
| `src/app/api/__tests__/games-dates.test.ts` | `GET /api/games/dates` Zod validation (missing/invalid season, invalid month) + query delegation. Mocks `@/lib/db/queries`. |
| `src/app/api/__tests__/games.test.ts` | `GET /api/games/[date]` valid/invalid dates, empty results, `GameResponse` shape. Mocks `@/lib/db/queries`. |

API route tests `vi.mock("@/lib/db/queries")`, so they exercise validation + response
shaping without a real database. These should pass against the current code.

## End-to-end tests — Playwright

Config (`playwright.config.ts`): `testDir: ./e2e`, `baseURL: http://localhost:3000`,
`chromium` only, `fullyParallel`, reporters `list` + `html` (no auto-open). `webServer` runs
`pnpm dev` (reuses an existing server unless `CI`); in CI `retries: 2`, `workers: 1`,
`forbidOnly`. Specs: `e2e/home.spec.ts`, `e2e/analysis.spec.ts`, `e2e/navigation.spec.ts`.

> **The e2e specs target the current terminal UI.** They were rewritten to match the live
> markup, but still need a running server **and** a populated database to pass — the suite
> drives real `/api/games/*` and `/api/analysis` responses, so it is not a build-time check.
>
> - **`navigation.spec.ts`** — nav links `TODAY'S GAMES` / `ANALYSIS` / `PICKS` →
>   `/` / `/analysis` / `/upcoming`. The active link is asserted via its inline color
>   (`#C9082A` → `rgb(201, 8, 42)`), since the active state is an inline style, not a class.
> - **`home.spec.ts`** — the heading is the `<h1>` **"Today's Matchups"** (`REST ADVANTAGE
>   DASHBOARD` is an eyebrow `<span>`); controls use `getByLabel("Season")`, the
>   `selected-date-display` placeholder `PICK A DATE`, and the empty state `NO GAMES SCHEDULED`.
> - **`analysis.spec.ts`** — terminal markup: heading "Rest Advantage Analysis" plus the
>   section dividers "WIN RATE BY RA THRESHOLD", "HOME TEAM MORE RESTED", and
>   "WIN RATE BY SEASON" (no `text-7xl` hero).

Note a pre-existing lint/`tsc` caveat around `src/app/page.tsx`
(`react-hooks/set-state-in-effect`). The earlier `e2e/home.spec.ts` `getByLabelText` typing
issue is resolved — the specs now use Playwright's `getByLabel`.

## CI/CD

### GitHub Actions — `.github/workflows/daily-update.yml`

- **Name:** "Daily NBA update". **Triggers:** `schedule` cron **`0 21 * * 1`** (Mondays
  21:00 UTC — offseason weekly; comment says switch to `0 21 * * *` in-season) and manual
  `workflow_dispatch`.
- **Job `update`** (`ubuntu-latest`): checkout → install pnpm (`pnpm/action-setup@v4`) →
  Node **22** (with pnpm cache) → Python **3.11** → `pnpm install --frozen-lockfile` →
  `pip install -r scripts/requirements.txt` → `python scripts/daily_update.py`.
- **Secret:** `DATABASE_URL` (the only one the workflow uses). `daily_update.py` itself
  shells out to `pnpm exec tsx scripts/run-daily.ts`, so both Node and Python toolchains are
  required in the runner.

### Vercel cron — `vercel.json`

```json
{ "crons": [ { "path": "/api/cron/update", "schedule": "0 10 1 * *" } ] }
```

- Current schedule **`0 10 1 * *`** = 10:00 UTC on the 1st of each month (offseason). Switch
  to **`0 10 * * *`** (daily) in-season. JSON can't hold comments, so `CLAUDE.md` is the
  source of truth for this.
- The cron hits `GET /api/cron/update` with `Authorization: Bearer <CRON_SECRET>`; the route
  refreshes live scores from the NBA CDN and updates `games`, which Supabase Realtime pushes
  to clients. On Vercel Hobby, crons are limited to once per day.

### Deployment

Vercel auto-deploys from `main`. DB-backed routes are `force-dynamic` + `runtime = "nodejs"`
so the build doesn't require `DATABASE_URL` and queries never run on Edge. `next.config.ts`
allow-lists remote image hosts (`cdn.nba.com/logos/**`, `a.espncdn.com/i/teamlogos/nba/**`)
and sets security headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(),
geolocation=()`).
