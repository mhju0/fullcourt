# Project handoff
Reconciled 2026-10-20. Source/tests and Git take precedence. Rationale: [Decisions](DECISIONS.md).
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
[all-season](research/2026-10-20-historical-audit/README.md) reports retain original findings.
D-120 keeps Mileage wording; D-121/ADR 0011 and D-122 prepared v1.0.3. Actual airports/home
stops, Cup assignments and physical-device/opening-night observation remain unresolved.

## v1.0.3 production closeout — 2026-10-20

Owner-approved PR #182 / `0f30d345` and exact after-state passed canonical verification;
writers were restored and coefficients/predictions preserved. The
[delivery report](research/2026-10-20-historical-recalculation.md) owns detailed evidence.
Intermittent Google Fonts builds remain monitored; researched local fonts were not adopted.

## Player-source correction — 2026-10-20

D-123–D-125 / v1.0.4 correct appearance/team identity and integer numerators while retaining
unknowns and the outcome protocol. The [record](research/2026-10-20-player-appearance-rest-correction.md)
pins producer/full-cache evidence; raw backups remain in isolated worktrees.

## Serverless transaction-pool candidate — 2026-10-20

D-126's v1.0.5 preparation used unpipelined node-postgres, guarded checkout, bounded waits
and verified TLS; data/schema/model remained unchanged. PostgreSQL lifecycle/recovery and
endpoint probes passed; deployment acceptance was pending then and is superseded below.

## Historical homepage and methods audit — 2026-10-20

D-127 restores the common full-history homepage population. D-128 / v1.0.6 correct methods
copy without changing artifacts; the [record](research/2026-10-20-methods-accuracy-audit.md)
retains source limits. v1.0.4/v1.0.5 canonical verification subsequently passed.

## Numeric source follow-up in preparation — 2026-10-20

D-129 / ADR 0015 prepared 346 overtime/683 fatigue corrections and preserved history.
Local replay/rollback, producers and browser/API checks passed; production was not claimed
at that entry. The [overtime record](research/2026-10-20-overtime-correction/README.md) retains
preparation and later v1.0.7 / PR #187 (`65605ae`) production acceptance. Cleanup was queued.

## Post-PR-187 independent correction candidate — 2026-10-20

D-131 rechecked all released fatigue sides before sourcing arena/Shooting fixes. Local
transition/producers/independent checks passed; approval/application were pending then. The
[source record](research/2026-10-20-arena-shooting/README.md) and
[audit ledger](research/2026-10-20-arena-shooting/AUDIT_LEDGER.md) retain all dated details.
Section 7 remains report-only; 2026-27 grading stays deferred.

## Approved arena candidate and recurrence record — 2026-10-20

Independent review accepted `64790668`; the owner approved manifest `6cc5f11f…` and asked
for the durable ledger. That entry recorded pending cutover, not deployed acceptance.
Exact source/manifest bindings and prediction history remained protected.

## Sanitized arena release publication — 2026-10-20

D-132 separated original private execution evidence from the sanitized public tree.
Secret alert #1 remained open; earlier exposure was not purged. CI installed the existing
pinned Python dependencies. The dated entry preceded application and canonical verification.

## Queued research maintenance follows arena correction — 2026-10-20

The v1.0.9 candidate integrated the arena closure with preserved v1.0.7 receipts. Local
1,463 Vitest / 81 ML / 58 script-Python / 26 Node plus types/lint/docs/build passed; guarded
intermediates matched accepted AFTER bytes. The [maintenance record](research/2026-10-20-repository-maintenance.md#arena-closure-follow-up-for-v109--2026-10-20)
retains checks and private archive locations. No cleanup push/deployment was claimed.

## Homepage cutover readback failed; rebuild pending — 2026-10-20

The root built `6ddf73f4` before applying the data correction. Canonical browser checks
caught stale prerendered home values despite API parity; maintenance was restored and writers
remained paused. [V11](research/2026-10-20-arena-shooting/AUDIT_LEDGER.md#v11-production-build-before-data-apply-2026-10-20)
retains the failed receipts and staged HTML/browser/API gate. Rebuild was pending at that entry.

## Research provenance review correction — 2026-10-20

Review added `tsconfig.json` provenance and real TypeScript import resolution; valid alias
mutation rejects both receipts without output writes. A readonly-clone export/prepare rerun
retained CSV bytes with new receipts; closure/82 ML/types/lint/links passed. Cleanup remains
local, with no runtime math or publication change.

## v1.0.8 canonical acceptance; v1.0.9 prepared — 2026-10-20

[v1.0.8](https://github.com/mhju0/fullcourt/releases/tag/v1.0.8) binds merge `6ddf73f4` and
rebuilt deployment `dpl_6doQr64bTQ9LzGcjes14ViUGSFzz`. Approved production AFTER `83fc2c66…`
matches all six domains; graded/playoff history is preserved, with eight future gap updates.
Immutable/canonical 86-API comparisons, staged homepage HTML, final canonical 390/1440 home
and the real homepage regression pass. V11 remediation is complete. Ten non-home/four-logo
cases remain carried same-source checks. Writers and automatic aliases are restored; SSO
protection remained unchanged throughout.
The ledger's [acceptance](research/2026-10-20-arena-shooting/AUDIT_LEDGER.md#v108-production-acceptance-and-v11-remediation-completed--2026-10-20)
pins full hashes and private receipt identities; older pending entries above are chronology.
Secret alert #1 is still open; revocation/history purge is unknown. Existing device/slate/Cup/
travel limits remain. Cleanup implementation `ffc9be7b` is reviewed; final documentation
review/publication remains pending.
