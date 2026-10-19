# Project handoff
Reconciled 2026-10-18. Source/tests and Git take precedence. This is a current-state summary;
update these sections in place. Rationale belongs in [Decisions](DECISIONS.md).
## Product and release
FullCourt studies NBA rest, travel, schedule density, and outcomes. The homepage leads with
rest and schedule findings; Games, Season Report, Schedule Edge, and Explore are the primary
navigation. Explore contains the other basketball studies. There are no accounts or persisted
personal preferences; exploration state is shareable through URLs and browser history.
Production: https://fullcourt.fyi. Condensed release context, 2026-10-19:
- Redesign PR #84 (`776683e`) and Officiating PR #85 (`34b8961`) established the current product;
  [release review](design/redesign-release-review.md), Git and Vercel retain delivery evidence.
- Next.js/ESLint 16.4.1 shipped in PR #174; Sharp 0.35.5 addresses the dependency advisory.
  The homepage hero keeps its headline, description and primary action (D-67).
- Games uses Season → Month → Date and tip-off ordering (D-79). Shared filters use 44px targets
  and 16px text; report sections separate measured results and interpretation.
  [Control audit](design/control-and-section-audit.md) and [polish review](design/seven-polish-fixes-review.md) retain detail.
- D-69 defaults Playoff Rest/Expected Shot Value to their latest usable publication; selected
  views remain shareable. Data Status separates coverage, refresh evidence and connectivity.
- D-70 adds annual Home-court history and Season Report's selected-season baseline. Ordinary
  rested-home rates retain the 100-game display gate; ongoing seasons have explicit labels.
  [Research](research/2026-09-11-home-advantage-trend.md) and [review](design/home-court-study-review.md) retain the original evidence.
- [Officiating archive evidence](research/2026-09-09-l2m-archive.md) records the publication's limits.
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

- D-64/D-65: Behind the Data shipped; see FRONTEND.md and [review](design/usability-audit-review.md). D-73 reading pages use `reading.module.css`.
- D-71/D-72: Games avoids URL writes during navigation; build cache is off. Verify production CSS after global-style changes. Database-backed e2e stays outside CI.
- PR #104 corrected audited dates, scores and overtime; the recompute matched production. After score/date fixes run `scripts/export_fatigue_features.ts` to check fidelity.

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

Condensed again on 2026-10-19; DECISIONS.md D-78 to D-109, dated reports and Git retain detail.

- D-79–D-83: finals-only LIVE/PENDING/FINAL, twelve hourly crons, verified schedule,
  next-game rescoring and the unchanged 103,390-row [recompute](research/2026-10-11-fatigue-recompute-audit.md).
  LAUNCH_DAY.md retains the live validation procedure.
- D-84/D-85: lock-before-read writers and monotonic Officiating publication; the
  [remediation report](reports/2026-10-11-remediation/index.html) retains all 28 launch statuses.
- PR #127 shipped the selected motion/accessibility fixes and CI/CD hardening F1–F7;
  [plans](../plans/README.md), [audit](reports/2026-10-14-accessibility-usability.html) and
  [findings](../anti-slop/audit-002-2026-10-14.md) retain the evidence. Database credentials rotated.
- D-86–D-100: full days off, two-decimal gap comparison, neutral-host exclusion, historical
  team names, owner-approved deletion of nine neutral calls, BY DATE/BY TEAM, and ratified
  altitude-carryover removal (27,420 calls, 61.2% at that snapshot).
- D-101–D-109: small 0.5–3, medium 3–5, large 5+; venue-labelled rest edges and consistent
  rested-team-at-home copy. PRs #167–#169 merged as `ab3aa8d` on October 18.
- October 18 cleanup fixed Officiating season-strip clipping and pinned Node types below23;
  #156 closed. Supabase Pro was selected for launch; its review remains listed below.

Still open from those entries:

- Never seen in production: a real slate's game status (only a mocked clock), the D-83 rescore,
  physical iPhone and VoiceOver use, native zoom, capacity, and real Supabase delivery.
- Explicit postponed/cancelled lifecycle support is prepared in the closeout candidate.
  Equal-tip ordering is deterministic; ESPN equivalence remains an inference, not a contract.
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

## Approved stacked comparison and release — 2026-10-19

The owner approved mock `0358ade` and authorized PR #176's merge and deployment. The D-114
amendment replaces open/closed markers with filled circles and one general sample-size note.
Season/Home stay left; 0.5+ and optional 5+ records each have a same-season comparison on
the right. Counts, ordinary gating, missing-data handling and the model remain unchanged.
The [review](design/2026-10-19-chart-toggle-table-a-review.md), PR #176 and its matching Vercel
deployment are the release evidence; check Git/Vercel for the final merge SHA and readiness.
Physical-device, human screen-reader and first-played-slate checks remain open.

## Quiet season guidance implementation — 2026-10-19

Owner approved the simplified mock and asked for consistent spacing, borders and readable
type. D-115 keeps the all-teams-ten-finals rule internal, with a common awaiting guide,
previous-publication links and qualified schedule-derived dates. New read-only metadata does
not gate the shared workload API. Per-study coverage remains independent; the Shooting
producer refuses early current-season pooling before replacing its artifact. Explicit new
season collection is supported, but no new provider data was fetched or published.
D-116 selects the earliest three large rested-home gaps and preserves the compact Games strip.
Homepage period metadata moves below the finding explanation. Wider history-window work is
deferred. Implementation is isolated on `codex/season-guidance`; the dated review records
checks and release state. Production is unchanged until an explicit release record says so.
Next: finish candidate/browser/preview review and deliver the PR. Opening-night validation,
manual source publication and the canonical-ID re-key remain separate.
