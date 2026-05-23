# NBA Rest Advantage — Project Context

Use this file as compact context for ChatGPT or another coding assistant.

## Summary

NBA Rest Advantage is a full-stack analytics portfolio project that quantifies how NBA travel distance, rest, and schedule density affect game outcomes. It uses a multi-factor Weighted Decay Fatigue Model to assign fatigue scores to both teams in a matchup, then derives a rest-advantage prediction from the score differential.

- Live site: https://nba-rest-advantage.vercel.app
- Repository: https://github.com/mhju0/nba-rest-advantage
- Stack: Next.js App Router, React, TypeScript, Tailwind CSS v4, shadcn/ui, Drizzle ORM, Supabase PostgreSQL
- Package manager: `pnpm`
- No dark mode
- API routes use `{ data, error }`
- Season labels use `"YYYY-YY"` format, e.g. `"2024-25"`
- Dates are stored and passed as `YYYY-MM-DD` strings

## Product

Core pages:

| Route | Purpose |
|-------|---------|
| `/` | Today’s Games: matchup cards, fatigue scores, live score updates, date/month navigation |
| `/analysis` | Historical backtest charts, win-rate stats, threshold analysis, and game search |
| `/upcoming` | Forward-looking picks with rest-advantage predictions and RA threshold filters |

Key finding:

- More-rested teams win about 53.5% of games overall.
- At rest advantage >= 5, win rate rises to about 61.7%.

## Visual Direction

Recent UI redesign direction: “Bloomberg Terminal meets NBA stats.”

Use:

- Clean white surfaces
- 1px restrained borders
- 4px card radius for terminal-style cards
- Left border accent cards
- Monospace font for data values and uppercase technical labels
- NBA red `#C9082A`
- NBA blue `#17408B`
- Tan accent `#C4853C`
- Muted neutral text such as `#8A8478`

Avoid:

- Glassmorphism
- Dark mode
- Decorative gradient blobs/orbs
- Marketing-style landing sections
- Overly rounded card surfaces

## Data Model

Primary Supabase/PostgreSQL tables:

- `teams`
- `games`
- `fatigue_scores`
- `predictions`

Drizzle schema lives in `src/lib/db/schema.ts`.

Supabase Data API access requires explicit grants. Migration `drizzle/0005_supabase_grants.sql` grants:

- `anon`: `SELECT`
- `service_role`: `SELECT`, `INSERT`, `UPDATE`, `DELETE`

When adding a new public table, create a new migration granting both roles the appropriate permissions.

## Fatigue Model

The fatigue score is a weighted composite built from factors including:

- Exponential decay workload
- Travel distance
- Road trip segment load
- Schedule density windows
- Back-to-backs
- Altitude penalties
- Freshness/rest bonuses
- Overtime penalties

Rest advantage is derived from the difference between away and home fatigue:

- `awayFatigue - homeFatigue`
- Positive means the home team is more fatigued than the away team.
- Negative means the away team is more fatigued than the home team.
- Very small absolute differences are treated as neutral/no-call in prediction logic.

Core model files:

- `src/lib/fatigue.ts`
- `src/lib/fatigue-recent-games.ts`
- `src/lib/haversine.ts`
- `src/lib/team-history.ts`

## Season Helpers

Use `src/lib/nba-season.ts` for NBA season utilities.

Important helpers:

- `NBA_SEASONS`
- `NBA_REGULAR_MONTHS`
- `parseSeasonStartYear(season)`
- `regularSeasonDateBounds(season)`
- `calendarYearForSeasonMonth(season, month)`
- `monthCalendarBounds(season, month)`
- `intersectDateBounds(a, b)`
- `defaultNbaCalendarMonth()`
- `defaultNbaSeason()`

Do not hardcode derived season labels when they can be computed from helpers.

## Data Pipeline

Pipeline is split between Python ingestion and TypeScript modeling.

Important scripts:

- `scripts/daily_update.py`: main orchestrator
- `scripts/fetch_schedule.py`: historical data via `nba_api`
- `scripts/fetch_nba_schedule_cdn.py`: current/future schedule via NBA CDN
- `scripts/run-daily.ts`: fatigue computation and prediction generation
- `scripts/backfill_fatigue.ts`: historical fatigue score backfill
- `scripts/backfill_predictions.ts`: historical predictions backfill
- `scripts/seed_teams.py`: seed 30 NBA teams

Operational notes:

- GitHub Actions runs the recurring data pipeline.
- Vercel cron calls `/api/cron/update`.
- During the offseason, `vercel.json` schedules `/api/cron/update` monthly at `0 10 1 * *`.
- During the regular season, change it back to daily: `0 10 * * *`.

## API Conventions

All API routes should return:

```ts
{ data: T, error: string | null }
```

Important route areas:

- `GET /api/games/[date]`
- `GET /api/games/dates`
- `GET /api/games/search`
- `GET /api/game/[id]`
- `GET /api/analysis`
- `GET /api/analysis/accuracy`
- `GET /api/games/upcoming`
- `GET /api/cron/update`

Use `src/lib/api-errors.ts` for safe public error messages.

## Frontend Notes

Client data fetching uses SWR and `src/lib/fetcher.ts`, which unwraps the API response envelope.

Live score updates use Supabase Realtime through:

- `src/hooks/useLiveGames.ts`

Important components:

- `src/app/page.tsx`: Today’s Games page
- `src/components/matchup-card.tsx`
- `src/components/analysis-content.tsx`
- `src/components/upcoming-content.tsx`
- `src/components/explore-game-detail-modal.tsx`
- `src/components/nav-bar.tsx`

Recent interaction note:

- Month tab navigation on `/` depends on clearing `selectedDateKey` before setting the new month. This prevents the render-time selected-date/month sync from reverting the month tab click.

## Testing

Common commands:

```bash
pnpm test:run
pnpm test:e2e
pnpm build
pnpm lint
```

Known current caveats in this workspace:

- Linting `src/app/page.tsx` may report existing `react-hooks/set-state-in-effect` issues around loading/error state in effects.
- `tsc --noEmit` may report existing Playwright typing issues in `e2e/home.spec.ts` for `getByLabelText`.

## Local Development

Install dependencies:

```bash
pnpm install
```

Run dev server:

```bash
pnpm dev
```

Required environment variables are typically provided in `.env.local`:

```env
DATABASE_URL=postgresql://...
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
CRON_SECRET=...
```

Service-role credentials should only be used in server-side scripts or protected route handlers.
