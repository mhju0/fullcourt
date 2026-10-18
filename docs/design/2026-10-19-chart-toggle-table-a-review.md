# Optional large-gap history and team schedule A

The owner selected schedule table A and an optional version of chart B on October 19.
The homepage's latest-ten-completed-season comparison remains part of the same candidate.
These changes are prepared on `codex/recent-home-schedule` (PR #176); production release
requires a separate merge decision.

## Acceptance

- The Home-court chart initially shows the existing home and 0.5+ rested-home series.
  A labelled, keyboard-operable checkbox adds the annual raw 5+ rested-home record.
- Counts and small-sample warnings accompany raw observations. Zero-game seasons have no
  observation and break the optional line; genuine 0% and 100% observations remain visible.
  Existing ordinary rested-home 100-game gating and annual comparison arithmetic remain.
- One canonical snapshot supplies both groups. Toggling changes visibility without another
  request or a response race. Selection remains stable across toggles.
- Desktop table order is number, date, opponent, Game, rest gap. Phone hides only the number;
  Game remains visible. Header text stays on one line, with ET and RA defined nearby.
- Row navigation, selected-team signs, lifecycle states and unassigned Cup rows remain intact.
- The chart's nested header receives top padding. Other uses of the same report frame have
  direct headings with their existing padding; no site-wide spacing rewrite is implied.

## Verification record

Local acceptance, October 19: the full unit run passed 1,245 of 1,246 tests; its sole failure
was the design-scale gate, corrected by using token-scale spacing. The failed contract and
design-scale suites then passed all 110 tests. Typecheck, changed-file ESLint, production
build and documentation links pass. Full lint has no errors and the same two existing
cron-test warnings.

All 48 targeted rendered cases pass (one test assertion was corrected to match exact `0.0%`
instead of accidentally matching `70.0%`, then rerun successfully). Coverage includes toggle
keyboard use, selection stability, open/filled sample markers, zero-game breaks, isolated
0%/100% outcomes, ordinary 99/100 gating, empty/error states, accessible mobile lookup,
table headers at 320/390/768/1440px, 44px phone rows, Cup numbering and real row navigation.
Actual database-backed `/api/home-court` rows reconcile with both canonical Analysis series
for all 41 seasons. The latest raw 5+ record is 22 wins in 42 games, 52.4% when displayed.

Independent frozen-candidate review and updated PR preview verification follow. No merge
or production release is claimed.
