# Optional large-gap history and team schedule A

The owner selected schedule table A and an optional version of chart B on October 19.
The homepage's latest-ten-completed-season comparison remains part of the same candidate.
These changes are prepared on `codex/recent-home-schedule` (PR #176). The owner approved
the revised stacked mock and authorized merge and ordinary deployment on October 19.

## Acceptance

- The Home-court chart initially shows the existing home and 0.5+ rested-home series.
  A labelled, keyboard-operable checkbox adds the annual raw 5+ rested-home record.
- Counts and one general sample-size note accompany raw observations. All markers are filled
  circles, without sample-size encodings. Zero-game seasons have no
  observation and break the optional line; genuine 0% and 100% observations remain visible.
  Existing ordinary rested-home 100-game gating and annual comparison arithmetic remain.
- One canonical snapshot supplies both groups. Toggling changes visibility without another
  request or a response race. Selection remains stable across toggles.
- Season and Home stay on the left; the right stacks the 0.5+ and optional 5+ records, each
  with its rate, wins/counts and displayed-rate difference from that season's home baseline.
  Missing data has no difference. Season-to-date text and keyboard focus remain available.
- Desktop table order is number, date, opponent, Game, rest gap. Phone hides only the number;
  Game remains visible. Header text stays on one line, with ET and RA defined nearby.
- Row navigation, selected-team signs, lifecycle states and unassigned Cup rows remain intact.
- The chart's nested header receives top padding. Other uses of the same report frame have
  direct headings with their existing padding; no site-wide spacing rewrite is implied.

## Verification record

Previous candidate `10fc302`, October 19: the full unit run passed 1,245 of 1,246 tests; its sole failure
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

That candidate subsequently passed all CI checks and independent review, and its preview was
verified. Its open/filled sample markers were then superseded by the owner-approved mock
`0358ade` and the D-114 amendment. The final candidate requires affected rendered checks,
independent review and preview verification before the authorized merge. No production
release is claimed until the release record confirms it.

## Final stacked candidate checks

The approved mock is implemented: filled circles throughout, one general note, and the fixed
home panel beside the two comparison rows. The ordinary rate retains its existing gate;
the raw 5+ difference follows D-93 and is unavailable at zero games. API/count math is unchanged.

The final built app passes all 49 targeted rendered cases, including the new stacked-layout
and same-year comparison checks. The only rendered failure was teal text contrast; using the
existing `--term-blue-text` token fixes it (5.63:1), and the failed accessibility case passes.
All 1,245 other unit cases passed initially; the sole design-scale failure was corrected and
the 110 affected contract/scale cases pass. Production build, typecheck, lint, documentation
links and diff checks pass, with only the two existing cron-test lint warnings.
Manual browser checks confirm actual 2025-26 counts, both comparisons, filled markers,
keyboard selection and a 320px layout without page overflow.

The exact final head receives independent review and preview verification before merge.
PR #176 retains the final merge/deployment readback, so this pre-release record does not
substitute a successful build for a verified production outcome.
