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
re-rendered; **the GitHub Settings re-upload is manual and still pending.**

The dependency tree is deliberately pinned; see
[SEASON_ROLLOVER.md §8](SEASON_ROLLOVER.md) before regenerating the lockfile, and §7 for the
season counts and frozen front-door figures that do not derive themselves. **`gsap` is the one
runtime dependency added since the freeze** (2026-07-28, for `/about` only; still the only
one as of 2026-07-30). It is imported
inside an effect so it stays out of the shared bundle, and `@gsap/react` was deliberately not
added alongside it.

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

Nothing. **`/referees` was the last held-back surface and was published on 2026-08-22**, which
empties this section for the first time since the module was built. Its history is recorded under
Shipped modules below, and the standing rule that replaced its ban is in
[CLAUDE.md](../CLAUDE.md) — restoring the in-progress card is now the mistake, not the safe move.

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
  `getCompletedGamesStamp`: three components (`scheduled/finals@latest`) over the same population
  the report reads, so seeding a schedule moves the stamp even though nothing is final yet. Since
  2026-08-18 that window also renders a real page rather than an empty one — a season with no
  completed game reports on the `"schedule"` basis.
- **`docs/social-preview.png` needs one manual re-upload.** Regenerated 2026-08-18 as a render of
  `/opengraph-image` rather than a hand export, so the stale "40-SEASON BACKTEST" card and the
  pre-2026-07-30 logo lean are gone from the tree — but GitHub serves the preview from repo
  settings, so the current file only becomes the live card once someone uploads it (Settings →
  Social preview). See [SEASON_ROLLOVER.md §7](SEASON_ROLLOVER.md).
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
  **check the first in-season run by hand.**

## Maintenance responsibilities

- Follow [SEASON_ROLLOVER.md](SEASON_ROLLOVER.md) before each new NBA season.
- The Vercel live-score cron runs **daily, year-round** — there is no seasonal cadence to
  switch. `/api/cron/update` early-returns before any ESPN fetch when neither of the two ET dates
  it checks (yesterday and today — it fires at 2–3 AM ET) has a `scheduled|live` row, so an
  off-season run costs one indexed query. See `vercel.json`.
- Keep GitHub Actions, Vercel, Supabase environment variables, and dependency security patches
  current.
- Re-run the documented schedule/date integrity audit after new season ingestion.
- Preserve the isolation of each analytics module and the existing rest-advantage naming
  contract.

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
