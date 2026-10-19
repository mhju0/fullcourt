# Season guidance and upcoming rest edges — 2026-10-19

## Acceptance contract

Implement the owner's simplified mock, not the original public ten-game progress proposal.
Current-season result availability uses the internal all-teams-ten-score-bearing-finals rule;
visitors see a quiet awaiting guide and prior-publication/schedule links. Estimate timing from
real fixtures, suppress expired dates, distinguish request failure, and preserve explicit URL
selection/Back. Keep publication coverage and the ordinary 100-game inference rule separate.
Schedule Edge and individual Games results remain useful before this reporting checkpoint.

Use shared card/border/radius/spacing tokens, 15px body and 18px headings, aligned with nearby
controls. Move homepage period below the explanation without changing numbers. Select earliest
three 5+ rested-home fixtures from the full candidate set, with known tip-off ordering and a
small reserve. Keep click-to-date behavior. Wider recent-ten-season windows remain deferred.
No schema, coefficient, generated analytics or production data changes.

## Implementation and evidence

- Shared guide, readiness notice/hook and read-only API; operational GP is independent of
  fatigue availability and the analytical abnormal-stretch cohort.
- Season Report default/explicit holds; publication-aware Shooting, Officiating and Shot Value
  guidance; Playoffs follows postseason publication; Availability stays a retrospective.
- Shooting export checks the internal rule before writing a current/upcoming payload, including
  its career estimates. Explicit single-season cache fetch is prepared without running it.
- Read-only current DB result: `2026-27`, `ready:false`, `expectedAfterDate:2026-11-11`.
- Targeted unit checks pass; full run initially had one obsolete sub-5 clock-test fixture
  (1,256 passed); updated the fixture to the approved 5+ floor and its 11-test file passed.
- Python publication-guard six tests pass; no exporter or provider download was executed.
- ESLint: zero errors, two existing unused-variable warnings in cron-update.test.ts.
- Typecheck and normal Turbopack production build pass. Initial linked-dependency setup failed
  Turbopack; a real frozen offline install fixed it. A trial webpack build generated incompatible
  legacy route checks; these generated files were removed. No application workaround was added.
- Dependency production audit: no known vulnerabilities; local documentation links resolve.

## Remaining candidate checks

Independent review of `962a1da` found two P2 cases: Shooting career/expanded history could
consume held current data, and Shot Value guessed a calendar-prior edition. Both are fixed
in `53bafa5`, which the independent reviewer approved after 49 focused tests. Historical
player rows remain available; held current expansion rows and all affected pooled estimates
are omitted without refitting. Shot Value uses an actual earlier publication or an honest
no-prior guide. A final copy refinement removes an unavailable-prior claim when none exists.

Final full unit run: 107 files, 1,270 tests passed. Normal production build/typecheck pass;
Python six contracts pass. The first built-route run passed nine cases; its one failure was
a test selector matching Next's route announcer as well as the actual alert. Scoped the
assertion to main and reran that case successfully. Homepage route/data checks passed two
cases. Final candidate route/browser/CI/preview verification is recorded below before release.

Root inspected shared guide geometry (1px existing border, 16px padding, 18px heading, 15px
body) and current guide coverage across Season Report, Shooting, Officiating, Playoffs and
Shot Value. At 390px the strip showed Nov 5/9/11 and clicked through to Nov 5. Homepage DOM
reading order puts the period after the finding explanation. Schedule Edge still shows
1,184/1,200 projected comparisons and no awaiting-data guide. Shared muted body and link
colors on the panel pass AA at 5.85:1 and 5.63:1. All guides use existing design tokens.

[PR #177](https://github.com/mhju0/fullcourt/pull/177) owns delivery status. The initial
preview was Ready for `962a1da`; the final code head is `763bfe4`. Independent review approved
that exact code head, including the 320px link-arrow wrap fix. The final built-route run
passed all 12 selected cases (Season Report, homepage and upcoming-edge jump); targeted
publication holds also pass. The final UI uses season-token wrapping throughout the guide.

Final CI, preview and production readiness must match the delivered SHA in GitHub/Vercel.
This pre-merge record deliberately does not predeclare those later provider outcomes; the
PR merge record, matching immutable deployment and delivery readback are authoritative.
Only this record/handoff change follows the approved code head; no application code changes
are included in the acceptance-record commit.

## Operational limits

New-season provider publications, first actual played-slate ingestion, canonical ESPN/hoopR
ID reconciliation, manual artifact publication and physical-device/human checks remain separate.
The guide and expected date do not establish that those operations have completed.
