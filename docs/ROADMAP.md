# Project status

FullCourt is **feature-complete and in maintenance mode** as of 2026-07-13. The repository is
kept operational for portfolio review; no additional product modules are planned.

"Feature-complete" means no new **product modules**. Interface and correctness work continues:
a design and UX audit on 2026-07-26 shipped a quick-win pass — the confidence-tier fix, the
focus indicator, IBM Plex Mono, zero-based backtest charts, and the Upcoming Edges rename —
and left a tracked backlog in [GitHub issues](https://github.com/mhju0/fullcourt/issues),
including one **P0**: three failure paths that render nothing and a missing error boundary
([#1](https://github.com/mhju0/fullcourt/issues/1)). The repository is not closed to fixes.

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

## Maintenance responsibilities

- Follow [SEASON_ROLLOVER.md](SEASON_ROLLOVER.md) before each new NBA season.
- The Vercel live-score cron runs **daily, year-round** — there is no seasonal cadence to
  switch. `/api/cron/update` early-returns before any CDN fetch when today's ET date has no
  `scheduled|live` rows, so an off-season run costs one indexed query. See `vercel.json`.
- Keep GitHub Actions, Vercel, Supabase environment variables, and dependency security patches
  current.
- Re-run the documented schedule/date integrity audit after new season ingestion.
- Preserve the isolation of the three analytics modules and the existing rest-advantage naming
  contract.

## Archive posture

The live demo and scheduled data pipeline remain operational, but feature development is closed.
Future changes should be limited to security, dependency compatibility, data-source breakage,
season rollover, deployment reliability, or verified correctness defects.
