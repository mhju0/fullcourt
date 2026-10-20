# Independent venue, identity and coverage follow-up — 2026-10-20

Status: locally implemented and recomputed. Exact-commit review and production acceptance
are separate release gates. No new production data write. The owner
requires a reviewed manifest, fresh backup and conditional rollback, followed by explicit
approval before production application. This record supersedes neither the retained audit
nor v1.0.7 acceptance. Source/test evidence takes precedence over audit prose.

## Section 8 — PR #187 follow-through confirmed first

A new repeatable-read, read-only production capture at 2026-10-20 06:38:01 UTC matches the
approved v1.0.7 complete six-table after hash:
`ef953faeb133a329a636653ed017091da17c27639adbb44bf2d8bd4eedf8159b`.
Claude's supplied independent `a4_fatigue_recompute.py` ran unchanged against fresh CSVs
and the released source. All 103,398 fatigue rows match across 1,757,766 field comparisons,
with zero mismatches. This includes the 2,400 projected sides on the scheduled basis.

The 346 corrected overtime games have 692 subsequent team appearances; 683 fall within
30 days, and all are covered by the complete independent replay. Later rolling-window
consequences are covered too. No conclusion depends on `computed_at` or its timezone.
All 15 dependent analytics stages had run, and their 27 retained output hashes still match
the frozen regeneration manifest. v1.0.7's canonical API/browser acceptance remains valid.

Evidence in the ignored correction folder: `capture.json`, `fresh-csv/`, and
`section8/{result.json,follow-through.json,recompute.pkl}`.

## Source acceptance

The prior audit's coordinates, dates and BRef city annotations are candidates. Individual
primary records must establish exceptional fixtures before registry adoption. Historical NBA
arena metadata can be retroactive or wrong: contemporary building names may be attached to
older games. A matching NBA fixture ID/date/result does not independently validate its arena.
All-30 arena inventories therefore separate fixture identity, physical-building history,
coordinate evidence, naming aliases and adoption status. Building opening dates do not
substitute for actual first/last game dates. Shared physical buildings use identical points.

Mileage remains an arena-to-arena estimate. Airports, unobserved home returns, coefficients,
window definitions, preserved graded predictions, seed proxies and 2026-27 grading remain
outside this correction. Alternate designated home venues retain the existing ADR 0011
home-court rule; a different city alone does not imply neutral status.

## Audit-item disposition

| Item | Independent result and local action |
| --- | --- |
| 8 — PR #187 follow-through | Confirmed complete by full unchanged replay and retained producer hashes before new geometry work. |
| 1 — arena eras | Confirmed missing within-metro eras; all 30 franchises inventoried. Several candidate points rejected or refined; see sourced tables and methods below. |
| 2 — alternate homes | Confirmed the 101 listed candidates with primary evidence or explicitly disclosed primary triangulation; additional mixed/return fixtures added. Conflicting unsupported venue claims remain unadopted. |
| 3 — Las Vegas | Confirmed Thomas & Mack for the May 3, 1992 Lakers game. Same designated-home classification as Anaheim; below the existing altitude threshold. |
| 4 — Shooting | Confirmed canonical alias exclusion; fixed identity matching, complete cache checks and regenerated publication. The universal one-to-two-game impact claim is not exact. |
| 5 — Data Status | Confirmed mislabeled venue-baseline count; neutral-inclusive coverage is separately computed and rendered with a regression test. |
| 6 — smaller repairs | Mileage wording, generated-fact references, era comment, conference builder/two manifest cells, referee dates, L2M canonical link and database docs corrected locally. |
| 7 — report only | Definitions, coefficients, seeds and preserved prediction history remain unchanged. No 2026-27 grading was built or run. |

All 15 analytics producers completed against the exact local after-state. The retained output
manifest hashes 27 artifacts; input bytes and full database/source bindings were unchanged
before and after regeneration. Independent fresh-export checks reproduce every fatigue
side/field and Mileage/altitude/time-zone calculation with zero mismatches. Nonzero
preserved-history, source-neutral and definition diagnostics are retained separately.

The [before/after comparison](before-after.html) and its CSVs are generated from complete
raw manifest snapshots and the corresponding old/new publication helpers. Local API/browser
acceptance and exact-commit review are recorded when finished; neither a prepared report nor
calculation parity establishes production deployment.

## Prepared geometry and source decisions

The [sourced arena table](arena-eras.csv) contains 76 observed regular/postseason episodes
across all 30 franchises. First dates may be left-censored at the 1985-86 coverage boundary;
current buildings' last dates mean the latest completed game in the frozen snapshot, not a
closure date. Preseason is outside the game's archive. The runtime register has 76 physical
sites, 69 default/base intervals and one explicitly separate Atlanta modeled-base override.

The cumulative physical-fixture register adds 182 exact fixtures: the audit's 101 candidates,
all 73 mixed Atlanta homes, six Maple Leaf Gardens games, and the Spectrum/MECCA return games.
Earlier accepted fixtures remain. Original venue-specific source points refresh the shared
Hartford, Baltimore, Tacoma, San Jose and Anaheim endpoints consistently.

Independent verification disagrees with several proposed coordinates. Government historical
maps support different Richfield, Miami, Orlando and HemisFair locations; the original ARCO I
building also differs from the candidate location. The Anaheim Convention Center's campus pin
is not its Arena: the accepted point comes from the circular Arena roof polygon, corroborated
by the official facility plan. No source is accepted merely because its modern game-page
building name or a named map result looks plausible. One November 1990 Tacoma Dome placement
is explicitly high-confidence primary triangulation, rather than direct building naming.
The conflicting March 29, 1991 UPI Tacoma dateline is rejected after AP and LA Times place that
separate Minnesota game in Seattle. The November 1996 Toronto venue conflict is retained
without an unsupported new override. See the per-area source reports and raw evidence hashes.

Shooting's complete source join adds 108 eligible outcomes and 917 FGA across 84 player-season
rows. Thomas Bryant has three recovered games, so the audit's universal one-to-two-game summary
is not exact. Existing outcome fields are preserved; the global empirical-Bayes prior can also
change career estimates beyond those 84 season rows. Shot Value has no matching canonical-ID
exclusion and does not require the same cohort correction.

A fresh 07:46 UTC read-only production capture and a public-schema backup share one exported
PostgreSQL snapshot and reproduce the accepted v1.0.7 six-domain hash. The backup restored in a
disposable local database with all public tables/policies; its eight-table schema needed a
local `auth.role()` compatibility function, which is not Supabase Auth verification. No
production Auth or data was changed. Exact backup/capture/restore receipts remain in the
ignored `docs/audit/arena-shooting-correction/fresh-backup/` folder.

The first preparation attempt correctly refused a source difference: a lexical scanner
misread an existing template literal after interpolation and treated approved comments as
code. Parser-resolved token validation now checks the actual old/new complete module and
rejects mutations to existing thresholds, aggregation, interpolation and helper behavior.
No scoring-rule exemption was widened.

## Exact local transition rehearsal

The candidate is `6cc5f11f24199936c118dc112ec47147eba275e8a7d522d5fbad87a71d0f70b6`,
with source proof `140647c61490bbe8ef20ef721a555346e66b6abe14d79c7fa8eeb537cd419036`.
All 103,398 sides were replayed; 52,611 semantic fatigue rows change across all 42 stored
seasons. Changes affect only arena Mileage, its travel-load contribution and total score;
altitude, time-zone, density, rest and all other score components remain unchanged.
The candidate also changes exactly two conference cells and updates eight existing future
forecasts, with no prediction insertion or deletion. Every graded prediction and every
playoff prediction version remains exact.

The local after hash is
`83fc2c66f301f6ac115d4b2fdfe45883b5304d33a041569712a94fe3cbb18fa7`.
Full apply/readback, idempotent retry, actual PostgreSQL restart/readback, conditional
rollback/readback, a second actual restart/original-state readback, and final local
reapplication/readback passed. This verifies the local transition and rollback; it does not
authorize or claim production application. The ignored `rehearsal.json` binds every stage
to the exact manifest, source proof and complete before/after hashes.

The [fixture source table](fixture-venues.csv) lists all 353 cumulative exceptions and their
source records. The [arena table](arena-eras.csv) separates observed game boundaries from
the runtime registry's effective base intervals.

## Integrated checks and retained diagnostics

All 1,460 unit tests pass after correcting old coordinate/calibration expectations without
widening their tolerances. Real PostgreSQL transition contracts pass 36 tests; Python scripts
pass 58 and ML contracts pass 72. Type checking, production build, documentation links and
dependency audit pass. Full ESLint reports zero errors and two pre-existing unused-variable
warnings in `cron-update.test.ts`. The methods-page removed-call rates now render from the
generated facts; the former blanket “above 63%” claim no longer holds for both terms.

The complete numeric oracle checks 80,312 independent before/after leaves. All 86 local
production-mode API requests return 200 and match 50,581 numeric leaves; the retained before
API corpus also matches 50,581 leaves. This establishes the local candidate, not production.

The fresh independent audit retains 12,378 historical prediction-gap differences, 838
currently missing calls and 141 no-longer-calls as diagnostics of preserved history, not
repair instructions. All 27,420 graded rows and all 3,149 playoff prediction versions remain
exact. The 153 seed-proxy differences, 174 referee neutral-flag differences, and final-game
window/streak counts of 25,763 and 1,041 remain report-only. The original Shooting reference
check retains 16 name-normalization misses; separate player-ID/context checks reconcile
all 16 without rewriting that original report. All 2,028 externally sampled player-seasons
then agree in FGA and exact eFG numerator. The separate full-cache check covers all 14,493
published season rows. Fifteen of the 615 reference playoff series are the existing
2019-20 bubble-model exclusion; all 600 stored series match their accepted metadata.

The prediction tools follow Section 7's preservation decision. Verification reports historical
current-rule differences separately from structural integrity and eligible-future consistency.
The legacy reset command is report-only; `--apply` is refused before environment/database
loading. The historical backfill documentation also stops recommending deletion. No reset,
historical backfill or 2026-27 grading was run in this task. This closes the handoff's explicit
script-reconciliation requirement without changing model definitions or stored history.

A built-browser error-state check additionally found the team-logo fallback text had
insufficient contrast on Atlanta/Portland red. The text selector now compares actual WCAG
contrast while preserving official team fills, using pure black only when both existing
text choices fail. All current/historical/neutral primary and secondary fills have regression
coverage. This presentation repair is outside the frozen scoring/transition source closure;
it does not change the manifest or any data calculation. Normal-image checks and the
explicit failed-image check remain distinct evidence.

Both preservation-aware CLIs were exercised on the dedicated SELECT-only local role in
REPEATABLE READ / READ ONLY transactions. They report 28,077 stored predictions, 27,420
graded and 657 unresolved; integrity and all 657 eligible future calls pass. Historical
all-stored-row gap differences are 12,519: the independent audit's 12,378 still-called rows
plus 141 withdrawn rows. The three retained neutral-site predictions are historical
diagnostics too. `--apply` refuses before environment/database access. Eight tool contracts
and the complete native Node suite (24 tests) pass; full unit tests remain 1,460 passing.
The exact six-domain after hash is unchanged before/after the actual CLI runs. Shared
node-postgres pool/TLS settings and latest-fatigue ordering remain in use.
