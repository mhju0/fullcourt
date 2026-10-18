# Project handoff
Reconciled 2026-10-18. Source/tests and Git take precedence. This is a current-state summary;
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
config move together: 16.4.0 shipped on 2026-10-15, and 16.4.1 is prepared in the
2026-10-18 closeout candidate (not deployed at this checkpoint); the
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
- Shared stat tiles are implemented. Further table-width redesign is deferred; no specific current defect is established.
- Keep `Find a page` in the footer: it is the visible entry to the page finder.
- Overtime before 2002-03 is not stored. Three NBA Cup finals and the 2020 play-in game are
  absent by design.
- Owner actions: tag `v1.0.0` at launch, and announce only after a verified live pipeline run.

## Summary of the launch-readiness entries, 2026-10-05 and 2026-10-06

Condensed on 2026-10-10 from two entries; DECISIONS.md D-74 to D-77 hold the detail.

Condensed 2026-10-14: D-74–D-77 shipped the footer non-affiliation notice, `/privacy`, and report mail link. `src/lib/site-url.ts` holds `https://fullcourt.fyi`; the www/fullcourt-nba/nba-rest-advantage domains redirect with 308.
Sentry `javascript-nextjs` / `michael-ju-46` uses Vercel `NEXT_PUBLIC_SENTRY_DSN` with IP storage off; UptimeRobot checks `/` and `/api/health` every five minutes. Vercel's one Hobby firewall rule limits `/api/` to 100 requests per 60 seconds per IP.
The owner's Mac runs `~/Backups/fullcourt/backup.sh` Sundays 11:00, retaining eight backups; it needs pg_dump 18 and one restore matched counts. Instagram review fixed the Schedule pinned-column zero rule and report subject `FullCourt error or suggestion`.

Source-map upload shipped in PR #171; client symbolication was verified on 2026-10-18. The owner
chose to keep the footer notice at 12px on 2026-10-17 and upgraded Supabase to Pro for launch.
The social preview was uploaded on
2026-08-30, and the profile, portfolio and repo homepage moved to fullcourt.fyi on 2026-10-17.

## Phone and tablet layout (2026-10-07)

Condensed 2026-10-11: PR #111 shipped D-78 phone calendar/week controls, one-line slate summary,
scroll cues and smaller Schedule columns; D-79 removed its summary rail. The owner holds the
private survey; row30 was amended. Stale dev CSS was checked with build/start (D-72).
The duplicated local history was reconciled with origin; the backup branch was removed.

Open:

- Done by the owner: `DATABASE_URL` is Sensitive in Vercel and rotated everywhere (2026-10-15),
  and `SENTRY_AUTH_TOKEN` is in Vercel (2026-10-12). The build-side source-map upload shipped on
  2026-10-18 with the owner's approval; the controlled client event shows source lines/context.
  Server-event symbolication remains unobserved; see TESTING_AND_CICD.md.
- A reader-picked Schedule column (C1) is unbuilt and explicitly deferred on 2026-10-18.
- The new phone controls have not been used on a physical phone.
- ADR 0006 retains the original travel-ablation snapshot; its 2026-10-18 addendum records the
  current 2026-10-17 export and the offline fidelity repair without changing coefficients.
- Sentry `JAVASCRIPT-NEXTJS-3` is resolved (live read 2026-10-18); the one Oct 7 timeout
  `JAVASCRIPT-NEXTJS-4` has no recurrence and remains monitored, not claimed fixed.
- Footer notice remains 12px by owner choice. Off-Mac backup and UptimeRobot phone push
  were declined; neither is an active action item.

## Summary of the entries from 2026-10-07 to 2026-10-18

Condensed on 2026-10-18 from 22 entries; DECISIONS.md D-78 to D-109, the dated research and
report records, and Git hold the detail.

- **Live slate and pipeline (D-79 to D-83).** Finals only, so a row reads LIVE, then PENDING, then
  FINAL, with twelve hourly cron entries. The 2026-27 schedule matches ESPN and
  basketball-reference (D-82); three nightly faults were fixed and all 103,390 fatigue rows
  recomputed with no difference ([recompute audit](research/2026-10-11-fatigue-recompute-audit.md)).
  The score route rescores each finalized team's next game (D-83). LAUNCH_DAY.md says how to check it.
- **Launch remediation (D-84, D-85; PRs #124 to #126).** Writers share lock-before-read
  transactions, and the generator guards keep Officiating publication monotonic. The
  [remediation report](reports/2026-10-11-remediation/index.html) keeps all 28 launch statuses.
- **Motion and accessibility audit (PR #127).** The five selected motion fixes shipped with
  [plans](../plans/README.md); the [audit report](reports/2026-10-14-accessibility-usability.html)
  and [findings](../anti-slop/audit-002-2026-10-14.md) are committed. CI/CD hardening F1 to F7
  shipped the same day, and the owner rotated the database credential.
- **Labels and data (D-86 to D-94, PRs #136 to #148).** Full days off, gaps compared at two
  decimals, neutral hosts never called, former team codes named; the 9 neutral-site prediction
  rows were deleted with owner approval.
- **Games board and model (D-95 to D-100, PRs #150 to #152).** Four flags per line, BY DATE / BY
  TEAM, the freeze withdrawn (D-97), and the altitude carryover removed with a production
  recompute: 27,420 graded calls, 61.2%.
- **Gap sizes (D-101 to D-107, PRs #157 to #166).** EVEN under 0.5, small 0.5 to 3, medium 3 to 5,
  large 5+, on every tab. The owner moved Supabase to Pro for one month through launch.
- **Full-service audit (D-108, D-109, PRs #167 to #169).** Data agreed on every surface; "3+ rest
  edge" with the venue beside it, "Vs home rate" / "Vs baseline", and "rested team at home"
  everywhere ("Rested at home" in narrow columns). Merged 2026-10-18 as `ab3aa8d`; merged
  branches and all seven old worktrees were removed the same day.
- **Cleanup, 2026-10-18 (this PR).** The Officiating season strip opens on whole columns at every
  width (it cut 2017-18's 89.9% to "9.9%" at 1280px). Dependabot ignores `@types/node` above the
  Node 22 runtime; #156 closed.

Still open from those entries:

- Never seen in production: a real slate's game status (only a mocked clock), the D-83 rescore,
  physical iPhone and VoiceOver use, native zoom, capacity, and real Supabase delivery.
- A postponed game reads LIVE for three hours (needs a stored status); the ESPN tie-break is
  inferred from one day; the daily job's lateness is unaddressed.
- `games.spec.ts:294` and `navigation.spec.ts:54` are load-sensitive.
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


## Closeout continuation — 2026-10-18

Reconciled Claude sessions, retained launch reports and current source/Git. The current
28-item disposition is in ROADMAP.md; dated reports remain historical evidence. The owner
selected antislop throughout, defect fixes, proper postponed/cancelled lifecycle support and
the existing scheduler/monitor; optional URL filters, chart actions and C1 column are deferred.
The dependency/UI/lifecycle changes are prepared on codex/unresolved-closeout and are not
deployed until the release record says so. Independent persistence review is required.

Client Sentry symbolication is verified on deployed 69b5e02: deliberate event d2332a30
resolved to original source and context; its test issue was then resolved. Server-event
symbolication remains unobserved. A fresh NBA source snapshot and full retained-cache
Legends rebuild close the reproduction gaps; source figures are unchanged. The offline
ablation harness now follows JavaScript rounding and refuses mismatched reconstructions;
ADR 0006 preserves the original snapshot and adds current evidence.

Remaining: finish candidate verification/review and obtain its merge approval; then verify
the deployed candidate. Human checks, first played-slate validation, December fixture ingest,
ESPN re-key after played data, November 5 plan review and server-error observation stay separate.
