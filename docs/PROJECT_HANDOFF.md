# Project handoff
Reconciled 2026-09-11. Source/tests and Git take precedence. This is a current-state summary;
update these sections in place. Rationale belongs in [Decisions](DECISIONS.md).
## Product and release
FullCourt studies NBA rest, travel, schedule density, and outcomes. The homepage leads with
rest and schedule findings; Games, Season Report, Schedule Edge, and Explore are the primary
navigation. Explore contains the other basketball studies. There are no accounts or persisted
personal preferences; exploration state is shareable through URLs and browser history.
The rest-focused redesign shipped in PR #84 (`776683e`). Its first verified Officiating refresh
and release record shipped in PR #85 (`34b8961`). Production: https://fullcourt.fyi.
The [dated release review](design/redesign-release-review.md) records verification; use GitHub
and Vercel for subsequent deployment status.
Games now exposes Season → Month → Date controls, with shared season selectors across studies.
Games has one layout at every width, in tip-off order (D-79). Playoff Rest explains between-round recovery directly.
Officiating covers 12 regular seasons and 4,546 reports, including the partial 2014–15 season;
[archive evidence](research/2026-09-09-l2m-archive.md) records source checks and historical limits.
The homepage hero now contains only the headline, original description and primary action.
The one-game example and its supporting reads were removed under D-67. Next.js and its ESLint
config are pinned to 16.4.0 (16.3.4 → 16.3.8 on 2026-10-03 for GHSA-vcvr-r3jv-pc5j; 16.4.0 on 2026-10-15, moved together); the
lockfile resolves Sharp 0.35.5 (pinned on 2026-10-07 for GHSA-wq5f-xc86-pv6w), clearing the production dependency audit. See [verification](design/home-hero-release-review.md).
Shared filters now use 44px targets and 16px text. Analysis uses equal-width filter columns;
Season Report uses bordered sections with a separate interpretation surface. The
[control and section audit](design/control-and-section-audit.md) records route coverage and rationale.
D-69 makes Playoff Rest and Expected Shot Value default to their latest usable publication.
Their selected views are shareable through URLs and copy actions. `/data-status` separates
coverage, refresh evidence and database connectivity; the homepage historical date comes from
the analysis population. Games moves offseason context beside mobile date controls, names
matchup controls distinctly, and restores selected-chip visibility after resizing. See the
[seven-fix review](design/seven-polish-fixes-review.md) for verification and release evidence.
D-70 adds `/home-court`, reached through Explore, for annual home and rested-home win-rate
history with an expandable count table. Season Report exposes the selected home baseline
alongside the rested-home result and gap. Both retain the 100-game rested-home display gate;
ongoing seasons are labeled explicitly and excluded from completed-history summaries.
The [research record](research/2026-09-11-home-advantage-trend.md) retains data, sources, and
owner decisions. See the [release review](design/home-court-study-review.md) and Git for verification and deployment status.
## Architecture and safeguards
- Next.js serves pages and API routes. Database reads use Drizzle/postgres-js against Supabase
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


## Summary of entries before 2026-10-05

Condensed again on 2026-10-11; DECISIONS.md and dated review records retain detail.

- **Methodology/usability (D-64, D-65).** Behind the Data audit shipped on 2026-09-09; see FRONTEND.md and [review](design/usability-audit-review.md).
- **Release checks, 2026-10-03 (D-71, D-72).** Games avoids URL writes during navigation (`route-transition.ts`). Turbopack build cache is off; after globals.css changes verify production CSS. e2e is outside CI and needed to discover stale specs.
- **Reading pages, 2026-10-04 (D-73).** About/How it was built use `reading.module.css`.
- **Data audit, 2026-10-04.** SQL recompute matched production; all 50,495 finals were compared with basketball-reference/nba.com. Owner corrected four 2019-20 dates, nine scores, one OT count, 75 missing OT games and playoff series 18; fatigue/predictions rebuilt (PR #104). After score/date fixes run `scripts/export_fatigue_features.ts` fidelity check for stale rows.

Still open from those entries:

- The cause of one production API 500 seen during the 2026-10-03 audit is unknown.
- Stat-tile unification and table column widths are deferred.
- Whether `Find a page` leaves the footer; removing it leaves the page finder keyboard-only.
- Overtime before 2002-03 is not stored. Three NBA Cup finals and the 2020 play-in game are
  absent by design.
- Owner actions: tag `v1.0.0` at launch, and announce only after a verified live pipeline run.

## Summary of the launch-readiness entries, 2026-10-05 and 2026-10-06

Condensed on 2026-10-10 from two entries; DECISIONS.md D-74 to D-77 hold the detail.

Condensed 2026-10-14: D-74–D-77 shipped the footer non-affiliation notice, `/privacy`, and report mail link. `src/lib/site-url.ts` holds `https://fullcourt.fyi`; the www/fullcourt-nba/nba-rest-advantage domains redirect with 308.
Sentry `javascript-nextjs` / `michael-ju-46` uses Vercel `NEXT_PUBLIC_SENTRY_DSN` with IP storage off; UptimeRobot checks `/` and `/api/health` every five minutes. Vercel's one Hobby firewall rule limits `/api/` to 100 requests per 60 seconds per IP.
The owner's Mac runs `~/Backups/fullcourt/backup.sh` Sundays 11:00, retaining eight backups; it needs pg_dump 18 and one restore matched counts. Instagram review fixed the Schedule pinned-column zero rule and report subject `FullCourt error or suggestion`.

Still open from those entries: Sentry source-map upload; the footer notice size (12px); the
GitHub social preview and outside links may still name the old address; the quota plan
from the ten-item list was not recorded as done.

## Phone and tablet layout (2026-10-07)

Condensed 2026-10-11: PR #111 shipped D-78 phone calendar/week controls, one-line slate summary,
scroll cues and smaller Schedule columns; D-79 removed its summary rail. The owner holds the
private survey; row30 was amended. Stale dev CSS was checked with build/start (D-72).
The duplicated local history was reconciled with origin; the backup branch was removed.

Open:

- Owner will do later, by their own choice: store `DATABASE_URL` in Vercel as Sensitive (rotate
  the database password in Supabase, save the new value as Sensitive, then update the GitHub
  secret, `.env.local` and `~/Backups/fullcourt/backup.sh`); and create a Sentry auth token for
  source-map upload, after which the build-side change can be written.
- A reader-picked number column for the Schedule breakdown (the survey's C1) is unbuilt.
- The new phone controls have not been used on a physical phone.
- DECISIONS.md and ADR 0006 quote the travel ablation as 5,994 calls, 59.14% and +0.32pp; the
  page has read 5,992, 59.1% and +0.34pp since the 2026-10-04 corrections. Whether those two
  records get a dated amendment is the owner's call.
- Sentry issue `JAVASCRIPT-NEXTJS-3`: a blocked `eval` on `/playoffs` from one iOS 15 client, with
  no first-party frame. Not reproduced.
- The footer notice size (12px) is not ruled on. A second backup copy off the Mac is not set up.

Later on 2026-10-07: every page was measured at 360 and 390px on a production build. No page
scrolls sideways and every table sits in a scroller. Four gaps were closed: the Home Court season
table and Officiating's season strip and call-type row now use `ScrollCue`, the Schedule
`WHAT THESE COLUMNS MEAN` disclosure is 44px tall, and the team label under a player on Shooting
is 10px, not 9.6px. The two stale `behind-the-data.spec.ts` assertions follow the page. Two e2e
tests (`games.spec.ts:294`, `navigation.spec.ts:54`) failed once in a full run and passed six of
six alone; treat them as load-sensitive. Season Report, Analysis and Playoff Rest needed no change.

Phone review round, 2026-10-07 (D-79): the Skim/Deep Dive toggle and the Games side rail are
gone, matchups are in tip-off order (`slateOrder()`), the two line tokens are darker, Season
Report and Officiating plays use bordered blocks with title bands, the fatigue chart is League
fatigue by week, the column guide sits inside the breakdown, and Shooting by Rest is Player
Shooting by Rest. Open: the ESPN tie-break is inferred from one day; Home Court inherits the
section band and was checked by screenshot only; nothing here has been seen on a physical phone.

Launch preparation, 2026-10-10 (D-80): the change freeze starts 2026-10-17 at 00:00 ET, three
days before the first game (BOS at DET, 2026-10-20, 3:00 PM ET). A mixed slate was rehearsed on
production with a mocked response (one final, one live, one upcoming): rows stayed one height
on desktop and iPhone WebKit, with no page errors. Seventeen pages were loaded in iPhone WebKit:
all 200, none scrolls sideways, no console errors.

Game status, 2026-10-10 (D-81): the stale-LIVE risk above was larger than first written. GitHub
starts the daily job two and a half to five hours late, so it lands mid-evening and would have
frozen a score on about half the season's games. Resolved by storing finals only: a row reads
LIVE from its tip time, then PENDING, then FINAL over the score. LIVE is a label with a still dot and no row tint, and the row's accessible name carries the state and score. `vercel.json` now holds
twelve hourly cron entries (21:00 to 08:00 UTC) so finals land the same night, the Games board
holds a game day until 6 AM ET, and EDGES AHEAD drops a game once it tips.

Open: twelve cron entries on one path have not been deployed before; check the Vercel cron list
after the first deploy and on opening night. A postponed game reads LIVE for three hours;
recording postponements needs a new stored status. The daily job's lateness is unaddressed and
only delays the fatigue refresh. Every state was tested with a mocked clock, none against a
real slate.

Season audit, 2026-10-11 (D-82): all 1,200 games of 2026-27 match ESPN and basketball-reference.
Three faults fixed in code: the nightly job dropped unplayed prior games (upcoming fatigue read
low or zero), the 3-in-4, 4-in-6 and 30-day figures were blank on future dates, and Season
Report travel miles were about four times too high in every season. The zeroed rows of 20 to 24
October were repaired on 2026-10-10. A second pass recomputed all 103,390 fatigue rows and 27,404
resolved picks with no difference; one typed rate and the 2026-09-11 home-court record were stale
(PR #121). Method and results: [recompute audit](research/2026-10-11-fatigue-recompute-audit.md).
The score route now rescores each finalized team's next game (D-83); rehearsed on a local restore on 2026-10-11, unseen in production. LAUNCH_DAY.md says how to check it.

Audit/proposal summary, 2026-10-11 (condensed 2026-10-12): baseline debb8cc read-only audit covered28 browser routes and1053 unit checks; local reports remain in docs/audit/2026-10-11-comprehensive and2026-10-11-fix-proposals. The owner approved implementing seven fixes and nine UI recommendations; delivered D-84 evidence follows below.
The proposed transaction-bound refresh, bounded cache and failure signaling were implemented and deployed via PR #124; the proposal's illustrations are not actual captures. Physical iPhone, capacity/load, real Supabase delivery and the first live slate remain unverified.
Launch record: owner answered “none” for2–10;17/19/20/21 investigations done within report limits,18 blocked on odds-feed intent. Preserve explicit owner yes for every merge/production write and D-80 freeze; all28 current statuses are retained in the remediation report.

Audit implementation, 2026-10-11 (D-84): [remediation report](reports/2026-10-11-remediation/index.html). [Verified] C1/C6 share prospective lock-before-read transactions across all three regular writers; C3 has absolute cache age, C5 propagates degraded failure, and Games/Edges refetch authoritative data with clock filtering. U1 and proposed UI polish applied; coefficients/artifacts/schema unchanged. Local PostgreSQL 18 reproduces the original stale overwrite; 16 protected integrity contracts pass, including actual CLI paths and restored foreign keys. Production remains unchanged pending owner merge approval. Full E2E/independent candidate review in progress; all 28 launch statuses remain in the report, owner-only items unanswered beyond “none”.

Final remediation verification, 2026-10-11: [Verified] product542af17: lint/typecheck/build,1,111 unit,20 PostgreSQL,7+35 Python,419/419 connected E2E; independent Class3 review accepted. Exact SHA preview ready; native Chrome mobile/desktop and connected Games refresh verified. Scoped homepage classic-scrollbar overflow fixed with failing regression evidence.
Next: PR #124 awaits explicit owner yes to merge/deploy; production data untouched. Conditional performance/schema proposals, owner checks, physical device and opening-night checks remain open; all28 statuses retained in remediation report.

Production merge follow-up, 2026-10-11: owner explicitly approved PR #124; merged0e9f60d at10:54:30UTC. [Verified] exact SHA Vercel production READY; live home390/1440, Games refresh/focus/opener, analysis anchors, Data Status and read-only APIs checked. No direct production data writes. Local remediation report updated; first real slate/owner/conditional checks retain existing28 statuses.

Artifact follow-up, 2026-10-11: [Verified] item23 chart regenerated from committed JSON; 164 count/rate/CSV checks passed. Item24 partial: shooting figures and1152 Officiating details reproduce, legends byte-identical; referee regeneration loses4 matched games and labels unplayed2026-27 coverage. Published JSON preserved; older Officiating index provenance rejected. See [record](research/2026-10-11-artifact-regeneration.md).
Next: review scope for referee matching/coverage before implementation; obtain latest Officiating snapshot before claiming full regeneration. Item1 target Oct12 run unavailable; owner/future checks unchanged. No production writes or additional merge.

Artifact merge follow-up, 2026-10-11: owner approved PR #125; merged3445fcd at11:29UTC. [Verified] exact SHA production READY, live home/health200 and merged chart PNG match. Item24 generator fixes still unimplemented; published JSON preserved. Local report updated with post-merge evidence; all28 statuses unchanged.

Generator safeguards, 2026-10-12 (D-85): owner approved observed referee coverage, exact4-game corrected-date crosswalk and monotonic Officiating publication. [Verified] both pure boundary and actual CLI cached runs match13,209 events, collect12,636 whistle/11,952 style,573 missing,0 errors; analytical fields identical to publication. Authentic older snapshot refused before any write;4,555 published JSON remain byte-identical.
[Record](research/2026-10-12-generator-publication-guards.md); [HTML before/after](reports/2026-10-11-remediation/index.html#generator-guards). [Verified] Node22 gates/1148 unit/Python7+42, independent edd31eb review, CI and exact-SHA connected preview pass. PR #126 awaits owner merge yes; no production writer or merge.
Open: latest Officiating snapshot/full upstream Legends unavailable, item24 stays partial. Oct12 nightly unavailable; all owner/future checks and unresolved prior issues preserved. Next: owner-approved PR merge only after preview/review; opening-night runbook remains separate.

Selected motion fixes, 2026-10-14: [plans and verification](../plans/README.md) record the five owner-selected fixes: immediate Analysis tooltips/fatigue fills, shared Games controls, reduced-motion drill scrolling and Schedule guide rotation. [Verified locally] corrected baseline reproduces all five defects; built Chromium passes 98 checks, including 20 selected-fix cases at 390/1440px in normal/reduced motion; lint/typecheck/build, 1,148 unit tests, production dependency audit and doc links pass.
No model/schema/data/dependency changes. Existing homepage, route and record motion is preserved. Early invalid reduced-motion harness results were rejected and replaced with asserted viewport/media evidence.
Open/next: independent root review; deployment remains pending the owner's credential rotation and explicit merge yes. No push, PR, merge or production write; physical-device and opening-night checks and all prior unresolved issues remain open.

Ordered accessibility/usability audit, 2026-10-14: [HTML report](reports/2026-10-14-accessibility-usability.html) and [numbered findings](../anti-slop/audit-002-2026-10-14.md). [Verified] unchanged motion candidate3058478 passes98 accessibility/navigation checks,50 baseline geometry samples and18 text-size stress samples; open-dialog semantics, palette focus return, pending-data explanations and narrow/enlarged-text layout need fixes. Nine recommendations remain unimplemented; mobile/desktop newcomer paths and local SQL/API/UI flow were exercised.
Owner approved merging3058478, but credential rotation is still unconfirmed. [Verified] latest nightly38488787184 writes112fatigue/19picks with0failures; main remains2d458df. Vercel deployment read is403 for mhju0s-projects; exact production commit/preview/source maps remain unverified. Next: select new fixes, finish credential updates and restore Vercel read access; no push/merge/deploy/data writes. Physical-device, native zoom, spoken accessibility, opening-night checks and every prior unresolved issue remain open.
Closeout: independent report review approved HTML SHA256 d93b936ae708037d272cf32c66c2f16e79c42d321b4b8c5539185d86e60d97ce after endpoint/backup-consumer corrections. Static artifact/doc checks pass; local app and initially-stopped PostgreSQL services were stopped again. Audit documents remain local and uncommitted.

Release preparation, 2026-10-14: the owner requested main integration of reviewed motion3058478 and the three audit documents. The release branch prepares that exact scope; recommendations F1–F9 remain unimplemented. Owner merge approval is recorded, while the credential-rotation gate awaits their response; no push, PR, merge or deployment has occurred in this preparation step. [Verified] Node22 lint/typecheck/build,1,148 unit tests and doc/diff checks pass for the prepared scope.

CI/CD hardening,2026-10-15: owner approved F1–F7. [Verified] local secret-free browser/real-PG gates feed required verify; dependency SDK/proxy pins,21:17 schedule, safe stage/freshness estimates, blocked manual sources and maintenance monitoring implemented. Main strict/admin enforcement and Vercel blocking GitHub verify applied/read back; no production data writes.
[Report](reports/2026-10-15-ci-cd-implementation.html) retains all28 launch statuses and owner instructions. Node22 gates/1157unit,15automation,24+42Python,12rendered,25PG pass; independent exact-candidate code review accepted4247072. No push/preview/merge/deploy: credential rotation unconfirmed. Next: owner confirms all credential locations, then exact-SHA preview and authorized release; scheduled/Dependabot/failed-promotion evidence follows. Broad UI suggestions and physical/opening-night checks remain open; D-80 freeze still applies. JOBKOREA queued separately.
Prelaunch cron follow-up,2026-10-15: [Verified] all12 Vercel cron entries enabled and recent2XX observed in the prior read-only audit. Opening-night finals/rescore remain unobserved; no production writer was manually called.

Release hold,2026-10-15: owner requested push/merge, then explicitly answered “Not yet — keep release pending” for credential rotation. [Verified] main remains2d458df, no PR exists for fix/ci-cd-hardening, and code candidate7d0c054 is unchanged. No push/preview/merge/deploy performed. Next: owner rotates/updates all recorded credential consumers, then resume exact-SHA CI/preview and approved merge.

Credential recovery preparation,2026-10-15: owner requested agent-managed rotation and confirmed submitting Supabase reset. [Verified] old credential fails28P01; live health503. New credential propagation/redeploy remains pending owner hidden local input. Local gitignored updater has15 passing mocktests; original env/backup format, CLI identities and pre-reset CA-verified readonly connection checked. Backup reads original.env, no separate edit. Dashboard confirmsFree plan(item10); current quota usage unknown. Next: reviewed updater local prompt → saved consumers → current production credential-refresh deployment/health → authorized CI/preview/merge. No reset, saved-credential mutation, push or deployment performed by agent. All other unresolved checks persist.

Credential recovery verified,2026-10-15: owner completed hidden prompt. [Verified] new saved credential passes CA-verified readonlySELECT1; local.env0600/backup extraction match; all consumer commands succeeded and GitHub timestamp updated. Existing accepted production redeploy5vzGqHuDr7gtF5pGo5EoErahvHiK isREADY; home/health200(dbup), Chrome Games rendersOct20slate. Local lint/typecheck/1157unit/build pass using exactpnpm11.8; oldCorepackkey error and localhelperlint interference resolved without app exceptions. Helper/receipt archived ~/.local/share/fullcourt-credential-rotation. Next: hosted exact-SHA CI/preview, independent frozen-candidate reconciliation and authorized merge/deployed verification; remaining launch checks preserved.

Post-merge verification,2026-10-15: PR127 mergedde81a8f; PR CI/CodeQL/realPG/browser12 and exactb012 preview desktop/mobile pass. Manual read-only maintenance dependency audit passes(70dev/all advisories,0critical), but monitor38668004619 fails insetup-node: implicit package-manager cache requests absentpnpm. Bounded repair disables only monitor auto-cache; regression contract red reproduced before fix. Follow-up branchfix/maintenance-monitor-node-cache awaits gates, exact hosted monitor rehearsal and separate owner merge yes. Main production/CI verification continues; no productiondatawriter dispatched.

Node-only workflow follow-up,2026-10-15: PR129 owner-approved/mergedc3b2be7; exact-main read-only monitor38668903373 passes. Final breadth check found the same implicit cache defect in manual provider probe; all other setup-node jobs install pnpm first. Generalized workflow guard fails on probe before fix, replacing the narrower monitor-only guard. Branchfix/probe-node-cache disables probe auto-cache only; no source/DBwriter logic changed. Gates/hosted source-probe rehearsal and separate merge yes pending; production remains healthy.
