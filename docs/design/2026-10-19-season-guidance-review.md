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

Root browser/route verification, exact-candidate independent review, CI and preview verification
are pending in this record. No merge or production deployment is claimed.

## Operational limits

New-season provider publications, first actual played-slate ingestion, canonical ESPN/hoopR
ID reconciliation, manual artifact publication and physical-device/human checks remain separate.
The guide and expected date do not establish that those operations have completed.
