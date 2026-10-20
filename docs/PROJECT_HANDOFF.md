# Project handoff
Reconciled 2026-10-18. Source/tests and Git take precedence. This is a current-state summary;
update these sections in place. Rationale belongs in [Decisions](DECISIONS.md).
## Product and release
FullCourt studies NBA rest, travel, schedule density, and outcomes. The homepage leads with
rest and schedule findings; Games, Season Report, Schedule Edge, and Explore are the primary
navigation. Explore contains the other basketball studies. There are no accounts or persisted
personal preferences; exploration state is shareable through URLs and browser history.
Production: https://fullcourt.fyi. Release history through 2026-10-19 is condensed here;
Git, CHANGELOG.md and dated reviews hold exact delivery evidence. PRs #84/#85 established
the current redesign; #174 shipped Next.js/ESLint 16.4.1 and Sharp 0.35.5. D-69/D-70
established publication-aware defaults and venue-baseline history. Games navigation follows
D-79; shared filters use 44px targets and 16px text. The hero follows D-67. Ordinary
rested-home rates retain the 100-game gate; Officiating's archive limits remain documented.
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

The redesign has automated desktop/mobile and accessibility coverage. Physical-device and human
screen-reader testing are not claimed. Exercise the daily pipeline against actual completed games
when the season resumes; an offseason skip is not evidence that the ingest path works.

[Roadmap](ROADMAP.md) contains the remaining maintenance work and deferred ideas. No coefficient
refit, database migration, accounts, or new analytics are implied by repository cleanup.

## Condensed pre-2026-10-07 history — 2026-10-20

D-64–D-78, Git and dated reviews retain the Behind the Data, reading-page, launch and
phone-layout deliveries. Build/start CSS verification remains required (D-72); full
DB-backed e2e stays separate from CI. Shared tiles, footer page finder, privacy/non-affiliation,
report mail and canonical-domain redirects shipped. PR #104 corrected historical facts;
v1.0.3 later restored four workload fixtures and confirmed overtime. D-117 supersedes
old launch gating: v1.0.0 is officially October 19; actual completed-slate checks remain open.

Sentry IP storage is off; UptimeRobot checks home/health every five minutes. The owner's
Mac retains eight weekly backups (`~/Backups/fullcourt/backup.sh`, Sundays 11:00,
pg_dump 18); one restore matched counts. API rate limiting was configured at the edge.
Credentials were rotated and Vercel DATABASE_URL made Sensitive. PR #171 shipped source
maps; client symbolication verified October 18. Supabase Pro review remains November 5.

Unresolved/standing dispositions retained from these entries:

- The October 3 production API 500 has no established cause. October 7 Sentry timeout
  JAVASCRIPT-NEXTJS-4 remains monitored; issue 3 resolved. Server symbolication unobserved.
- Phone/calendar controls, native zoom and screen-reader behavior need physical-device use.
- Reader-picked Schedule column and broader table-width redesign remain deferred.
- Footer notice stays 12px by owner choice; off-Mac backup and phone push were declined.
- ADR 0006 keeps original ablation evidence plus the October 18 offline-fidelity amendment;
  no fatigue coefficients changed. Unconfirmed early overtime coverage remains a source limit.

## Summary of the entries from 2026-10-07 to 2026-10-18

Condensed again on 2026-10-19; DECISIONS.md D-78 to D-109, dated reports and Git retain detail.

- D-79–D-109 and their Git history retain the Games hierarchy, status/rescore, writer locking,
accessibility/motion, fatigue/date rounding, historical naming, calibrated rest bins and
dependency deliveries. [Remediation](reports/2026-10-11-remediation/index.html) retains the
launch statuses; [accessibility audit](reports/2026-10-14-accessibility-usability.html) and
[plans](../plans/README.md) retain UI evidence. The owner excluded odds feeds. Ratified
coefficients and module-specific cohort rules remain in their ADRs.

Still open from those entries:

- Never seen in production: a real slate's game status (only a mocked clock), the D-83 rescore,
  physical iPhone and VoiceOver use, native zoom, capacity, and real Supabase delivery.
- Explicit postponed/cancelled lifecycle support shipped in PR #174; an actual provider
  event remains future observation. Equal-tip ordering is deterministic; ESPN equivalence remains an inference, not a contract.
  The owner kept the scheduler/monitor with variable lateness documented (D-110).
- The two previously load-sensitive offseason Games cases and the retracting-header navigation
  case passed targeted checks on the built candidate; no speculative timing changes were made.
- Officiating item 24: see the current source/reproduction checkpoint in ROADMAP.md.
  Odds-feed item 18 is closed: the owner excluded feeds from scope (Oct 14 report, row 18).
- The nine-item accessibility audit is historical. The owner selected defect fixes and deferred
  optional chart actions and filter sharing on 2026-10-18; current acceptance is in ROADMAP.md.
- Schedule Edge's capped net days-off wording is equivalent to its days-since arithmetic:
  subtracting one from both capped sides cancels. Preserve the current calculation.
- Vercel connector access remains limited; authenticated Chrome dashboard access works.
  Production 69b5e02 was Ready on 2026-10-18. Both Dependabot PRs have Ready previews.
- Re-key the ESPN-seeded 2026-27 games to hoopR IDs once played games exist (SEASON_ROLLOVER.md).
- Supabase: the owner will revisit the Pro plan around 2026-11-05, after seeing in-season egress.

## Condensed release history — 2026-10-18 to 2026-10-19

PR #174 merged Next.js/dependency, accessibility and explicit postponed/cancelled support;
PR #175 delivered the independent audit and sky-tinted neutrals (D-111). PR #176 delivered
the recent-ten-season homepage comparison, table A and optional raw 5+ Home-court history
(D-112–D-114), merged as `6ac5c27`. Their dated reviews retain verification evidence.
The owner selected antislop throughout and kept the existing scheduler/monitor. Optional URL
filters, extra chart actions and configurable columns remain deferred. Client Sentry
symbolication was verified; server-event symbolication remains unobserved. Fresh NBA source
reproduction and the full cached Legends rebuild closed prior provenance gaps; published
figures and ratified model coefficients did not change. Opening-night pipeline observation,
human/device checks, December fixtures, canonical-ID re-key and the November 5 plan review
remain open as listed above. Git/provider state takes precedence over these historical notes.
PR #177 added quiet publication-specific availability guides, internal readiness, prior-season
links and chronological large rested-home edges (D-115–D-116); PR #178 fixed the Officiating
guide heading and wrapping. Their dated reviews retain acceptance evidence.

## Official v1.0.0 release — 2026-10-19

The owner declared October 19, 2026 the official release date and the current site
v1.0.0 (D-117), superseding the previous completed-slate prerequisite. Version and
release history now start at 1.0.0 in package.json and CHANGELOG.md; future production
releases increment the version and receive immutable tags/GitHub release records.
The product baseline is 114617d. Release designation does not mark the remaining
opening-night, physical-device or source-publication checks complete.

## Shooting awaiting view — 2026-10-19

D-118 records the owner’s v1.0.1 follow-up: default to the current season and show
only its Awaiting results view until usable publication, with explicit prior-season
navigation. Historical tables remain available by selection; no automatic older
table beneath the notice. Readiness and career guards remain. Delivery/verification
are recorded by the patch PR, version tag and GitHub release.

## Approved readability refinements — 2026-10-19

D-119 records owner approval of mock controls B, trend A, playoffs A and team
records A from prototype 0719987. v1.0.2 removes the duplicate chart dropdown, adds
a pooled five-completed-season home-rate average, separates historical picks from
known-results playoff fits, and adds a league-centered team gap key. Team gap
rounding uses original counts. Ratified coefficients, cohorts and generated data
remain unchanged. Exact PR, review, checks and matching deployment own release
acceptance; the prototype is retained separately as design evidence.

## Opening-quarter travel audit — 2026-10-20

The [audit](research/2026-10-20-opening-quarter-travel-review.md) checks all assigned Oct–Dec games and researches 30 teams’ airport candidates. Density flags pass; homecoming road-load inconsistency, Austin venue omission and stale CHI–MIL tip remain unresolved. Airport/return-home assumptions are unverified; six away gaps cross unknown Cup fixtures. No source/model/database correction was applied. Next: review the road-load rule and physical-venue representation, reconcile times, then verify a controlled correction before rescoring.

## Full assigned-season travel review — 2026-10-20

The [full review](research/2026-10-20-full-season-travel-review.md) extends checks to all 1,200 assigned games / 2,400 sides. Density and API fields pass; 185 homecomings have positive road load, three Austin venues are omitted, and two stale tips are confirmed. D-120 records the owner's Mileage label choice. Deeper itinerary cases confirm some home interruptions but no validated geography rule. No app/model/DB correction occurred. Next: resolve the scorer contract, separate physical venues, correct tips and dependent scores, then re-audit Cup assignments plus championship workload context.

## All-season schedule/travel audit — 2026-10-20

The [all-season report](research/2026-10-20-historical-audit/README.md) covers 51,695 games / 103,390 scores across 42 stored seasons. Replay and independent density/rest/Mileage arithmetic pass; longstanding homecoming semantics affect 6,125 published scores under a one-change diagnostic (61.1889%→61.1417%). External checks identify 783 missing OT inputs (including the separately frozen bulk supplement), 109 postseason sublabel defects and a qualified 167-game venue register. Early source coverage, actual airports/home stops and combined correction impact remain incomplete. No app/model/DB/generated-data correction was applied. Next: settle homecoming/physical-venue contracts, adjudicate and prepare a reversible input correction, review predictions/artifacts together, then obtain applicable production-write approval. Audit completion is not repaired production.


## Full-history correction staging — 2026-10-20

D-121 / ADR 0011 implement verified corrections, actual venue endpoints, streak resets,
Cup/play-in workload context and bounded bubble geography without changing coefficients.
The isolated `fix/historical-recalculation` worktree has a restored local PostgreSQL shadow;
production remains unchanged. The [recalculation report](research/2026-10-20-historical-recalculation.md)
pins the exact manifest and comparisons. Apply/rollback and actual server-restart checks pass;
cache/derived publication checks and full tests pass. D-122 adds eleven verified playoff
feature fixes and 1,050 new-revision outputs while preserving older records.
The owner explicitly approved the exact reviewed production update and conditional rollback.
Next: finish the exact commit review, maintenance/cutover and canonical-domain verification. Existing opening-night/device/source-publication
follow-ups remain open. Unverified scores, early overtime coverage and actual itineraries
remain explicit source limits rather than inferred corrections.

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
