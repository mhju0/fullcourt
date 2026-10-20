# Project handoff
Reconciled 2026-10-18. Source/tests and Git take precedence. Rationale: [Decisions](DECISIONS.md).
## Product and release
FullCourt studies NBA rest, travel, schedule density, and outcomes. The homepage leads with
rest and schedule findings; Games, Season Report, Schedule Edge, and Explore are the primary
navigation. Explore contains the other basketball studies. There are no accounts or persisted
personal preferences; exploration state is shareable through URLs and browser history.
Production: https://fullcourt.fyi. Git, CHANGELOG.md and dated reviews retain releases. D-69/D-70 define publication-aware
defaults and venue baselines; D-79 defines Games navigation. Ordinary rested-home rates keep
the 100-game gate; Officiating archive limits remain documented.
## Architecture and safeguards
- Next.js serves pages and API routes. Database reads use Drizzle/node-postgres against Supabase
  PostgreSQL. Offline Python analyses also publish committed artifacts.
- `src/lib/fatigue.ts` computes scores on the write path. The coefficients are ratified;
  changes require an owner decision and the protocol in ADR 0006.
- Game dates are America/New_York calendar dates. Published regular-season reads use
  `publishableGames()`; the headline counts `isCalledSide()` (rested home team) against a
  venue baseline. Rested visitors remain separate.
- The ORM schema is incomplete by design. `shot_grid` and `shot_value_surface` use raw SQL.
  Manual SQL records in `drizzle/` are not an automatic database bootstrap.
- Generated artifacts, their scripts, and pinning tests must change together. Missing data
  stays distinct from zero. Officiating covers selected late-game reviews, not whole-game accuracy.

## Operations

[Testing and CI/CD](TESTING_AND_CICD.md) owns checks and release steps;
[Data pipeline](DATA_PIPELINE.md) owns ingest;
[Officiating](OFFICIATING.md) owns L2M publication;
[Season rollover](SEASON_ROLLOVER.md) owns calendar transitions.

Officiating's first manual Actions run, `34179954451`, passed collection, source retention,
and publication contracts. Repository policy prevented the bot from opening a PR; the workflow
successfully left a review branch and comparison link. A human-authorized PR published that update.
Future refreshes still require preview verification before merging.

## Remaining verification and future scope

Automated desktop/mobile/accessibility coverage does not establish physical-device or human
screen-reader behavior. Observe actual completed-slate ingest; offseason skips are insufficient.

[Roadmap](ROADMAP.md) contains the remaining maintenance work and deferred ideas. No coefficient
refit, database migration, accounts, or new analytics are implied by repository cleanup.

## Condensed pre-2026-10-07 history — 2026-10-20

D-64–D-78, Git and dated reviews retain the Behind the Data, reading-page, launch and
phone-layout deliveries. Build/start CSS verification remains required (D-72); full
DB-backed e2e stays separate from CI. Shared tiles, footer page finder, privacy/non-affiliation,
report mail and canonical-domain redirects shipped. PR #104 corrected historical facts;
v1.0.3 later restored four workload fixtures and confirmed overtime. D-117 supersedes
old launch gating: v1.0.0 is officially October 19; actual completed-slate checks remain open.

Sentry IP storage is off; UptimeRobot checks home/health every five minutes. Eight weekly
Mac backups use `~/Backups/fullcourt/backup.sh` (Sunday 11:00, pg_dump 18); one restore
matched counts. Edge rate limiting and credential rotation shipped. PR #171 source maps
have verified client symbolication. Supabase Pro review remains November 5.

Unresolved/standing dispositions retained from these entries:

- The October 3 production API 500 has no established cause. October 7 Sentry timeout
  JAVASCRIPT-NEXTJS-4 remains monitored; issue 3 resolved. Server symbolication unobserved.
- Phone/calendar controls, native zoom and screen-reader behavior need physical-device use.
- Reader-picked Schedule column and broader table-width redesign remain deferred.
- Footer notice stays 12px by owner choice; off-Mac backup and phone push were declined.
- ADR 0006 keeps original ablation evidence plus the October 18 offline-fidelity amendment;
  no fatigue coefficients changed. Early overtime coverage was subsequently closed by v1.0.7.

## Condensed 2026-10-07 to 2026-10-19 record — 2026-10-20

D-78–D-119, Git and dated reports retain the Games hierarchy, status/rescore locking,
accessibility/motion, fatigue/date rounding, dependency and readability deliveries. The
[remediation](reports/2026-10-11-remediation/index.html), [accessibility audit](reports/2026-10-14-accessibility-usability.html)
and [plans](../plans/README.md) retain evidence. PR #174 shipped dependencies and explicit
postponed/cancelled states; #175 shipped the audit/sky-tinted neutrals; #176 shipped table A,
recent-ten homepage comparison and optional 5+ history; #177/#178 shipped quiet publication
guides, prior-season links and chronological upcoming rested-home edges. Later D-127 restores
the historical homepage period. Antislop applies throughout. Odds feeds remain excluded;
filter sharing, extra chart actions and configurable Schedule columns remain deferred.

October 19 is the owner's official v1.0.0 release date (D-117), baseline 114617d; subsequent
releases receive incremented versions and immutable tags. D-118 / v1.0.1 keeps current-season
Shooting in Awaiting results with explicit prior-season navigation. D-119 / v1.0.2 removes
the duplicate chart dropdown, adds a pooled five-season home-rate average, separates historical
picks from known-result playoff fits and adds a league-centered team gap key. The prior
completed-slate prerequisite is superseded; opening-night observation is still required.

Standing limits preserved from those entries:

- Observe a real slate, provider status/postponement events and the D-83 rescore in production;
  offseason/mocked-clock checks do not establish those outcomes. Equal-tip order is deterministic;
  ESPN equivalence remains an inference. The owner kept scheduler/monitor lateness (D-110).
- Physical iPhone/VoiceOver/native zoom, capacity and real Supabase delivery remain unverified.
  Previously load-sensitive Games and retracting-header cases passed targeted built checks.
- Officiating item 24: current source/reproduction checkpoint is in ROADMAP.md. Fresh NBA source
  reproduction and cached Legends rebuild closed prior provenance gaps. No coefficient change.
- Vercel connector access remains limited; authenticated browser/CLI are usable. Client Sentry
  symbolication is verified; server-event symbolication remains unobserved.
- Re-key ESPN-seeded current-season games to hoopR IDs once played games exist (SEASON_ROLLOVER.md).
  Future Cup/December assignments need rechecking; review Supabase Pro around November 5.
- The nine-item accessibility audit is historical; current defect acceptance/deferred scope is
  in ROADMAP.md. Schedule Edge net days-off subtraction remains equivalent to days-since arithmetic.

## Condensed schedule and correction staging — 2026-10-20

The [opening-quarter](research/2026-10-20-opening-quarter-travel-review.md),
[full-season](research/2026-10-20-full-season-travel-review.md) and
[all-season](research/2026-10-20-historical-audit/README.md) reports retain the original
read-only findings. D-120 keeps the visible Mileage label. D-121 / ADR 0011 and D-122
prepared the controlled physical-venue, workload, homecoming, tip and playoff-input
corrections later accepted as v1.0.3 below. Those reports' repair-pending wording is
historical. Actual airports/intermediate home returns, future Cup assignments and physical
device/opening-night observation remain unresolved. The separate historical overtime
coverage limit was closed by v1.0.7 and independently replayed in D-131.

## v1.0.3 production closeout — 2026-10-20

Owner-approved manifest `9e8c6ebd…9911490` applied; fresh-backup restore and independent
production after-state `5b5b1bad…683278` match. PR #182 / merge `0f30d345` is live in
`dpl_AB8Fc1sBfoHNptroC9Z8jDW6kM8c`; canonical alias, 12 APIs (ten exact local matches),
14 routes, browser figures and cache refresh pass. CI/CodeQL/browser/PostgreSQL gates pass;
GitHub/Vercel scheduled writers restored. Existing predictions and coefficients preserved.
The [delivery report](research/2026-10-20-historical-recalculation.md) records exact evidence.
Next: observe actual opening-night writes; recheck future Cup assignments and retain all
source/device limits above. Intermittent upstream Google Fonts build failure passed on retry;
licensed local-font replacement was researched but not applied.

## Player-source correction — 2026-10-20

v1.0.4 implements D-123 / ADR 0013 (confirmed appearance history before Shooting's
unchanged raw outcomes) and D-124 / ADR 0014 (Availability identity/coverage guards and
source-aware windows). Both producers and career estimates are regenerated; unknowns
remain distinct from absence/zero minutes. One primary-confirmed player team assignment
is corrected; D-125 carries exact integer shooting numerators to prevent inconsistent
season/career rounding. No DB score, fatigue coefficient or resolved prediction changes. Independent
full-cache arithmetic/outcome checks and producer replays pass; the
[record](research/2026-10-20-player-appearance-rest-correction.md) pins exact evidence.
PR/tag/release and provider evidence own review, preview and canonical acceptance.
Next operational work: actual opening-night writes, future Cup assignments and retained
source/device limits. Raw backups and audit evidence remain in the isolated worktrees.

## Serverless transaction-pool candidate — 2026-10-20

D-126 prepares v1.0.5 after concurrent production reads exhausted the shared-session pool.
The shared app/score writer uses unpipelined node-postgres, guarded transaction checkout,
bounded connection waits and optional CA-verified TLS; raw execution consumers preserve
their row arrays through `.rows`. No production data/schema/model change is included.
Disposable PostgreSQL contracts pass: 20 prospective, 12 lifecycle, five freshness and six
pool recovery cases. Independent Supabase transaction-endpoint/TLS probes pass. Next:
complete exact-candidate review/full checks and preview/API parity, switch Vercel's URL/CA,
then verify canonical production before declaring the patch released.

## Historical homepage and methods audit — 2026-10-20

D-127 restores all eligible completed seasons on the homepage; both bars and their
denominators share that population. D-128 audits all twelve Behind the Data routes against
current producers/artifacts and official policy sources. v1.0.6 corrects coverage, travel
proxies, model evaluation, uncertainty and formula descriptions without changing analytics
artifacts, coefficients or database state. The [record](research/2026-10-20-methods-accuracy-audit.md)
separates current generated results, dated studies and retained source limits. PR/tag/provider
evidence owns exact-candidate review and deployed acceptance. v1.0.4/v1.0.5 are released
with canonical verification; the serverless pool uses production-only transaction mode and
verified TLS. Next: opening-night writes, future Cup assignments and human/device checks.

## Numeric source follow-up in preparation — 2026-10-20

D-129 / ADR 0015 close the bounded 5,815-game overtime source audit with retained NBA
responses and 14 field-specific supplemental adjudications. The separate candidate corrects
346 overtime inputs and 683 fatigue rows with unchanged coefficients/results/predictions/
playoff tables. Its exact manifest passed independent semantic review, 16 unmocked PostgreSQL
checks and independent before/after captures after real server restarts. All 15 producers,
full tests/build, 86-API numeric parity and 61 browser tests pass; no production application
is claimed. The [record](research/2026-10-20-overtime-correction/README.md) separates candidate numbers
from live acceptance, which is recorded below. After this audit, the owner requests repository
and local audit/script cleanup, preserving source evidence and rollback material while updating
active tools. That cleanup is queued separately. Opening-night/device/Cup limits remain open.

## Post-PR-187 independent correction candidate — 2026-10-20

v1.0.7 / PR #187 (`65605ae`) was applied with owner approval and verified on the canonical
site. D-131 first rechecked its full six-domain production state and all 103,398 fatigue
sides with Claude's unchanged independent calculation: zero mismatches, including every
following-game overtime effect. All 15 dependent producer stages were confirmed.

The isolated `fix/historical-arena-shooting` worktree prepares v1.0.8; it is not deployed.
The [source record](research/2026-10-20-arena-shooting/README.md) covers all 30 franchises,
76 observed arena episodes, 182 additional exact fixture overrides, five canonical Shooting
aliases, neutral-inclusive Data Status coverage, two conference cells and referee identity
repairs. Points are sourced map estimates, not surveyed court centers; the November 1990
Tacoma placement is explicitly primary-source triangulation. Section 7 remains report-only;
coefficients, historical predictions and deferred 2026-27 grading are preserved.

The fresh public backup restored with all eight public tables and 16 policies in disposable
PostgreSQL. Manifest `6cc5f11f…0f70b6` changes 52,611 fatigue sides, two conference cells and
eight existing future forecasts. Exact apply, idempotence, rollback and actual server-restart
checks passed; production writes remain zero. All 15 producers and independent full-row
replays pass; 86 local APIs match the numeric oracle and 1,460 unit tests/build pass. Next:
obtain narrow final review of the report-only prediction tools, then present the exact diff,
source proof, before/after figures and rollback for new owner approval. Do not merge/deploy
the new scorer against the old production dataset. The separately queued cleanup
branch needs the new arena dependency closure before integration.


## Approved arena candidate and recurrence record — 2026-10-20

Independent core and narrow prediction-tool reviews accepted final candidate
`647906687fb4218ca939a250545902ad3747c0f4`. The owner approved its exact arena manifest
`6cc5f11f24199936c118dc112ec47147eba275e8a7d522d5fbad87a71d0f70b6` for production
application and requested a durable record to prevent repeated audit mistakes. The
[audit ledger](research/2026-10-20-arena-shooting/AUDIT_LEDGER.md) records adopted fixes,
rejected evidence, implementation/harness corrections, preserved Section 7 diagnostics
and rerun triggers, separating committed regression coverage from ignored operational
receipts. This entry supersedes the prior pending-review/approval next step; it does not
claim production execution or deployment. Next: root completes fresh preflight, approved
application/readback, matching release and canonical verification, then records observed
production evidence. Preserve the exact source/manifest bindings and historical predictions.


## Sanitized arena release publication — 2026-10-20

D-132 records the owner-reported third-party embed-key exposure in extracted source metadata.
A fresh public branch from v1.0.7 publishes the sanitized tree without adding the exposed
research commit to its ancestry. The old public PR/commit exposure is not purged; secret alert
#1 remains open. Exact original evidence and the approved manifest stay in the private
execution worktree. CI also now installs the existing pinned Python dependencies before both
Python contract suites. Public runtime/artifact equivalence requires independent review.
Production DB writes remain zero at this entry; original schedulers/settings were restored
while preparing this bridge. Next: fresh release gates, drain/backup, original approved apply,
exact readback, matching deployment and canonical verification.


## Queued research maintenance follows arena correction — 2026-10-20

The isolated `chore/research-freshness` branch integrates the released arena dependency
closure for v1.0.9. It retains the earlier v1.0.7 maintenance verification and CSV receipts
as dated evidence, rather than certifying them against the new source. Freshness guards
include the shared arena registry/factory and require an actual successful export → prepare
run against the accepted AFTER clone. No refits, publication regeneration, production writes
or deletion of raw sources/backups is part of this maintenance. Root records actual v1.0.8
canonical acceptance separately; the cleanup has not been pushed or deployed.

The local follow-up now passes 1,463 Vitest, 81 ML Python, 58 script Python and 26 native
Node contracts plus type/lint/docs/build. Guarded intermediates are byte-identical to the
accepted arena outputs; all six local AFTER tables match the frozen manifest. Both receipts
validate and old CSV/receipt/report copies remain archived. See the
[maintenance record](research/2026-10-20-repository-maintenance.md#arena-closure-follow-up-for-v109--2026-10-20).
No cleanup publication or production action is claimed.


## Homepage cutover readback failed; rebuild pending — 2026-10-20

The root applied the approved arena manifest and verified exact production AFTER `83fc2c66…`,
but had built source `6ddf73f4` before that apply to shorten the maintenance window. Canonical
browser checks at 390/1440 caught old prerendered homepage values despite 86 APIs / 50,581
leaves passing. The root restored maintenance immediately and kept scheduled writers paused.
The same source is rebuilding against the corrected database (`4i7sjdouf` staged shorthand);
no SQL/model change is involved. [V11](research/2026-10-20-arena-shooting/AUDIT_LEDGER.md#v11-production-build-before-data-apply-2026-10-20)
records the root's sequencing error and the required staged HTML/browser plus API gate.
Remediation and canonical acceptance remain pending; root appends the measured final outcome.
