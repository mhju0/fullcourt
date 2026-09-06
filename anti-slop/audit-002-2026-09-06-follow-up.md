# Audit 002 follow-up

All five findings in [audit 002](audit-002-2026-09-06.md) have been addressed. The owner requested application to existing copy, including GitHub metadata and README. The earlier project setup and interaction fixes remain included under audit 001.

## Coverage and changes

- Scanned page, component, and library text with a TypeScript AST inventory and targeted wording searches. Reviewed the explanatory inventory across 101 source files, including metadata, chart notes, table descriptions, empty states, and error messages.
- Revised all ten Behind the Data routes: index, rest advantage, schedule edge, playoff predictions, player shooting, shot value, availability, referees, time zones, and data limits.
- Synchronized the nine product pages, front page, matchup evidence sentences, manifest, social metadata, and social image.
- Shortened the README, corrected its feature descriptions and setup instructions, and refreshed all nine product screenshots. Screenshot alt text describes the image instead of repeating an analysis.
- Scanned current documentation for conflicting claims. Rewrote the glossary and corrected the architecture's obsolete daily-ingest overview, handoff editorial policy, and brand voice examples. D-55 records the decision. No roadmap commitment changed.
- Historical ADRs, pre-registrations, research reports, and design explorations retain their original wording. Current copy is governed by D-55; the audit does not rewrite the research record or independently reproduce every analysis.

## Evidence corrections

| Earlier wording | Current meaning |
| --- | --- |
| The time-zone test “answered no” | No added predictive value in the tested held-out setup; no claim of a biologically zero effect |
| Absence controls prove an objection wrong | Measured absence changes schedule coefficients little; unmeasured confounding remains |
| No model uses team strength | The regular-season fatigue score excludes it; the separate playoff model uses team records |
| Each referee figure is exactly diluted by one third | Crew records cannot isolate who made a call or establish an exact individual effect |
| Chance guarantees the most extreme record | Expected minima illustrate multiple comparisons; they are not guarantees or corrected significance thresholds |
| Travel adds 5,994 winning predictions | The 5,994 dropped calls include losses; their win rate is shown separately |
| Log loss measures whether a probability is honest | Probability-error metrics assess estimates; accuracy and calibration have different interpretations |

The fatigue constants, thresholds, generated data, numerical facts modules, and publication predicates are unchanged. The player-rest shrinkage explanation was checked against `scripts/export_player_rest.py`: its target is the eligible-player pool mean, not zero.

## Verification

- `pnpm lint`: pass.
- `pnpm typecheck`: pass.
- `pnpm test:run`: 932 tests in 69 files passed.
- `pnpm build`: passed; production server smoke checks returned HTTP 200 with no page errors for the front page, Games, Behind the Data, rest method, referee method, and Referee Effect.
- `pnpm audit --prod`: no known vulnerabilities.
- Python contracts: 2 schedule tests and 14 playoff-grind tests passed. ML tests used a temporary virtual environment with the dependency pinned by `ml/requirements.txt`; no project dependency changed.
- Full browser suite: 291 tests exercised. The first run passed 272 and identified stale prose assertions, three JSX spacing defects, and two header wraps. After fixes, all 106 tests covering the changed page groups passed, including the formerly failing cases. The unchanged accessibility, layout, and navigation checks passed in the full run.
- Rendered prose sweep across all twenty page routes found four additional referee spacing defects; explicit JSX spaces corrected them.
- Refreshed nine product screenshots and the social preview. Visually inspected the methods index, mobile rest method, and referee screenshot. Evidence images are in `evidence-002/`.
- GitHub description changed and read back as: “NBA analytics for rest, travel, and schedule density, checked against games since 1985-86.” README and app publication follow the PR workflow; preview verification is required before merging.

## Delivery gate

This pass changes copy and preserves the Front Office layout, palette, type, and motion. The per-rule interaction evidence in [audit 001](audit-001-2026-09-06-follow-up.md) still applies to that setup.

| Gate | Result and evidence |
| --- | --- |
| R-02 | PASS: AST scan found no sentence-level em dashes in public source text; missing-value dashes remain. |
| R-03, C-4 | PASS: document overflow checks passed at 320, 390, and 1440px; revised headers pass their line-length tests. |
| R-17, R-18, R-36, R-38, C-5 | PASS: unsupported causal and absolute claims were narrowed; no numbers, testimonials, or analytical results were fabricated. |
| R-23, R-24, R-26 | PASS: existing assets and navigation retained; product and method links exercised by browser tests. |
| R-25, R-32 | PASS: axe checks and keyboard/control checks passed in the full run; focus and touch-target fixes are documented in audit 001. |
| R-27, R-28 | PASS: loading, empty, and failure states remain; no generic FAQ added. |
| R-33, R-35 | PASS: UI edits were written directly in source, then built and exercised. |
| R-34, R-37 | PASS: existing light app/dark front-page scopes and approved design direction retained. |
| R-01, R-04, R-06–R-10, R-12–R-14, R-19, R-22 | PASS for this pass: no new visual technique, asset, or motion introduced. |
| R-05, R-11, R-15, R-16, R-20, R-21, R-29–R-31 | PASS: shared tokens and product identity retained; prose names the measurement and reason instead of adding slogans or repeated claims. |
| C-1–C-3 | PASS: corrections answer recorded findings; controls retain working destinations; explanations and README sections have distinct purposes. |
| Liveliness | PASS for preserved direction: ENERGY 2 / RHYTHM 2 / MOTION 2, with the existing court motif, data colours, and typographic hierarchy. |

Real-device Safari behaviour and exhaustive screen-reader review remain outside this Chromium validation. See the existing device checks in `docs/UIUX_CHECKLIST.md`.
