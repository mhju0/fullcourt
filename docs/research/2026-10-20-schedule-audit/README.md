# Opening-quarter audit evidence

Start with [NUMERIC_AUDIT.md](NUMERIC_AUDIT.md) for definitions, findings, commands and limitations. [numeric-summary.json](numeric-summary.json) contains machine-readable coverage. [anomalies.csv](anomalies.csv) indexes confirmed defects, semantic questions, conflicts and unresolved evidence separately.

- `team-month.csv`: all 30 teams × 3 months; each flag is a team-game count.
- `calendar-oracle.csv`: every target team-game, using full-season prior context.
- `per-leg.csv`: all 2,400 season team legs; filter `is_target=True` for October–December.
- `travel-candidates.csv`: 43 long away-to-away gaps (6 overlap TBD Cup fixtures) and 33 local legs.
- `stored-mismatches.csv`: 208 homecoming road-streak differences.
- `homecoming-impact.csv` / `score-diagnostic.json`: 66 positive-load homecomings and diagnostic score/gap effects.
- `api-mismatches.csv`, `schedule-differences.csv`, `tip-differences.csv`: empty means no differences against their stated snapshots, not that every source is currently correct.
- `espn-differences.csv`: 2 current feed tip differences; one confirmed update, one provider conflict.
- `teams.json`: all 30 current DB arena coordinates.
- `raw-manifest.json`: SHA-256 / size / source locator for gitignored raw evidence under `docs/audit/2026-10-20-schedule-audit/`.

Observed checks: independent Python oracle completed; source score replay matched 950/950; complete target canonical API replay compared 950/950; complete official release PDF parsed 1,200/1,200; current ESPN date coverage 153/153. Targeted audit-script ESLint, repository TypeScript, Python compilation and JavaScript syntax checks passed. No application source or production state was changed. Actual itineraries, future Cup fixtures, production corrections and rendered UI were not verified.
