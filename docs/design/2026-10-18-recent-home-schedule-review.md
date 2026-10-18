# Recent homepage comparison and schedule headers

Owner-approved behavior, 2026-10-18: pool both homepage rates over the same latest ten completed
regular seasons; retain the 5+ large-gap rule; rename the team schedule's mixed time/result
column Game, move Eastern Time to a note, and keep headers on one line. Alternative chart
series and wider table structures remain a separate prototype decision.

## Invariants and evidence

- The baseline season list owns the window. Completed seasons with zero 5+ games still count;
  unfinished seasons do not. Both groups use one source population, one completion set, and
  the canonical backtest classifier. Raw wins and game counts are pooled before division.
- The selected period and actual number of completed seasons are visible. The evidence date
  comes from that window. The difference uses unrounded rates and the UI explains this.
- One database scan supplies both annual series. Stamp readers, maximum age and sequential
  hosted-pool reads follow the existing cache policy. Unexpected errors still reach the page
  boundary; a deliberately withheld Schedule ranking does not hide the historical result.
- The mixed Game column retains existing score/status/time behavior. The table note names
  Eastern Time (ET) and the rest-advantage unit. A phone uses RA with an explicit expansion.
  Structural alternatives are not present in production code.

Local acceptance: 1,238 unit tests in 100 files pass; typecheck, build and documentation link
checks pass. Lint has no errors and two existing unused-variable warnings in cron-update.test.ts.
All 24 targeted browser cases pass against the built app: independent raw-count reconciliation
for the homepage, completed-season rows, row navigation and Back restoration, Cup numbering,
one-line header geometry at 320/390/768/1440px, mobile overflow and reduced motion.
Independent source review and PR preview verification follow the frozen candidate. No merge
or deployment claimed.

## Prototype scope

`prototype/chart-schedule-options` captures an offline HTML exploration using actual public API
responses and the existing sky-tinted design. Chart A retains two series; B shows a third raw
annual 5+ series with small samples explicitly marked; C applies the existing 100-game gate.
The table options compare combined Game, split tip-off/result and compact matchup structures.
The portable review is in the owner's gitignored `docs/audit/2026-10-18-design-options/` folder.
No prototype figure changes published analytics, the model or the live display threshold.
