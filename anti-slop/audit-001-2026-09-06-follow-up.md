# Audit 001: applied changes and verification

All five findings in [the audit](audit-001-2026-09-06.md) were applied under the owner's instruction to audit first, then apply. The core, five companion skills, and contrast checker are installed locally under this directory. `AGENTS.md` routes future work to them and to FullCourt's existing brand direction. Installed files match the existing local skill copies.

## Changes

| Finding | Result | Reason |
| --- | --- | --- |
| 1 | Fixed. SEARCH, OTHER, mobile SEARCH, and the command input retain a visible 2px outline during keyboard use. | The shared rule must outrank component resets; the input's outline sits inside its clipping container. |
| 2 | Fixed. Shared controls and navigation have 44px minimum targets below `lg`; method and entry links also have larger targets. | Touch readers need room to select controls without changing desktop density. |
| 2 | The footer stacks its groups on smaller screens; date arrows stay on the same row around a wrapping date. | Larger targets need layout space, not overlapping hit boxes. |
| 3 | Fixed. The command input computes to 16px below `lg`. | Match FullCourt's existing mobile input floor. |
| 4 | Fixed. Plain CSS section comments and one footer cascade explanation replace decorative banners and repeated history. | Preserve the useful constraint while reducing repetition. |
| 5 | Fixed. Headline figures scale between the existing 24px and 40px endpoints; the long playoff count fits at 320px. | Keep the value together and readable without clipping or changing published data. |

Brand colors, typography family, routes, product copy, model coefficients, generated analytics, and database schema were preserved. The changes add no runtime JavaScript, dependency, asset design, or theme. The React review found no new hooks, effects, requests, state, or client boundaries.

## Checks

- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `pnpm test:run`: 69 files, 932 tests passed, including generated-figure and design-token pins.
- `pnpm build`: passed after the final UI changes.
- `pnpm audit --prod`: no known vulnerabilities.
- Full existing browser suite plus the new controls spec: 271 tests passed before the final headline sizing fix.
- After that fix: 76 targeted browser tests passed, covering all 20 routes at 320px, 390px, and 1440px, control targets at 360px/768px, keyboard focus, and Playoff Rest.
- After adding the font-readiness guard: all 20 narrow-phone route checks passed again.
- `git diff --check`: passed.
- Local skill-copy comparisons: identical to their sources.

The existing 80-test accessibility/overflow baseline passed before changes. Its inability to catch the measured focus resets and small targets is why `e2e/control-accessibility.spec.ts` was added. The layout suite now also includes 320px and waits for fonts before measuring.

## Interaction evidence

Direct navigation walkthrough: [recorded actions and console results](evidence/001-navigation.json). Each action below reached the expected route with no console errors or uncaught JavaScript exceptions in that walkthrough.

| Control | Observed behavior |
| --- | --- |
| SEASON REPORT | Opened `/season`. |
| SCHEDULE EDGE | Opened `/schedule`. |
| MODEL RESULTS | Opened `/analysis`. |
| PLAYOFF REST | Opened `/playoffs`. |
| PLAYER SHOOTING | Opened `/shooting`. |
| GAMES | Returned to `/games`. |
| OTHER, SHOT VALUE | Menu opened; selection opened `/shot-quality`. |
| OTHER, AVAILABILITY COST | Selection opened `/availability`. |
| OTHER, REFEREE EFFECT | Selection opened `/referees`. |
| BEHIND THE DATA | Opened `/behind-the-data`. |
| FullCourt home | Opened `/`. |
| Mobile SEARCH, type `referee`, Enter | Opened `/referees`. |

The passing browser specs also exercised these behaviors:

| Control/state | Evidence |
| --- | --- |
| Keyboard OTHER | Enter opens the menu; Escape closes it and restores visible trigger focus. |
| Keyboard SEARCH | Enter opens the palette with visible input focus; Escape closes it. Tested on light and dark routes. |
| Unmatched search | Shows “No surface matches.” |
| Mobile palette | Ten results meet the 44px floor; filtering to `behind` and Enter opens the reference page. |
| Date arrows | Previous day changes the displayed date; narrow-screen arrows remain on the same row. |
| SKIM / DEEP DIVE | Changes slate density. |
| Edges Ahead | Selecting an edge moves the board to its date. |
| Season selectors | Change the selected season and its displayed results. |
| Player search/filter/sort | Search finds names; franchise filtering narrows rows; sorting changes order. |
| Player row | Expands into season details and updates the shareable URL. |
| Referee filter/sort | Crew-chief filtering narrows officials; sorting reorders rows and marks the header. |
| Season comparison error | A simulated failed request stays local; retry recovers. |
| Season comparison empty | Empty data is distinct from an error; changing the view recovers. |
| Skip link | Enter transfers focus to main content. |
| Front-page links | Surface cards and board CTA navigate; existing reveal and reduced-motion checks pass. |

## Delivery Gate for this change

This gate describes the edited surfaces and tested flows, not certification of every possible dataset, device, and interaction combination in the product.

| Rule | Status and evidence |
| --- | --- |
| R-02 | PASS for newly written prose/comments. Existing authored brand and scientific prose were retained under voice calibration; this is not a claim that the repository contains no em dashes. |
| R-03 | PASS for measured widths and controls: target tests at 360/768, document layout at 320/390/1440, and visual inspection of date controls and playoff figures. |
| R-17 | PASS for change scope: published values and their producing sources were preserved; figure pinning tests passed. |
| R-18 | PASS: no testimonials or identities were introduced. |
| R-23 | PASS: no new logo, image, navigation destination, or purported data asset was created. |
| R-24 | PASS: every primary/OTHER/reference navigation destination was clicked successfully. |
| R-25 | PASS for changed indicators: contrast checker measured 6.29:1 for light indigo on white and 6.33:1 for dark chrome's indigo on its ground. Existing 40-route/viewport axe scans passed; headline type remains at least 24px. |
| R-26 | PASS for affected controls: recorded navigation plus passing filter, sort, date, density, and palette tests. |
| R-27 | PASS for preserved state handling: comparison error/retry/empty tests and palette empty-state checks passed. |
| R-28 | PASS: no FAQ was added or rewritten. |
| R-32 | PASS for affected focus paths: the new tests measure a visible solid outline during keyboard use and exercise Enter/Escape. |
| R-33 | PASS: source changes were made directly with patches; inspection scripts did not rewrite CSS or source. |
| R-34 | PASS for shipped theme scopes: light app and dark front page were exercised. No theme toggle was introduced. |
| R-35 | PASS for change scope: production build, browser runs, recorded interactions, screenshots, and explicit limits below. |
| R-36 | PASS: no new analytical, security, performance, or customer claim was introduced into the product. |
| R-37 | PASS: the audit uses the existing Front Office direction and records its interpreted dials. |
| R-38 | PASS: no fabricated product content or realistic placeholder was introduced. |
| R-01 | PASS: existing semantic palette retained; no gradient or color treatment added. |
| R-04 | PASS: existing navigation glyphs retain their route meanings; no icons added. |
| R-06 | PASS: Geist remains the documented brand family; responsive headline sizing prevents measured overflow. |
| R-07 | PASS: no background pattern added; the existing court motif belongs to FullCourt's brand. |
| R-08 | PASS: existing navigation arrows retain their direction cues; no arrow decoration added. |
| R-09 | PASS: no badge introduced or repurposed. |
| R-10 | PASS: no blur or glass treatment added. |
| R-12 | PASS: the existing palette shadow continues to distinguish its overlay; no shadow added. |
| R-13 | PASS: no glow added. |
| R-14 | PASS: no feature-card composition added or flattened. |
| R-19 | PASS: existing route and reveal motion retained, including reduced-motion handling. |
| R-22 | PASS: no illustration added. |
| R-05 | PASS: content order remains intact; the date control reflows around its actual three elements. |
| R-11 | PASS: existing radius tokens retained. |
| R-15 | PASS: action-specific control labels retained. |
| R-16 | PASS: no marketing copy or buzzwords added. |
| R-20 | PASS: court identity, data poles, table hierarchy, and Front Office typography retained. |
| R-21 | PASS: the ratified light-only app and dark front page remain the intended theme scopes. |
| R-29 | PASS: no colors added to the existing semantic system. |
| R-30 | PASS: no external product style or layout imported. |
| R-31 | PASS: each change has a reason in the change table; useful code constraints remain documented. |

Liveliness: PASS for preserved direction. ENERGY 2 / RHYTHM 2 / MOTION 2, accounting for the existing app route transitions. The court motif, deliberate data colors, prominent figure/headline, and section spacing remain. The design read was recorded before edits.

Craftsmanship: C-1 PASS, changes answer measured defects; C-2 PASS, exercised controls work; C-3 PASS, no filler section added; C-4 PASS within the tested widths/states; C-5 PASS, product claims and figures preserved.

## Screenshots and limits

- [Palette before](evidence/001-palette-before.png) and [after](evidence/001-palette-after.png): taller results and an inset focus indicator.
- [Games at 320px](evidence/001-games-320.png): date arrows flank the wrapped date.
- [Playoff Rest at 320px](evidence/001-playoffs-320.png): the full equal-rest count fits its card.

Chromium checks do not establish real iOS keyboard, focus-zoom, or safe-area behavior. Those remain the existing device checks in `docs/UIUX_CHECKLIST.md`. External footer destinations were preserved and inspected in source, not exercised as part of the recorded navigation walkthrough. The audit does not independently recalculate every historical analytical result, test every chart hover value, or claim exhaustive screen-reader coverage. No merge or deployment was performed.
