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
`GAMES` as a view toggle rather than kept as a sixth tab. The five are now `GAMES`,
`SCHEDULE EDGE`, `MODEL RESULTS`, `PLAYOFF REST` and `PLAYER SHOOTING`; `SHOT VALUE`
and `REFEREE EFFECT` live behind the `OTHER` menu. Module names are unchanged; see
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

The dependency tree is deliberately pinned; see
[SEASON_ROLLOVER.md §8](SEASON_ROLLOVER.md) before regenerating the lockfile, and §7 for the
season counts and frozen `/about` figures that do not derive themselves. **`gsap` is the one
runtime dependency added since the freeze** (2026-07-28, for `/about` only; still the only
one as of 2026-07-30). It is imported
inside an effect so it stays out of the shared bundle, and `@gsap/react` was deliberately not
added alongside it.

## Shipped modules

- **Rest Advantage** — the flagship regular-season fatigue model, historical backtest, game
  explorer, and upcoming-game edge view. **The model no longer calls a game when the fresher
  team is the visitor** (2026-08-02): backing a rested road team measured 44.4% across 7,224
  games and no threshold rescues it, so rest alone never outweighs home court. The declined half
  is published on `/analysis` as the evidence rather than dropped. Same day, `ALTITUDE_MULTIPLIER`
  rose 1.15 → 1.29, the first ratified coefficient changed on measurement. See
  [ADR 0006](adr/0006-fatigue-weights-were-fitted-and-the-model-was-not-changed.md).
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
  games** at `/schedule` (the days-based rest edge was retired 2026-07-30). The most isolated module: **read-only**, no migration, no table, no
  ingest. Every figure is scoped to its own season — there is deliberately no cross-era ranking.
  Verified against the live database on 2026-07-27. See
  [the design spec](superpowers/specs/2026-07-27-schedule-disparity-design.md) and
  [ADR 0001](adr/0001-derive-rest-days-from-games.md).

## Maintenance responsibilities

- Follow [SEASON_ROLLOVER.md](SEASON_ROLLOVER.md) before each new NBA season.
- The Vercel live-score cron runs **daily, year-round** — there is no seasonal cadence to
  switch. `/api/cron/update` early-returns before any CDN fetch when today's ET date has no
  `scheduled|live` rows, so an off-season run costs one indexed query. See `vercel.json`.
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

- **Referee Effect** shipped 2026-07-29 at `/referees`, then was **reduced to a placeholder on
  2026-07-30**. Its central question — does any referee tilt the whistle home? — came back
  inside noise, and a table of muted cells invites readers to find names in it anyway. The
  ingest (`scripts/fetch_officials.ts`) and its dataset test are deliberately left in place so
  the page can return without a re-ingest.
- **Behind the Data** added 2026-07-30: a reference section documenting every model's terms,
  constants and limits, reached from the nav row's `Reference` landmark and from a
  `HOW THIS IS CALCULATED` link on each product page. It grows with the product — eight routes
  as of 2026-08-03, an index plus one per model, the newest being `/behind-the-data/availability`.
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
