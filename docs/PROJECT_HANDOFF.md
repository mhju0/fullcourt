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

Condensed 2026-10-15 (entries of 2026-10-07 to 2026-10-10): every page measured at 360/390px
with no sideways scroll; D-79 removed Skim/Deep Dive and the side rail and ordered matchups by
tip-off; D-80 set the change freeze from 2026-10-17 00:00 ET; D-81 stores finals only, so a row
reads LIVE, then PENDING, then FINAL, with twelve hourly cron entries (all twelve seen enabled
on 2026-10-15). Still open: `games.spec.ts:294` and `navigation.spec.ts:54` are load-sensitive;
the ESPN tie-break is inferred from one day; nothing has been seen on a physical phone; a
postponed game reads LIVE for three hours (needs a stored status); the daily job's lateness is
unaddressed; game status has been tested with a mocked clock, never a real slate.

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

CI/CD and credential recovery, 2026-10-15 (condensed 2026-10-16): F1–F7 hardening shipped (secret-free browser and real-PG gates feed the required `verify`; strict admin enforcement on `main`). The owner rotated the database credential through a local hidden prompt; every consumer and production redeploy verified. PRs #127, #129 and #133 merged; the last two disable setup-node's implicit pnpm cache in the monitor and the provider probe. No production data writer was dispatched.

Next 16.4.0, 2026-10-15: PR #134 (`0fbcb62`) moved `next` and `eslint-config-next` to 16.4.0 together with the dev-tooling group, superseding Dependabot #130/#132 (Dependabot ships them in separate PRs; either alone left lint red or the versions apart). `TransitionLink` now derives its season href instead of reassigning the prop (new `react-hooks/immutability` rule). [Verified] Node 22 gate, 1157 unit, 12 smoke, preview and production READY. Open: first scheduled run of the rewritten nightly at 21:17 UTC tonight is unobserved; this file is past ~200 lines and due for condensing.

Days off + storyline names, 2026-10-15: PR #136 (D-86). `daysRest` is now full days off (b2b = 0, "0 days") via `src/lib/days-off.ts`; the model keeps `daysSinceLastGame`. The storyline uses season-correct nicknames with a verb on every clause; the player-shooting rested bucket is relabelled "2+ days off" (threshold unchanged; a true 3+ cut halves the effect and splits the age bands). [Verified] unit/typecheck/lint/build, smoke 12, games+audit e2e 32. Open: Schedule Edge "days off" label over a days-since count (owner's site-wide audit); `shooting.spec.ts` 4 local failures pre-date this PR; merge before the 10-17 freeze.

Labels, data and line breaks, 2026-10-15 to 10-16 (condensed): D-87 to D-94 shipped (gaps compare at two decimals, neutral hosts never called, the /home-court gap read from printed rates, former team codes named, officiating credits the working crew) with `keepTogether()` and `e2e/line-breaks.spec.ts`; all merged on merge day below. Still open: altitude carryover applies to the next game at any gap while every written source says the next night (needs an ADR, a ~2,349-row production recompute and owner approval); `scripts/backfill_predictions.ts` for 5 called games with no prediction row; `shooting.spec.ts` filter race (a filter picked right after load sometimes does not stick, on `main` too).

Merge day, 2026-10-16: owner delegated the open PRs. #138 squashed (`5795929`); the stack #137–#145 folded into #136 and merged as one commit (`66e9415`, individual commits kept); production READY, health 200, `/api/analysis` venue baseline 47,112. The 9 neutral-site prediction rows were deleted (owner-approved for after #139; backup kept locally, transaction asserted 9). `verify_predictions.ts` still called the neutral host, so it read MISMATCH; #147 (`f1155a7`) fixed it and it now reads consistent (47,112 in scope, 27,400 calls, 0 neutral predictions). Portfolio mhju0/mhju0.github.io#6 merged and live. [Verified] combined tree: CI, local gate, e2e 484 + 3 load-failures passing on rerun, preview, then `line-breaks`/home-court/analysis specs 56/56 against production. Open: Dependabot #131 (recharts) and #128 (actions) are held until the freeze lifts (comments on each); `*-server.test.ts` cache tests (rest-advantage-evidence, schedule-disparity, season-report) time out at 5s on a loaded machine, on `main` too (3 of 5 runs). They import the module inside the test; CI has been green.

Games board round, 2026-10-16 (PR #150, merged 2026-10-17 as `edfa767`): days-rest column dropped and four flags per line (D-95); gap tiers replaced by one BIG REST EDGE badge for a rested home team 3+ fresher, the backtest's 3+ bucket (D-96); "How to read the board" guide reads the 3+ rate live and omits the venue baseline by owner decision; refresh control is "Updated <time>" plus an icon button; flag hover card removed; fatigue scores and rest gaps print at one decimal, cut not rounded (D-98, display only). The owner withdrew the D-80 launch freeze (D-97), so Dependabot #131 and #128 are no longer held. [Verified] lint, typecheck, build, 1,184 unit; full e2e 485 passed, 2 failed then fixed or passing on rerun (a schedule test pinned two decimals and clicked an ambiguous label; the 1440px reach test times out under load). The `shooting.spec.ts` race was fixed by #138 (126 runs clean on 2026-10-17).

Games by team, 2026-10-17 (PR #151, merged 2026-10-17 as `fafb574`; results mid-season and NBA Cup TBD rows added before merge): BY DATE / BY TEAM tabs; `/games/team` lists one team's season with the gap signed from its side, via `GET /api/games/team` (D-99); desktop day arrows moved onto the DATE label's line and the long date into the Matchups heading. Workflow: the owner found audits and scans too slow and heavy on the Mac, so AGENTS.md now carries a verification budget, and Vitest is capped at half the cores (full run 20s, server cache tests no longer time out under load). [Verified] lint, typecheck, 1,191 unit, build, the affected e2e specs plus the new `e2e/games-by-team.spec.ts`. ALT TRIP was decided the same day (next entry).

ALT TRIP removed, 2026-10-17 (branch `feat/remove-altitude-carryover`): the owner chose to delete the altitude carryover rather than fix or hide it (ADR 0006 amendment, D-100). Measured first: no published rate moves at one decimal, 205 games change class. `fatigue.ts` charges altitude for tonight's venue only; ALT TRIP is gone from the board and the matchup line; the flag also requires tonight's venue at altitude so old rows cannot raise it; the harness drops `alt_carry`. Production recomputed the same day with owner approval: 3,138 final games (6,276 rows, deleted then `backfill_fatigue.ts`, backup in the session scratchpad), all 1,200 projected 2026-27 games (`project_fatigue.ts --force`), the 27,400 graded predictions rebuilt to 27,420 (16,778 correct, 61.2%; `verify_predictions.ts` consistent, 634 open), `ml/rest_split_facts.json` regenerated with its mirror and the schedule-value pins, and the rest-advantage ablation table re-measured. Fidelity export: 100,990 stored rows, 0 mismatches. The 5 missing predictions from the labels audit are covered by the rebuild.

Gap sizes across tabs, 2026-10-17 (PRs #157 and #158, both open): the owner set one vocabulary for every tab: EVEN under 0.5, small 0.5–3, medium 3–5, large 5+, "3+ edges" combined. #157 (D-101) turns the Games BIG REST EDGE badge into MEDIUM or LARGE. #158 (D-102, stacked on #157) rebuilds /analysis: HOME TEAM MORE RESTED tile, a disjoint-range chart with 95% whiskers whose bars open exactly their games, five-season era chart against each era's home rate, home court by season, and an explorer with Rest gap and Rested team selects defaulting to home. Supabase egress was at 90% (cycle resets 10-30); the owner stays on Free, so #158 was verified without the database (build with no DATABASE_URL, route-fixture e2e) and the weekly Mac backup is paused until 10-31 by a guard in `~/Backups/fullcourt/backup.sh` (delete it after). Next, each in its own PR: /schedule big edge 1.5 → 3, home page "widest gaps" 7+ → 5+, Behind the Data ladders after 10-30, /season hidden-tier cleanup. Open: run `e2e/analysis.spec.ts` and `motion-accessibility.spec.ts` against the #158 preview; BY TEAM "3+ REST EDGES" counts home-rested games only (owner to choose caption or rename).

Checkpoint, 2026-10-17 (PRs #157, #158, #160 merged; production `ec368d1` READY): the gap sizes of D-101/D-102 are live on Games and Model Results. Running the production e2e suite after #158 turned up 11 failures: 10 were test drift and 1 was a real defect (the Small bar's whisker took its click), fixed in #160. A follow-up PR forces the tooltip hover onto near-zero era bars (about 1px, which Playwright reads as covered; the axis tooltip triggers from the bar's column). [Verified] the analysis, gap-range and motion specs pass 13/13 against fullcourt.fyi. README screenshots and copy were recaptured from production. Profile README now links fullcourt.fyi (mhju0/mhju0#5). Portfolio Games capture and captions refreshed (mhju0.github.io#7). Dependabot: #155 closed itself, #159 (minor/patch group) is next, and #156 (`@types/node` 26) stays held because the runtime is Node 22. Open: the four follow-up gap-size PRs (Schedule Edge 1.5→3, home page 7+→5+, Behind the Data ladders after 10-30, Season Report hidden tiers); delete the backup guard after 10-31; BY TEAM "3+ REST EDGES" caption question; the Officiating season chart clips its 2017-18 bar at 1280px; seven local worktrees from earlier sessions hold unmerged work (including `codex/sentry-source-maps`, the pending withSentryConfig change).
