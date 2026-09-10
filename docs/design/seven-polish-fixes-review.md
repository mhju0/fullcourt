# Seven approved polish fixes

The owner approved all seven findings in the
[September 11 audit](../research/2026-09-11-recruiter-user-polish-audit.md).
This record tracks that bounded implementation and its verification.

## Design direction

Continue the existing Front Office identity: light research pages, dark homepage, aligned
numeric comparisons, shared controls, and restrained indigo emphasis. Antislop applies throughout.
Read this as an NBA research application for fans and recruiters, with an editorial data-table
style: ENERGY 1 / RHYTHM 2 / MOTION 1. The existing homepage entrance remains the approved exception.

- Publication-aware defaults keep research useful across the calendar transition.
- The mobile season notice belongs with date selection because it explains the selected slate.
- Matchup names belong in accessible control labels because each control opens a different record.
- Data status separates connectivity, coverage and refresh evidence so one cannot imply another.
- Shared URLs and copy actions preserve the comparison another reader needs to inspect.
- Selected date chips follow container resizing without changing focus or the selected date.
- Search-result wording follows the actual count.

No new metric, model coefficient, generated result, homepage example or account feature is part
of this change. The original audit remains a dated before-state record.

## Acceptance matrix

| Finding | Required evidence |
| --- | --- |
| Publication defaults | Latest actual publication, explicit selection, empty/error distinction, rollover dates, no previous-season data under new labels |
| Mobile offseason context | Notice and upcoming action before the matchup list at phone width; desktop hierarchy preserved |
| Accessible game names | Teams/date identify each row; Enter/Space toggle and focus remains on the control |
| Data status | Real coverage/record dates, unknown refresh times labeled, machine endpoint retained, homepage historical data-through date |
| Sharing | Season and map controls survive fresh links and history; copy success/failure feedback; Games title |
| Resize | Selected month/day visible after narrowing; selection and focus preserved |
| Count wording | Zero, one and many players |

## Verification record

Local verification on September 11, 2026:

- Lint, typecheck and 981 unit tests across 74 files passed. The production build passed.
- Python contracts passed: 2 pipeline tests and 33 ML tests. Production dependency audit
  reported no known vulnerabilities. Local documentation links resolve.
- Focused Playwright checks cover publication defaults, the October 1 transition, valid
  unpublished-season recovery, failed season changes, URL history, clipboard success and
  denial, named game controls with keyboard focus, mobile offseason context, and resizing.
- Independent browser inspection of the populated local production build at desktop and
  390px phone width confirmed the status-page coverage, mobile notice before matchups,
  upcoming-season action, preserved desktop sidebar, selected-chip visibility after resizing,
  Playoff Rest season selection and copy feedback, Shot Value comparison/map URLs and empty
  recovery, and the singular Jokić search result.
- A fresh build with the configured read-only database rendered the homepage's populated
  findings and `Rest evidence through 2026-04-12`. The status page showed the same analysis
  date, schedule coverage through `2027-04-11`, and a readable UTC officiating refresh time.

Hosted preview and production verification are recorded in the release PR. Physical-device
and human screen-reader testing remain separate from browser automation; no such testing is
claimed here.
