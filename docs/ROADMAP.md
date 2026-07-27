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

On 2026-07-27 the nav was renamed to five plain-noun tabs — `GAMES`, `SCHEDULE EDGE`,
`MODEL RESULTS`, `PLAYOFF PREDICTIONS`, `SHOT VALUE` — and `/upcoming` was folded into `GAMES`
as a view toggle rather than kept as a sixth tab. Module names are unchanged; see
[GLOSSARY.md §Nav labels](GLOSSARY.md) for the label-by-label rationale.

The dependency tree is deliberately pinned; see
[SEASON_ROLLOVER.md §8](SEASON_ROLLOVER.md) before regenerating the lockfile, and §7 for the
season counts that do not derive themselves.

## Shipped modules

- **Rest Advantage** — the flagship regular-season fatigue model, historical backtest, game
  explorer, and upcoming-game edge view.
- **Playoff Predictor** — complete ingest, series feature pipeline, walk-forward evaluation,
  persisted predictions, API, and `/playoffs` UI. The model improves calibration rather than
  distinguishably improving accuracy over the majority-home-court baseline; see
  [PLAYOFF_PREDICTOR_DESIGN.md](PLAYOFF_PREDICTOR_DESIGN.md) and
  [`ml/PHASE3_REPORT.md`](../ml/PHASE3_REPORT.md).
- **Shot Quality** — complete collection, aggregation, model evaluation, persisted expected-value
  surface, API, and `/shot-quality` UI. Public data supports location value, not defender- or
  shot-clock-aware quality; see [SHOT_QUALITY_DESIGN.md](SHOT_QUALITY_DESIGN.md).
- **Schedule Disparity** — which teams a season's schedule favored, ranked by net rest edge in
  days, at `/schedule`. The most isolated module: **read-only**, no migration, no table, no
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


