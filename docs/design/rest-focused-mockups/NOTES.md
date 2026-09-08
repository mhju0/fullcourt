# FullCourt rest-focused mockups

Review artifact, 2026-09-07. These HTML/CSS pages do not replace application routes.
Open `index.html`, or serve this directory with `python3 -m http.server 3112`.
Rebuild HTML using `python3 build.py`; CSS, fonts, JavaScript and snapshots are bundled.
No framework, build tool, account, personalization, animation, or remote font request.

## Coverage

Seven representative pages: Homepage, Games, Season Report, Schedule Edge, Player Shooting,
Shot Value, Behind the Data. Supporting Explore, About, and season-state pages complete the
review navigation. Each HTML file is responsive; review widths are 1280px and 390px.

The homepage stays focused on rest/schedule and shooting by rest. Officiating does not appear
in its main findings. Games prioritizes the actual slate. Season Report owns completed outcomes;
Schedule Edge owns comparisons, travel/workload and the weekly fatigue calendar. Both shooting
sample sizes stay visible on mobile. Methodology has local contents and anchored sections.

## Data provenance

Bundled files were read from the existing local application on 2026-09-07:

- `data/analysis.json`: `/api/analysis`; historical baselines and widest-gap group. Hero uses
  the RA >= 7 threshold, 1,108 games, 65.9% minus the 59.9% home baseline. It is not an
  estimate of wins caused by rest. Baseline denominator: 47,143 games.
- `data/season.json`: `/api/season-report?season=2025-26`; season results, team records,
  completed-game workload, weekly fatigue and notable games.
- `data/schedule.json`: `/api/schedule-disparity?season=2025-26`; ranking and coverage.
- `data/games.json`: `/api/games/2026-04-12`; all 15 games on the final regular-season date.
- `data/player-rest.json`: copied from `public/data/player-rest.json`; packed column offsets
  match `src/lib/player-rest.ts`. Twenty highest-volume 2025 player-season rows with >=300 FGA.
- `data/court.svg` and `data/court-model.svg`: rendered BASELINE and GBM SVGs captured from
  `/shot-quality`, with an SVG namespace added for standalone rendering. Both contain real cells.

Historical and current-season measures have different coverage. The future-season page is
explicitly a placeholder; no future figures are fabricated. Snapshot copies here are design
fixtures, not updates to published analytics. Production implementation must use canonical
calculations and freshness metadata, not these static files.

## Deliberate limits and review choices

- One season/date snapshot; the selector displays that scope, not a functioning historical browser.
- Games uses text team identifiers in circles as layout stand-ins. Final integration retains
  the existing recognizable team marks and approved wordmark/mark assets, including kerning.
- Games uses all supplied games. The upcoming action leads to an explicit scope-state example.
- No Skim/Deep Dive redesign in this artifact; details open natively and instantly.
- Season team records initially show six rows; a disclosure contains the remaining 24. No
  schedule-worth, travel table, player workload or fatigue chart is repeated on that page.
- Schedule Edge initially shows all net-edge ranks, five workload rows, and disclosures for
  remaining detail. The weekly chart has the exact-value table underneath. Two-column ranks
  read across rows on desktop and collapse to a single sequence on mobile.
- Shooting is a 20-player layout sample; search filters this sample. The selected A treatment colors the difference cells and marks uncertain differences quietly.
  Career expansion is not included.
  A link opens the full application. Player workload relocation is not implemented in this sample.
- The homepage shooting module presents the question and its uncertainty, rather than choosing
  an extreme single-player split as a headline. A final numerical shooting finding is not selected.
- Shot Value uses static source diagrams. Compare models reveals the distinct GBM diagram;
  interactive coordinate inspection links to the already repaired application. Mobile starts
  with one court; desktop comparison is side-by-side when opened.
- Methods and About contain shortened proposed copy, not a complete replacement for all methods.
- Links to existing application pages use `http://localhost:3110`; that application must be running.
  All mockup navigation, fonts, diagrams and data are local. No links imply a deployed redesign.
- The permitted brief homepage hero entrance is omitted from these static composition reviews.
- Details, search, model comparison and anchor navigation work. These are not full product flows.

## Review focus

1. Does the homepage immediately communicate rest/fatigue rather than general NBA statistics?
2. Do Games, Season Report and Schedule Edge each have an obvious, distinct job?
3. Is the two-column desktop schedule ranking easier to scan, or should it stay one column?
4. Are mobile shooting samples readable enough beside their percentages?
5. Does the shortened methodology layout preserve trust while improving navigation?

Review these compositions before moving product content or changing application navigation.

## Verification

All seven representative pages checked at 1280px and 390px: no document overflow, no broken
images, and no automated axe violations in the checked states. Both court diagrams were shown
for comparison checks. Search/empty results, game expansion, weekly-value disclosure, and the
desktop/mobile review viewer were exercised. Rendered captures are in `screenshots/`; measured
results are in `verification.json`. Physical-device and full screen-reader checks are not claimed.

## Owner review amendment — denser Shooting by Rest

The owner requested a dense comparison table instead of spaced player blocks. The mockup now
shows 20 player-season rows, with about 53px row height, sortable rates/differences/attempts,
search, and an explicit empty result. Desktop includes games, total FGA and overall eFG%.
Mobile hides those secondary columns while keeping identity, both split rates and attempts,
and difference together. Player links open the existing application detail. The other mockup
compositions are unchanged. This supersedes the earlier spaced-row recommendation.

## Shooting color exploration — A selected

Open `shooting-colors.html` to switch between three treatments and 1280px / 390px previews.
Direct files: `shooting-color-cell.html`, `shooting-color-bar.html`, `shooting-color-row.html`.
`python3 build.py` regenerates the selected page and reference variants; `python3 build-colors.py` also runs that complete mockup generation.

1. Tinted difference cell: confines the diverging color intensity to the final column.
2. Centered bar: encodes sign through position and magnitude through length, with green/red.
3. Row gradient: carries the direction across the identity and supporting data for faster scanning.

The owner requested green for positive and red for negative in this exploration. This does not
change the Officiating palette or ratify a site-wide palette. All three preserve the exact
20-player sample, sorting/search, signed differences, attempt counts, and dense row geometry.
The main `shooting.html` now uses A. B and C remain reference alternatives only.

Assumptions: a common ±10 percentage-point visual cap; values beyond the cap still print in
full. Color refers to 3+ days minus no rest, not overall player quality. A dagger and quieter
mark denote abs(difference) below sqrt(2500/noRestFGA + 2500/restedFGA), matching the current
application's `effectSe` display convention. This is not a significance test or causal finding.
Missing values and career estimates are outside this complete-data snapshot's scope.

Applied UI UX Pro Max's chart guidance on diverging scales with exact values and a numeric
legend; Emil's guidance on predictable, immediate repeated interactions. No animation added.
Automated browser checks covered six variant/width combinations, search, empty results and
sorting, plus the comparison viewer. No document or table-cell overflow and no axe violations
after correcting the darkest red-cell text contrast. Screenshots and `color-verification.json`
are bundled. These checks do not substitute for physical-device or screen-reader testing.

Owner selected A: tinted difference cells. This is the approved Shooting by Rest design for
future application integration. Positive differences use green; negative use red; player names
and supporting statistics remain neutral. No centered bars or full-row color in the selected page.
