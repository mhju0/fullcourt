# UI polish remediation · 2026-10-11

## Scope and acceptance

Approved bounded changes preserve the current light theme, generated analytics, probability calculations, venue baselines, rest-advantage identifiers, working Schedule internal scroll cue/pinned units, and existing Model Results anchor destinations.

- U1: every documented related product link has meaningful text, including Home Court. A registry keyed by the inferred documented route union makes omissions a type error.
- Shot Value: court interaction instructions use existing TYPE.body (15px), prose face and AA text color.
- Playoffs: explain prior-season-only PICK and target-season-included HINDSIGHT beside the published bracket; state named-team probability and insufficient-history N/A. No probability or training changes.
- Model Results: make existing #answer and #explorer discoverable under “On this page”, with wrapping and 44px links. No fixed navigation or new sections.
- Schedule: clarify historical win equivalents versus actual wins. Existing layout and controls remain intact.
- Data Status: explain absence of durable successful-refresh evidence; preserve separate coverage, data-through, refresh and database reachability values.

## Implementation and checks

Changed `src/lib/behind-the-data-sections.ts`, its test, `behind-the-data-shell.tsx`, `shot-quality-content.tsx`, `playoffs-content.tsx`, `analysis-content.tsx`, `schedule-disparity-content.tsx`, and `src/app/data-status/page.tsx`.

Failing-test-first U1 check: the new registry coverage test failed before implementation with undefined registry at `/analysis`; after implementation all eight section tests pass. The test also pins the Home Court label to `View Home Court`.

`node node_modules/vitest/vitest.mjs run` for behind-the-data-sections, playoff-bracket, playoff-seasons, playoff-rest-facts, analysis-claims, schedule-disparity, schedule-ranking and schedule-value: **8 files, 152 tests passed**.

Scoped `node node_modules/eslint/bin/eslint.js` across all eight changed source/test files: **passed**.

Whole-repository `node node_modules/typescript/bin/tsc --noEmit --incremental false`: initially failed on three in-progress sibling cache tests using maxAgeMs/loadTimeoutMs before their implementation. No UI type errors were reported. Recheck after sibling work settles.

Antislop contrast checker for muted prose `#5D6470`: **5.96:1** on `#FFFFFF`, **5.56:1** on `#F6F7F9`, both normal-text AA pass.

Playoff explanatory copy checked against existing authoritative project methodology at `src/app/behind-the-data/playoff-predictions/page.tsx:422–440`.

## Limits and next verification

These changes are implemented and unit/lint exercised. Rendered 360/390px, actual 200% text zoom, keyboard court/slider behavior, populated earliest/latest/unpublished playoff brackets, anchor fragment/back behavior and live Data Status require root-coordinated browser verification. No deployment or production verification is claimed. No fabricated job timestamp or pipeline success record is introduced.


## Connected rendered verification

CUA dedicated Chrome tab, `http://localhost:3101`, using root-prepared isolated PostgreSQL 18 restore. No database writes or fixture API responses. Initial `127.0.0.1` navigation was unhydrated and server interrupted; localhost after root restart rendered connected content. The initial loading screenshot is retained and is not acceptance evidence.

Evidence: `docs/reports/2026-10-11-remediation/evidence/ui-polish/checks.json` and adjacent PNGs.

- Home Court named related link activated with Enter, navigated to `/home-court`; localhost loaded history checked at 1440px.
- Shot Value at 390px: rendered guidance 15px, Geist prose face, rgb(93,100,112). At 360px it wraps without document overflow. Slider ArrowRight changed the displayed measured location/attempts. Difference mode rendered and preserved instructions.
- Playoffs at 360px: latest published bracket shows training-scope and named-team guidance. Selecting 1985-86 preserves insufficient-history N/A; selecting 2026-27 shows unpublished-bracket empty state and latest-results action.
- Model Results at 360px: both anchors are exactly 44px high; `#explorer` and browser back preserve fragments/history. Desktop 1440px screenshot confirms discoverable “On this page” placement.
- Actual native Chrome AX reported `Zoom: 200%`. DOM DPR changed from 1 to 2, viewport from 1440 to 720 CSS px. Model and Shot Value zoom DOM checks show no document overflow. The extension screenshot backend crops zoomed captures, so those PNGs do not establish visual clipping behavior. A native-window capture follow-up stopped when the user switched to an unrelated Chrome tab; no further native input was sent. This is normal browser page zoom, not text-only zoom. Chrome zoom reset to 100%.
- Schedule at 390px: full breakdown opens; scroll cue says `Scroll sideways for more columns.` Internal scroller is 500px wide inside 343px, with tabindex=0, while document scrollWidth equals clientWidth (375px). Header units remain games/net/wins. 360px screenshot retained.
- Data Status at 360px: database reachable, coverage/data-through/refresh remain separate; six cards retain `Not recorded.` and the durable-record absence explanation is visible. Desktop 1440px capture retained.
- Tab console: no errors; four Recharts initial-size warnings (width/height -1) captured in JSON. Rendered charts subsequently appear; this bounded polish did not change chart sizing.

Viewport override reset after checks. No deployment or production verification claimed. 200% visual clipping (capture limitation), text-only 200% scaling, physical mobile browser and exhaustive court tapping/share behavior remain unverified.

Typecheck recheck during sibling work: only cron update DailyRefreshPort missing methods and sync-scores-espn test object.includes errors remained. Root must recheck after those implementations settle.


## Home full-bleed scrollbar correction

Native Chrome reproduced the same pre-existing homepage overflow on local 3102 and unchanged production (`fullcourt-nba.vercel.app` redirected to `fullcourt.fyi`). At a 390px viewport the classic scrollbar reserves 15px: document clientWidth 375px, home left -7.5px/right 382.5px/width 390px, document scrollWidth 383px. `margin-inline: calc(50% - 50vw)` used the scrollbar-inclusive viewport width, shifting both content rails by half the gutter.

Bounded fix: `src/components/home.module.css` makes only `#main:has(.home)` an inline-size query container and uses `50cqw` in the existing breakout margin. Background/theme, vertical geometry, max-width 1152px, type, motion and markup remain unchanged. Header and bottom nav are outside main, as is the command palette mount.

Regression tests in `e2e/home.spec.ts` remove Chromium's default `--hide-scrollbars` only for this test file. Four cases use auto/stable gutter at 390/1440px and compare document scrollWidth with **clientWidth**, assert full-bleed bounds (left 0/right clientWidth), actual main width, and nearest query ancestor. The existing Games action test also checks that main's containerType returns to normal outside home.

Test-first evidence against old built 3101: initial stable-only injection did not reproduce the real bug. With Chromium's hidden-scrollbar flag removed, stable itself changed viewport-unit geometry so the old CSS passed those two cases. The added default-auto cases reproduced the observed bug: **390px scrollWidth 383 > clientWidth 375; 1440px scrollWidth 1433 > clientWidth 1425**. Both auto cases failed before CSS modification; both stable cases passed. This distinction is retained rather than treating emulation setup failures as regression evidence.

Source ready for root-coordinated fresh build, affected homepage checks and native Chrome confirmation. No source candidate or deployed acceptance is inferred from the old build.
