# Frontend

Pages, components, and the design system. All hex values, fonts, and props are taken from
the actual code (`src/app/`, `src/components/`, `src/app/globals.css`).

## App shell — `src/app/layout.tsx`

- Fonts via `next/font/google`: **Geist** (`--font-geist`, weights 400/500/600 — body AND
  headings; `--font-sans` and `--font-heading` both resolve to it) and **Geist Mono**
  (`--font-geist-mono`, weights 400/600/700 — all data, labels and chart ticks, via `.mono`).
  `<html>` gets both font variables + `antialiased`.
  - **One family for body and headings (Front Office, 2026-08-09).** Titles separate from
    prose by *weight*, not by face: the base heading rule in `globals.css` is `font-semibold`
    (600), which distinguishes a title without the heavy line 700 sets. This retired Inter
    (body) and **Space Grotesk** (display) from the UI, and IBM Plex Mono gave way to Geist
    Mono — the same tabular discipline, one voice with the UI face. **Outfit is still
    bundled** under `src/app/fonts/` for the OG card: that wordmark is a fixed brand asset,
    and a logotype does not have to share the UI's display face. It is not downloaded by the
    client.
- Metadata: title default `"FullCourt — NBA Analytics"`, template `"%s · FullCourt"`, plus
  a description.
- Layout: `<NavBar />` (sticky), `<main>` with a centered `max-w-7xl` container
  (`px-4 py-8 sm:px-6`), and a footer (`var(--term-surface-2)` bg, top border
  `var(--term-border)`) showing `RENDERED: <ts> UTC · SYSTEM STATUS` (the latter a link to
  `/api/health`) and `GUIDE · BUILT BY MJ · SOURCE` (two links → the author's GitHub and the
  repo).
  `renderedAt` is `new Date().toISOString()` truncated to the minute at render time — the
  **render** time, explicitly **not** data/pipeline freshness (live health lives behind the
  SYSTEM STATUS link).

## Pages

The product routes shipping today are `/`, `/season`, `/analysis`, `/playoffs`, `/schedule`,
`/shot-quality`, `/shooting`, `/referees` and `/availability`, plus a branded App Router
`not-found` page for unknown paths. (This sentence used to open with a count, which went stale
twice — first at "five" when it omitted `/shooting`, then at "seven". The list is the fact; a
number in front of it is a second copy of the same fact that nothing checks.)
`/upcoming` was retired: it is a permanent redirect to `/` (`next.config.ts`), whose UPCOMING
view now renders what it used to.

### `/` — Games (`src/app/page.tsx`, client component)

**The root states the thesis, not the format** (2026-08-11). The `<h1>` read `"Games"` until
then — the same word as the tab, describing the table below it — so the largest type on the
site's front door named the format rather than the subject, and a first-time visitor read
"another scores site". The claim was already on the page, in the 15px description under it; it
was simply out-ranked by the page's own hierarchy. The heading is now *"What the schedule does
to a game"*, followed by `ThesisFigure`: the one headline number (`RESTED_AT_HOME.winPct`
against `REST_SPLIT_BASELINE.homeWinPct`) with a `MethodLink`.

`ThesisFigure` is deliberately **not** a fourth stat tile — the tiles below describe the
selected day, and a forty-one-season result sitting in that row would read as another property
of today's slate. Every figure in it is read from `rest-split-facts.ts`, never typed, and the
season span is stated as "since 1985-86" rather than as a count so it cannot age.

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
- Pieces: heading eyebrow `REST ADVANTAGE DASHBOARD` + `<h1>What the schedule does to a game</h1>`
  and the `ThesisFigure` band beneath it; the BY DATE/UPCOMING
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
  prev/next day arrows; the matchup slate with skeleton/empty/error states.
- **The slate renders through `MatchupTable` (`matchup-table.tsx`) since 2026-08-09** — the
  Front Office table spine: one continuous grid-table of rows rather than a stack of
  `MatchupCard`s, with the same expand-in-place fatigue detail per game. That card was deleted on
  2026-08-11, having rendered nowhere since; the shared pieces it used to house (`ConfidenceBadge`,
  `FatigueDetailColumn`, `TeamLogo`, `RaBadge`, …) now live in `matchup-parts.tsx`.
- **Schedule flags sit on their own team's fatigue line, not in a shared strip** (2026-08-11),
  via `teamGameFlags()` — which is why they read `3IN4` rather than `AWAY 3IN4`: on a team's own
  line the prefix says nothing, and it was half of each chip. Two per line, then `+N`; the strip
  is a fixed 104px so the fatigue numbers stay in one column however many flags a team carries.
  They used to share a full-width sub-row with the evidence sentence, right-floated opposite it.
  Measured over 79 games: 53% of rows had both, **43% had flags and no sentence, and 0% ever had
  a sentence and no flags** — so the two-up layout only ever served the "both" case, while 43%
  of rows paid a 32px band to right-align three chips against 901px of nothing. That empty space
  under the team names is what this removed.
- **The evidence sentence leads the expansion; it is not a sub-row** (2026-08-11). It renders
  only above the 0.5 call threshold, so as an always-on band it striped a slate grey under some
  rows and not others — and the sentence is not about the game anyway. It names the historical
  **class** the matchup falls into, so a slate holds at most a couple of distinct strings: on the
  15-game date it was re-cut against, four rows carried a band and three were byte-identical.
  Repeating a class-level fact once per row asserts it is per-game. Inside the expansion it sits
  above the two fatigue columns — the click came from the REST ADVANTAGE cell, so "is 1.1 a lot?"
  is the first question and the components are the second. Every collapsed row is now the same
  81px, and the expansion insets on the row's own 16px rail rather than the 12px it used to use,
  so the detail cards start on the status cell's line.
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

**Two hero tiles, then the excluded half as a sentence** (2026-08-11). Both tiles name who won
and over which slice — `RESTED TEAM AT HOME WON · ANY GAP` and `… · RA ≥ 5`. They led with the
measure until this pass (`OVERALL WIN RATE`, `WIN RATE · RA ≥ 5`), which named neither: *overall*
has no referent on a page whose finding is that the rate is **not** overall, and a bare "win
rate" leaves whose unsaid.

- **Do not add a third tile.** RA ≥ 7 is the obvious candidate and the wrong one — the rate is
  flat from RA ≥ 5 upward, which the `READING THESE NUMBERS` callout says outright, so a third
  ascending tile would draw a trend the data does not have off the page's thinnest slice. The
  chart below already plots all four thresholds.
- **The excluded half stays on the page, always.** It was a third tile and no label made it
  legible, because the fault was not wording: a tile row is a row of *results* and this is the
  rule they are produced under. It is now a `termInsetStyle` band headed `NOT COUNTED`, stating
  the home team's rate over the games where the rested team was the visitor, against the same
  home baseline as the tiles. Dropping it would leave the headline alone with no sign that
  11,548 games were set aside to produce it. The argument for the rule lives once, in
  `/behind-the-data/rest-advantage`; this is the live figure.

### `/season` — Season Report (`src/app/season/page.tsx`)

Server wrapper; metadata title `"Season Report"`; renders a `<PageHeader>` (eyebrow
`ONE SEASON, DEEP`) plus `<SeasonReportContentLazy />`. **No season in the `<h1>`** — the
selector below it reaches back to 1985-86, so a title naming one would be wrong the moment it
moved; the sections carry the label instead.

The lazy client component (`season-report-content.tsx`) fetches `/api/season-report?season=…`
and renders, in order: three rate tiles (rest-advantage win rate, win rate at RA ≥ 2, season
progress) against an all-season marker, then `WHAT THE SCHEDULE WAS WORTH` (schedule luck, not
results), `REST EDGE CONVERSION` (records, not a ranking), `LOUDEST CALLS` (ranked by rest gap),
`SCHEDULE TAX` (completed games only), `FATIGUE CALENDAR` (league average by week) and
`ZERO-REST WORKLOAD` (volume, not effect).

**Two sentences in this page are load-bearing and read as redundant prose.** Both exist to stop
a specific misreading, and `e2e/season.spec.ts` guards both:

- `WHAT THE SCHEDULE WAS WORTH` opens with a callout stating the per-game effect — a rest edge
  moves a home team 3.6 points against home court's 19.8, so about 18% of home court — **before**
  the per-team wins table underneath it. That order is the design. The wins figure never leaves
  ±0.4 for any team, and read cold it invites the conclusion that rest is nothing; read after the
  scale line it says what is true, which is that the effect is real and the league distributes
  edges evenly enough that it never accumulates. Never reorder these two, and never publish the
  wins figure on a surface that does not carry the scale beside it.
- `REST EDGE CONVERSION` prints `swingBaseline` above its table and diverges the `SWING` column's
  colour around it rather than around zero. The rested arm is every game played as the fresher
  side *at home* and the tired arm every game played as the tireder side *on the road* —
  `isCalledSide` admits no other pairing — so a team with no rest-conversion skill still posts
  about +10. Colouring from zero painted twenty-odd teams blue for having home-court advantage,
  which is the same error the venue baseline was introduced to stop `/analysis` making.

**Every rate tile is gated on sample size.** `MIN_GAMES_FOR_INFERENCE` is 100
(`src/lib/season-report.ts`); below it a tile reads `TOO EARLY · N OF 100 GAMES NEEDED` rather
than printing a rate a single season cannot support.

Its last section, `ZeroRestWorkload`, reads `public/data/player-rest.json` directly rather than
the API — the second surface to serve from that static asset, after `/shooting`.

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

Server component; metadata title `"Schedule Disparity"`; renders a `<PageHeader>`, a
`<MethodLink>`, `<ScheduleDisparityContentLazy />` and `<WinTotalMarketCheck />`. That last one
is static and season-independent, which is why it sits outside the season selector's data flow:
it reads the committed `src/data/win-total-benchmark.json` (guarded by
`win-total-benchmark.test.ts`) and publishes a deliberate **null** — a season's schedule edge
does not correlate with the preseason win-total market. The lazy client component
(`schedule-disparity-content.tsx`) fetches `/api/schedule-disparity?season=…` via SWR and
renders, in order: a `<SeasonSelector>` over `browsableSeasons()`, a four-cell summary strip
(most favored / least favored / spread / games with an edge), the ranked **net rest edge**
list, the column guide, and the full breakdown table.

The breakdown table's **Worth (wins)** column is the same figure `/season` publishes, from the
same conversion (`src/lib/schedule-value.ts`) and the same population — the two pages must never
show a team different values. It carries the scale sentence directly above it for the reason
`/season` does: a wins figure without the per-game effect beside it gets misread as the size of
the effect rather than the size of the schedule's imbalance.

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

The player's own row renders through `DataTable`'s `columns` like every other table's; the
seasons, the `Career` line and the closing note come from `rowExtras`, which can add rows after a
row but cannot touch the row itself. They keep hand-written `<td>`s, because an indented season
label and a `colSpan` note are not the column model — the alternative was bending the module
around one caller. **Player names went from proportional to mono on 2026-08-11**: this was the
last table on the site whose text cells were not mono, and it is the only visible change the
port made anywhere.

The group is marked out by three low-strength signals rather than one strong one: a tint at 3–7%
of `--term-amber`, a 2px `--term-rail` down the left edge of every row including the 2019-20
marker, and a rule above and below. Each still reads if the others fail — a single subtle tone
did not survive the dark palette, where `--term-surface-2` sits a few points off `--term-surface`.

That rail is painted as `box-shadow: inset 2px 0 0`, **not** `border-left` (2026-08-11). As a
border it consumed 2px of the cell's layout width, so an expanded player's first column sat 2px
right of every collapsed player's — the marker meant to group the rows was knocking them out of
the column. `e2e/alignment-law.spec.ts` asserts that expanding a row does not move it sideways.

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
height). Order: the claim, the thesis, the evidence, the six surface cards, what the score is made
of, the standard, the way in. The hero carries no buttons: they competed with the single line
the page opens on. Evidence figures come from `getHistoricalBacktest` via the server page and
are revalidated daily, because all three were hardcoded and all three had gone stale.
Headings use `font-bold` (700), not extrabold: `layout.tsx` loads Geist at 400/500/600/700
— the 700 face is carried for this page specifically — so an 800 request resolves to the
700 face anyway.

Two things on this page are easy to get wrong twice:

- **The stacking method cards dim with `filter: brightness()`, never `opacity`.** They are
  `sticky` and physically overlap, so a card at `opacity: 0.45` shows the card *beneath* it
  straight through — card 02's heading landing on card 01's paragraph. The last card is not
  animated at all, which is why the bug only ever showed on 01 and 02.
- **The six surface cards keep their copy visible at rest.** It was `lg:opacity-0` until
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

### `/behind-the-data/*` — the reference section (8 routes)

`/behind-the-data` plus one route per model (`rest-advantage`, `schedule-edge`,
`playoff-predictions`, `player-shooting`, `shot-value`, `availability`) and a shared
`data-and-limits`. Real
routes rather than client-side tabs, so each method is linkable, crawlable, and deep-linkable
from the page it explains. `BehindTheDataShell` supplies the header and the section sub-nav;
`behind-the-data-parts.tsx` supplies the shared prose primitives so seven pages cannot drift into
seven typographic treatments of the same content.

`/referees` has no section here, and is also the one product surface currently held back — its
page shows an in-progress card rather than the foul-style table. Its method (per-season share
baselining, the |z| ≥ 2 emphasis rule, why a call cannot be attributed to one official) is the
writing that is unfinished, which is why the surface is unpublished; a section here would land
with it.

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

### `/availability` — what a missing player costs

Shipped 2026-08-02, behind the `OTHER` menu. The one surface on the site with **no data fetch at
all**: every figure is a frozen constant in `src/lib/availability-facts.ts`, mirrored from
`ml/availability_facts.json` and pinned by `src/lib/__tests__/availability-facts.test.ts`. No API
route, no client bundle, no loading state — the same arrangement as `PlayoffRestArgument`, and
the reason the page is complete when the database is slow or empty.

It exists to put one number beside the schedule numbers in the same unit: losing a team's best
player is worth 2.86 points of final margin, against home court's 2.82 and a back-to-back's 1.76.
The comparison is the point, so `availability-content.tsx` draws all five effects on **one shared
track running from zero**, not one bar per card.

Two pieces of copy are load-bearing and are asserted in `e2e/availability.spec.ts` rather than
left to review:

- *"This measures what an absence cost, not who will play tonight."* The measurement is
  retrospective — absences are read from who actually took the floor. Without this line the page
  reads as an injury report, which is also why the nav label is `AVAILABILITY COST` and not
  `AVAILABILITY`.
- *"And a basketball game is mostly noise."* Margins vary by 13.6 points and the residual is
  still 12.4. The effects are real and precisely estimated; the page must not imply they explain
  games.

The season trend is one series, so it carries no legend and one hue, and every column holds a
`title` — a reader gets any season's figure without the page shipping a line of JavaScript.

### `/referees` — foul style *(built, deliberately unpublished)*

**The page currently renders an in-progress card, not the table below.** Everything described in
this section exists and works — it is held back because the writing around the numbers is not
finished, and that framing is what stops the table reading as a bias claim. Restoring it is two
edits, both named in the docstring of `src/app/referees/page.tsx`: swap the `MessageCard` back
for `<RefereeStyleContent data={data} />`, and un-skip the table block in `e2e/referees.spec.ts`.
Treat this as an editorial state, not stale documentation.

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
   The wordmark is **22px in the display face (Geist, 700)**, two-tone — `FULL` in
   `var(--term-text)`, `COURT` in `var(--term-text-muted)`. `COURT` is **muted since
   2026-08-09**: Front Office keeps the poles for data, so the wordmark no longer borrows the
   fatigued hue. It was 11px mono until 2026-07-30, i.e. *smaller than the tabs
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
   dead branch was removed. Per-game LIVE status is shown in the slate row instead (`matchup-table.tsx`).
2. **Main nav** (44px, `var(--term-surface)`, bottom border `var(--term-border)`) holds **two
   navigation landmarks in one row**. Left, `aria-label="Main navigation"`: the six direct tabs
   from `DIRECT_NAV_ITEMS` (`src/lib/primary-navigation.ts`) — `GAMES → /`,
   `SEASON REPORT → /season`, `SCHEDULE EDGE → /schedule`, `MODEL RESULTS → /analysis`,
   `PLAYOFF REST → /playoffs`, `PLAYER SHOOTING → /shooting` — followed by the `OTHER`
   menu holding `SHOT VALUE → /shot-quality`, `AVAILABILITY COST → /availability` and
   `REFEREE EFFECT → /referees`. Right,
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
   The active link gets an accent
   bottom border (`border-[var(--term-amber)]` — the historical slot, aliasing
   `--term-accent`) + `text-[var(--term-text)]` and carries
   `aria-current="page"`; inactive links are muted with a hover-to-text transition.

### First-visit orientation — *(removed 2026-08-11)*

There was an `onboarding-guide.tsx`: a Base UI dialog that opened over the app on a visitor's
first load, enumerated every primary surface from `PRIMARY_NAV_ITEMS`, and persisted a
`fullcourt:onboarding:v1` flag. It is gone, along with `src/lib/onboarding.ts`,
`e2e/onboarding.spec.ts`, and the `storageState` block every other e2e spec carried purely to
stop it opening over them.

It was removed because the site now explains itself in place. Benchmarks put embedded guidance at
roughly **1.5× the action rate of a pop-up modal**, and user-triggered tours at **2–3×** the
completion of auto-triggered ones — and a modal that only survives as a footer link is a modal
nobody opens. The home page's thesis header does the site-level explaining; each page's
`PageHeader` does the page-level explaining.

**The one thing it uniquely carried had to survive it.** `/referees` was labelled
`"Still being built."` in the guide, which is the deliberate, load-bearing stance recorded in
CLAUDE.md. That warning now renders as an `IN PROGRESS` tag beside `REFEREE EFFECT` in the
`OTHER` menu, driven by `inProgress: true` on its `primary-navigation.ts` entry, so navigation
still says the surface is unfinished *before* it is opened. `e2e/referees.spec.ts` asserts it
there. Do not drop that tag.

### `matchup-parts.tsx` — the shared matchup pieces

**Named `matchup-card.tsx` until 2026-08-11.** The Front Office redesign replaced the card stack
with `MatchupTable` on 2026-08-09, and `MatchupCard` had rendered nowhere since — along with
`MetaStrip` and the pooled `gameFlags()`, and the four private helpers only those three used
(`confidenceAccent`, `fatigueTones`, `TeamStatRow`, `RestAdvPanel`). All of it is gone, which
halved the file from 766 lines to ~380, and what is left is named for what it actually is: the
pieces every matchup surface draws — `TeamLogo`, `ConfidenceBadge`, `GameStatusRow`,
`FatigueDetailColumn`, `RaBadge`, `getConfidence`, `teamGameFlags`, and the `Confidence` type.
`matchup-table.tsx`, `explore-game-detail-modal.tsx` and `upcoming-content.tsx` import from here.

**One `TeamLogo`, not two.** `upcoming-content.tsx` carried a private copy until the same day — a
second adapter at a seam that already existed, and one that took only an abbreviation, so it
could not resolve era-correct branding through `getTeamBranding` even in principle. It now uses
the shared one. No `season` is passed there because upcoming games are current-season, so the
current logo is the correct one; the point is that the capability is a prop away rather than a
rewrite.

Confidence tiers:
- `getConfidence(diff)`: `high` `|diff| ≥ 2.0`, `med` `≥ 1.0`, **`low` `≥ 0.5`**, `neutral`
  below that, `none` when no RA. The `low` tier exists because the canonical classifier
  (`NEUTRAL_REST_ADVANTAGE_THRESHOLD = 0.5`, imported from `rest-advantage-evidence.ts` rather
  than redeclared) calls a game for a team at 0.5: with tiers starting at 1.0, every gap in
  `[0.5, 1.0)` made the rest-advantage cell print e.g. `BOS 0.7` while the badge beside it
  printed `NEUTRAL`. The invariant — *anything the classifier calls is at least `low`* — is
  pinned by `src/components/__tests__/matchup-parts-confidence.test.ts`.
- In a row's expansion, `buildRestAdvantageEvidence` (`src/lib/rest-advantage-display.ts`)
  renders one sentence giving the rest-advantage number its historical hit rate, sample size
  and **the baseline that side wins anyway** — the home baseline for a rested home team, the
  road baseline for a rested road team. Buckets are **cumulative**, so a 4.1 gap resolves to
  `at home · gap ≥ 3`; a called gap below 2 falls back to the overall rate worded
  `at home · any gap`. Neutral matchups, a missing `/api/analysis` payload, a missing
  `venueBaseline`, or any class with a zero denominator render nothing at all.
- **Both branches report the rested team, and always state the baseline in the same sentence**
  (2026-08-06). The subject used to flip — the home-rested branch reported the rested team and
  the road-rested branch reported the *home* team — which made `/upcoming`'s single win-rate
  column mean two different things depending on the row. Keeping the baseline inside the one
  sentence is deliberate: a rested road team's 42.4% standing alone beside a coloured `EDGE`
  chip reads as a pick, where "42.4% — road teams win 40.1% overall" reads as a measurement,
  and no truncation can separate them. `/upcoming`'s cell shows the rate, the signed lift, the
  class label and the baseline together for the same reason.
- **Confidence is never a data pole** (2026-08-09) — the poles say *who* is rested, and a rose
  HIGH CONF badge beside a rose fatigue bar read as "fatigued wins", which is backwards.
  Confidence is magnitude, carried by the badge text and the accent's loudness rather than a hue
  of its own. The badge ladder: HIGH CONF a filled `--term-accent` chip, MED CONF an ink
  outline, LOW CONF and NEUTRAL a hairline outline. (`confidenceAccent` implemented this on the
  retired card and went with it; `matchup-table.tsx` applies the same rule inline.)

The pieces, and who draws them:
- `TeamLogo` — season-aware logo via `getTeamBranding` when given a `season`, plain
  `teamLogoUrl` without one; falls back to an abbreviation chip on error. Drawn by the slate
  table, the detail modal and `/upcoming`.
- `GameStatusRow` — LIVE / FINAL / UPCOMING plus the score.
- `ConfidenceBadge` — the ladder above.
- `FatigueDetailColumn` — GP (30D/7D), back-to-back, 3-in-4, 4-in-6, road streak, travel
  miles (7-day; highlighted ≥1000), days rest. Both the slate's expansion and the modal.
- `RaBadge` — the compact `ABBR n.n RA` chip, used by the modal.
- `teamGameFlags` — per-team schedule flags, de-prefixed. See the `/` section above.

The **center-anchored rest-advantage meter** (fill width `min(|diff|/5, 1) * 50%`, always the
rested pole `--term-blue` whichever side it extends toward, because the advantaged team *is* the
more-rested one and direction alone carries home/away) now lives in `matchup-table.tsx` as
`RestAdvCell`. It was `RestAdvPanel` here until 2026-08-11.

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
games with an "edge" badge naming the more-rested side — **always the rested-pole teal**
(2026-08-09), whichever venue that side plays at; it was side-colored (home blue / away red),
which dressed a rested visitor in the fatigued hue. Rendered in the standard card style
(`var(--term-surface)` fill, `1px solid var(--term-border)`, `.mono` labels) — consistent
with Games / Model Results.

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
   reveals `SeriesFeatureGrid` (seed diff, win% diff, prior grind diff, entry rest diff, h2h
   diff). Sign convention: positive always favours the home-court team, which means every row
   is home-court − opponent *except* prior grind diff, which is opponent − home-court. The
   component prints that caption itself.

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
The eight `*-lazy` modules remain separate files because `dynamic()` with `ssr: false` cannot
be called from a server component and the pages are server components — but each now carries
only its skeleton, not a restatement of the loader.

### `components/ui/*` — shadcn primitives

Two shadcn primitives survive — `button`, built on **`@base-ui/react`** with
`class-variance-authority` variants, and `skeleton`, a plain `div` — alongside one hand-written
primitive that is not shadcn's, `message-card` (below). (`@base-ui/react` is
also used directly by the modals.) `cn()`
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

## Small screens

**Measured 2026-08-04 against production at 360×780pt @3x** — the real iPhone 12/13 mini
viewport, and the narrowest screen the app has to hold. Note that Playwright's built-in
`iPhone 12 Mini` descriptor reports **375**, which is wrong for that device; test at 360, because
several layouts fit at 375 and are tight at 360.

**No page overflows horizontally.** All eleven routes (the nine product pages plus `/about` and
`/behind-the-data`) measured `scrollWidth === clientWidth` at 360pt. Wide content is contained
rather than escaping, which is the invariant to protect when adding a table or a chart.

Three deliberate horizontal scrollers carry that load, and each is a **content-discoverability**
question rather than a layout bug:

- **The nav bar** (`nav-bar.tsx`, `.fc-nav-scroll … overflow-x-auto`). The six direct tabs plus
  the `OTHER` trigger total ~610pt of targets in a 360pt viewport, so at rest the bar shows
  roughly three and a half tabs and clips mid-word. **`OTHER` is entirely off-screen**, which
  means Shot Value and Availability Cost are unreachable for a reader who does not think to swipe
  the bar. There is no fade or arrow affordance.
- **The Games month/day chip rows** — same pattern; April is off-screen at rest in a full season.
- **The wide data tables** (`/shooting`, `/schedule`, `/season`), each inside its own
  `overflow-x-auto`. This is why the page itself does not overflow.

**Form controls sit below the iOS zoom threshold.** Every `<select>` computes at 12px and one
control on `/shooting` at 10px, against the 16px floor at which **Mobile Safari zooms the page on
focus and does not zoom back out**. Densest surfaces: `/analysis` (four selects) and `/shooting`
(four selects plus the player search input). The viewport meta is
`width=device-width, initial-scale=1` with no `maximum-scale`, which is correct for accessibility
— so the fix, if this is ever addressed, is a 16px floor on focusable controls at mobile widths,
never disabling zoom.

**Nav links measure 43pt tall**, one point under Apple's 44pt minimum touch target.

**`/about` bleeds its decorative court SVG past both edges by design** — it is the one page whose
children legitimately extend beyond the viewport box, and it is inside a clipping section, so it
does not scroll the page.

**There is no PWA/home-screen support and this is a gap, not a decision.** `/manifest.json`,
`/manifest.webmanifest` and `/apple-touch-icon.png` all return 404, and there is no
`apple-mobile-web-app-capable` meta — only `icon.svg` (which iOS ignores for home screens) and
`themeColor`. Add to Home Screen therefore yields a screenshot-of-the-page icon and opens in
Safari chrome rather than standalone.

## Design system — "Front Office" (light)

The app is **light-only** — a front-office data-room language: a cool near-white ground, white
cards lifting on hairline borders, near-black ink, team colors carrying each matchup, monospace
data values, one indigo accent carrying every kind of emphasis chrome, and rose/teal kept
strictly as the **fatigue / rest-advantage data semantics** (rose = more fatigued, teal = more
rested), tuned for legibility on white. **Selected/active chrome is a solid ink fill** — view
toggles, month tabs, day chips and filter pills invert to `--term-text` background /
`--term-surface` text when active, never a data pole. `<html>` carries **no** `dark` class and
`globals.css` sets `color-scheme: light`. Every color flows through the `--term-*` CSS tokens,
so reskinning the tokens in `globals.css` re-themes the whole app; component code should read
tokens, never hard-code hexes.

> **Theme lineage:** "Bloomberg Terminal" (light) → "Broadcast" (dark) → "Broadcast" (light,
> flipped 2026-07-17 for legibility) → **"Front Office" (light, current — adopted 2026-08-09
> from the round-2 direction mocks in `docs/design/`)**. Each redesign kept the same flat/token
> architecture and the same components; only token values moved — plus one token added this
> time, `--term-accent`, which splits emphasis chrome off the blue that used to double as both
> "primary chrome" and the rested data pole.

### Color tokens (verified — light values in `globals.css :root`)

Token NAMES are historical slots: `--term-red` holds the fatigued pole, `--term-blue` the
rested pole, `--term-amber` the accent — whatever hue each currently is. Renaming them would
touch every consumer for zero rendered change.

| Token / Hex | Role |
|-------------|------|
| `--term-bg #F6F7F9` | page background (cool near-white) |
| `--term-surface #FFFFFF` | card / panel fill (lifts off the page) |
| `--term-surface-2 #EFF1F4` | stat tiles, inset panels, table headers, hover |
| `--term-border #E4E6EB` | borders / dividers |
| `--term-hairline #D6DAE1` | subtle inner rules / center markers |
| `--term-text #16181D` | primary text (ink) — also the selected-chrome fill |
| `--term-text-muted #5D6470` | muted / label text |
| `--term-text-dim #333845` | secondary text (darker than muted) |
| `--term-red #E11D48` | **data pole** — rose, "more fatigued"; LOST result text |
| `--term-blue #0891B2` | **data pole** — teal, "more rested"; RA chips/meters, chart marks |
| `--term-accent #4F46E5` | **the one accent** — eyebrows, live markers, HIGH CONF, in-page links/CTAs, callout rails |
| `--term-amber` | aliases `--term-accent` — the historical slot name its consumers still read |
| `--term-hardwood #4C5361` | **non-data chrome only** — off-season banners, quiet CTA hover |
| `--term-rail rgba(79,70,229,0.42)` | the accent at partial strength, for grouping rules |
| `--term-pos #15803D` | win / up |
| `--term-neutral #6B7280` | neutral semantic / badge outlines |

> On light, "raised" reads as *slightly tinted*, not lighter: `--term-surface` is pure white and
> `--term-surface-2` steps **down** into cool gray — the inverse of the dark theme's ramp.

> Team colors (matchup + upcoming rows) come from `src/lib/nba-team-colors.ts`
> (`getTeamColors(abbr)` → `{ primary, secondary }`, neutral fallback). They are brand chrome
> only — the top color band, logo chips, and identity dots — and never override the rose/teal
> fatigue semantics. Chip text runs through `readableTextOn(hex)` (same module), which picks
> `#FFFFFF` or `#111318` by the fill's sRGB luminance — without it, light primaries (SAS
> `#C4CED4`) would render white-on-white. shadcn semantic tokens in `:root` are set to matching
> light values (`--background #F6F7F9`, `--foreground #16181D`, `--card #FFFFFF`,
> `--primary #4F46E5`, `--destructive #E11D48`, `--accent #4F46E5`); chart palette
> `--chart-1..5` = teal / rose / indigo / emerald / violet. **The `--chart-*` palette is
> shadcn scaffolding that no chart in this app reads** — recharts pulls `--term-*` directly.
> Do not adopt it without re-measuring. `--term-blue` ↔ `--term-red` is a validated pair
> (worst-adjacent CVD and normal-vision ΔE figures are recorded in the token block comment in
> `globals.css`, measured on white), which is why the fatigue / rest-advantage semantics stay
> on exactly those two and nothing is added alongside them.

### Typography

- **Body / sans:** Geist (`--font-geist`).
- **Headings (`h1–h3`):** the same Geist (`--font-heading` / `font-heading` utility resolve to
  it), **semibold** (600) + tight tracking (`-0.025em`) — weight, not a second face, is what
  separates a title from its prose. The base layer in `globals.css` supplies both, so pages
  set only the size — a page heading should not need to restate weight or family.
- **Data / labels:** the `.mono` class = `var(--font-geist-mono)` (**Geist Mono**, loaded by
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

### Alignment: two rails, one scale

*(Established 2026-08-11. Before it, the app used twelve gap steps, about twenty distinct inline
padding values and eight prose measures, so no two panels inset their contents to the same place
and no two pages' paragraphs ended in the same place.)*

**There are exactly two horizontal rails.**

- The **outer rail** is the page gutter, set by the layout container — `mx-auto max-w-7xl px-4
  sm:px-6` in `layout.tsx`, matched exactly by the brand bar, the nav row and the footer. Page
  titles, top-level prose, section rules and card borders all begin here.
- The **inner rail** is `SPACE_CARD` (16px) in from a box's own border. Every card insets its
  contents by exactly this, so a card title and everything under it share one line.

**One documented third rail** exists: `SPACE_NESTED_ROW` (28px), for a row that is
hierarchically inside another row — the expanded seasons under a player on `/shooting`. The
nesting is the information there, so it has to be visible. Nothing else may take a third rail.

**A table is a box, so it takes the inner rail like any other box.** Cell padding lives in the
`.fc-table` rule in `globals.css`, not in `termThStyle` / `termTdStyle`, so all 21 tables pad
identically without 21 call sites agreeing. **12 a side, every cell, edges included.**

**Every table on the site is a `DataTable`** (`src/components/ui/data-table.tsx`), and since
2026-08-11 there is no other kind — the only `<table>` element left in `src/` is the module's
own. Give it `columns` and `rows`; it supplies the class name, the collapse mode, the header
band, the top and bottom rules, unit sub-labels, numeric alignment, tabular numerals, the scroll
wrapper and the cap. Read its docblock before adding a prop: what a caller decides is
deliberately only what varies.

> Before it existed there was a *convention* — a caller had to independently know twelve facts
> to draw one table right, and five of the seven measurable ones had drifted across the 21 call
> sites. Four omitted `mono`, two set `border-collapse` as a class where nineteen set it inline,
> a dead `fontSize: 12` appeared on ten, and four combined `w-full` with the numeric cap, which
> silently means "always exactly 760px". Two tables had independently grown a byte-identical
> sortable-column descriptor, and both attached `onClick` to a bare `<th>`, so neither could be
> sorted from a keyboard.

Three things the module settled that are easy to get wrong again:

- **A column's `style` is body-only.** `headStyle` is the header. A cell style that reached the
  heading shrank a rank column's own label out of line with the eight beside it.
- **A sortable heading is a real `<button>` inside the `<th>`.** `role="button"` on the `<th>`
  replaces the implicit `columnheader` role — wrong for the table, and it breaks
  `getByRole("columnheader")`.
- **The padding stays on the cell, not on that button.** Moving it in buys a bigger hit area and
  makes the cell measure `padding: 0`, which is this law broken.

> The edge cells padded to **zero** for part of 2026-08-11, so a table's first column would land
> on whatever rail its container sat on. **Reverted the same day.** `termThStyle` paints a
> `--term-surface-2` header band and 20 of the 21 tables used it then — all 21 do now, through
> `DataTable` — so zeroing the inset put the
> first column's text hard against a filled edge — which reads as broken however exactly it
> lines up with the heading above. The box sits on the page rail; its cells sit on the box's own
> inner rail. The earlier rule applied the two-rail model to the wrong element.
> `alignment-law.spec.ts` asserts the first and last cells pad like their neighbours, comparing
> rather than pinning a literal.

**The numeric cap is a ceiling, not a target.** `TERM_NUMERIC_TABLE_MAX_WIDTH` (760) sets how
wide a mostly-numbers table may *get*; a table must not also carry `w-full`, which turns the cap
into a fixed width. `DataTable` makes that unrepresentable — `width` is one field, `"full"` or
`"numeric"`, so the two cannot both be set. The season report's three-column WHAT THE SCHEDULE
WAS WORTH was the proof —
at a forced 760 its middle column ran 390px wide to hold `+21`, so the eye crossed 528px of
nothing between a team and its own number. Sized to content it lands at its 420px `minWidth`
floor and reads as one scan. `minWidth` stays: it is the horizontal-scroll floor on a phone, not
a target either.

**Every table closes at the top as well as the bottom.** The last row's own `borderBottom` is the
table's bottom edge, so `.fc-table thead tr:first-child th` takes a matching `border-top`. The
header band's tint alone was doing that job, and a fill is not an edge. First header row only —
the wide tables stack two, and a rule under the group labels would cut the header in half.

**Recessed panels are bands, not boxes.** `termInsetStyle` is a background plus rules top and
bottom, with no side padding, so it bleeds to its container's content edge and its text stays on
the same rail as the title above it. Pad it vertically at the call site, never horizontally. As
a bordered box it put nested text on a third rail 32px in.

**A rail must never cost layout width.** Draw a group marker as `box-shadow: inset 2px 0 0`, not
`border-left`. As a border, the `/shooting` group rail pushed an expanded player's first column
2px right of every collapsed one's — the rule meant to mark the group knocked the group out of
its column. Same technique in `behind-the-data/page.tsx`'s hover state.

**The spacing scale is `SPACE` in `terminal-styles.ts`: 4 / 8 / 12 / 16 / 24 / 32 / 48.** Every
gap, pad and margin is one of those seven. New values round to nearest, ties up. 4px is the base
because an 11px mono label sitting on its 32px number needs a step finer than 8.

Two exemptions, both deliberate:

- **Data-mark geometry.** The gaps between bar segments, shot-grid cells, the 4px fatigue bar's
  own height. Those are *drawing*, sized against the data and the pixel grid, not layout. A
  `gap-[2px]` between two bar segments is correct and must not be snapped to 4.
- **Intrinsic control caps.** A season select, a modal, a hover tooltip, the shot-quality legend
  (sizes to its colour ramp), the player search box (sizes to a name). These are not content
  columns and keep their own widths.

**Content columns pick from `WIDTH`**, never a new measure: `full` (the container), `wide`
(1040px — a page-level column of mixed prose, tiles and charts), `numeric` (760px, re-exported
as `TERM_NUMERIC_TABLE_MAX_WIDTH`), `prose` (42rem).

Two things left alone on purpose: `components/ui/button.tsx` (vendored shadcn, its sizes live
inside `has-data-*` variant selectors) and `opengraph-image.tsx`'s `72px 80px` (a fixed
1200×630 brand asset, not a page).

**Enforcement.** `e2e/alignment-law.spec.ts` asserts the absolute parts — title on the gutter,
tables taking no inset, expanding a row not moving it. `e2e/alignment-audit.spec.ts` reports
every near-miss edge across 17 routes × 3 viewports to `test-results/alignment/report.txt`; run
it before and after a spacing change and diff. Its count has a floor it will never reach, since
a wrapped nav row and a scrolling date strip place items by flow — treat it as advisory, and do
not tune the instrument to improve it. There is deliberately **no ESLint rule** yet: a scale
nobody has stress-tested through a real feature becomes a rule people disable.

### Page rhythm

Every page is built the same way, so moving between tabs does not feel like moving between
products:

- **Page title = 32px**, the "hero stat value" slot in `terminal-styles.ts`. At 24px a title
  was the same size as the stat numbers under it. `PageHeader` sets it for every page —
  `/schedule`, `/playoffs`, `/shot-quality`, `/shooting`, and now `/` and `/analysis`, which
  used to hand-copy its markup. Its description measure is fixed at `WIDTH.prose`; the
  `descriptionMaxWidth` prop was removed on 2026-08-11 because the one override left in the
  tree asked for 46rem, and 4rem of line length is not worth every reference page introducing
  itself on a different measure from every product page.
- **`gap-12` between chapters** — heading, controls, results — on the page's top-level column,
  with tighter spacing inside anything that belongs together. A uniform `gap-4` gave a heading
  the same separation as two halves of one control panel. Loading and error branches carry the
  same `gap-12` so the layout does not shift when data lands.
- **Stat tiles take a 2px rule on the *top* edge**, not the left. As a left border a row of
  tiles reads as a list with coloured bullets; along the top edge it reads as a row of
  measures. Single centred callouts (error cards, "key insight") keep the left rule — they are
  one statement, not a row.
- **Cards that expand lift 2px on hover** (`hover:-translate-y-0.5`), cancelled under
  `motion-reduce`. Do not pair this with a `hover:border-*` class on a slate row or the
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
:focus-visible { outline: 2px solid var(--term-accent); outline-offset: 2px; }
```

`--ring` is a **solid** `#4F46E5`. It was `rgba(37, 99, 235, 0.45)` and further halved by an
`outline-ring/50` applied to `*`, which composited to 1.97:1 on white — under the 3:1 non-text
minimum. Components may **reinforce** focus with a ring or a background tint but must not
replace it: `focus-visible:outline-none` was removed from `matchup-parts`, `playoffs-content`,
`analysis-content` (explorer rows) and `explore-game-detail-modal`. The
explore-game modal keeps its explicit accent rings, which are a real visible indicator.

### Charts (`analysis-content.tsx`)

Both backtest bar charts are **deviation columns**: `toDeviation(winPct, baselinePct)` plots
`winPct - baselinePct` in percentage points, so **zero is the venue baseline** and the bar's
length is the part rest accounts for. `deviationFill()` colors the two poles — `--term-blue`
above, `--term-red` below, `--term-neutral` at exactly zero — and `ReferenceLine y={0}` is drawn
**after** the bars as solid `--term-text` at 1.5px. That rule is the axis, not an annotation,
which is why it is the one assertive line on the chart.

**The baseline is not 50, and this is load-bearing** (2026-08-06). Every game these charts count
is one the more-rested team played at home, and home teams win ~59.9% of all games regardless of
rest — so a coin-flip zero credited the model with about ten points of home court it did not
produce. The threshold chart passes `data.venueBaseline.homeWinPct`; the season chart passes each
season's own `homeBaselinePct`, because home court ran from 67.9% in 1987-88 to 54.3% in 2023-24
and one fixed line would misread both ends. Both legends name their zero, and both tooltips print
the baseline on the same line as the deviation so the two cannot be read apart.
`e2e/analysis.spec.ts` asserts the zero-line copy and that no surface says `COIN FLIP`.

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

- Cards: `var(--term-surface)` fill, `1px solid var(--term-border)`,
  `var(--term-radius)`. Many add a **2px left-border accent** via `TERM_ACCENT`
  (`.neutral` default, `.red` for errors, `.accent` for high confidence and editorial
  emphasis). `TERM_ACCENT` carries `red` / `blue` / `neutral` / `accent` — `.red` and `.blue`
  are the data poles and no longer mark chrome; the unused `tan` key was removed.
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
arc — all derived geometrically, not hardcoded pixel paths. Color ramps (Front Office,
validated against the white `#FFFFFF` court): expected-eFG% is a magnitude, so its ramp is
**sequential — one hue, light→dark teal** (`#79BDD1` → `#065F74`), with the pale end held at
≥2:1 contrast against the court so low-value cells stay visible; the GBM−baseline diff is a
polarity, so it **diverges through a neutral midpoint on the two data poles** — teal → gray →
rose (`#0891B2` ← `#E5E7EB` → `#E11D48`), rose where GBM rates a spot higher. The old
tan→blue value ramp put two competing hues on one scale. The diff-neutral is
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
