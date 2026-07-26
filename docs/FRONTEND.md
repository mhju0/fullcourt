# Frontend

Pages, components, and the design system. All hex values, fonts, and props are taken from
the actual code (`src/app/`, `src/components/`, `src/app/globals.css`).

## App shell — `src/app/layout.tsx`

- Fonts via `next/font/google`: **Inter** (`--font-inter`, weights 400/500/600 — body/sans),
  **Outfit** (`--font-outfit`, weights 600/700 — headings, exposed as the `font-heading`
  utility), and **IBM Plex Mono** (`--font-plex-mono`, weights 400/600/700 — all data, labels
  and chart ticks). `<html>` gets all three font variables + `antialiased`.
- Metadata: title default `"FullCourt — NBA Analytics"`, template `"%s · FullCourt"`, plus
  a description.
- Layout: `<NavBar />` (sticky), `<main>` with a centered `max-w-7xl` container
  (`px-4 py-8 sm:px-6`), and a footer (`var(--term-surface-2)` bg, top border
  `var(--term-border)`) showing `RENDERED: <ts> UTC · SYSTEM STATUS` (the latter a link to
  `/api/health`) and `GUIDE · BUILT BY MJ · SOURCE` (two links → the author's GitHub and the
  repo). `GUIDE` opens the client-side first-visit onboarding dialog at any time.
  `renderedAt` is `new Date().toISOString()` truncated to the minute at render time — the
  **render** time, explicitly **not** data/pipeline freshness (live health lives behind the
  SYSTEM STATUS link).

## Pages

Five product routes ship today — `/`, `/analysis`, `/upcoming`, `/playoffs`, `/shot-quality` —
plus a branded App Router `not-found` page for unknown paths.

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
  `StatSummaryRow` (GAMES ON THIS DATE, AVG REST ADV, **ALL-TIME WIN RATE** fetched live via
  `useSWR("/api/analysis")` — the same `overallWinRate` `/analysis` renders, shown as `—` while
  loading/on error, HIGH CONF PICKS where `HIGH_CONF_THRESHOLD = 2.0`); the shared
  `<SeasonSelector>`; month tabs (`NBA_REGULAR_MONTHS`); `DateChip`s ("DAYS WITH GAMES");
  prev/next day arrows; the `MatchupCard` list with skeleton/empty/error states.
- The first tile is **"GAMES ON THIS DATE"**, not "GAMES TODAY": its value is
  `mergedGames.length` for the *selected* day, and `pickDefaultGamesDate` deliberately selects
  a non-today date whenever today has no games (the normal case in the off-season).
- The season control is the shared `<SeasonSelector>` (`season-selector.tsx`), which lists
  **newest season first**. The hand-rolled `<select>` it replaced mapped `NBA_SEASONS` raw, so
  it opened on 1985-86 and disagreed with every other season picker in the app.
- Month tabs and `DateChip`s carry their active/inactive colors in **classes, not the `style`
  prop**. An inline `background`/`border` shorthand outranks any class rule, which previously
  made both controls' `hover:` states dead.

### `/analysis` — Analysis (`src/app/analysis/page.tsx`)

Server wrapper just renders `<AnalysisContentLazy />`. The lazy client component
(`analysis-content.tsx`) owns the header — a terminal-style `HISTORICAL BACKTEST` eyebrow +
`<h1>Rest Advantage Analysis</h1>` + descriptor — so the heading renders once.

### `/upcoming` — Upcoming Edges (`src/app/upcoming/page.tsx`)

Server wrapper: header (`<season> SEASON` eyebrow + `<h1>Upcoming Edges</h1>` + description)
then `<UpcomingContentLazy />`. The nav label, the `<h1>` and the metadata title are all
**"Upcoming Edges"** — previously the nav said `PICKS` while the page and tab said "Future
Games", three names for one destination, and "picks" promised betting tips that the guide copy
explicitly disclaims.

### `/playoffs` — Playoff Predictor (`src/app/playoffs/page.tsx`)

Server wrapper: header (`PLAYOFF PREDICTOR` eyebrow in red + `<h1>Series Predictions</h1>` +
a descriptor tying it to the same rest-advantage lineage as the regular-season model) then
`<PlayoffsContentLazy />`. The lazy client component (`playoffs-content.tsx`) owns a season
`<select>`, a `MethodComparisonHeader` (walk-forward-OOS vs. full-in-sample accuracy cards,
explicitly framed "OOS is the honest generalization number"), and per-round `SeriesCard` lists
— each an expandable row (home-court team, opponent, series score, OOS/IN win-probability
inline, a correctness badge) that reveals a `SeriesFeatureGrid` (seed diff / win% diff / entry
rest diff / h2h diff) on click.

### `/shot-quality` — Expected Shot Value (`src/app/shot-quality/page.tsx`)

Server component; metadata title `"Expected Shot Value"`; renders `<ShotQualityContentLazy />`
with no page-level header of its own (the lazy content owns its own controls row). The lazy
client component (`shot-quality-content.tsx`) fetches `/api/shot-quality?season=…` via SWR and
renders a season `<select>`, an `EncodingToggle` (`EXPECTED eFG%` sequential view vs.
`GBM − BASELINE` divergent-diff view — a **single** court in diff mode, not two), and one or
two `ShotCourt` half-court SVGs depending on the toggle. See "Shot chart / court geometry"
under Design system below for the rendering details, and a collapsible `MethodologyNote`
explaining the baseline/GBM framing (small calibration win, not a large accuracy jump; no
defender distance or shot-clock data).

### Unknown routes — `src/app/not-found.tsx`

Static server component inside the shared shell. It provides a branded 404 heading and direct
recovery links to Today's Games and Analysis without adding a client bundle or data request.

## Components

### `nav-bar.tsx` — two-layer header (sticky, `z-50`)

1. **Top status bar** (28px, `var(--term-surface-2)`, bottom border `var(--term-border)`):
   a `<CourtMark size={22}>` brand logo + `FULLCOURT` (`var(--term-red)`) + `NBA ANALYTICS
   PLATFORM` (muted), and on the right `currentDisplaySeason() + " SEASON"` (dynamic — from
   `src/lib/nba-season.ts`, not a hardcoded label). There is **no LIVE dot** — it was gated by
   a `HAS_LIVE_GAMES` constant hardcoded to `false`, so it never rendered in any state; the
   dead branch was removed. Per-game LIVE status is shown by `MatchupCard` instead.
2. **Main nav** (44px, `var(--term-surface)`, bottom border `var(--term-border)`): links from
   `PRIMARY_NAV_ITEMS` (`src/lib/primary-navigation.ts`) — `TODAY'S GAMES → /`, `ANALYSIS → /analysis`, `UPCOMING EDGES → /upcoming`,
   `PLAYOFFS → /playoffs`, `SHOT QUALITY → /shot-quality`. The active link gets an amber
   bottom border (`border-[var(--term-amber)]`) + `text-[var(--term-text)]` and carries
   `aria-current="page"`; inactive links are muted with a hover-to-text transition.

### `onboarding-guide.tsx`

Client-side, first-visit orientation dialog implemented with Base UI `Dialog`. On mount it reads
the versioned `localStorage` flag `fullcourt:onboarding:v1`; new visitors see the dialog, while
returning visitors see the unobtrusive `GUIDE` footer control. It explains the five routes from
the shared `PRIMARY_NAV_ITEMS` source, with page links that dismiss the dialog and navigate.
Close, backdrop, Escape, and `START EXPLORING` all persist the completion flag; if browser storage
is unavailable, the guide still closes for the current page. The responsive panel is centered on
desktop and becomes a scrollable bottom sheet on mobile. Base UI provides the modal semantics,
focus trap, dismissal, and trigger-focus restoration.

### `matchup-card.tsx` — the core matchup row (broadcast style)

White card (`background: var(--term-surface)`, `1px solid var(--term-border)`) topped by a
team-color band (away | home from `getTeamColors`) with a **2px left-border accent** colored
by confidence:
- `getConfidence(diff)`: `high` `|diff| ≥ 2.0`, `med` `≥ 1.0`, **`low` `≥ 0.5`**, `neutral`
  below that, `none` when no RA. The `low` tier exists because the canonical classifier
  (`NEUTRAL_REST_ADVANTAGE_THRESHOLD = 0.5`, imported from `rest-advantage-evidence.ts` rather
  than redeclared) calls a game for a team at 0.5: with tiers starting at 1.0, every gap in
  `[0.5, 1.0)` made `RestAdvPanel` print e.g. `BOS 0.7` while the badge directly beneath it
  printed `NEUTRAL`. The invariant — *anything the classifier calls is at least `low`* — is
  pinned by `src/components/__tests__/matchup-card-confidence.test.ts`.
- `confidenceAccent` returns `TERM_ACCENT` tokens (`src/lib/terminal-styles.ts`): high
  `.red`, med `.blue`, everything else `.neutral`. **Not `.tan`** — against `--term-red` it
  measures ΔE 3.2 for deuteranopia (floor 8) and 14.5 for normal vision (floor 15), so a
  HIGH CONF and a NEUTRAL card were indistinguishable at a 2px border. Confidence is
  magnitude, and is carried by the badge text rather than a third hue.

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
  MED CONF blue / LOW CONF and NEUTRAL outlined).
- `MetaStrip` — game date plus flag chips: `AWAY/HOME B2B`, `AWAY/HOME 3IN4`, `AWAY/HOME
  4IN6`, `ALT`, `COAST`, `OT`.
- `FatigueDetailColumn` — GP (30D/7D), back-to-back, 3-in-4, 4-in-6, road streak, travel
  miles (7-day; highlighted ≥1000), days rest.
- Exported helpers reused by the modal: `GameStatusRow`, `FatigueDetailColumn`, `RaBadge`.

### `fatigue-bar.tsx`

A 4px progress bar; `SCALE_MAX = 10` (scores above clamp to 100% fill); tone colors:
`higher` `var(--term-red)`, `lower` `var(--term-blue)`, `neutral` `var(--term-neutral)`.
`role="progressbar"` with aria min/now/max.

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
games with an "edge" badge (home edge blue, away edge red). Rendered in the **broadcast
style** (`var(--term-surface)` card fill, `1px solid var(--term-border)`, `.mono` labels) —
consistent with Today's Games / Analysis.

### `explore-game-detail-modal.tsx`

Portal-rendered modal (`createPortal` to `document.body`). SWR `/api/game/{id}`, with a
nav-history stack so clicking a "recent game" drills into that game and Back returns. Escape
and backdrop close it. Renders `GameStatusRow`, `RaBadge`, two `FatigueDetailColumn`s, and
`RecentResultsList` (last-5 W/L) per team. Rendered in the **broadcast style**
(`var(--term-surface)` panel, `1px solid var(--term-border)`, `.mono` labels, a
`var(--term-surface-2)` inset breakdown surface).

### `playoffs-content.tsx` (+ `playoffs-lazy.tsx`)

Loaded via `next/dynamic` (`ssr: false`). SWR `/api/playoffs?season=…`. Renders
`MethodComparisonHeader` (two `MethodMetricCard`s — OOS blue accent, in-sample tan accent —
each showing accuracy% + `predictedCorrect / knownWinnerGames`), then a `RoundSection` per
playoff round, each holding expandable `SeriesCard`s: header row = home-court team (`HC`
chip) vs. opponent, series score, `MethodInline` OOS/IN win-probability reads, and a
`CorrectnessBadge` (✓ CORRECT blue / ✗ UPSET red / — pending tan, with an "(IN-SAMPLE)" tag
when OOS wasn't available). Expanding a card reveals `SeriesFeatureGrid` (seed diff, win% diff,
entry rest diff, h2h diff; sign convention = home-court minus opponent). Same terminal-card /
`.mono` styling as the rest of the app.

### `shot-quality-content.tsx` (+ `shot-quality-lazy.tsx`)

Loaded via `next/dynamic` (`ssr: false`). SWR `/api/shot-quality?season=…`
(`keepPreviousData: true` so switching seasons doesn't flash empty). Owns:
- `SeasonSelector` + `EncodingToggle` (`value` = sequential expected-eFG% / `diff` = divergent
  GBM−baseline).
- Per-season color-scale domains derived from the returned cells (5th/95th percentile of
  expected-eFG% for the sequential ramp; a 90th-percentile-of-well-sampled-cells absolute-diff
  bound, clamped to `[0.03, 0.15]`, for the divergent ramp — sparse tiny-attempt cells are
  excluded so they can't flatten the diff scale).
- `ShotCourt` — an SVG half-court (custom `sx`/`sy` coordinate transform, see below) that
  renders one square marker per grid cell, sized by `sqrt(fga / p95(fga))` (clamped
  `[0.3, 1.18]` ft) and colored by the active encoding; larger markers draw first so small ones
  stay visible on top. `value` mode renders **two** courts side by side (baseline vs. GBM);
  `diff` mode renders **one** court (GBM − baseline) — a deliberate simplification from the
  two-court diff view sketched in the original design doc.
- A collapsible `MethodologyNote` (`<details>`) explaining baseline vs. GBM, the ~1%
  calibration-not-accuracy framing, what "shots-above-expected" means, and that the surface is
  trained on prior seasons only (expanding window) with no defender-distance/shot-clock signal.

### `hooks/useLiveGames.ts`

Subscribes (via `getSupabaseBrowser()`) to Supabase Realtime `postgres_changes` `UPDATE`
events on the `public.games` table, filtered to the tracked `gameIds` (O(1) `Set` lookup).
Returns `{ liveUpdates: Record<id, {homeScore, awayScore, status}>, recentlyUpdated:
Set<id> }`; `recentlyUpdated` clears after 600ms to drive the flash. No-ops (returns empty
maps) when the Supabase env vars are unset (client is `null`).

### `components/ui/*` — shadcn primitives

Only two primitives survive: `button`, built on **`@base-ui/react`** with
`class-variance-authority` variants, and `skeleton`, a plain `div`. (`@base-ui/react` is
also used directly for the `onboarding-guide` dialog.) `cn()`
(`src/lib/utils.ts`) merges classes with `clsx` + `tailwind-merge`. `components.json` pins
the shadcn `base-nova` style, `neutral` base color, CSS variables, and the `@/components`,
`@/lib`, `@/hooks`, `@/components/ui` aliases.

## Design system — "Broadcast" (light)

The app is **light-only** — a daylight broadcast / editorial box-score language: a warm
off-white paper ground, white cards lifting on hairline borders, near-black text, team colors
carrying each matchup, monospace data values, a burnt-amber "live" accent, and NBA red/blue kept
strictly as the **fatigue / rest-advantage data semantics** (red = more fatigued, blue = more
rested), darkened for legibility on white. `<html>` carries **no** `dark` class and `globals.css`
sets `color-scheme: light`. Every color flows through the `--term-*` CSS tokens, so reskinning the
tokens in `globals.css` re-themes the whole app; component code should read tokens, never
hard-code hexes.

> **Theme lineage:** "Bloomberg Terminal" (light) → "Broadcast" (dark) → **"Broadcast" (light,
> current — flipped 2026-07-17 for legibility)**. Each redesign kept the same flat/token
> architecture and the same components; only token values moved.

### Color tokens (verified — light values in `globals.css :root`)

| Token / Hex | Role |
|-------------|------|
| `--term-bg #FAF9F6` | page background (warm off-white paper) |
| `--term-surface #FFFFFF` | card / panel fill (lifts off the page) |
| `--term-surface-2 #F0EEE9` | stat tiles, inset panels, table headers, hover |
| `--term-border #E2DED6` | borders / dividers |
| `--term-hairline #D4CFC5` | subtle inner rules / center markers |
| `--term-text #111318` | primary text (near-black) |
| `--term-text-muted #5A626C` | muted / label text |
| `--term-text-dim #363B42` | secondary text (darker than muted) |
| `--term-red #DC2626` | high confidence · danger · "higher fatigue" |
| `--term-blue #2563EB` | primary · med confidence · "lower fatigue" · charts · active data |
| `--term-bar-base #E3DFD6` | the coin-flip portion of a win-rate bar — warm neutral, not a second blue (see Charts below) |
| `--term-hardwood #A16207` | **non-data chrome only** — off-season banners, amber CTA hover |
| `--term-amber #C2410C` | **live** dot + active nav underline (broadcast accent) |
| `--term-pos #15803D` / `--term-neg #DC2626` | win / loss, up / down |
| `--term-neutral #6B7280` | neutral semantic / badge outlines |

> On light, "raised" reads as *slightly tinted*, not lighter: `--term-surface` is pure white and
> `--term-surface-2` steps **down** into warm gray — the inverse of the dark theme's ramp.

> Team colors (matchup + upcoming cards) come from `src/lib/nba-team-colors.ts`
> (`getTeamColors(abbr)` → `{ primary, secondary }`, neutral fallback). They are brand chrome
> only — the top color band, logo chips, and identity dots — and never override the red/blue
> fatigue semantics. Chip text runs through `readableTextOn(hex)` (same module), which picks
> `#FFFFFF` or `#111318` by the fill's sRGB luminance — without it, light primaries (SAS
> `#C4CED4`) would render white-on-white. shadcn semantic tokens in `:root` are set to matching
> light values (`--background #FAF9F6`, `--foreground #111318`, `--card #FFFFFF`,
> `--primary #2563EB`, `--destructive #DC2626`, `--accent #A16207`); chart palette
> `--chart-1..5` = blue / red / hardwood / emerald / violet. **The `--chart-*` palette is
> shadcn scaffolding that no chart in this app reads** — recharts pulls `--term-*` directly.
> Do not adopt it without re-measuring: `--chart-5` violet against `--chart-1` blue separates
> by ΔE 0.4 for deuteranopia. `--term-blue` ↔ `--term-red` is the only pair in the codebase
> that passes every separation check (ΔE 38.2 normal vision, 29.9 protanopia), which is why
> the fatigue / rest-advantage semantics stay on exactly those two and nothing is added
> alongside them.

### Typography

- **Body / sans:** Inter (`--font-inter`).
- **Headings (`h1–h3`):** Outfit (`--font-heading` / `font-heading` utility), bold + tight
  tracking.
- **Data / labels:** the `.mono` class = `var(--font-plex-mono)` (**IBM Plex Mono**, loaded by
  `next/font/google` in `layout.tsx`) with a `ui-monospace` fallback, and
  `font-variant-numeric: tabular-nums` applied on the class itself. TS/TSX style objects that
  need the same stack import `MONO_FONT_STACK` from `src/lib/terminal-styles.ts` rather than
  re-declaring it — this includes every recharts `tick.fontFamily`.
- This replaced `'Courier New'`, which set roughly 80% of the visible text: a metrically loose
  typewriter face with weak tabular figures, and the largest single source of visual
  cheapness in a dense numeric UI. `next/font` ships with Next.js, so the swap added **no npm
  dependency**.

### Sentence case vs. caps

Uppercase mono is for **labels of about three words or fewer** — stat-card captions, table
headers, section dividers, badges. Anything that is a *sentence* is set in Inter, sentence
case, at 15px: `PageHeader` descriptions, the `/analysis` and `/` intro paragraphs, the
playoffs OOS-vs-in-sample explainer, and the shot-quality `MethodologyNote`. All-caps removes
word-shape cues and measurably slows reading past a few words.

### Focus

One app-wide indicator, defined once in `globals.css`:

```css
:focus-visible { outline: 2px solid var(--term-blue); outline-offset: 2px; }
```

`--ring` is a **solid** `#2563EB`. It was `rgba(37, 99, 235, 0.45)` and further halved by an
`outline-ring/50` applied to `*`, which composited to 1.97:1 on white — under the 3:1 non-text
minimum. Components may **reinforce** focus with a ring or a background tint but must not
replace it: `focus-visible:outline-none` was removed from `matchup-card`, `playoffs-content`,
`analysis-content` (explorer rows), `explore-game-detail-modal` and `shot-quality-content`
(the methodology `<summary>`, which had focus removed with no replacement at all). The
onboarding dialog keeps its explicit amber rings, which are a real visible indicator.

### Charts (`analysis-content.tsx`)

Both backtest bar charts are **zero-based** — `domain={[0, yMax]}`, where `yMax` comes from
`chartMaxPct()` (the greater of 80 and the data's peak rounded up to a whole 20-point tick
step, so no bar can be clipped and the top gridline is always a labelled tick — `ticks` comes
from `chartTicks()` because Recharts, left to improvise on a `[0, 70]` domain, emitted
0/20/40/60 plus an orphan 70). They previously clipped to `[45, 75]` and `[40, 70]`, which
renders a 4.8-point edge as a landslide.

Legibility is recovered without the dishonest axis by splitting each bar at the baseline:
`splitAtBaseline(winPct)` yields `base = min(winPct, 50)` and `edge = max(0, winPct - 50)`,
stacked under one `stackId`. The `base` segment is `--term-bar-base` ("what a coin flip
already gives you") and the `edge` segment is solid `--term-blue` ("the edge the model
finds") — so the measured edge is both the only saturated mark and the part with length.
`BASELINE_PCT = 50` is drawn as a **hairline dashed** `--term-neutral` `ReferenceLine`
(1px, `4 4`, 0.7 opacity) **declared after the bars** so it renders on top, with no inline
"COIN FLIP" text; the neutral/blue seam already marks 50% on every bar, so the line only
confirms the rule. A `BaselineLegend` names all three marks. Tooltips read the win rate off the datum, not off
`payload` — with two stacked series, iterating `payload` would print the split halves — and
each adds a `±N.N PP VS COIN FLIP` line.

### Card / accent patterns

- Broadcast cards: `var(--term-surface)` fill, `1px solid var(--term-border)`,
  `var(--term-radius)`. Many add a **2px left-border accent** via `TERM_ACCENT`
  (`.neutral` default, `.red` for errors/high-confidence, `.blue` for highlights).
  `TERM_ACCENT.tan` is **not** used in any data role — see the token table above.
- Uppercase mono labels with wide letter-spacing (`0.04–0.12em`) for "technical" headers.
- Animations (`globals.css`): `fadeInUp` (card entrance, staggered by `index * 40ms`),
  `scoreFlash` (live-update glow).

### Shot chart / court geometry (`shot-quality-content.tsx`)

The API returns an **unfolded**, rim-origin grid (`cellX = floor(LOC_X/10)`, `cellY =
floor(LOC_Y/10)`, 1-ft cells — see `scripts/aggregate_shot_grid.py` in
[DATA_PIPELINE.md](DATA_PIPELINE.md)). The component derives court-space feet from a cell as
`x_ft = cellX + 0.5` (center-origin, left negative) and `court_y = RIM_Y + cellY + 0.5` with
`RIM_Y = 5.25` (rim center, ft from baseline), then maps feet → SVG viewBox units with local
`sx`/`sy` helpers (`PX = 12` px/ft, half-court `50 × 47` ft + 1ft padding). `CourtLines` draws
the boundary, paint, free-throw circle, backboard/rim, restricted-area arc, three-point line
(two straight corner segments + an arc computed from `asin(22 / 23.75)`), and the center-circle
arc — all derived geometrically, not hardcoded pixel paths. Color ramps (endpoints
darkened to read on the white `#FFFFFF` court): sequential tan→blue
(`#A16207` → `#2563EB`) for expected-eFG%, divergent blue→neutral→red
(`#2563EB` → `#E5E7EB` → `#DC2626`) for the GBM−baseline diff. The diff-neutral is
near-white so "models agree" cells recede *into* the court (on the dark theme it was a
near-black `#2A313A` for the same reason).

### Two-layer header

Sticky header = top status bar (28px) + main nav (44px); see `nav-bar.tsx` above. Footer
mirrors the broadcast aesthetic with mono metadata.

### Brand mark

The FullCourt logo ("Angled Divider" court) lives in `src/components/court-mark.tsx`
(`<CourtMark size>` — a tilted center line splitting a blue/rested half from a red/fatigued
half, with an amber center circle; fixed brand hexes, not theme tokens). It renders in the
nav status bar, so its strokes are **near-black `#111318`** to read on the light chrome.

> **Off-page brand assets stay dark by design.** The favicon (`src/app/icon.svg`) and the
> social/OG card (`src/app/opengraph-image.tsx`) are self-contained badges that carry their own
> dark ground (`#12151A` / `#0A0B0D`) and keep the pre-flip brightened palette (`#3B82F6`,
> `#E5484D`, `#F5A623`, `#F2F4F7`). They never sit on the app's page background — a browser tab
> and a link-preview card render on someone else's chrome — so they stay legible as-is and were
> deliberately left untouched in the light flip. Do **not** "fix" them to match the in-app mark.
