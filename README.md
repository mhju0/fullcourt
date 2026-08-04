<div align="center">

<img src="docs/logo.svg" alt="FullCourt logo" width="104" height="104" />

# FullCourt

**An NBA analytics platform that turns four decades of schedule data into game-level predictions.**

[![CI](https://github.com/mhju0/fullcourt/actions/workflows/ci.yml/badge.svg)](https://github.com/mhju0/fullcourt/actions/workflows/ci.yml)
[![Daily NBA Update](https://github.com/mhju0/fullcourt/actions/workflows/daily-update.yml/badge.svg)](https://github.com/mhju0/fullcourt/actions/workflows/daily-update.yml)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?logo=supabase&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38BDF8?logo=tailwindcss&logoColor=white)

</div>

FullCourt quantifies how **travel, rest, and schedule density** shape NBA outcomes. Its flagship model assigns every team a multi-factor **fatigue score**, derives a **rest advantage** for each matchup, and backtests it against every NBA season since 1985-86.

> **The finding:** where the model makes a call, the more-rested team wins the majority of games —
> and the edge widens once the rest-advantage gap reaches **5+ points**. The call is deliberately
> one-sided: since 2026-08-02 the model declines a game when the fresher team is the *visitor*,
> because backing a rested road team measured 44.4% and no threshold rescues it. Every rate is
> computed live from the database rather than typed here; as captured in the screenshots below on
> 2026-08-03, that ran **61.2%** overall and **65.3%** at a 5+ gap, with the declined half
> published beside it at 42.4%.

🔗 **Live demo:** https://fullcourt-nba.vercel.app &nbsp;·&nbsp; **Code:** https://github.com/mhju0/fullcourt

> **Project status:** actively developed. The live demo and scheduled data pipeline are
> operational, and new analytics modules are built as additive, isolated slices — their own
> scripts, tables, routes, and page — so they never destabilize the flagship rest-advantage flow.

---

## Demo

**Games — the per-matchup view.** Each team's fatigue score, the rest-advantage
differential, and a confidence read. Every rest-advantage number carries the historical hit
rate and sample size of its class; matchups the model calls neutral get no claim at all.

<img src="docs/screenshots/games.png" alt="The Games page for Sunday, April 12, 2026, with a BY DATE / UPCOMING toggle set to BY DATE. Three tiles read 15 games on this date, an average rest advantage of 0.8, and 0 high-confidence games. A Scope panel below holds the 2025-26 season with month buttons from October to April, April selected, and day chips 1 through 12 each captioned with its game count, the 12th selected. A banner reads that the 2025-26 season is complete and the final slate is showing, linking to the backtest. Two matchup cards follow. The first, Brooklyn Nets 101 at Toronto Raptors 136, shows fatigue bars of 3.3 and 4.4, a rest-advantage panel giving BKN plus 1.1 with a MED CONF badge, and a sentence reading that any measurable gap has gone the rested team's way 61.2% of the time from 27,400 games. The second, Chicago Bulls 128 at Dallas Mavericks 149, shows fatigue scores of 4.4 and 4.6, is scored EVEN 0.2 with a NEUTRAL badge, and carries no such sentence." width="900" />

**Schedule Disparity — who the schedule favored.** All 30 teams ranked by net edge games,
drawn from a zero line so the bar length *is* the edge. Positive is favorable in every column on
the page.

<img src="docs/screenshots/schedule.png" alt="Schedule Disparity for 2025-26, marked final with 1,214 of 1,230 games compared. A summary strip reads most favored plus 21 (Utah Jazz), least favored minus 17 (Boston Celtics), a spread of 38 edge games best to worst, and 942 games with an edge of which 541 were big (1.5+). Below it all 30 teams are ranked as horizontal bars diverging from a zero line, blue to the right for a favorable edge and red to the left for an unfavorable one, from Utah at plus 21 and Cleveland at plus 18, down through Sacramento at exactly zero, to Houston at minus 16 and Boston at minus 17. The two altitude teams sit high — Utah first and Denver fifth at plus 11 — because visitors to thin air carry more fatigue. A header note states the season is final with 1,214 of 1,230 games compared." width="900" />

**Model Results — the full-history backtest behind the headline finding.** Win rate by rest-advantage
threshold, plotted as the gap against a coin flip in percentage points: zero is a 50% win
rate, so the bar's length is the measured edge. Slices the model gets backwards hang below
the line in red.

<img src="docs/screenshots/analysis.png" alt="Rest Advantage Analysis. The intro reads that among completed regular-season games the model asks whether the more-rested team won, and is called only when that team is also at home. A HOW THIS IS CALCULATED link sits below it. Three summary tiles read an overall win rate of 61.2% across 27,400 games, a RESTED VISITOR · DECLINED figure of 42.4% across 11,548 games not called, and 65.3% at a rest advantage of 5 or more across 3,782 games. Below them, win rate by rest-advantage threshold is drawn as deviation columns measured from a 50% coin flip: four blue bars rise from a zero line, growing left to right from RA at least 2 to RA at least 7, each labelled with its sample size — 16,078, 10,524, 3,782 and 1,108 games. A legend states that blue means the rested team beat a coin flip and red means it lost to one. A final card, THE HALF THIS MODEL DECLINES, shows 42.4% from 4,894 wins in 11,548 games and explains that backing a fresher visitor loses, that raising the bar does not rescue it, and that rest alone never outweighs home court." width="900" />

**Playoff Rest — what surviving a long series costs the round after.** The page leads with the
argument, not the bracket: every playoff game after Game 1 is played on equal rest by
construction, so the only rest signal left is how far each team's previous round ran. The
home-court team's series win rate climbs from 68.9% to 85.4% depending on whether its opponent
closed out early or went the distance, the effect survives holding a team's own result fixed, and
the model's bracket picks below carry that gain.

<img src="docs/screenshots/playoffs.png" alt="Playoff Rest for 2025-26. The header reads PLAYOFF REST and The round before decides the round after. THE POSTSEASON HAS NO REST states 2,545 of 2,545 playoff games after Game 1 were played on equal rest, with only 277 of 600 Game 1s equally rested. THE GRIND TAX leads with a single figure — plus 16.5 points better odds when the other team arrives off a long series, rounds 2+ — over two full-width bars that hold the reader's own last round fixed at a quick close: 68.9% across 74 series when the opponent also closed early, and a highlighted 85.4% across 89 series when the opponent went the distance. A line below notes that when you went the distance too the edge reverses, 65.9% against a fresh opponent and 59.7% against a tired one. A season selector set to 2025-26 follows, then the first-round bracket: eight series cards, each with the result, the model's pick probability, its hindsight probability, and a CORRECT or UPSET verdict." width="900" />

**Player Shooting — a lookup, not a ranking.** Every player's eFG% on zero rest beside three or
more days off, with the split's sample size shown on both sides so a thin season reads as thin.

<img src="docs/screenshots/shooting.png" alt="Shooting by Rest for 2025-26, filtered to players with 300 or more attempts, 284 players in the season. A note defines no rest as having played yesterday and 3+ days rest as at least three days since his last game, both counted from the games he actually played, with rest effect being the right column minus the left. A table sorted by field-goal attempts lists each player's team, age, games, FGA, overall eFG%, then eFG% and attempts on no rest, the same on 3+ days rest, and the signed rest effect drawn as a bar. Jaylen Brown leads by volume at 1,543 attempts with a plus 1.90 effect; Jalen Brunson shows 49.3% on 223 no-rest attempts against 55.0% on 380 rested ones for plus 5.67; Luka Dončić runs the other way at 65.5% against 55.2% for minus 10.32; James Harden shows the largest positive at plus 11.54." width="900" />

**Expected Shot Value — location-only xeFG%.** A gradient-boosted location model beside the
zone-average baseline it is measured against.

<img src="docs/screenshots/shot-quality.png" alt="Expected Shot Value for 2025-26, covering 1,808 cells and 219,121 shot attempts. A colour scale runs from 26% low value in tan to 56% high value in blue. Two half-court maps sit side by side: BASELINE, the zone average, whose colour changes in blocky steps at zone boundaries, and GBM, the location model, whose colour varies smoothly. Both show a blue arc along the three-point line and blue at the rim, with the long mid-range in tan — most visibly so on the GBM court. Marker size encodes shot attempts from that cell." width="900" />

**Availability Cost — every effect this site measures, in one unit.** Losing your best player
against playing at home, a back-to-back, thin air and an overtime, all in points of final margin
so they can be read against each other directly. The page also answers the standing objection to
the whole premise — that the schedule effects are really absences in disguise.

<img src="docs/screenshots/availability.png" alt="Availability Cost, headed What a missing player is worth. WHAT AN ABSENCE COSTS leads with 2.86 points — what a team loses when its best player sits — over five bars in points of final margin: best player out 2.86 highlighted in blue, playing at home 2.82, on a back-to-back 1.76, visiting altitude 1.36, and off an overtime 0.54, measured across 35,458 games with both teams' records held equal. HOW OFTEN gives three figures: 17.1% of games have one side missing its best player, 44.5% of team-games are missing nobody from the rotation, and 8.6 players in a typical rotation. THE LOAD-MANAGEMENT ERA plots one bar per season from 1996-97 at 6.0% to a highlighted 2025-26 at 19.5%, noting the climb dips in 2023-24, the season the league first required 65 games for awards eligibility. THE SCHEDULE STILL COUNTS holds who actually played fixed and re-measures each schedule term: back-to-back 1.759 to 1.641 (6.7% shift), visiting altitude 1.358 to 1.282 (5.6%), off an overtime 0.544 to 0.501 (7.9%), and schedule density 0.275 to 0.265 (3.8%) — every one under 8%, so load management does not explain the schedule away." width="900" />

---

## Features

Nine product routes sit behind six direct nav tabs plus an **OTHER** menu, which holds the
smaller reference surfaces so the bar stays short as they accumulate. Labels are plain nouns
with no time words — the pattern every mainstream NBA nav uses — while the precise terms
(`xeFG%`, net rest edge) live in each page's eyebrow, where surrounding context decodes them.

- **Games** (`/`) — live matchup cards with fatigue bars, a rest-advantage gauge, and real-time
  score/status updates via Supabase Realtime. Browses any season back to 1985-86 by date, and
  carries an **UPCOMING** view: the remaining schedule in date order, filterable to a minimum
  rest-advantage gap, each game shown with the historical hit rate and sample size of its
  rest-advantage class. Not
  betting advice. (This view is the retired `/upcoming` route, which now redirects here.)
- **Season Report** (`/season`) — one season read end to end: how the rest call scored that year
  against the all-season norm, which teams actually converted a rest edge into wins, what the
  schedule cost each of them, and the nights the league played on zero rest. Honest framing: a
  single season is a small sample, so every rate tile is gated at a minimum game count and the
  verdict says "too early to call" rather than inventing one.
- **Schedule Edge** (`/schedule`) — which teams a season's schedule favored, ranked by **net edge
  games**: games arrived at with a real rest edge, minus games played against one, with
  back-to-back and short-rest differentials beside it.
  Honest framing: it describes the schedule rather than predicting anything, much of the gap is
  structural rather than anyone being favored, and every figure is scoped to its own season —
  season length, team count and the league-wide rest distribution all shifted across four
  decades, so there is deliberately no all-time ranking.
- **Model Results** (`/analysis`) — the historical backtest that scores the rest model: win rate by
  rest-advantage threshold and by season, the home-rested split, and a filterable game explorer.
- **Playoff Rest** (`/playoffs`) — what surviving a long series costs the round after, argued
  before the bracket rather than under it. Every playoff game past Game 1 is played on equal rest
  by construction, so the only rest signal left is how far each team's previous round ran, read
  format-aware (Round 1 was best-of-five through 2001-02). The home-court team's series win rate
  in rounds 2+ runs 68.9% when both sides closed early against 85.4% when only the opponent went
  the distance, and the gap survives narrowing to evenly-matched series. Below the argument sits
  the bracket: a four-feature logistic at series grain, still driven mainly by regular-season
  record (`win_pct_diff` outweighs the one rest-shaped input, `prior_grind_diff`, about two and a
  half to one). Honest framing: the model's gain lives where a prior round exists to have been
  ground down by — 73.3% against a 69.5% always-pick-the-home-court baseline over 210 rounds-2+
  series, per-season 11-16-3 — and it *loses* in Round 1, 77.1% against 78.8%, where the feature
  is zero for every row. Pooled over 30 seasons predicted in advance that nets out to 75.3% vs
  74.4%, a tie inside the noise; the durable win is calibration, log loss 0.5696 → 0.4939 (~13%)
  and Brier 0.1907 → 0.1628 (~15%). The page leads with the finding and the bracket; the full
  argument — the round split, the confound test and the calibration table — sits one link away at
  `/behind-the-data/playoff-predictions`.
- **Shot Value** (`/shot-quality`, under **OTHER**) — a half-court hexbin map of expected effective FG% per grid cell, comparing a location-only gradient-boosted model against a zone-average baseline. Honest framing: public NBA data has no defender distance or shot-clock signal, so this is shot-**location** value only, and the model's edge over the baseline is a small calibration win (~1% on log-loss / Brier), not a large accuracy jump.
- **Player Shooting** (`/shooting`) — a browsable database of every player's eFG% on zero rest
  against three or more days off, for any season since 1996-97 or pooled across a career. Rest is
  the player's **own**, counted from the games he actually played, so a night off for load
  management is never credited to him as rest. Honest framing: a single season's split carries a
  standard error near 7 pp and correlates with the same player's next season at roughly zero, so
  the page is a lookup rather than a ranking — a season describes what happened, and only the
  career line, shrunk toward the league mean, supports a claim.

- **Availability Cost** (`/availability`, under **OTHER**) — what a missing rotation player costs,
  measured in the same points of final margin as the schedule terms so the two can be read against
  each other. Losing a team's best player is worth **2.86 points**, against home court's **2.82** —
  the finding is that they land within 0.04 of one another. It also answers the standing objection
  to the whole premise: putting absence and the schedule terms in one regression moves every
  schedule coefficient by under 8%, so load management explains almost none of what a back-to-back
  costs. Honest framing: **retrospective by construction**. Who sat is known only because the game
  was played, so this measures what an absence cost and never forecasts who will be available
  tonight — and a 13.64-point margin standard deviation against a 12.44 residual says everything
  here, team strength included, explains a small share of a basketball game.
- **Referee Effect** (`/referees`, under **OTHER**) — how each official's *mix* of foul calls
  differs from the league's own seasonal mix, across every collected game since 2015-16. Honest
  framing: **this is style, not bias.** The two questions that would be about fairness were both
  asked and both came back empty — no official tilts free throws home beyond chance, and crew rest
  makes no measurable difference — so the page publishes the one thing that does separate
  officials and refuses the word bias. It also states its own ceiling: three officials work every
  game and the play-by-play never records which one blew the whistle, so every game credits all
  three and each figure is roughly a third of the real effect.

Each analytics module is **additive and isolated** — its own scripts, tables, routes, and page — so new modules never destabilize the flagship rest-advantage flow.

Two routes sit outside that set: **`/about`**, a landing page that explains what the product
measures, and **`/behind-the-data`**, the method pages behind each module. Neither is a tab —
both are reached from reference links right-aligned in the nav row, and `/about` also from the
footer. `/about` reads its three evidence figures from the same backtest `/analysis` renders.

---

## Architecture

```mermaid
flowchart TD
    src["NBA CDN · nba_api · ESPN site.api"] --> ingest["Python ingest (scripts/)"]
    ingest --> db[("Supabase PostgreSQL")]
    db --> model["Fatigue model · src/lib/fatigue.ts<br/>run-daily.ts · backfill_fatigue.ts"]
    model -->|"fatigue_scores · predictions"| db
    db --> api["Next.js route handlers · Zod · { data, error }"]
    api -->|"live scores"| db
    api --> ui["React 19 · SWR"]
    db -.->|"Realtime push"| ui
    cron["GitHub Actions — daily, self-gating"] --> ingest
    vercel["Vercel cron — live scores"] --> api
```

- **Ingest (Python + TypeScript):** `nba_api` and the NBA CDN feed schedules and scores into Postgres; ESPN supplies overtime periods, tip-off times and neutral-site venues (`stats.nba.com` is unreachable from outside the US). A daily GitHub Actions job **self-gates on the NBA season** — it runs year-round on a fixed schedule but exits cleanly during the offseason (before touching the database or any API), so there is no cron cadence to toggle.
- **Model (TypeScript):** one fatigue engine (`src/lib/fatigue.ts`) with exactly two production callers, both writers — the nightly refresh (`run-daily.ts`) and the bulk backfill (`backfill_fatigue.ts`). A score is computed once, written to `fatigue_scores`, and every read serves that stored row, so there is no second copy of the math on the read path to drift from.
- **Store:** Supabase PostgreSQL with Row-Level Security; reads run as type-safe Drizzle queries.
- **Serve:** Next.js App Router route handlers (Zod-validated, `{ data, error }` envelope) feed a React 19 frontend using SWR and Supabase Realtime.
- **Ship:** Vercel auto-deploys from `main`; GitHub Actions runs the daily pipeline.

The diagram above is the flagship rest-advantage flow. Playoff Predictor, Shot Quality, Schedule
Disparity, Shooting by Rest, Availability Cost and Referee Effect are separate routes/pages that
never touch `fatigue.ts` and are never read by the flagship queries; see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for their data flows. Schedule Disparity adds no
table, no migration and no ingest — it derives everything from the existing `games` and
`fatigue_scores` reads. Three others do not query the database at all: Shooting by Rest is served
entirely from a committed static asset (`public/data/player-rest.json`) built offline from
[hoopR](docs/adr/0002-shooting-source-hoopr.md), Availability Cost ships as a generated constants
module (`src/lib/availability-facts.ts`) pinned by a test against the artifact that produced it,
and Referee Effect renders a committed JSON artifact (`src/data/referee-foul-style.json`) written
by its ingest script. Those three add nothing to the runtime query path.

---

## The fatigue model

Each team's score combines:

- **Workload** — exponential decay over the last 30 days (recent games weigh more).
- **Travel** — log-scaled great-circle miles, with a realistic travel contract: a team only flies home when its *next* game is at home (no phantom round-trips between two road games).
- **Back-to-backs & altitude** — a one-day-rest multiplier sharpened by the *actual* hours between tips (a 10:30pm game into a 7pm game is not the same as the reverse), plus multipliers for visiting Denver, Utah or Mexico City, and a smaller residual the night after.
- **Schedule density** — a stress multiplier across five windows (6, 7, 12, 15 and 30 days)
  measured against a normal-pace anchor. Each window is clamped before the curve is applied, so
  the multiplier tops out near 1.31 on real schedules. The 3-in-4 and 4-in-6 flags are
  reported alongside it, not inputs to it.
- **Road trips & body clock** — added load for long road stretches, plus a circadian charge for playing two or more time zones from home. It is heavier travelling east than west, and it decays as the team re-entrains, at roughly a day per zone crossed.
- **Freshness & game difficulty** — a rest discount for extended breaks, and prior-game load weighted by how hard the game actually was: overtime adds, a blowout that rested the starters subtracts.

Data spans **1985-86 to the present**, excluding every playoff/finals game from the fatigue model (a fixed two-team series breaks the travel assumptions) and the **2019-20 Orlando bubble** — 88 games at a single site, with no travel to measure and no home crowd.

That exclusion is the bubble, not the season ([ADR 0004](docs/adr/0004-season-exclusions-belong-to-modules-not-ingest.md)). The 971 games 2019-20 played before the March 2020 suspension were reached by flying to them and are fully in. One surface still withholds the season in full: **Schedule Edge** ranks teams against each other within a season, and 2019-20 stopped with teams having played between 63 and 67 games, so a team with four fewer games would carry four fewer chances to accumulate an edge. Every other season is within a single game of even. 2020-21 is included — ordinary travel, compressed into 72 games — as are the 1998-99 and 2011-12 lockout seasons: short is fine, interrupted is not.

Three inputs — overtime, tip-off times and neutral sites — come from ESPN, whose coverage starts around 2002. Earlier seasons are scored by the same formula without them, which is a deliberate, documented trade rather than a silent gap: see [ADR 0003](docs/adr/0003-fatigue-inputs-limited-to-espn-era.md).

The model was overhauled on 2026-07-30 — real time zones in place of a longitude proxy, a
circadian term that decays as teams acclimate, prior-game load weighted by margin, and an
overtime penalty that had shipped years earlier but never once fired, because its data source
was unreachable and every game read zero overtime. Honest framing of the result: on games both
the old and new model call, accuracy moved **+0.15pp** and the two pick the same team 98.8% of
the time. The published hit rates rise about a point because the new model **abstains** from
2,661 games the old one called at 49% — below a coin flip. That is better selectivity, not
better prediction, and it is worth more to a site whose premise is only claiming an edge where
one exists.

Two changes followed on **2026-08-02**, both on measurement rather than taste. The model
**stopped calling a game when the fresher team is the visitor** — backing a rested road team ran
44.4% across 7,224 games and no threshold rescued it, so rest alone never outweighs home court.
That half is published on `/analysis` as the evidence rather than quietly dropped. And
`ALTITUDE_MULTIPLIER` rose **1.15 → 1.29**, the first ratified coefficient ever changed on
evidence: measured on final margin, altitude is worth 1.358 points against a back-to-back's
1.759, a ratio of 0.772 where the model was charging 0.405.

Those are the changes that survived. A weight-fitting harness was also built and run
out-of-sample, and it **did not change the model** — fitted weights do not beat the ratified ones
by enough to matter, and most of the model's terms carry no independent signal at all. That null
is written down in [ADR 0006](docs/adr/0006-fatigue-weights-were-fitted-and-the-model-was-not-changed.md)
so the question is not reopened from scratch.

---

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS v4, shadcn/ui, Recharts, SWR, GSAP (dynamically imported, `/about` only) |
| API | Next.js route handlers, Zod validation, Drizzle ORM, postgres-js |
| Database | Supabase PostgreSQL — Row-Level Security + Realtime |
| Data pipeline | Python (`nba_api`, `pandas`) + TypeScript (`tsx`) |
| Modeling | scikit-learn — `HistGradientBoostingClassifier` in `scripts/` (Shot Quality), logistic regression in `ml/` (Playoff Predictor), and fixed-effects OLS in `ml/` (Availability Cost, the fatigue weight-fitting harness); Python-side only, never the app's runtime deps |
| Testing | Vitest (unit + route), Playwright (e2e) |
| Infra | Vercel, GitHub Actions |

---

## Engineering highlights

- **End-to-end type safety** — Drizzle ORM + Zod + strict TypeScript, from DB column to API response.
- **Single source of truth** — one fatigue engine with two callers, both on the write path: a score is computed once and stored, and every read serves that row. No read-path copy of the model math exists to drift from the write path.
- **Self-gating pipeline** — the daily GitHub Actions job checks whether the NBA season is active and exits cleanly in the offseason (before touching the DB or any API), so it runs year-round with no manual cron changes.
- **Query performance** — hot read paths use `LEFT JOIN LATERAL … ORDER BY … LIMIT 1` against a composite index to fetch the latest fatigue row per team, replacing full-table `DISTINCT ON` scans — verified byte-for-byte identical output before/after.
- **Data integrity** — the 40 seasons audited to date are reconciled against an independent source (Basketball-Reference, 340 monthly pages, cross-checked with ESPN); 2019-20 was admitted after that audit and is queued for the next run to catch timezone date-shift bugs a sampled check would miss; game dates are stored in US/Eastern end-to-end with a self-healing upsert (`date = EXCLUDED.date`), so a re-run repairs any mis-dated row.
- **Security** — Supabase RLS with explicit Data API grants (anon read, service-role writes); a Content-Security-Policy + `X-Frame-Options: DENY`, and a constant-time comparison on the cron bearer token.
- **Real-time** — score and status changes push to the browser through Supabase Realtime.
- **Tested & shipped** — Vitest unit/route + Playwright e2e (run locally); ships via Vercel (auto-deploy + a live-score cron) and a scheduled GitHub Actions data pipeline.

---

## Getting started

```bash
pnpm install
cp .env.example .env.local
# Fill DATABASE_URL, then optionally add the public Supabase Realtime values.
pnpm dev
```

Open http://localhost:3000. A populated Supabase PostgreSQL database is required for product data.
The repository intentionally has no one-command database reset/bootstrap: its committed SQL files
are incremental and production-compatible, and `schema.ts` intentionally lags two live tables and
one index. Do **not** run `drizzle-kit push` or `generate`; follow
[`docs/DATABASE.md`](docs/DATABASE.md) and apply required SQL manually in a dedicated Supabase
project. Ingest and model commands are documented in
[`docs/DATA_PIPELINE.md`](docs/DATA_PIPELINE.md).

### Validation

```bash
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build
```

Playwright is integration-style and requires the running app plus populated database:
`pnpm test:e2e`.

---

## Project structure

```
src/
  app/            # App Router pages + typed API route handlers
  components/     # matchup cards, fatigue bars, nav, charts, shot-quality court
  lib/
    fatigue.ts    # the fatigue model (single source of truth)
    db/           # Drizzle schema, queries, client
  hooks/          # Supabase Realtime + the game-slate controller
scripts/          # Python ingest + TypeScript modeling + Shot Quality / Shooting pipelines
ml/               # Playoff Predictor series modeling, the Availability Cost measurement, and the
                  # fatigue weight-fitting harness (isolated venv, scikit-learn) + gitignored cache
src/data/         # bundled analytics artifacts (referee whistle + foul style, win-total benchmark)
src/lib/          # availability-facts.ts and playoff-rest-facts.ts — generated figures pinned by tests
public/data/      # the static asset /shooting fetches at runtime (player-rest.json)
drizzle/          # SQL migrations (RLS, grants, indexes)
docs/             # architecture, database, pipeline, API, frontend, ADRs
                  # screenshots regenerate with `node scripts/screenshots.mjs` against a running dev server
```

---

## Modules

- [x] **Rest Advantage model** (flagship) — fatigue score + rest-advantage backtest
- [x] **Playoff Predictor** — series win-probability model (record-driven logistic) at `/playoffs`
- [x] **Shot Quality** — Expected Shot Value / xeFG% half-court hexbin at `/shot-quality`
- [x] **Schedule Disparity** — net edge games per team-season at `/schedule`
- [x] **Shooting by Rest** — per-player eFG% split by his own rest at `/shooting`
- [x] **Season Report** — one season end to end: the rest call, which teams converted an edge,
      and what the schedule cost each of them, at `/season`
- [x] **Availability Cost** — what a missing rotation player costs in points of margin, at
      `/availability`
- [x] **Referee Effect** — each official's foul mix against the league's own, at `/referees`

---

Built by **Michael Ju** ([@mhju0](https://github.com/mhju0)).

The interface is set in **Space Grotesk** (headings), **Inter** (body) and **IBM Plex Mono**
(data and labels), all loaded through `next/font/google` — no font files are committed for them.

The bundled [Outfit](https://github.com/Outfitio/Outfit-Fonts) font faces in
`src/app/fonts/` are © 2021 The Outfit Project Authors and licensed separately under the
[SIL Open Font License 1.1](src/app/fonts/OFL.txt). They render the social/OG card only — a
logotype is a fixed asset and does not have to track the UI's display face.

---

## License

Copyright (c) 2026 Michael Ju. All rights reserved.
No license is granted for use, copying, modification, or distribution of this code as of 2026-07-30. This repository is public for portfolio review purposes only.
