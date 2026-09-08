# Season navigation and historical reports review

September 9, 2026. Implements the owner's five follow-up requests after the first-use audit.

| Area | Before | After |
| --- | --- | --- |
| Games navigation | Season and month hidden behind “Change season or date”; dates wrapped into a large grid | Visible Season → Month → Date hierarchy; compact horizontal strips keep the selection in view; URLs and history restore context |
| Deep Dive | Wide numerical columns squeezed beside a sidebar | Full desktop width; supplementary content below; keyboard-accessible horizontal scrolling at narrower widths |
| Season selectors | Different dimensions and typography, including a separate Shooting control | Shared labeled 160px-wide control, 44px minimum height and 16px monospaced text across analytical pages |
| Playoff Rest | “When calendar rest differs” and a large 2,545/2,545 statistic | “An early finish can mean more days off,” with an explanation of shared within-series schedules and different recovery demands |
| Officiating | Three recent regular seasons | 12 seasons, 4,546 games; first-season and eligibility caveats, selected-season strip highlighting, original PDF sources and unavailable states |

## Design references and scope

The [NBA schedule](https://www.nba.com/schedule) exposes calendar and season-type filtering;
[ESPN's scoreboard](https://www.espn.com/nba/scoreboard) emphasizes a nearby-date strip.
FullCourt combines explicit historical scope with quick date selection because it supports retrospective research.
The Season → Month → Date ordering comes from the owner's request.

UI/UX Pro Max, Emil design engineering, the local antislop guidance and the existing brand grammar were consulted.
The implementation uses native selects, explicit selected states, visible keyboard focus, horizontal overflow
containment and readable touch controls. No animation was added. It retains the site's existing colors and fonts.

The 2,545/2,545 playoff count was rechecked against the producing database query and was correct; it was
removed from the headline because it added little explanatory value. No coefficients or playoff figures changed.
Historical report methods and limitations are in the [archive evidence](../research/2026-09-09-l2m-archive.md).

## Verification

- 972 unit tests pass, including all 12 season count baselines and the partial-season start date.
- 19 targeted Python archive/publication tests pass; every published game count matches detail evidence.
- The independent PDF-column audit matches all 1,665 PDF reports with zero mismatches.
- 50 affected-route browser checks pass, covering dates/history, five Deep Dive widths, season-control consistency,
  shooting filters, playoff content, historical report source links and desktop/mobile Officiating accessibility.
- Lint, type checking, documentation links, the production build and the production dependency audit pass.
- 20 navigation checks pass. The built-site rerun covers 21 key date, layout, history, source and accessibility checks.
- Browser screenshots were captured against the existing production baseline and the local implementation at
  1440px and 390px. The delivery summary records the final production-build, preview and deployment checks.

Physical iPhone/iPad testing and first-time participant observation remain open in the roadmap.
