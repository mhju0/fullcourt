# Frontend

Pages, components, and the design system. All hex values, fonts, and props are taken from
the actual code (`src/app/`, `src/components/`, `src/app/globals.css`).

## App shell — `src/app/layout.tsx`

- Fonts via `next/font/google`: **Inter** (`--font-inter`, weights 400/500/600 — body/sans),
  **Space Grotesk** (`--font-space-grotesk`, weights 400/500/600/700 — headings, exposed as the
  `font-heading` utility), and **IBM Plex Mono** (`--font-plex-mono`, weights 400/600/700 — all
  data, labels and chart ticks). `<html>` gets all three font variables + `antialiased`.
  - **Space Grotesk replaced Outfit (2026-07-28).** Outfit is geometric and reads heavy at the
    sizes headings actually use — the page title carried the same visual weight as the stat
    numbers below it. Space Grotesk sets a lighter line, so the base heading weight dropped
    `font-bold` → `font-medium` in the same change. Outfit is **still bundled** under
    `src/app/fonts/` for the OG card: that wordmark is a fixed brand asset, and a logotype does
    not have to share the UI's display face. It is no longer downloaded by the client.
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

Seven product routes ship today — `/`, `/season`, `/analysis`, `/playoffs`, `/schedule`,
`/shot-quality`, `/shooting` —
plus a branded App Router `not-found` page for unknown paths. (This count was stale at "five"
before this section was last touched: it omitted `/shooting`, which had already shipped.)
`/upcoming` was retired: it is a permanent redirect to `/` (`next.config.ts`), whose UPCOMING
view now renders what it used to.

### `/` — Games (`src/app/page.tsx`, client component)

Two views behind a toggle (`role="group"`, `aria-label="Games view"`), held in local `view`
state rather than a query param — the nav no longer links to `/upcoming`, so the only inbound
deep link is an old bookmark, which the redirect lands on the default BY DATE view.
**BY DATE** is the state machine below; **UPCOMING** renders `<UpcomingContentLazy />` in place
of the stat row, filter panel and matchup list.

Browsing state lives in **`useGameSlate`** (`src/hooks/useGameSlate.ts`), a thin shell over the
pure reducer in `src/lib/game-slate-machine.ts`. The page holds no fetch, no date arithmetic and
no loading flags of its own.

- **`selectedDate` is the only stored position; the month is derived from it** (`slateMonth`).
  Two values that must agree can disagree, which is why the previous version needed a
  `setState`-during-render block to reconcile `month` with `selectedDateKey`. A derivation
  cannot disagree with itself, so crossing a month boundary with the arrows needs no sync step.
- **Days are fetched per season, not per month** — `/api/games/dates?season=…` with no `month`
  param, filtered in memory. A month click therefore resolves synchronously, so there is no
  round trip for `pendingSelectionResetRef` to arbitrate and no first-fetch special case for
  `isFirstDatesFetchRef` to flag. Both refs are gone. Selecting a day fetches
  `/api/games/{date}`; both requests use `AbortController`.
- Because the day list is season-wide, months a season never played (the 1998-99 and 2011-12
  lockouts) are knowable, so those tabs **disable** instead of round-tripping to an empty result.
- **Status is one tagged value**, not four booleans: `loadingDays` · `daysError` · `noDays` ·
  `loadingSlate` · `slateError` · `slateEmpty` · `slateReady`. The old shape allowed
  `loadingDates && errorDates && !errorGames`, which rendered nothing under its own MATCHUPS
  header and needed an `errorGames ?? errorDates` patch. That combination now has no name.
  The matchup region is one exhaustive `switch` closed with a `never` assignment; `calendarView`
  projects the seven statuses onto the chip region's four renderings so the switch is written once.
- A slate response for a date the user has already left is **dropped by the reducer**, an
  out-of-order guard the `AbortController`-only version lacked.
- `useLiveGames(gameIds)` is folded into the hook; each returned game carries `isScoreFlashing`
  and the score/status overlay already applied.
- `initSlate` freezes "today" (ET) and the pre-selection fallback month at mount — constants,
  not state, so neither can drift.

Initial day selection still uses `pickDefaultGamesDate` (today if it has games; else the first
upcoming October date at season start; else nearest / last available).
- Pieces: heading eyebrow `REST ADVANTAGE DASHBOARD` + `<h1>Games</h1>`; the BY DATE/UPCOMING
  toggle;
  `StatSummaryRow` (GAMES ON THIS DATE, AVG REST ADV, HIGH CONF GAMES where
  `HIGH_CONF_THRESHOLD = 2.0` — three tiles, all scoped to the slate on screen; a fourth
  once carried the full-history backtest rate, which described none of the games shown and is
  stated per matchup and on /analysis instead); `useSWR("/api/analysis")` stays, since the
  matchup cards' evidence sentences are denominated from it; the shared
  a two-group control panel — **Scope** (`<SeasonSelector>` + month tabs from `slate.months`,
  disabled at `dayCount === 0`) and **Day** (`DateChip`s pre-formatted by the hook, plus the
  prev/next arrows). The old "DAYS WITH GAMES" caption is gone: the group is labelled, and each
  chip states its own count;
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
(`analysis-content.tsx`) renders `<PageHeader>` itself — `HISTORICAL BACKTEST` /
`Rest Advantage Analysis` — inside the loaded branch, so the heading arrives with the data it
describes. It used to hand-copy `PageHeader`'s markup for that; the component works fine
inside a branch.

### `/upcoming` — retired

Folded into `/` as its UPCOMING view when the nav dropped to five tabs; the route is now a
permanent redirect (`next.config.ts`). Only the route and the tab went — `/api/games/upcoming`,
`upcoming-content.tsx` and their tests are unchanged. A sixth tab was the wrong price for it:
the page and `/` render the same object (games carrying a rest edge) under different filters,
and three of the five labels would otherwise have ended in "EDGES".

### `/playoffs` — Playoff Predictor, tab renamed PLAYOFF REST (`src/app/playoffs/page.tsx`)

Server wrapper: `<PageHeader>` (`PLAYOFF REST` eyebrow + `<h1>The round before decides the round
after</h1>` + a descriptor naming the argument), then two siblings — `<PlayoffRestArgument />`
(Sections A–B, `playoff-rest-sections.tsx`) followed by `<PlayoffsContentLazy />` (the bracket).
Siblings rather than one wrapping the other, so putting the bracket first is a swap of two lines
in `page.tsx`, not a rewrite of either.

Sections A–B are a server component with no data fetching — every figure is a published
constant from `src/lib/playoff-rest-facts.ts`, so the finding renders even if the DB is down:
**A** `THE POSTSEASON HAS NO REST` (equal-rest game counts) and **B** `THE GRIND TAX`
(`playoff-grind-gap.tsx`). Each is one card, a headline number, and at most three sentences.

**B is two bars, not the 2×2 matrix it was.** `PlayoffGrindMatrix` rendered all four cells of
`PLAYOFF_GRIND_MATRIX` with a lit maximum, and asked a casual reader to decode two axes before
the finding appeared. `PlayoffGrindGap` holds the reader's own last round fixed at "closed
early" — the top matrix row — so only the opponent's grind varies, leads with the `+16.5 points`
gap, and keeps the reversal (when you went long too) as one sentence. The bar track is a full
0–100 scale; a truncated axis would draw a bigger gap than the data has.

**Trimmed to the numbers, 2026-08-01.** Two further sections used to sit here — the "isn't that
just the better team?" confound test and `WHAT THE MODEL DOES WITH IT` (the round-split accuracy
table) — and together they pushed the bracket four screens down. Both moved, in full and with
their caveats, to `/behind-the-data/playoff-predictions`, which now owns the argument; the
product page owns the numbers. `PLAYOFF_GRIND_EXOGENOUS`, `PLAYOFF_ENTRY_REST_BUCKETS` and
`PLAYOFF_BEST_OF_FIVE` are consumed there rather than here.

The bracket (`playoffs-content.tsx`) owns a season `<select>`, a `ModelResultHeader`, a
`SeasonScoreboard`, and per-round `SeriesCard` lists — each an expandable row (home-court team,
opponent, series score, a `GrindLine` naming how both sides arrived, `PICK`/`HINDSIGHT`
win-probability inline, a correctness badge) that reveals a `SeriesFeatureGrid` (seed diff /
win% diff / prior grind diff / entry rest diff / h2h diff) on click.

**Rebuilt argument-first, 2026-07-31.** The page used to open on the bracket and headline two
calibration tiles (log loss / Brier vs the base rate, sourced from
`src/lib/playoff-model-metrics.ts`). It now leads with Sections A–B so the claim reads without
any DB round trip, and the model — retrained as `logistic_grind_v2`, swapping `entry_rest_diff`
for `prior_grind_diff` — is supporting evidence rather than the headline. See the reader-facing
version at `/behind-the-data/playoff-predictions`.

### `/schedule` — Schedule Disparity (`src/app/schedule/page.tsx`)

Server component; metadata title `"Schedule Disparity"`; renders a `<PageHeader>` plus
`<ScheduleDisparityContentLazy />`. The lazy client component
(`schedule-disparity-content.tsx`) fetches `/api/schedule-disparity?season=…` via SWR and
renders, in order: a `<SeasonSelector>` over `browsableSeasons()`, a four-cell summary strip
(most favored / least favored / spread / games with an edge), the ranked **net rest edge**
list, the column guide, and the full breakdown table.

**Horizontal, not vertical.** The ranked list is 30 CSS rows, not a Recharts `BarChart` — the
bars *are* the leaderboard, so team codes sit upright and rank reads top to bottom. The
Analysis page's vertical deviation columns are right there because its x-axis is *time*; here
the axis is *rank*, where horizontal is legible and vertical forces 9px rotated labels. The
`EdgeBar` component draws both the list rows and the table's inline column, on a domain
symmetric around zero so a −8 and a +8 are equally long.

**One sign convention.** Every figure is oriented so **positive is favorable**, including the
`backToBackEdge` / `threeInFourEdge` fields, which count short-rest games *avoided* relative to
opponents. `edgeColor()` therefore maps the whole table with one rule: blue favorable, red
unfavorable, grey exactly even.

**Column guide.** A native `<details>` (`ColumnGuide`) — chosen over hover tooltips because it
opens on tap, takes keyboard focus, and is announced by screen readers.

A **provisional** season — any season with a game that is not final — shows an as-of date and a
sentence explaining that the NBA announces only 80 of 82 games before opening night and fills
the rest after NBA Cup group play. There is deliberately no cross-season ranking anywhere on
the page.

### `/shot-quality` — Expected Shot Value (`src/app/shot-quality/page.tsx`)

Server component; metadata title `"Expected Shot Value"`; renders `<ShotQualityContentLazy />`
with no page-level header of its own (the lazy content owns its own controls row). The lazy
client component (`shot-quality-content.tsx`) fetches `/api/shot-quality?season=…` via SWR and
renders a season `<select>`, an `EncodingToggle` (`EXPECTED eFG%` sequential view vs.
`GBM − BASELINE` divergent-diff view — a **single** court in diff mode, not two), and one or
two `ShotCourt` half-court SVGs depending on the toggle. See "Shot chart / court geometry"
under Design system below for the rendering details. The page carries **no methodology block
of its own** — it was a duplicate of `/behind-the-data/shot-value` and was removed 2026-07-30;
the `HOW THIS IS CALCULATED` link at the top of the page is the single door to the method.

### `/shooting` — Player Shooting (`src/app/shooting/page.tsx`)

Server component; metadata title `"Shooting by Rest"`; `PageHeader` plus
`<PlayerRestContentLazy />`. The lazy client component (`player-rest-content.tsx`) fetches
`/data/player-rest.json` — a **static asset, not an API route**, because the export changes once
a season and there is nothing for a round trip to Postgres to discover. All row-building lives in
`src/lib/player-rest.ts` so it is testable without a browser.

**Layout: expansion in place.** Clicking a player appends his seasons as rows of the browse table
itself rather than a nested table inside one cell. That is deliberate — a nested table brings its
own header, which the page's sticky header then floats over and collides with. One table means
one header, one column grid, and each season landing under the column that describes it. The
group is closed by a `Career` row summed from those same seasons; it is never read from a
separate career record, because a total printed under a column has to equal that column.

The group is marked out by three low-strength signals rather than one strong one: a tint at 3–7%
of `--term-amber`, a 2px `--term-rail` down the left edge of every row including the 2019-20
marker, and a rule above and below. Each still reads if the others fail — a single subtle tone
did not survive the dark palette, where `--term-surface-2` sits a few points off `--term-surface`.

**The filter bar is two rows, not one wrapping row** (2026-07-30). Row one is the four
`<select>` filters — Season, Volume, Team, Position — each label/control pair wrapped in its own
flex box so a wrap can never separate a label from what it names. Row two is the search box, the
`Hide noisy rows` checkbox, and the result count pushed right with `ml-auto`. Six controls plus
the count did not fit a 1440px line, and the piece that wrapped away was the count — the one
element that answers "did my filter do anything". The Season option for all seasons reads
`Career`, not `Career (all seasons)`: the longest option sizes the whole `<select>`, and the list
is visibly seasons already.

A `?player=<name>` query parameter opens that player directly, and expanding one rewrites the URL
via `history.replaceState`, so a view can be linked and shared without the route ever leaving
`/shooting`.

### `/about` — landing / explainer (`src/app/about/page.tsx`)

Deliberately unlike the rest of the app: dark ground, oversized display type, GSAP scroll
work. It explains what the product measures rather than serving data, which is why it is
**not** one of the product surfaces. Visuals are CSS and inline SVG only — no remote images —
so `img-src` in `next.config.ts` did not have to widen; GSAP is imported inside `useEffect`
so it stays out of the shared bundle.

Reachable from an `ABOUT` link in the nav row's **`Reference` landmark** and from
`WHAT THIS MEASURES` in the footer — not from the main nav, whose six-link count is asserted
in `e2e/navigation.spec.ts`. It sat in the top status bar until 2026-07-30, which proved too
quiet to be found; the reference links are now the same size and weight as a tab, and the gap
between the two groups is what says "not one of the six".

Rebuilt 2026-07-30 into **seven full-viewport sections** (`calc(100svh - var(--term-chrome-h))`
each, the
subtraction being the sticky chrome — without it every section overran the fold by the header's
height). Order: the claim, the thesis, the evidence, the five surfaces, what the score is made
of, the standard, the way in. The hero carries no buttons: they competed with the single line
the page opens on. Evidence figures come from `getHistoricalBacktest` via the server page and
are revalidated daily, because all three were hardcoded and all three had gone stale.
Headings use `font-bold` (700), not extrabold: `layout.tsx` loads Space Grotesk at
400/500/600/700, so an 800 request resolved to the 700 face anyway.

Two things on this page are easy to get wrong twice:

- **The stacking method cards dim with `filter: brightness()`, never `opacity`.** They are
  `sticky` and physically overlap, so a card at `opacity: 0.45` shows the card *beneath* it
  straight through — card 02's heading landing on card 01's paragraph. The last card is not
  animated at all, which is why the bug only ever showed on 01 and 02.
- **The five surface cards keep their copy visible at rest.** It was `lg:opacity-0` until
  hover, and five tall cards showing only a label read as a loading state, not an accordion.
  Each card now carries a mono index, its route, a `SurfaceGlyph` miniature of what that page
  draws, and the copy. Index, route and glyph are `aria-hidden`, so the link's accessible name
  stays `"<label> <copy>"` — which is what `e2e/about.spec.ts` anchors on.

Display statements on this page take **no terminal period** (`Rest is a stat`, `Five surfaces`,
`How a number earns its place`). Body copy and the scrubbing thesis keep normal punctuation —
they are prose, not statements.

Known rough edge: the light app header sits directly above the dark hero, with no transition.

### Unknown routes — `src/app/not-found.tsx`

Static server component inside the shared shell. It provides a branded 404 heading and direct
recovery links to Games and Model Results without adding a client bundle or data request.

## Components

### `/behind-the-data/*` — the reference section (7 routes)

`/behind-the-data` plus one route per model (`rest-advantage`, `schedule-edge`,
`playoff-predictions`, `player-shooting`, `shot-value`) and a shared `data-and-limits`. Real
routes rather than client-side tabs, so each method is linkable, crawlable, and deep-linkable
from the page it explains. `BehindTheDataShell` supplies the header and the section sub-nav;
`behind-the-data-parts.tsx` supplies the shared prose primitives so six pages cannot drift into
six typographic treatments of the same content.

**Colour is load-bearing here** (2026-07-30). The pages were near-uniform black-on-white and
read as one undifferentiated wall, so each primitive carries an accent and each accent means one
thing: **red** for the `Section` header band (a tinted strip with a red inset rail and a red
descriptor chip) and for `LimitList` — what a model cannot do; **blue** for the arithmetic,
i.e. `Formula` and the `ValueGrid` numbers; **gold** for `Note`, an aside qualifying the claim
above it. Accents are hairline rails over 4–7% tints, never filled blocks, so body text stays
the highest-contrast thing on the page. `ValueGrid` cells layer their tint over
`var(--term-surface)` with a `linear-gradient` rather than using it alone — the cells sit on a
1px grid painted by the parent's background, and a translucent cell let that border colour
through and turned the whole grid grey. The sub-nav's active section carries the same red
underline the main nav uses, since bolder text alone on a row of bold mono labels was no signal.

Constants are **imported from source** (`FATIGUE_CONSTANTS`, `BIG_EDGE_FATIGUE_THRESHOLD`,
`REST_DAYS_CAP`) rather than retyped, so the prose cannot drift from the code. Measured figures
that cannot be computed per page view carry the date they were measured.

`MethodLink` (`src/components/method-link.tsx`) renders the `HOW THIS IS CALCULATED` link on
each product page, resolved through `methodologyHrefFor()` — it returns null for surfaces with
no documented section, so adding one to `BEHIND_THE_DATA_SECTIONS` is all it takes.

> **Prose spacing has a rendered test.** A JSX text node that wraps to the next line silently
> loses its leading space, producing "30days" and "backtest.The". It is invisible in review
> because the source looks correct, so `e2e/behind-the-data.spec.ts` sweeps the rendered `<p>`
> and `<li>` text of every reference page for run-together words. Formula blocks are excluded —
> camelCase inside them is code.

### `/referees` — foul style

Returned 2026-07-31 asking a different question. The page was stubbed on 2026-07-30 because its
original question — does any official tilt the whistle home? — came back inside noise, and a
table of muted cells invites readers to find names in it anyway. Crew *rest* was tested next and
was also a null. What does separate officials is the **mix** of fouls they call, and that
survives baselining per season, per arena, and on share rather than count.

`src/data/referee-foul-style.json` (written by `scripts/fetch_officials.ts` alongside the older
`referee-whistle.json`) holds one row per official: deviation in percentage points from the
league's own seasonal mix, per foul type, each with a z-score at that official's sample size.
`referee-style-content.tsx` renders it as a sortable table; `src/lib/referee-foul-style.ts` owns
the types, the |z| ≥ 2 emphasis rule and the 200-game publication bar.

**Three things were built and removed, all for the same reason — this is a page to browse, not
to study.** A leaderboard strip naming the most and fewest of each type said only what sorting a
column already says. Per-column rank printed inline as `+23% #1` put two competing figures in
every cell. Moving that rank into a native `title` tooltip was worse, not better: it takes about
a second of motionless hover to appear, nothing signals that it exists, and it does nothing on
touch — present in the DOM and absent in practice. Emphasis alone — blue above the league, red
below, muted inside noise — carries the scan, and a sort answers the ranking question in a click.

**The stored unit is not the displayed one.** The JSON holds percentage-point deviations, but
`relativePct` scales each against its own league share before render, so a cell reads `+23% #1`
rather than `+1.39pp`. A percentage-point gap is unreadable without its baseline — the same
+1.39 is a rounding error on shooting fouls at 50.2% and the largest effect in the data on
offensive fouls at 6.1%. The trade, stated on the page: relative change flatters the rare types,
so the widest technical-foul gap is +26% but only about a fifth of a whistle a game.

Three constraints the page states rather than hides. A call cannot be attributed to one of three
officials, so every figure is roughly a third of the real effect — crews barely repeat, which
makes colleagues noise rather than bias. Foul *type* is classified by the arena scorekeeper, so
arena was tested as a confound and found orthogonal. And **crew chief is only marked from
2024-25**: ESPN carries no role label, its `order` field matches the NBA's published crew chief
10/10 in 2024-25 and 2025-26 but fails earlier, so the *As chief* column counts those seasons
alone. It is style, not bias, and the copy says so.

### `nav-bar.tsx` — two-layer header (sticky, `z-50`)

1. **Brand bar** (52px, `var(--term-surface-2)`, bottom border `var(--term-border)`):
   a `<CourtMark size={34}>` + the wordmark + a hairline rule + `NBA ANALYTICS PLATFORM`
   (mono 10px, muted, hidden below `sm`), wrapped in a link to `/`.
   The wordmark is **22px Space Grotesk 700**, two-tone — `FULL` in `var(--term-text)`,
   `COURT` in `var(--term-red)`. It was 11px mono until 2026-07-30, i.e. *smaller than the tabs
   beneath it*, so the one element naming the product read as the least important thing in the
   header; it is now sized as a logotype in the same display face as every page title. The
   `aria-label="FullCourt home"` keeps the accessible name one string across the split spans,
   which is what `e2e/behind-the-data.spec.ts` clicks. The wordmark was inert until 2026-07-30, the
   one piece of chrome people reflexively click. Home is `GAMES`, not `/about`: a logo landing
   on an explainer breaks the "take me back to the product" contract.
   The right side is now empty. It previously held `currentDisplaySeason() + " SEASON"`, removed
   2026-07-30 — it was not interactive, and on a site covering four decades of seasons it implied the whole
   product was scoped to one — and an `ABOUT` link, which moved to the nav row.
   There is **no LIVE dot** — it was gated by
   a `HAS_LIVE_GAMES` constant hardcoded to `false`, so it never rendered in any state; the
   dead branch was removed. Per-game LIVE status is shown by `MatchupCard` instead.
2. **Main nav** (44px, `var(--term-surface)`, bottom border `var(--term-border)`) holds **two
   navigation landmarks in one row**. Left, `aria-label="Main navigation"`: the six direct tabs
   from `DIRECT_NAV_ITEMS` (`src/lib/primary-navigation.ts`) — `GAMES → /`,
   `SEASON REPORT → /season`, `SCHEDULE EDGE → /schedule`, `MODEL RESULTS → /analysis`,
   `PLAYOFF REST → /playoffs`, `PLAYER SHOOTING → /shooting` — followed by the `OTHER`
   menu holding `SHOT VALUE → /shot-quality` and `REFEREE EFFECT → /referees`. Right,
   `ml-auto` and `aria-label="Reference"`: `ABOUT → /about` and
   `BEHIND THE DATA → /behind-the-data`. Two landmarks rather than one so the reference links
   never inflate the asserted six-link count, and so screen readers announce them as what they
   are.
   **The surface list on `/about` is *not* derived from `DIRECT_NAV_ITEMS`** — `SURFACES` in
   `src/components/about-content.tsx` is a separate, hand-maintained array. An earlier version
   of this doc claimed the two were linked, which was false and let a tab addition on this
   branch ship without `/about` in sync for a time. There is no shared source: adding or
   renaming a direct tab requires a matching hand edit to `SURFACES`, and `SHOT VALUE` is
   correctly absent from it only because someone left it out on purpose, not because the list
   knows it belongs to `OTHER_NAV_ITEMS`.

   **Below ~900px the row is a horizontal scroll strip** (`.fc-nav-scroll`, `overflow-x-auto`,
   `shrink-0` + `whitespace-nowrap` on every link), added 2026-07-30. Eight links do not fit a
   390px line and they used to take the whole document sideways with them: measured 238px of
   horizontal page scroll, `SCHEDULE EDGE` squeezed to 62px and wrapping inside a 44px box, and
   both reference links off screen. `ml-auto` still right-aligns the reference group whenever
   the content fits, so the desktop row is byte-for-byte what it was. A strip rather than a
   drawer because the whole nav is eight short labels — a hamburger would hide all eight behind
   a tap to solve what a swipe solves. The scrollbar is hidden in `globals.css`: at 44px tall it
   would land on the active tab's underline, which is the only state the row carries. The
   `OTHER` popup is unaffected — `Menu.Portal` renders it outside this container, so the
   `overflow` cannot clip it. `e2e/navigation.spec.ts` asserts the page does not scroll
   sideways at 390px, that the strip is what overflows instead, and that `BEHIND THE DATA` is
   still clickable at that width.
   Bare noun phrases, no time words: mainstream NBA navs (ESPN, CBS) name the thing and
   leave time to a date picker, and NN/g's category-name guidance rules out both jargon
   (`EDGES`) and generic labels (`ANALYSIS`, `DATA`). Labels are also checked against *borrowed*
   meaning — bare `SCHEDULE` means a game list on every other sports site, which is this site's
   `GAMES`, so the disparity tab keeps its qualifier; bare `SHOOTING` means shot location on
   Basketball-Reference and NBA.com, which is `SHOT VALUE`, so the player tab keeps its own. Precise terms (`xeFG%`, `SCHEDULE
   DISPARITY · NET REST EDGE`) stay in the page eyebrows, where context decodes them.
   The active link gets an amber
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
- Beneath the card body, `buildRestAdvantageEvidence` (`src/lib/rest-advantage-display.ts`)
  renders one sentence giving the rest-advantage number its historical hit rate, sample size
  and distance from the 50% coin flip. Buckets are **cumulative**, so a 4.1 gap resolves to
  "gaps of 3 or more"; a called gap below 2 falls back to the overall rate worded "any
  measurable gap". Neutral matchups, a missing `/api/analysis` payload, or any class with a
  zero denominator render nothing at all.
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

Loaded via `lazyContent` (see below). Uses SWR:
- `/api/analysis` for the main payload; `/api/analysis?seasonMinRA=<n>` when a season RA
  threshold pill is active.
- Renders terminal stat cards, a **Win Rate by RA Threshold** Recharts bar chart (clicking a
  bar sets the explore filter and smooth-scrolls to the table), a **Home Team More Rested**
  breakdown, a **Win Rate by Season** chart with RA-threshold toggles, a **Key Insight**
  callout (RA ≥ 5 / ≥ 7), and the `ExploreGames` table.
- `ExploreGames`: JSX only. Its state lives in `explore-games-machine.ts` (pure, no React)
  behind `useExploreGames` (`src/hooks/useExploreGames.ts`), which owns the single SWR call to
  `/api/games/search` (`EXPLORE_PAGE_SIZE = 20`, `keepPreviousData`). The machine holds the four
  filters, the page, the applied drill token and the detail-modal pair; `exploreSearchKey` builds
  the URL and `pageWindow` derives "showing X–Y of Z". Any filter change returns to page 1 in one
  place. Same shape as `game-slate-machine.ts`, and tested the same way —
  `src/lib/__tests__/explore-games-machine.test.ts`, no DOM.

### `upcoming-content.tsx` (+ `upcoming-lazy.tsx`)

Loaded via `lazyContent` (see below). Mounted by `/`'s UPCOMING view since `/upcoming` was
retired. SWR `/api/games/upcoming?season=<currentDisplaySeason()>&minRA=…`,
plus a second SWR call to `/api/analysis` for the historical column.
RA filter pills, an off-season empty state (`OffSeasonEmptyState`), and a table of upcoming
games with an "edge" badge (home edge blue, away edge red). Rendered in the **broadcast
style** (`var(--term-surface)` card fill, `1px solid var(--term-border)`, `.mono` labels) —
consistent with Games / Model Results.

### `explore-game-detail-modal.tsx`

Portal-rendered modal (`createPortal` to `document.body`). SWR `/api/game/{id}`, with a
nav-history stack so clicking a "recent game" drills into that game and Back returns. Escape
and backdrop close it. Renders `GameStatusRow`, `RaBadge`, two `FatigueDetailColumn`s, and
`RecentResultsList` (last-5 W/L) per team. Rendered in the **broadcast style**
(`var(--term-surface)` panel, `1px solid var(--term-border)`, `.mono` labels, a
`var(--term-surface-2)` inset breakdown surface).

### `playoffs-content.tsx` (+ `playoffs-lazy.tsx`)

Loaded via `next/dynamic` (`ssr: false`). SWR `/api/playoffs?season=…`. Renders, in order:

1. `ModelResultHeader` — two `CalibrationTile`s (log loss, Brier: model value, the base rate it
   is measured against, and the % improvement) plus two prose lines, one naming what the model is
   good at and one naming what it is not. Reads every figure from
   `src/lib/playoff-model-metrics.ts`; takes **no props**, because these are pooled model
   constants rather than per-season query output.
2. `SeasonScoreboard` — the selected bracket only, as a `ScoreLine` (`predictedCorrect /
   knownWinnerGames` + accuracy%), explicitly captioned with how far one flipped upset moves it.
   Shows `PREDICTED IN ADVANCE` normally, and `HINDSIGHT FIT` **instead** (never beside) when the
   season has no walk-forward coverage.
3. A `RoundSection` per playoff round, each holding expandable `SeriesCard`s: header row =
   home-court team (`HC` chip) vs. opponent, series score, `MethodInline` `PICK`/`HINDSIGHT`
   win-probability reads, and a `CorrectnessBadge` (✓ CORRECT blue / ✗ UPSET red / — pending
   neutral, with a "(HINDSIGHT)" tag when no forecast backed the verdict). Expanding a card
   reveals `SeriesFeatureGrid` (seed diff, win% diff, entry rest diff, h2h diff; sign convention
   = home-court minus opponent).

Same terminal-card / `.mono` styling as the rest of the app. `MethodComparisonHeader` /
`MethodMetricCard` and the `OOS`/`IN` labels were removed in the 2026-07-30 repositioning
described under `/playoffs` above.

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
The baseline/GBM framing, what "shots-above-expected" means, and the expanding-window
training all live on `/behind-the-data/shot-value` — this component states none of it twice.

### `hooks/useLiveGames.ts`

Subscribes (via `getSupabaseBrowser()`) to Supabase Realtime `postgres_changes` `UPDATE`
events on the `public.games` table, filtered to the tracked `gameIds` (O(1) `Set` lookup).
Returns `{ liveUpdates: Record<id, {homeScore, awayScore, status}>, recentlyUpdated:
Set<id> }`; `recentlyUpdated` clears after 600ms to drive the flash. No-ops (returns empty
maps) when the Supabase env vars are unset (client is `null`).

### `components/lazy-content.tsx`

`lazyContent(load, skeleton)` — `next/dynamic` with `ssr: false` and the given skeleton as its
`loading`. Every page's content component is loaded this way: these surfaces are client-only
state fed by a fetch, so server-rendering them would ship markup React immediately replaces.
The seven `*-lazy` modules remain separate files because `dynamic()` with `ssr: false` cannot
be called from a server component and the pages are server components — but each now carries
only its skeleton, not a restatement of the loader.

### `components/ui/*` — shadcn primitives

Two shadcn primitives survive — `button`, built on **`@base-ui/react`** with
`class-variance-authority` variants, and `skeleton`, a plain `div` — alongside one hand-written
primitive that is not shadcn's, `message-card` (below). (`@base-ui/react` is
also used directly for the `onboarding-guide` dialog.) `cn()`
(`src/lib/utils.ts`) merges classes with `clsx` + `tailwind-merge`. `components.json` pins
the shadcn `base-nova` style, `neutral` base color, CSS variables, and the `@/components`,
`@/lib`, `@/hooks`, `@/components/ui` aliases.

### `components/ui/message-card.tsx` — the failure/empty card

`MessageCard({ tone, title, body? })` is what a surface renders instead of its data.

It was born inside `shot-quality-content.tsx`, where it already had the right shape, and served
one file. Everywhere else each module decided for itself: nine branches in five visual shapes —
two full cards, a dashed box doubling as the empty state, a bare `<p>` that replaced the whole
page, a 13px line off the type scale, and a `<td colSpan>` — one of which discarded the error
message entirely.

`tone="error"` carries `role="alert"`; `tone="muted"` does not. That asymmetry is the point: a
failure that visibly replaced the page announced nothing to a screen reader on six of the eight
surfaces, while an empty result is not an alert — nothing went wrong.

Deliberately **not** used for three things a card would misrepresent:

- the dashed in-place empties (`termDashedEmptyStyle`), which stand where a chart or a bar list
  would be and two of which already sit inside a card — a second filled panel reads as content,
  not absence;
- the Explore Games `<tbody>` states, which need a `<td colSpan>`; three sites, one file;
- every skeleton, each of which mirrors its own module's shape.

`errMsg(error)` (`src/lib/fetcher.ts`) is the companion: the message to show for a thrown value.
It lives next to the thing that throws, and replaced eight per-surface copies of the same
ternary — each with a differently worded fallback that could never render, since `apiFetcher`
only ever throws an `Error` and SWR rethrows it unchanged.

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
| `--term-hardwood #A16207` | **non-data chrome only** — off-season banners, amber CTA hover |
| `--term-amber #C2410C` | **live** dot + active nav underline (broadcast accent) |
| `--term-pos #15803D` | win / up |
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
- **Headings (`h1–h3`):** Space Grotesk (`--font-heading` / `font-heading` utility), **medium**
  (500) + tight tracking (`-0.025em`). The base layer in `globals.css` supplies both, so pages
  set only the size — a page heading should not need to restate weight or family.
- **Data / labels:** the `.mono` class = `var(--font-plex-mono)` (**IBM Plex Mono**, loaded by
  `next/font/google` in `layout.tsx`) with a `ui-monospace` fallback, and
  `font-variant-numeric: tabular-nums` applied on the class itself. TS/TSX style objects that
  need the same stack import `MONO_FONT_STACK` from `src/lib/terminal-styles.ts` rather than
  re-declaring it — this includes every recharts `tick.fontFamily`.
- **Signed numbers:** every column whose sign is doing work — a schedule edge, a deviation from
  the coin flip, a model coefficient, a swing — renders through `signedNumber(value, decimals?)`
  (`src/lib/signed-number.ts`), never a hand-rolled template. Two rules, no options: **U+2212,
  never the ASCII hyphen** (the hyphen-minus reads short and sits off the numeral's baseline in
  a mono face), and **an exact zero is bare** (an even schedule points nowhere, and a sign would
  claim it did). Units stay at the call site, because every numeric column names its own. It
  replaced eleven copies that had drifted three ways: two emitted the hyphen, three signed an
  exact zero, one could render `−0`.
- This replaced `'Courier New'`, which set roughly 80% of the visible text: a metrically loose
  typewriter face with weak tabular figures, and the largest single source of visual
  cheapness in a dense numeric UI. `next/font` ships with Next.js, so the swap added **no npm
  dependency**.

### Page rhythm

Every page is built the same way, so moving between tabs does not feel like moving between
products:

- **Page title = 32px**, the "hero stat value" slot in `terminal-styles.ts`. At 24px a title
  was the same size as the stat numbers under it. `PageHeader` sets it for every page —
  `/schedule`, `/playoffs`, `/shot-quality`, `/shooting`, and now `/` and `/analysis`, which
  used to hand-copy its markup. Its one prop beyond the copy is `descriptionMaxWidth`
  (default `42rem`); `/` passes `34rem`.
- **`gap-12` between chapters** — heading, controls, results — on the page's top-level column,
  with tighter spacing inside anything that belongs together. A uniform `gap-4` gave a heading
  the same separation as two halves of one control panel. Loading and error branches carry the
  same `gap-12` so the layout does not shift when data lands.
- **Stat tiles take a 2px rule on the *top* edge**, not the left. As a left border a row of
  tiles reads as a list with coloured bullets; along the top edge it reads as a row of
  measures. Single centred callouts (error cards, "key insight") keep the left rule — they are
  one statement, not a row.
- **Cards that expand lift 2px on hover** (`hover:-translate-y-0.5`), cancelled under
  `motion-reduce`. Do not pair this with a `hover:border-*` class on `MatchupCard` or the
  playoff `SeriesCard`: both set `border` as an inline style, which beats any non-`!important`
  class rule, so such a hover silently does nothing.

The Games filter panel's `Scope` / `Day` grouping is deliberately **not** carried to the other
pages — it exists because that page has three interacting controls. The others have one or two,
already self-labelled.

### Sentence case vs. caps

Uppercase mono is for **labels of about three words or fewer** — stat-card captions, table
headers, section dividers, badges. Anything that is a *sentence* is set in Inter, sentence
case, at 15px: `PageHeader` descriptions, the `/analysis` and `/` intro paragraphs, the
playoffs calibration-vs-accuracy explainer, and the reference pages' `Prose`. All-caps removes
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
`analysis-content` (explorer rows) and `explore-game-detail-modal`. The
onboarding dialog keeps its explicit amber rings, which are a real visible indicator.

### Charts (`analysis-content.tsx`)

Both backtest bar charts are **deviation columns**: `toDeviation(winPct)` plots
`winPct - 50` in percentage points, so **zero is the coin flip** and the bar's length is the
measured edge itself. `deviationFill()` colors the two poles — `--term-blue` above,
`--term-red` below, `--term-neutral` at exactly zero — and `ReferenceLine y={0}` is drawn
**after** the bars as solid `--term-text` at 1.5px. That rule is the axis, not an annotation,
which is why it is the one assertive line on the chart.

`deviationScale()` derives a signed domain plus evenly spaced `ticks` from the data.
Both are required: Recharts left to improvise emitted 0/20/40/60 **plus an orphan 70**, and
any hardcoded ceiling clips — the RA ≥ 7 season series runs **−11.0 to +25.0 pp**. The step
comes from `TICK_STEP_CANDIDATES` (2 / 5 / 10), the smallest that keeps the axis under
`MAX_TICK_INTERVALS`. `signedNumber()` (`src/lib/signed-number.ts`) signs the ticks (`+10` / `0`
/ `−10`, U+2212) — the site-wide formatter, not a local one, so a hyphen cannot creep back into a
single chart. It is wrapped as `tickFormatter={(v) => signedNumber(v)}` rather than passed by
reference: Recharts types the prop as `(value, index) => string`, so a bare reference feeds the
tick index into `decimals` and renders `+10`, `+20.0`, `+30.00` down one axis.

`minPointSize={minBarSize}` gives a **dead-even** slice a 2px stub. Its true height is 0px, so
without it the bar vanishes and reads as missing data — and it is real: RA ≥ 7 in 2011-12 went
17/34. Tooltips lead with the plotted deviation and carry the absolute win rate underneath,
since the axis no longer shows it anywhere.

**Three earlier encodings, and why each was wrong.** The axes once clipped to `[45, 75]` and
`[40, 70]`, which renders a 4.8-point edge as a landslide. That was replaced by a zero-based
bar split at the baseline into a `base = min(winPct, 50)` and an `edge = max(0, winPct - 50)`
segment, stacked under one `stackId` — honest about the axis, but it encoded a single
measurement as two colors, which reads as part-to-whole when no such relationship exists.
Worse, the `edge` clamp meant **a losing slice could not be drawn at all**: the 39.0% season at
RA ≥ 7 (2016-17, 41 games) rendered as a bare `base` segment, the same kind of mark as 50.0%,
with the legend still calling it "what a coin flip already gives you". Deviation columns are
genuinely zero-based on the measured quantity, so the truncation problem the split existed to
solve never arises. Regression tests: `src/components/__tests__/analysis-deviation.test.ts`.

### Card / accent patterns

- Broadcast cards: `var(--term-surface)` fill, `1px solid var(--term-border)`,
  `var(--term-radius)`. Many add a **2px left-border accent** via `TERM_ACCENT`
  (`.neutral` default, `.red` for errors/high-confidence, `.blue` for highlights).
  `TERM_ACCENT` carries `red` / `blue` / `neutral` only; the unused `tan` key was removed.
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

Sticky header = brand bar (52px) + main nav (44px) = **96px**, published as
`--term-chrome-h` in `globals.css`. `/about`'s full-viewport sections subtract that token
rather than a literal, because they overran the fold by exactly the difference the last two
times the chrome changed height and they did not. See `nav-bar.tsx` above. Footer mirrors the
broadcast aesthetic with mono metadata.

### Brand mark

The FullCourt logo ("Angled Divider" court) lives in `src/components/court-mark.tsx`
(`<CourtMark size>` — a tilted center line splitting a blue/rested half from a red/fatigued
half, with an amber center circle; fixed brand hexes, not theme tokens). It renders in the
brand bar, so its strokes are **near-black `#111318`** to read on the light chrome.

**The divider leans top-right to bottom-left** — `M39 7 L33 41` in the 72×48 viewBox — matching
the oversized `CourtSplit` court on `/about`. It leaned the other way until 2026-07-30, so the
same mark pointed two directions depending on which surface you were looking at. That geometry
is duplicated in four files (`court-mark.tsx`, `src/app/icon.svg`, `docs/logo.svg`, and the
`MARK` string in `src/app/opengraph-image.tsx`) plus the hand-exported
`docs/social-preview.png`; there is no shared source, so **change them together**. The center
circle is the badge amber `#F5A623` everywhere, including in-app: it was `--term-amber`
(`#C2410C`) in `CourtMark` alone until 2026-07-30, which at 34px read as a second red sitting
next to the fatigued half rather than as the live accent.

> **Off-page brand assets stay dark by design.** Four assets: the favicon (`src/app/icon.svg`),
> the social/OG card (`src/app/opengraph-image.tsx`), the README header mark (`docs/logo.svg`)
> and the GitHub repo social preview (`docs/social-preview.png`). All are self-contained
> badges that carry their own
> dark ground (`#12151A` / `#0A0B0D`) and keep the pre-flip brightened palette (`#3B82F6`,
> `#E5484D`, `#F5A623`, `#F2F4F7`). They never sit on the app's page background — a browser tab
> and a link-preview card render on someone else's chrome — so they stay legible as-is and were
> deliberately left untouched in the light flip. Do **not** "fix" them to match the in-app mark.

`docs/social-preview.png` is the GitHub repo social preview (Settings → Social preview). It is
uploaded out-of-band and referenced by no code, so a dead-file sweep will read it as an orphan
— it is not. It is hand-matched to `src/app/opengraph-image.tsx`; re-export and re-upload the
two together.
