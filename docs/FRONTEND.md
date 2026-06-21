# Frontend

Pages, components, and the design system. All hex values, fonts, and props are taken from
the actual code (`src/app/`, `src/components/`, `src/app/globals.css`).

## App shell — `src/app/layout.tsx`

- Fonts via `next/font/google`: **Inter** (`--font-inter`, weights 400/500/600 — body/sans)
  and **Outfit** (`--font-outfit`, weights 600/700 — headings, exposed as the `font-heading`
  utility). `<html>` gets both font variables + `antialiased`.
- Metadata: title default `"FullCourt — NBA Analytics"`, template `"%s · FullCourt"`, plus
  a description.
- Layout: `<NavBar />` (sticky), `<main>` with a centered `max-w-7xl` container
  (`px-4 py-8 sm:px-6`), and a footer (`#F0EEE9` bg, top border `#E2DFD8`) showing
  `LAST UPDATED: <ISO> UTC · PIPELINE OK` and `BUILT BY MJ`. `lastUpdated` is computed from
  `new Date().toISOString()` at render time (server render → UTC).

## Pages

### `/` — Today's Games (`src/app/page.tsx`, client component)

State machine over season/month/day:
- On mount, fetches `/api/games/dates?season=…` (no `month` on the first fetch), then on
  month/season change refetches with `month`. Picks an initial day with `pickDefaultGamesDate`
  (today if it has games; else first upcoming October date at season start; else nearest /
  last available). Selecting a day fetches `/api/games/{date}`. Requests use `AbortController`.
- A render-time block snaps the active month tab to the month of `selectedDateKey` so the
  prev/next-day arrows can cross month boundaries; `onMonthTabClick` clears the selected day
  first (via `pendingSelectionResetRef`) so this sync doesn't immediately revert the click.
- `useLiveGames(gameIds)` merges Realtime score/status updates into the rendered list;
  recently-updated cards flash (`scoreFlash`).
- Pieces: heading eyebrow `REST ADVANTAGE DASHBOARD` + `<h1>Today's Matchups</h1>`;
  `StatSummaryRow` (GAMES TODAY, AVG REST ADV, **SEASON WIN RATE = "53.5%"** hardcoded as
  `SEASON_WIN_RATE`, HIGH CONF PICKS where `HIGH_CONF_THRESHOLD = 2.0`); season `<select>`;
  month tabs (`NBA_REGULAR_MONTHS`); `DateChip`s ("DAYS WITH GAMES"); prev/next day arrows;
  the `MatchupCard` list with skeleton/empty/error states.

### `/analysis` — Analysis (`src/app/analysis/page.tsx`)

Server wrapper just renders `<AnalysisContentLazy />`. The lazy client component
(`analysis-content.tsx`) owns the header — a terminal-style `HISTORICAL BACKTEST` eyebrow +
`<h1>Rest Advantage Analysis</h1>` + descriptor — so the heading renders once.

### `/upcoming` — Future Games (`src/app/upcoming/page.tsx`)

Server wrapper: header (`2025–26 Season` + `<h1>Future Games</h1>` + description) then
`<UpcomingContentLazy />`.

## Components

### `nav-bar.tsx` — two-layer header + ticker (sticky, `z-50`)

1. **Top status bar** (28px, `#F0EEE9`, bottom border `#E2DFD8`): `FULLCOURT` (red
   `#C9082A`) + `NBA ANALYTICS PLATFORM` (muted), and on the right `SEASON_LABEL =
   "2025-26 SEASON"` plus a LIVE dot gated by `HAS_LIVE_GAMES` (**hardcoded `false`**).
2. **Main nav** (44px, white, bottom border `#E2DFD8`): links from `NAV_LINKS` —
   `TODAY'S GAMES → /`, `ANALYSIS → /analysis`, `PICKS → /upcoming`. Active link is NBA red
   text with a 2px red bottom border (set via **inline style**, not a Tailwind class).
3. **Navy ticker** (26px, `#17408B`): a `TICKER` label + a CSS `marquee` (40s linear loop)
   of **hardcoded** `TICKER_ITEMS` (BOS/DEN/LAL/MIA/NYK/GSW with up `▲` green / down `▼` red
   / flat `—` arrows and a fake `RA` value). These ticker values are decorative, not live.

### `matchup-card.tsx` — the core matchup row (new terminal style)

Flat white card (`#E2DFD8` border) with a **left-border accent** colored by confidence:
- `getConfidence(diff)`: `high` `|diff| ≥ 2.0`, `med` `≥ 1.0`, `neutral` otherwise, `none`
  when no RA. `confidenceAccent`: high `#C9082A`, med `#17408B`, neutral `#C4853C`, none
  `#888888`.

Layout per card: status line (`GameStatusRow` → LIVE/FINAL/UPCOMING + score),
`away TeamBlock | FatigueBarsBlock | home TeamBlock | RestAdvPanel`, a `MetaStrip`, and a
click/keyboard-expandable detail grid (two `FatigueDetailColumn`s). Subcomponents:
- `TeamLogo` — season-aware logo via `getTeamBranding`; falls back to an abbreviation chip on
  error.
- `FatigueBarsBlock` / `FatigueBarRow` — away + home `FatigueBar`s; the higher score is red
  (`higher`), the lower blue (`lower`), equal/neutral grey.
- `RestAdvPanel` (~180–200px, left divider): `REST ADVANTAGE` label, team abbreviation +
  value (or `EVEN`), a center-anchored fill bar (home fills right in blue, away fills left in
  red; fill width = `min(|diff|/5, 1) * 50%`), and a `ConfidenceBadge` (HIGH CONF red /
  MED CONF blue / NEUTRAL outlined).
- `MetaStrip` — game date plus flag chips: `AWAY/HOME B2B`, `AWAY/HOME 3IN4`, `AWAY/HOME
  4IN6`, `ALT`, `COAST`, `OT`.
- `FatigueDetailColumn` — GP (30D/7D), back-to-back, 3-in-4, 4-in-6, road streak, travel
  miles (7-day; highlighted ≥1000), days rest.
- Exported helpers reused by the modal: `GameStatusRow`, `FatigueDetailColumn`, `RaBadge`.
  `TeamRow` is exported but is a **deprecated no-op shim** (returns `null`) kept for import
  compatibility.

### `fatigue-bar.tsx`

A 4px progress bar; `SCALE_MAX = 10` (scores above clamp to 100% fill); tone colors:
`higher` `#C9082A`, `lower` `#17408B`, `neutral` `#888888`. `role="progressbar"` with aria
min/now/max.

### `analysis-content.tsx` (+ `analysis-lazy.tsx`)

Loaded via `next/dynamic` with `ssr: false` and a skeleton. Uses SWR:
- `/api/analysis` for the main payload; `/api/analysis?seasonMinRA=<n>` when a season RA
  threshold pill is active.
- Renders terminal stat cards, a **Win Rate by RA Threshold** Recharts bar chart (clicking a
  bar sets the explore filter and smooth-scrolls to the table), a **Home Team More Rested**
  breakdown, a **Win Rate by Season** chart with RA-threshold toggles, a **Key Insight**
  callout (RA ≥ 5 / ≥ 7), and the `ExploreGames` table.
- `ExploreGames`: SWR `/api/games/search` with RA/team/season/result filters + pagination
  (`PAGE_SIZE = 20`, `keepPreviousData`), opening `ExploreGameDetailModal` per row.

### `upcoming-content.tsx` (+ `upcoming-lazy.tsx`)

Loaded via `next/dynamic` (`ssr: false`). SWR `/api/games/upcoming?season=2025-26&minRA=…`.
RA filter pills, an off-season empty state (`OffSeasonEmptyState`), and a table of upcoming
games with an "edge" badge (home edge blue, away edge red). **Still uses the older
glassmorphism style** (`glass` object: `rgba(255,255,255,0.6)` + `backdrop-filter: blur`,
`rounded-3xl`) rather than the terminal style.

### `explore-game-detail-modal.tsx`

Portal-rendered modal (`createPortal` to `document.body`). SWR `/api/game/{id}`, with a
nav-history stack so clicking a "recent game" drills into that game and Back returns. Escape
and backdrop close it. Renders `GameStatusRow`, `RaBadge`, two `FatigueDetailColumn`s, and
`RecentResultsList` (last-5 W/L) per team. **Also still glassmorphism** (`detailGlass`
blur, `rounded-2xl`).

### `hooks/useLiveGames.ts`

Subscribes (via `getSupabaseBrowser()`) to Supabase Realtime `postgres_changes` `UPDATE`
events on the `public.games` table, filtered to the tracked `gameIds` (O(1) `Set` lookup).
Returns `{ liveUpdates: Record<id, {homeScore, awayScore, status}>, recentlyUpdated:
Set<id> }`; `recentlyUpdated` clears after 600ms to drive the flash. No-ops (returns empty
maps) when the Supabase env vars are unset (client is `null`).

### `components/ui/*` — shadcn primitives

`badge`, `button`, `separator`, `tabs` are built on **`@base-ui/react`** with
`class-variance-authority` variants; `card` and `skeleton` are plain `div`s. `cn()`
(`src/lib/utils.ts`) merges classes with `clsx` + `tailwind-merge`. `components.json` pins
the shadcn `base-nova` style, `neutral` base color, CSS variables, and the `@/components`,
`@/lib`, `@/hooks`, `@/components/ui` aliases.

## Design system — "Bloomberg Terminal meets NBA stats"

The current direction (Today's Games + Analysis) is flat white surfaces, thin borders,
monospace data values, and brand-color accents — **no glassmorphism, no dark mode** (the app
forces `color-scheme: only light`). Future Games + the detail modal are not yet migrated and
keep the older glass look.

### Color tokens (verified)

| Hex | Role | Where |
|-----|------|-------|
| `#F7F6F3` | page background (off-white) | `globals.css` `html, body { background: #F7F6F3 }` |
| `#F0EEE9` | panel / stat-card / top-bar / footer fill | components |
| `#E2DFD8` | borders / dividers | components |
| `#8A8478` | muted / label text | components |
| `#0f172a` | primary dark text | components / `--foreground` |
| `#C9082A` | **NBA red** — high confidence, danger, active nav, "higher fatigue" | tokens + components |
| `#17408B` | **NBA blue** — primary, med confidence, "lower fatigue", charts | tokens + components |
| `#C4853C` | **hardwood tan** — neutral accent / `--accent` | tokens + components |
| `#C9C5BC` | subtle divider dots / center marker | components |
| `#17A34A` / `#22c55e` | win / up-tick green | components / nav ticker |
| `#ef4444` | down-tick red | nav ticker |

> Token vs applied background: the CSS variable `--background` is `#f8f9fc`, but the base
> layer hard-sets `html, body { background: #F7F6F3 }`, so the actual page background is
> **`#F7F6F3`**. shadcn semantic tokens in `:root`: `--primary #17408b`, `--destructive
> #c9082a`, `--accent #c4853c`, `--muted-foreground #64748b`, `--radius 0.75rem`; chart
> palette `--chart-1..5` = blue / red / hardwood / emerald (`#10b981`) / violet (`#8b5cf6`).

### Typography

- **Body / sans:** Inter (`--font-inter`).
- **Headings (`h1–h3`):** Outfit (`--font-heading` / `font-heading` utility), bold + tight
  tracking.
- **Data / labels:** the `.mono` class = `'Courier New', Courier, monospace`; numeric values
  use `tabular-nums`. The Tailwind `--font-mono` token is a `ui-monospace` system stack.

### Card / accent patterns

- Terminal cards: white fill, `1px solid #E2DFD8`, `border-radius: 4px`. Many add a **2px
  left-border accent** (`#C4853C` default, `#C9082A` for errors/high-confidence, `#17408B`
  for highlights).
- Uppercase mono labels with wide letter-spacing (`0.04–0.12em`) for "technical" headers.
- Animations (`globals.css`): `marquee` (ticker), `fadeInUp` (card entrance, staggered by
  `index * 40ms`), `scoreFlash` (live-update glow).

### Two-layer header + ticker

Sticky header = top status bar (28px) + main nav (44px) + navy ticker (26px); see
`nav-bar.tsx` above. Footer mirrors the terminal aesthetic with mono metadata.
