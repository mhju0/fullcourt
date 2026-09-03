# Project status

FullCourt is **actively developed**. New analytics modules are added as additive, isolated
slices, alongside continuing interface and correctness work — a design and UX audit on
2026-07-26 shipped a quick-win pass: the confidence-tier fix, the focus indicator, IBM Plex
Mono, deviation-from-coin-flip backtest charts, and the Upcoming Edges rename.

A closeout pass on 2026-07-27 emptied the tracker. Shipped: the blank-render P0 and a route
error boundary ([#1](https://github.com/mhju0/fullcourt/issues/1)); a historical hit rate and
sample size on every rest-advantage number, on both the matchup cards and Upcoming Edges
([#4](https://github.com/mhju0/fullcourt/issues/4)); and the retirement of the unrendered
`monthlyTrends` payload ([#6](https://github.com/mhju0/fullcourt/issues/6)). Closed as
`wontfix` after verifying each against HEAD — real, but judged not worth building at the time:
URL-reflected view state
([#2](https://github.com/mhju0/fullcourt/issues/2)), the seven-step type scale and home-page
thesis block ([#3](https://github.com/mhju0/fullcourt/issues/3)), and extracting the three
duplicated presentational components ([#5](https://github.com/mhju0/fullcourt/issues/5)).

On 2026-07-27 the nav was renamed to five plain-noun tabs and `/upcoming` was folded into
`GAMES` as a view toggle rather than kept as a sixth tab. The bar has since grown to **six**
direct tabs — `GAMES`, `SEASON REPORT`, `SCHEDULE EDGE`, `MODEL RESULTS`, `PLAYOFF REST` and
`PLAYER SHOOTING` — with `SHOT VALUE`, `AVAILABILITY COST` and `REFEREE EFFECT` behind the
`OTHER` menu. Module names are unchanged; see
[GLOSSARY.md §Nav labels](GLOSSARY.md) for the label-by-label rationale.

On 2026-07-28 an interface pass followed: **Space Grotesk** replaced Outfit as the display
face at weight 500, and all five pages took the same layout grammar — 32px page titles, a
`gap-12` rhythm between chapters, and stat tiles ruled on the top edge rather than the left.
See [FRONTEND.md §Page rhythm](FRONTEND.md). The same pass added **`/about`**, a dark landing
page that explains what the product measures. It is still not a tab, but as of 2026-07-30 it
is reached from a right-aligned `Reference` landmark in the nav row rather than the status
bar, which proved too quiet to be found.

Two directions were considered and **declined**, so they are not backlog:
- Restyling the five app pages in the dark cinematic aesthetic used by `/about` — it would
  overwrite the light "Broadcast" system (which already went light → dark → light once, see
  [ARCHITECTURE.md](ARCHITECTURE.md)) and widen the CSP product-wide.
- A generated brand kit / identity board.

**On 2026-08-09 the interface was replaced outright — "Front Office".** Chosen from four
light-only, data-forward directions after a first round of five wider ones; every mock and the
reason each of the other three lost is in
[design/BRAND_GRAMMAR.md §Direction record](design/BRAND_GRAMMAR.md). It supersedes the
2026-07-28 pass above rather than extending it: **one type family** (Geist / Geist Mono, so titles
separate by weight and size rather than by face — retiring Inter, Space Grotesk and IBM Plex Mono
together), an **indigo accent** spent one moment at a time, rose/teal **data poles**, and the
Games slate rebuilt as **one continuous table** where a row expands in place. Still light-only;
The front door (`/`, at `/about` until 2026-08-12) is still the one deliberately dark surface. No runtime dependency was added.

**Two follow-on passes on 2026-08-11**, both consequences of that redesign rather than new
features:

- **The two-rail alignment law** — outer rail at the page gutter, inner rail at `SPACE_CARD`, and
  exactly one sanctioned third rail (`SPACE_NESTED_ROW`, for the nested season rows on
  `/shooting`). Stated in [FRONTEND.md](FRONTEND.md), guarded by `e2e/alignment-law.spec.ts`. One
  rule shipped and was **reverted the same day**: zeroing a table's edge-cell inset put the first
  column's text hard against the header band's fill. The box sits on the page rail; its cells sit
  on the box's own inner rail.
- **One table module.** `src/components/ui/data-table.tsx` absorbed what had been a *convention* —
  a CSS rule, three exported style objects and a width constant, which twenty-one call sites had
  to reproduce from memory. Five of the seven measurable facts had drifted across them, including
  four tables combining `w-full` with the numeric cap, which silently means "always exactly
  760px". **Every table on the site now renders through it;** the only `<table>` element left in
  `src/` is the module's own. Two tables had independently grown a byte-identical sortable-column
  descriptor and both had hung `onClick` on a bare `<th>`, so neither could be sorted from a
  keyboard — fixed once, in the module. `scripts/screenshots.mjs` was rewritten alongside it to
  end each capture on a **named element** instead of a pinned pixel height.

**On 2026-08-19 the brand mark was replaced** — "Split Ink" superseded the Angled Divider
across every cut (nav, favicon, apple icon, maskable pair, OG card, `docs/logo.svg`), drawn
from one geometry source (`src/lib/brand/court-mark-geometry.ts`) and pinned against drift
by test. The OG card moved to Geist (retiring Outfit entirely) and took the caps lockup and
the operating line. The grammar, construction spec, and archived exploration record live in
[design/BRAND_GRAMMAR.md](design/BRAND_GRAMMAR.md). `docs/social-preview.png` was
re-rendered, and **the GitHub Settings re-upload landed on 2026-08-30** — the repo's `og:image`
now resolves to `repository-images.githubusercontent.com` and serves that exact file. It was
manual because it had to be: the REST API exposes no field for the social preview.

**On 2026-08-24 the palette took a second grade, and the wordmark took a kerning table.** The
first full axe pass over all 20 routes (2026-08-24) found two discrete defects and one systemic
question: the rose/teal poles were validated at the 3:1 graphics bar but were also carrying
**small text**, at 3.0–4.4:1 against AA's 4.5. Michael chose full compliance rather than a
scoped exception, so `--term-red-text` / `--term-blue-text` were added as text-grade cuts of the
same two hues — the poles themselves are unchanged and still paint fills and figures. Two
findings are worth remembering rather than rediscovering: **no dimming opacity on text can pass
AA** (`/shooting`'s noisy rows are de-emphasized by colour instead), and **`aria-hidden` does not
exempt text from the color-contrast rule** (the front door's ghost numerals became CSS counters).
The re-audit is clean on all 20 routes and `design-contrast.test.ts` pins the ratios. The same
day, the FULLCOURT lockup's optical kerning moved into one table
(`src/lib/brand/wordmark-kern.ts`) consumed by the nav, the front-door h2 and the OG card, on the
same one-source rule as the mark geometry. **The VoiceOver walkthrough was refused on 2026-08-30**
as out of scope — the row in [UIUX_CHECKLIST.md](UIUX_CHECKLIST.md) carries the reasoning and the
evidence that the structural a11y work it would have sat on top of is shipped and tested.

**On 2026-08-28 design was pulled to the front of the roadmap, and the whole UI was redesigned in
six stages** — merged as PRs #68 through #73 over 2026-08-28/29. The complaints were a hard seam
where the light header met the dark front door, and a shell that felt static ("click a tab, go to
the tab"). A five-lane research pass and three grilling rounds turned that into decisions rather
than taste, and **[ADR 0010](adr/0010-the-ui-redesign-was-decided-at-the-bench.md) is the ledger**
— read it before reopening any of them. Two research findings shaped everything: no credible
data-sports property runs a left rail as primary navigation, and "modern" in 2026 is motion
between states rather than relocated chrome.

What shipped, by stage: the front-door chrome joins the dark on `/` alone, scoped by
`fc-chrome-front` (#68); every big rate now carries its venue-baseline read and the key columns
their standing (#69); the two-tier bar merged into one slim bar, **a docked bottom nav took the
phones** (four routes plus search, `lg:hidden`, while the desktop tab strip is `hidden lg:block`
— the two never coexist), and ⌘K reaches everything through a `cmdk` palette backed by
`/api/games/search` (#70); the slate became one board with a **density dial** (#71); the headline
became a distance-from-baseline dot plot and the season chart points at its own story (#72); and
motion became five moments of law (#73). The route cross-fade is a **manual
`document.startViewTransition` wrapper** (`src/lib/route-transition.ts`), deliberately not Next's
experimental `viewTransition` flag, so production carries no experimental surface; reduced motion
and unsupporting browsers take the plain state change.

One decision inside the round was Michael's alone and is recorded here because a later reader
will otherwise try to resolve it: **both the dot plot and the season-chart highlight were kept**
(#72), not one or the other. The round was verified as a unit rather than per PR — the merge
order was rehearsed in a throwaway worktree and the full suite run against the union, which is
what caught two cross-PR e2e breaks that no single stage could see. Final state on `main`:
911 unit tests, **170 e2e passed / 0 skipped** against a production build, gate green.

The dependency tree is deliberately pinned; see
[SEASON_ROLLOVER.md §8](SEASON_ROLLOVER.md) before regenerating the lockfile, and §7 for the
season counts and frozen front-door figures that do not derive themselves. **Two runtime
dependencies have been added since the freeze**, and the second one costs more than it looks:

- `gsap` (2026-07-28, for `/about` only). Imported inside an effect so it stays out of the
  shared bundle, and `@gsap/react` was deliberately not added alongside it.
- `cmdk` (2026-08-29, PR #70, for the ⌘K palette). Its own runtime is small — 11 KB raw,
  4.3 KB gzipped — but it declares `@radix-ui/react-dialog` as a **runtime** dependency, so
  **16 `@radix-ui/*` packages entered the tree transitively**, none of them named in
  `package.json`. The app therefore carries **two headless-UI libraries**: `@base-ui/react`,
  which is declared and which `nav-bar.tsx` (the `OTHER` menu) and `ui/button.tsx` use, and
  Radix, which arrived behind `cmdk`. Both land in the same 202.9 KB / **66.2 KB gzipped**
  chunk that ships on **every one of the 20 routes**, because `CommandPalette` is imported
  statically in `src/app/layout.tsx` and the palette renders nothing until ⌘K is pressed.
  Measured 2026-09-01 — see the audit checkpoint below.

## Shipped modules

- **Rest Advantage** — the flagship regular-season fatigue model, historical backtest, game
  explorer, and upcoming-game edge view. **The model no longer calls a game when the fresher
  team is the visitor** (2026-08-02): backing a rested road team measures 42.4% across 11,548
  games, and folding home court into the score instead covers 96.5% of games at 59.7% — below
  the 59.9% from backing the home team every time. That row is published on `/analysis` as its
  own row rather than dropped. Same day, `ALTITUDE_MULTIPLIER` rose 1.15 → 1.29, the first
  ratified coefficient changed on measurement.
  **Every published rate is read against a venue baseline rather than a coin flip**
  (2026-08-06): home teams win 59.9% of all games regardless of rest, so the 61.2% headline is
  worth +1.3 points, not +11.2. See
  [ADR 0006](adr/0006-fatigue-weights-were-fitted-and-the-model-was-not-changed.md) and its
  2026-08-06 addendum.
- **Referee Effect** — what separates NBA officials, at `/referees`. Three chapters: the **mix**
  of fouls each one calls against the league's own seasonal mix (the real, clear finding), **when**
  in a game they arrive (real and narrow — the ends separate officials, the middle does not), and
  the **folklore** chapter added 2026-08-21, which tests the sport's loudest claims about
  individual referees against 913 playoff games and 13,114 regular-season ones. Held back from
  2026-07-30 to 2026-08-22 because a per-official table without its framing reads as the bias
  claim the page exists to refuse. Published on Michael's explicit instruction, under the
  pre-registrations in [ADR 0007](adr/0007-referee-analysis-axes-are-pre-registered.md) and
  `ml/referee_player_preregistration.md`. **The famous Scott Foster / Chris Paul playoff record is
  real (1–10 against 6.34 expected, the most lopsided of 689 pairs) and is published beside the
  arithmetic that dissolves it** — 7 pairs clear p < 0.01 where chance predicts 6.9, and the pair
  is not even as extreme as the maximum a grid that size produces from nothing. The page also
  retires two beliefs: make-up calls are possession changing hands (the sign flips after an
  offensive foul), and no official puts stars in early foul trouble more than another.

- **Availability Cost** — what a missing rotation player costs, in the same points of margin as
  the schedule terms: losing a team's best player is worth 2.86, against home court's 2.82.
  Retrospective by construction, so no live lineup feed and no database table — a generated
  facts artifact pinned by a test, the same shape as Playoff Rest. Lives at `/availability`
  behind the OTHER menu.
- **Playoff Predictor** — complete ingest, series feature pipeline, walk-forward evaluation,
  persisted predictions, API, and `/playoffs` UI. The model improves calibration rather than
  distinguishably improving accuracy over the majority-home-court baseline; **as of 2026-07-30 the
  surface leads with that calibration result** instead of headlining accuracy, and no longer
  claims descent from the regular-season fatigue model. See
  [PLAYOFF_PREDICTOR_DESIGN.md](PLAYOFF_PREDICTOR_DESIGN.md) and
  [`ml/PHASE3_REPORT.md`](../ml/PHASE3_REPORT.md).
- **Shot Quality** — complete collection, aggregation, model evaluation, persisted expected-value
  surface, API, and `/shot-quality` UI. Public data supports location value, not defender- or
  shot-clock-aware quality; see [SHOT_QUALITY_DESIGN.md](SHOT_QUALITY_DESIGN.md).
- **Schedule Disparity** — which teams a season's schedule favored, ranked by **net edge
  games** at `/schedule` (the days-based rest edge was retired 2026-07-30) and, since 2026-08-07,
  priced in **wins** through `src/lib/schedule-value.ts`. The most isolated module: **read-only**,
  no migration, no table, no ingest. Every figure is scoped to its own season — there is
  deliberately no cross-era ranking. Verified against the live database on 2026-07-27 and again
  on 2026-08-07. See [the design spec](superpowers/specs/2026-07-27-schedule-disparity-design.md)
  and [ADR 0001](adr/0001-derive-rest-days-from-games.md).
- **Season Report** — one season read end to end at `/season`: how the rest call scored that year
  against the all-season norm, **what each team's schedule was worth in wins**, which teams
  converted a rest edge, and the nights the league played on zero rest. A direct nav tab since
  2026-07-31, served by `/api/season-report` over `buildSeasonReport`. Every rate tile is gated at
  a minimum game count and reads "too early to call" rather than inventing a verdict from a small
  sample. Two things landed 2026-08-07: the wins figure above, and a **baseline for the rest-edge
  conversion swing**, which had been plotted against zero when its own no-effect line is about
  +10 — the column's rested arm is played at home and its tired arm on the road, so it was
  crediting every team with home-court advantage.
- **Player Shooting** — every player's eFG% on zero rest against three or more days off, at
  `/shooting`, for any season since 1996-97 or pooled across a career. Rest is the player's **own**,
  counted from the games he actually played. Served entirely from the committed
  `public/data/player-rest.json` — no table, no route. A lookup rather than a ranking, because one
  season's split is noise; see [ADR 0002](adr/0002-shooting-source-hoopr.md).

## In progress

**All four items the 2026-09-01 checkpoint audit opened are closed** (measurements and method in
the dated section below). Two were defects the redesign round shipped and no gate could see; two
were the guards that would have caught them — and the guards landed first, failing on the unfixed
code, so each fix had something to prove itself against.

- **[x] P0 · `/shooting`'s rank rider rendered at 1.8:1.** `src/app/globals.css` faded
  `.fc-rest-table tbody tr.fc-noisy > td span[aria-hidden]` to `opacity: 0.4`. That rule was
  written on 2026-08-24 to fade **the effect bar** — the only `aria-hidden` span in a cell at
  the time, and a graphic, which carries no text-contrast requirement. PR #69's `RankBadge`
  then added a *second* `aria-hidden` span in the same cells that is **10px text**, and it
  inherited the fade: `--term-text-muted` `#5D6470` at 0.4 over white composited to `#BEC1C6`,
  **1.8:1** against AA's 4.5:1, on 10 nodes. **Fixed** by giving the bar its own class,
  `.fc-effect-bar`, and pointing the fade at that. The durable rule, now in FRONTEND.md: *a
  selector that says "any hidden span" is one that is waiting for the next one.*
- **[x] P0 · `/season` and `/shooting` scrolled sideways on a phone.** `RankBadge`'s sibling
  `<span class="sr-only">` is `position: absolute` and had no positioned ancestor **inside** the
  table's scroll container, so it laid out against a containing block outside the scroller and
  extended the document past the viewport. Measured at 390px: `documentElement.scrollWidth`
  447 and 437 against a 390 viewport, and `window.scrollTo(400, 0)` really moved `scrollX` to
  57 and 47. At 360px it was +87 and +77, and `/playoffs` picked up +3. Confirmed by bisect —
  hiding `.sr-only` dropped both back to exactly 390 — and by exclusion: the two affected routes
  were precisely the two `RankBadge` pages, while `/games` and `/analysis` were 0. **Fixed** by
  wrapping the badge in a `position: relative` span, which puts the containing block inside the
  scroller and lets it clip.
- **[x] P1 · every horizontally scrolling region is reachable from a keyboard now.** A wrapper
  that scrolls sideways but takes no focus holds its off-screen columns where a keyboard alone
  cannot reach them — axe `scrollable-region-focusable`, serious, **35 nodes across 12 routes**
  at 390px. Two shared components carried all of it and both now take `tabIndex={0}`:
  `ui/data-table.tsx` (every table on the site) and `behind-the-data-parts.tsx`'s `Formula`,
  the `<pre>` on eight of the nine method pages — which the first fix uncovered rather than the
  audit, since it only became the top offender once the tables stopped being.
- **[x] P1 · the a11y pass is a guard now, which is why the three above could ship.** `axe-core`
  was **not a dependency**; the 2026-08-24 pass was a one-off local script whose report lives in
  the gitignored `docs/audit/`. `design-contrast.test.ts` pins **token** ratios and cannot see a
  *composited* one, which is exactly the gap the `opacity: 0.4` finding fell through. The
  checklist's "all 20 routes re-audit with zero violations" was true when written and stopped
  being true four days later, with nothing able to say so. **Closed** by
  `e2e/accessibility.spec.ts` (`@axe-core/playwright`, now a devDependency) and
  `e2e/layout-integrity.spec.ts`, each walking all 20 routes at **two viewports** — 80 of the
  suite's 250 tests. Both ran red on the unfixed code first: axe on 13 routes, the scroll
  assertion on exactly the two the audit named, by exactly the amounts it measured.

**All three of the audit's notes are closed too** — four rows, because the third one split into
a fix and a refusal. Each was taken up the day it was filed rather than scheduled.

- **[x] `pnpm audit --prod` gates CI.** Open since 2026-08-13. `--prod` and not a bare audit:
  the dev tree carries 55 advisories that never reach a user, **38 of them reachable only
  through `shadcn`**, and a noisy gate is one everybody learns to skip. Production has been at
  zero since the 2026-08-13 postcss fix, so a red step here is a regression, not a backlog.
- **[—] Dropping `shadcn` to `pnpm dlx` — tried, and it is wrong.** The audit recommended it as
  a way to take 38 advisories out of the tree, on the reading that a scaffolding CLI ships
  nothing. It ships a stylesheet: `globals.css` line 2 is `@import "shadcn/tailwind.css"`, so
  removing the package fails the build with `Can't resolve 'shadcn/tailwind.css'`. Measured,
  reverted, and recorded here rather than deleted, because the recommendation reads as sound
  and the next person will have the same idea. **A grep that skips `*.css` will call a build
  input unused.**
- **[x] The ⌘K palette is fetched on first summon.** `cmdk` and the sixteen `@radix-ui/*`
  packages behind `@radix-ui/react-dialog` were in the chunk that loads on **all twenty routes**,
  rendering nothing until somebody pressed a key. `command-palette-mount.tsx` is the doorbell
  that stays (~1KB, the three summon handlers); the palette is a `next/dynamic` import.
  Measured on a production build: the chunk is **48,507 bytes raw / 16,325 gzipped**, it is
  absent from the 23 JS files a cold `/games` loads, and it arrives on ⌘K. The palette's own
  e2e — SEARCH button, ⌘K, the dock slot, navigation through it — passes unchanged.
- **[x] `/api/games/search` is cached — at `inSeason`, after the first answer was wrong.** It was
  the only heavy read route with no `Cache-Control` at all, so nothing absorbed the repeat of a
  read that costs the same for `page=1` and `page=999999`. It first took `CACHE.historical` on
  the reasoning that it reads the same settled backtest population `/api/analysis` does — same
  population, and still the wrong policy. `/api/analysis` returns a forty-one-season aggregate
  where last night is invisible among ~39,000 games; this route is `orderBy(desc(games.date))`
  and paginated, so **page 1 is last night**, and `seasonParam` admits the season in progress as
  soon as it has one final game. An hour of `s-maxage` over a day of `stale-while-revalidate`
  would open the explorer on a list missing the most recent slate. `CACHE.inSeason`, pinned by a
  test. **The population does not pick the policy; the ordering does** — which is the test
  `/api/games/dates` and `/api/season-report` had already applied and written down.
- **[—] `games` gets no index on `season` — measured, and the index would not have helped.** The
  audit recommended one and the measurement retired the recommendation, so it is recorded rather
  than deleted. A season-scoped scan of all 51,695 rows costs **8.418 ms with `Buffers: shared
  hit=1123`** — every page already in cache, no disk read to save. It sits inside a
  `searchRegularSeasonGames({season})` that runs **113 ms and returns 993 rows**, so the index
  targets 7% of the fastest case. The *slow* case is the unfiltered search — **38,955 rows,
  ~600 ms** — and it has no season predicate for an index to use. **An index on the selective
  filter cannot speed up the query that omits it.** Should this be reopened, the cost is the two
  `latestFatigueSubquery` joins that dedupe all of `fatigue_scores`, not the scan on `games`; the
  `latestFatigueLateral` shape beside it is the other half of that trade (`queries.ts:84-108`).

**Nothing in the audit is left open.** The third note closed as two rows above rather than one:
the caching half shipped, and the schema half was measured and declined. **Declining is a
result, not a deferral** — a schema change is still manual SQL applied by Michael and never by an
agent, which is exactly why the measurement had to come before the handoff rather than after it.

### The review round, 2026-09-02

PR #75 went through `/code-review` before merge rather than after, and the choice of the plain
review over the multi-agent one was made on the shape of the diff: ~100 lines of source under
665 insertions, already carrying 250 e2e and 912 unit tests. It returned 14 findings. **Ten were
real and are fixed in the same PR**; the split is recorded because the ratio is the useful part,
not the total.

- **The one that mattered was the cache policy above** — a defect introduced *by the audit's own
  fix*, argued from a true premise (same population as `/api/analysis`) to a wrong conclusion.
  Both sibling routes had already written down the correct test and the reasoning did not consult
  them. **A justification that reads well is not the same as one that was checked against the
  neighbours.**
- **Three stale comments, all in code this PR wrote.** `layout.tsx` still said "the palette mounts
  once here", which is exactly what the commit stopped being true and exactly what a future agent
  would read before collapsing the doorbell back into a static import; a `{@link}` pointing at an
  import the same commit deleted; and `data-table.tsx` giving overflow as the reason for an
  unconditional `tabIndex` when overflow is not what axe's rule tests. The code stays — the rule
  is a floor, not the goal — but the stated reason was wrong and is now the true one.
- **Two defects in the new guards themselves.** `layout-integrity.spec.ts` asserted a 0px
  tolerance while its own offender scan used 1px, so a sub-pixel rounding failure would go red
  and name nothing; and neither guard had a readiness gate, so both could in principle scan an
  unhydrated shell and pass having measured nothing. **The guards written to stop vacuous passes
  could produce one.**
- **`docs/API.md` was the one doc that did not ship with the code** — the declared source of
  truth for route cache policy, still reading "Six routes", while four other docs were updated.
  That is [the standing rule](CLAUDE.md) failing in the same PR that quotes it.
- **`pnpm audit --prod` now runs last.** First meant an overnight CVE against a transitive
  dependency would redden every open PR *and* abort the job before lint, type-check, Vitest or
  the build ran. An advisory is real information but it is not a fact about the diff.
  **That ordering earned its keep the same day.** The next push to `main` was docs-only
  (`282e3ba`, CLAUDE.md alone) and CI went red anyway: two high advisories against
  `browserslist <=4.28.6` (GHSA-c83g-rgw3-j3cx, GHSA-73wf-gq98-2v4g) were published twenty
  minutes after the previous green run, reached only through `next → styled-jsx →
  @babel/core → @babel/helper-compilation-targets` at build time. Because the audit ran last,
  every correctness gate still reported green above it, and the failure read as what it was.
  **Closed by PR #76** (merged 2026-09-02): a fifth `pnpm-workspace.yaml` override,
  `browserslist@<4.28.7: 4.28.7`, a lockfile regen that moved only browserslist and its three
  data dependencies, and [SEASON_ROLLOVER.md §8](SEASON_ROLLOVER.md) corrected from "four"
  overrides to five — it had also still quoted the pre-2026-08-13 postcss pin. A red `main` on
  a commit that touched nothing runnable is a reason to read the step list before the logs.
- **Four were declined, with reasons**: consolidating six duplicated route lists in `e2e/` and
  merging the two guards into one navigation pass are both real, both pre-existing patterns, and
  both scope this PR does not own. Moving the `sr-only` fix into `DataTable`'s wrapper as
  `position: relative` would make the bug class impossible — and would also change the containing
  block for every absolutely-positioned descendant in every table, which is a larger blast radius
  than the defect. The e2e count arithmetic reads wrong because the figure it replaced (163) had
  itself gone stale at 170; the doc now says so.

> **One trap worth carrying forward.** Both P0 fixes were correct and axe still reported them,
> because Turbopack served the *previous* `globals.css` across a dev-server restart; `rm -rf
> .next` was what actually cleared it. Before believing a CSS fix did not work, fetch the served
> stylesheet and grep it for the rule you just wrote.

Two items added 2026-08-23, both discussed with and scoped by Michael. Before them this section
had been empty since `/referees` published on 2026-08-22 (its history is under Shipped modules;
the standing rule that replaced its ban is in [CLAUDE.md](../CLAUDE.md) — restoring the
in-progress card is now the mistake, not the safe move).

- **Referee careers are unequal, and the table should say so — an exploration, not a promise.**
  The per-official table ranks a 700-game crew chief beside a 200-game newcomer with nothing but
  the raw `G` column to separate them, and the |z| ≥ 2 bolding quietly favors veterans: at
  n=700 a tiny real quirk clears the bar that an identical quirk at n=200 cannot. Scoped
  2026-08-23: **(1)** add a seasons-active span per official (needs `firstSeason`/`lastSeason`
  per row from the pipeline — presentation, do regardless); **(2)** pre-register and measure an
  **equal-window comparison** — every official scored on their last N games (~200), same sample,
  same noise floor, answers "what is this official like now"; **(3)** a literal per-season split
  is assessed *inside* that pre-registration and is expected to fail — an official works ~65
  games a season, and at that n the |z| ≥ 2 rule blanks nearly every cell. If the exploration
  beats nothing, ship it; **status quo is the accepted fallback**, recorded with the measurement.
  Standing rule applies: any new referee number goes through a written pre-registration first.
  **MEASURED 2026-08-24** (`ml/referee_career_preregistration.md` →
  `ml/REFEREE_CAREER_REPORT.md`): the replication gate first caught a real pipeline defect —
  ESPN's duplicate officials entries were double-credited (one official's G read 721 for 600
  games actually worked) and the order-4 standby was counted; fixed, artifacts regenerated. Then: **(1)**
  the SINCE span column shipped with its censoring caveat; **(2)** drift is real — 11.9% of
  recent-vs-earlier cells beyond |zΔ| ≥ 2 against 4.6% chance, and 32 of 74 officials change
  leading trait — and Michael **adopted the equal window as the table's displayed basis**
  (shipped 2026-08-24; every published row scored on its last 200 games, career figures kept
  in the artifact, drift facts pinned to `src/data/referee-career-drift.json`); **(3)** the
  per-season split passed *both* its declared bars against expectation (11.8% of season cells
  clear the veteran-grade bar; 75.2% sign agreement) and was **declined as a surface by
  design** — the refusal is recorded, with its numbers, on the method page's THE WINDOW
  section.

- **Schedule Edge vs Season Report — RESOLVED 2026-08-23: one home per fact, both pages kept.**
  The audit ran first as scoped (inventory in the decision artifact; both candidate outcomes
  weighed from a casual-fan and an NBA-junkie walk of the live pages), and Michael chose the
  user-experience recommendation over the merge: a merged page would run ~10 screens serving
  two different questions, and the reclaimed nav tab solved nothing. Shipped, see
  [ADR 0008](adr/0008-schedule-pricing-has-one-home.md): the per-team Worth table's one home is
  `/schedule` (`/season` keeps the scale callout and its extremes line and links over, which
  also lifts its own results sections from five screens deep); the two headers now carry the
  identity pair (**as played** vs **the hand dealt**); B2B/3-in-4 counts and edges name each
  other as different facts; and the rest-state classification collapsed into one implementation
  (`restStatePair`, `schedule-value.ts`) with `rest-state-agreement.test.ts` running both
  reducers over one fixture — the two-files-must-agree comments retired into an enforced test,
  which promptly caught a real divergence (the `scheduleValueWins` null gate read the
  opener-gated population instead of its own).

## Known and not fixed

Real, measured, and deliberately left open — recorded so each reads as a decision rather than an
oversight. None is a defect in what the site publishes.

- **Small-screen discoverability** — *affordance shipped 2026-08-15, outcome unmeasured.* The
  2026-08-04 measurement (360×780pt) found the `OTHER` menu entirely off-screen with no scroll
  affordance; the nav strip now fades the edge that still has content under it (the Naver/ESPN
  pattern). The fade is the standard signal, not proof of discovery — re-measure on a real
  device before closing. Full measurements in [FRONTEND.md §Small screens](FRONTEND.md).
  The month/day chip rows on `/games` carry the same overflow with no fade; adopt there only if
  the nav's fade proves itself.
- ~~iOS zooms on form controls~~ — **fixed 2026-08-15**: selects and text inputs take a 16px
  floor at phone widths in the class layer (12px from `sm` up), and the viewport still allows
  pinch-zoom — the `maximum-scale` route was refused on purpose, being what ESPN/NBA/Naver/KBL
  ship instead. e2e asserts the computed sizes; real-Safari behavior wants one hand check.
- ~~No PWA / home-screen support~~ — **fixed 2026-08-15**: `manifest.webmanifest` (standalone,
  `start_url` `/games`), a generated 180×180 `apple-touch-icon` of the court mark, and
  `appleWebApp` metadata. Completed 2026-08-18 with the maskable pair — `/icon-192.png` and
  `/icon-512.png`, route handlers over `maskableIconResponse()`, declared `purpose: "maskable"`
  so a launcher that crops has artwork inside the spec's 80% safe circle.
- ~~**`/season` can serve a stale empty rollover for weeks from 1 October.**~~ — **fixed**, and
  this entry outlived the fix. `/season` is keyed on `getSeasonGamesStamp`, not
  `getCompletedGamesStamp`: four components (`scheduled/finals@latest#checksum`) over the same population
  the report reads, so seeding a schedule moves the stamp even though nothing is final yet. Since
  2026-08-18 that window also renders a real page rather than an empty one — a season with no
  completed game reports on the `"schedule"` basis.
- ~~**`docs/social-preview.png` needs one manual re-upload.**~~ — **uploaded and verified
  2026-08-30**, and this entry outlived the fix by one audit (found stale 2026-09-01: the
  In progress section above already recorded the upload while this row still asked for it).
  Regenerated 2026-08-18 as a render of `/opengraph-image` rather than a hand export; GitHub
  now serves it from repo settings, and the live `og:image` resolves to
  `repository-images.githubusercontent.com` with a PNG byte-identical to the committed file.
  See [SEASON_ROLLOVER.md §7](SEASON_ROLLOVER.md).
- ~~**2026-27 is not seeded.**~~ — **seeded 2026-08-18**: 1,200 games from ESPN, keyed
  `espn-<eventId>`, cross-checked against Fox Sports. Both NBA-owned sources remain blocked from
  outside the US *and* from CI runners (re-probed the same day), so the `002…`-id path was not
  taken and is no longer needed — the nightly score path matches on (date, away, home) instead.
- **Shooting by Rest will carry no 2026-27 data until those rows are re-keyed to `002…` ids.**
  `scripts/analyze_player_shooting.py` filters `external_id LIKE '002%'` and joins hoopR box
  scores on that id; 2026-27 is keyed `espn-<eventId>`, so the join finds nothing. Nothing else
  is affected — the nightly score path matches on (date, away, home) precisely so it cannot be.
  **Decided and built, waiting on games**: `scripts/rekey_season_from_hoopr.ts` (2026-08-18).
  hoopR's `nba_stats_*` ids are the canonical ones, and the script matches them to stored rows on
  (away, away points, home, home points) — validated against 2025-26, where keys built from its
  1,230 rows resolved to the id each already holds, 1,230 correct with 0 wrong and 0 collisions.
  It can only convert games that have been **played**, so run it from **January 2027**, and again
  later for the remainder. See [SEASON_ROLLOVER.md §9](SEASON_ROLLOVER.md).
- **The nightly pipeline was dead for the whole back half of 2025-26, and the fix has not yet
  run on a live slate.** `daily_update.py`'s first network call was to `cdn.nba.com`, which
  403s, so it raised before updating a score, reading overtime, or recomputing fatigue — every
  in-season run from at least 2026-05-11 failed there, while the offseason runs either side
  showed green from the season gate. Rewritten onto ESPN on 2026-08-18 and verified against
  historical data (0 writes needed over dates whose values were already correct; a perturbed
  row correctly repaired). It cannot be exercised against a real slate until 2026-10-20 —
  **check the first in-season run by hand**, following [LAUNCH_DAY.md](LAUNCH_DAY.md), which
  was written 2026-08-27 for exactly this check. Read it before opening night, not during: it
  records that the Actions run *on* 2026-10-20 fires before tip-off and correctly writes
  nothing, so the run to check is 2026-10-21's.

## Maintenance responsibilities

- Follow [SEASON_ROLLOVER.md](SEASON_ROLLOVER.md) before each new NBA season, and
  [LAUNCH_DAY.md](LAUNCH_DAY.md) on the first live slate of one.
- The Vercel live-score cron runs **daily, year-round** — there is no seasonal cadence to
  switch. `/api/cron/update` early-returns before any ESPN fetch when neither of the two ET dates
  it checks (yesterday and today — it fires at 2–3 AM ET) has a `scheduled|live` row, so an
  off-season run costs one indexed query. See `vercel.json`.
- Keep GitHub Actions, Vercel, Supabase environment variables, and dependency security patches
  current.
- Re-run the documented schedule/date integrity audit after new season ingestion.
- Preserve the isolation of each analytics module and the existing rest-advantage naming
  contract.

## 2026-09-01 — the checkpoint audit

A full four-track audit — security, UI/UX, performance, architecture — run against `main` at
`cb590e0` plus the two docs commits after it, to answer "where is this project" rather than to
close a ticket. Everything below was measured this session, against a production build served
locally and against the live deployment; nothing is carried forward from a previous pass
unverified.

**Every gate is green.** 911 unit tests / 67 files, `typecheck`, `lint`, `build`, and the full
**170 e2e / 0 failed** against a production build. Scale, for the record: 20 routes, 12 API
routes, 214 TS/TSX files, ~36.8k lines under `src`; a 317 MB database holding 51,695 games,
103,390 fatigue scores and 1,029,098 shot-grid cells.

**Security is in good shape, and one number is worth stating plainly: zero
production-reachable dependency advisories.** `pnpm audit` reports 55, and every one of them is
dev-only — verified by splitting the advisory JSON on the `dev` flag rather than by reading
paths. The 2026-08-13 postcss pin fix has held. Two things follow from the same measurement:
**38 of the 55 are reachable only through `shadcn`** — which reads as a scaffolding CLI and is
not one: `globals.css` line 2 imports `shadcn/tailwind.css`, so it is a build input, and dropping
it to `pnpm dlx` fails the build. *(That correction is the audit's own: the recommendation here
originally said to drop it, and it was tried and reverted on 2026-09-01 — a grep that skips
`*.css` will call a build input unused.)* And there was **no `pnpm audit --prod` gate in CI**,
carried open since 2026-08-13, whose own finding — a pin that had quietly aged into *holding* a
vulnerable version — was the argument for adding one. Cheap, because production is at zero; added
the same day.

The rest of the security surface re-verified clean and is recorded so the next pass can skip
it: all 12 routes are `GET`; 10 go through `jsonRoute`'s Zod envelope and the two that do not
are the documented pair (`/api/health` takes no input, `/api/cron/update` is the only
authenticated route and compares its bearer token with `timingSafeEqual`, failing closed with a
503 when `CRON_SECRET` is required but unset). No injection sink exists in `src` — every
Drizzle `sql` template is parameterised, the one `sql.raw` (`scripts/backfill_fatigue.ts:50`)
interpolates a module constant, and the two Python f-string queries interpolate
`ABNORMAL_STRETCHES` and a caller-supplied table name in hand-run scripts with no HTTP surface.
Only `.env.example` is tracked and no `.env*` file has ever been committed. Live headers were
read off production, not assumed: HSTS `max-age=63072000; includeSubDomains; preload`, the CSP
correctly without `unsafe-eval`, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`,
`Permissions-Policy`, and Brotli doing real work — the largest API payload compresses
636,661 → 51,277 bytes at the edge with `x-vercel-cache: HIT`.

**The two defects the audit found are both in `RankBadge`, and both are in the In progress
section above.** They are worth one sentence here about *why* they got through: neither is
visible to any gate the project has. A contrast test that reads token hexes cannot see an
`opacity` composited over white, and an e2e suite that asserts alignment rails does not ask
whether the document scrolls sideways. The pattern is the one already recorded for inline
styles beating hover classes — **a rule written for the only element that matched it at the
time, meeting a new element that also matches it.**

**Performance: the shared bundle is the finding.** Every route loads 878 KB raw / **270 KB
gzipped**, of which 38.5 KB is the `noModule` polyfill chunk that modern browsers skip — so the
real figure is **231.7 KB gzipped on every page, including pure prose pages**. A single
202.9 KB / 66.2 KB-gz chunk holding `@base-ui/react` + `cmdk` + Radix accounts for more than a
quarter of it; the dependency note above says how the second headless-UI library got there.
`@base-ui` is legitimately global (the `OTHER` menu is in the chrome), so the recoverable slice
is the palette's, not the whole chunk — but the palette renders nothing until ⌘K and is
imported statically in `layout.tsx`, which is the wrong default for a surface nobody has
opened. Everything else that could have been wrong is right: no N+1 anywhere; recharts
(2 × 353 KB) route-scoped behind `*-lazy.tsx`; GSAP loaded inside an effect; supabase-js
(56 KB gz) scoped to `/games`.

Two data-layer notes, neither urgent. **`/api/games/search` reads 39,016 rows to return 20** —
`searchRegularSeasonGames` fetches the whole matching population and `buildHistoricalGameSearch`
slices it in memory, so `page=999999` costs exactly what `page=1` costs (measured: 0.58 s and
0.55 s). It is the only heavy read route not behind `createStampedCache` and the only one with
no `Cache-Control`, so nothing absorbs a repeat. And **`games` has no index on `season`** —
verified against the live database, which carries `date`, `status`, `home_team_id`,
`away_team_id`, `external_id` and the primary key — so every season-scoped read scans 51,695
rows. Latency is fine today; this is a note for the season where it is not. *(Both were taken up
the same day. The caching half shipped; the index was measured and declined — that scan costs
8.418 ms fully cached, and the slow search has no season filter to index. See the checkpoint
section above before acting on this paragraph.)*

**Architecture held up.** Module isolation is real at the surface layer — nine modules, each
with its own route, page, `*-server.ts` and facts module — but it stops at the query layer:
`src/lib/db/queries.ts` is **1,465 lines** carrying every module's queries in one file, banner-
sectioned rather than split. It is also the only large module with no unit test file, which is
defensible (it is DB-bound and covered through `src/app/api/__tests__`). `analysis-content.tsx`
is the largest component at 1,209 lines with 71 inline `style` blocks. The ~80 exported-but-
unimported symbols are mostly types that are legitimately part of a module's surface; the
genuinely internal-only functions are unchanged from the 2026-08-12 scan and are still
deliberately undeleted. `createStampedCache` remains the best abstraction in the codebase — its
one invariant is written down *and* enforced by pairing the stamp with its loader.

One process result is worth keeping. **The docs shipped with the code this round**, and it is
checkable: `FRONTEND.md` carries the dock, the 56px bar, view transitions, the density dial,
`RankBadge` and `cmdk`, and ADR 0010 is committed. The audit found exactly one stale row — the
social-preview upload, still listed as pending under Known and not fixed while the section
above it recorded the upload landing — and it is struck through now.

## 2026-07-29 → 30 — the fatigue overhaul

A second audit of `src/lib/fatigue.ts` found ten defects and all but one were fixed. The three
that mattered most:

- **The overtime term had never fired.** `games.overtime_periods` read 0 for every game in the database,
  because its only loader used `stats.nba.com`, which is unreachable from outside the US. It is
  now sourced from ESPN by `scripts/fetch_game_context.ts`.
- **Time zones were approximated by a 26° longitude test**, which missed 871 of 3,522 genuine
  two-zone road trips and false-fired on 40. Zones are now resolved from real UTC offsets.
- **Neutral-site games were geolocated at the listed host's arena.** They are now scored as away
  games for *both* teams, at the venue they actually travelled to.

Also added: turnaround hours sharpening the back-to-back multiplier, acclimation decay and an
eastward/westward asymmetry on the circadian term, a blowout discount on prior-game load, a
continuous freshness curve, and an altitude carryover. Cumulative season load was considered
and **declined**. Migration `0011` added `tip_off_utc`, `neutral_site` and
`neutral_venue_city`. See [ADR 0003](adr/0003-fatigue-inputs-limited-to-espn-era.md) for the
era limits of the ESPN source, and [DATA_PIPELINE.md](DATA_PIPELINE.md) for the revised formula.

**Read the result honestly.** Published tier win rates rose about a point, but on games both
the old and new model call, accuracy moved 0.15pp and the two pick the same team 98.8% of the
time. The gain is the new model *declining* 2,661 games the old one called at below a coin
flip. That is better selectivity, not better prediction.

Single-term ablations, holding the sample fixed: recent workload −1.59pp, back-to-backs
−0.90pp, travel −0.35pp, road segment −0.15pp, and altitude, overtime and freshness at roughly
nothing, with schedule density very slightly harmful. The model is essentially recent workload
plus back-to-backs. The four terms that earn nothing are kept because they are physically real
and correctly computed, which is a different claim from being useful.

**Those ablation figures are a record of this pass, not a description of the current model.**
Holding the sample fixed only measures anything while the rule can pick either side; once the
model stopped calling rested visitors on 2026-08-02, every fixed-sample ablation returns zero by
construction, because a called game is always a home pick. They were re-measured that day on
what the terms now actually do — select which games get called — by `ml/ablate_fatigue_terms.py`.
See `/behind-the-data/rest-advantage`.

The re-measurement overturned the "four terms earn nothing" reading above. **Every term finds
games that win.** Ranked by correct calls above a coin flip given up if removed: travel 404,
recent workload 336, back-to-back 210, road segment 209, altitude 71, density 41, overtime 20,
freshness −10. Travel leads because it is the widest net in the model — 5,994 calls no other
term produces, winning at 59.14%. It *lowers* the published average (+0.32pp when removed) only
because those games are slightly harder than the model's 61.17% core, which is what widening
reach looks like. Deleting a term because its removal raises the headline would trade winning
predictions for a prettier percentage.

## 2026-08-02 → 03 — the search for a better model, and what it returned

The fatigue model was pushed hard for a further gain and **did not yield one**. Weights were
fitted out-of-sample on 16 blind seasons, alternative functional forms were searched broadly, and
a set of new candidate variables was tested. Two changes survived and shipped — the altitude
multiplier and the rested-visitor rule above. Nothing else did.

That is the finding, and it is written down so the question is not reopened from scratch:

- **Fitted weights do not beat the ratified ones** by enough to matter, and most terms carry no
  independent signal. [ADR 0006](adr/0006-fatigue-weights-were-fitted-and-the-model-was-not-changed.md)
  is the record; use the harness (`scripts/export_fatigue_features.ts` → `ml/fit_fatigue_weights.py`)
  for questions of this shape, never a database recompute.
- **Candidate variables that returned nothing:** signed jet lag, continuous schedule density, a
  body-clock term controlled for franchise identity, a 30-day games window beyond the 7-day one,
  and baselining a team against its own norm rather than an absolute scale. Franchise identity is
  the confound that killed three of the five.
- **The ceiling is close.** The schedule feature block carries roughly an eighth of the mutual
  information team strength does, and the rest advantage prices at about **0.35 points of margin
  per point of RA** against home court's ~4.7 in the same specification. The published RA ≥ 0.5
  call is therefore worth around 0.18 points on a 13.9-point margin spread — real, precisely
  estimated, and small.

Two documentation defects were found in the same pass and both are fixed: the site published a
schedule-density cap of `1.42` that the model **can never reach** (each of the five windows is
clamped before the curve applies, so the realised maximum is `1.307`), and `ml/data/`'s model
table had gone stale against the altitude change and was regenerated.

## 2026-07-29 → 30 — surfaces

- **Referee Effect** shipped 2026-07-29 at `/referees`, was **reduced to a placeholder on
  2026-07-30**, and **returned on 2026-07-31** asking a different question. Its original one —
  does any referee tilt the whistle home? — came back inside noise, and a table of muted cells
  invites readers to find names in it anyway. Crew rest was asked next and returned a null too.
  What does separate officials, clearly and repeatably, is the *mix* of fouls they call, so the
  page now publishes that against the league's own seasonal mix — a statement about style, not
  fairness, which is why nothing on it is called bias. Keeping the ingest
  (`scripts/fetch_officials.ts`) and its dataset test through the placeholder day is what let the
  page return without a re-ingest.
- **Behind the Data** added 2026-07-30: a reference section documenting every model's terms,
  constants and limits, reached from the nav row's `Reference` landmark and from a
  `HOW THIS IS CALCULATED` link on each product page. It grows with the product — nine routes
  as of 2026-08-22, an index plus one per model, the newest being `/behind-the-data/referees`.
  Since that one, **every published surface has a method page** and the test enforcing it carries
  no exemptions.
- **`/about` rebuilt** 2026-07-30 as seven full-viewport sections. Its evidence figures are now
  read from the live backtest rather than hardcoded — all three had gone stale, one of them
  citing a metric that had been retired.
- **2019-20 admitted** 2026-07-30. The season had been excluded from `NBA_SEASONS` outright and
  never ingested, which discarded the 971 games played before the March 2020 suspension in order
  to exclude the 88 played in the Orlando bubble. Exclusions moved to the module that objects to
  the data: `ABNORMAL_STRETCHES` drops the bubble from every model, `TRUNCATED_SEASONS` withholds
  the season from Schedule Edge alone (the one surface that ranks teams within a season, and so
  cannot tolerate a 63-to-67 game spread), and the series model keeps its own exclusion because
  the bubble playoffs followed a 4½-month layoff. See
  [ADR 0004](adr/0004-season-exclusions-belong-to-modules-not-ingest.md).

  The same pass retired the Oct 1–Apr 30 window as a data filter. It had been documented as the
  project's single season-regime policy while silently dropping 135 of 2020-21's May games and 44
  of 1998-99's, neither of which was reachable through the Games month tabs either. The backtest
  grew 38,084 → 38,851 games and the headline rate moved 55.6% → 55.50%.

  Seeding needed a detour: `stats.nba.com` is unreachable from Seoul and from GitHub's runners,
  so `scripts/seed_season_from_hoopr.ts` joins hoopR box scores (canonical NBA game ids, sides,
  scores) to the ESPN scoreboard (dates) on `(away tricode, away pts, home tricode, home pts)`.
  It matched 1,142 of 1,142 and refuses to write a partial season.
