# Project handoff
Reconciled 2026-10-18. Source/tests and Git take precedence. This is a current-state summary;
update these sections in place. Rationale belongs in [Decisions](DECISIONS.md).
## Product and release
FullCourt studies NBA rest, travel, schedule density, and outcomes. The homepage leads with
rest and schedule findings; Games, Season Report, Schedule Edge, and Explore are the primary
navigation. Explore contains the other basketball studies. There are no accounts or persisted
personal preferences; exploration state is shareable through URLs and browser history.
Production: https://fullcourt.fyi. Release history through 2026-10-19 is condensed here;
Git, CHANGELOG.md and dated reviews hold exact delivery evidence. PRs #84/#85 established the redesign; #174 updated the framework. D-69/D-70 and D-79
retain publication defaults, venue baselines and Games navigation. Shared controls use 44px
targets and 16px text. Ordinary rested-home rates retain their 100-game gate.
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

## Condensed schedule/travel audit and staging — 2026-10-20

The [opening-quarter audit](research/2026-10-20-opening-quarter-travel-review.md),
[full-season review](research/2026-10-20-full-season-travel-review.md) and
[all-season report](research/2026-10-20-historical-audit/README.md) retain original findings
and unrepaired-state measurements. D-120 retains Mileage wording; actual airports and
intermediate home stops remain unobserved. The diagnostic homecoming rate was sensitivity
evidence, not a fitted coefficient. D-121 / ADR 0011 and D-122 / ADR 0012 subsequently
corrected verified venue/streak/tip/type/workload inputs plus eleven playoff feature cases,
with 1,050 new-revision predictions preserving previous records. Local apply/rollback,
restart and independent review preceded the owner-approved v1.0.3 cutover below.
Actual opening-night writes, source publication, future Cup assignments/championship
workload, device checks and unresolved source conflicts remain separate follow-ups.

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
is claimed. The [record](research/2026-10-20-overtime-correction/README.md)
separates candidate numbers from live acceptance. Next: frozen-commit review, immediate
owner approval, then
coordinated production activation and readback. After this audit, the owner requests repository
and local audit/script cleanup, preserving source evidence and rollback material while updating
active tools. That cleanup is queued separately. Opening-night/device/Cup limits remain open.

## Production correction accepted; maintenance — 2026-10-20

v1.0.7 / PR #187 merged `65605ae9` (source-identical to reviewed `7aa04e82`). The
owner-approved production update matches the exact six-table after-state; independent
review passed. Deployment `dpl_6MEYfJzbvWn3BcvXXB1Viie5eyuj` serves fullcourt.fyi.
Canonical verification passed 86 APIs / 45,837 comparisons with zero mismatches and
61 Behind the Data browser tests. Health is up. Daily Actions and all 12 Vercel cron
definitions were restored; domain assignment restored and protection preserved. This
supersedes the preceding preparation-only status. Opening-night/device/Cup limits remain.

Queued cleanup is underway: main is synchronized to the release; 17 ignored research
outputs match the verified recalculation and previous copies are archived. Preserve
path-bound audit/source/backups and frozen correction tools. Active research tooling is
updated to reject stale or failed producer output, without refitting coefficients. Full
1,366 Vitest / 72 ML contracts pass; guarded CSVs match v1.0.7 byte-for-byte. The owner
then supplied a new independent arena/shooting audit: maintenance awaits separate review,
and the new correction must stop for explicit approval before any production data write.
