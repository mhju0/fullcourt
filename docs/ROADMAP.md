# Roadmap

Current commitments, updated in place. Completed work belongs in Git/release records and
rationale in [Decisions](DECISIONS.md), not another running implementation log.

## Historical recalculation — released in v1.0.3

PR #182 corrects every stored season under D-121 / ADR 0011 and D-122 / ADR 0012.
The owner-approved production transaction matches the reviewed six-table after-state;
the exact merged deployment and canonical API payloads are verified. Ratified fatigue
coefficients, resolved predictions and prior playoff revisions are preserved. The
[delivery report](research/2026-10-20-historical-recalculation.md) closes the confirmed
streak, venue, overtime, type, tip, workload-context and dependent-publication repairs
listed in the dated audit snapshots below.

Open source limits: 17 unresolved historical score discrepancies, 5,815 games without
confirmed overtime source coverage, actual airports/itineraries/home stops, and 30 future
Cup-dependent regular fixtures. Recheck the Cup assignments when published. Opening-night
and physical-device observation remain future/human checks, not completed by this release.

## Maintenance

- Track the intermittent upstream [Next.js Google Fonts build issue](https://github.com/vercel/next.js/issues/99114). The release passed on retry; a licensed local-font alternative was researched without changing typography.
- Keep correctness, dependency audit, and CodeQL checks passing. Review dependency overrides
  when upstream fixes become available; the current overrides live in `pnpm-workspace.yaml`.
- Review Officiating refresh branches and their source evidence before publication. The workflow
  is deployed and verified; [operations](OFFICIATING.md) describes its manual-PR fallback.
- Run the [live-season checklist](LAUNCH_DAY.md) when completed games resume. Confirm actual writes,
  not just successful scheduled jobs, then audit dates, fatigue coverage, and resolved predictions.
- Complete physical-device checks for mobile Safari input sizing, navigation, focus, table scrolling,
  and homepage motion. Browser automation does not close this item.
- Re-key ESPN-seeded games to canonical hoopR IDs once played-game data is available. Review a dry
  run before applying; see [season rollover](SEASON_ROLLOVER.md). This enables shooting-data joins.

## First-use validation

- Observe first-time visitors finding a game, interpreting a player difference, and locating a
  source. Include a non-NBA recruiter reading the engineering walkthrough. Record completion,
  hesitation and incorrect interpretations; automated checks do not substitute for this.
- Confirm personal ownership and collaboration wording with the owner before expanding the
  engineering walkthrough beyond repository-verifiable behavior.

## Approved season guidance

Implement the quiet season-data guide and internal current-season availability rule (D-115),
with publication-specific notices and previous-season navigation. Keep Schedule Edge useful
before results arrive. The Games strip selects upcoming large rested-home gaps chronologically
(D-116); the homepage period follows its finding description. Wider recent-ten-season window
changes are deferred. Source collection/publication for new shooting and shot-location data,
opening-night provider verification, and the canonical-ID re-key remain separate operational
work; a guide or calendar date does not complete them.

## Deferred ideas

Exportable graphics, universal search, new analytical findings, and additional season reports
beyond the existing data pipeline remain future work. They are not unfinished redesign tasks.
Performance changes should begin with a measured query or interaction problem.

## Standing boundaries

No accounts or persisted personal preferences. Games owns matchups, Season Report owns completed
outcomes, Schedule Edge owns demands and advantages, and Model Results owns historical evaluation.
The Home-court advantage study provides venue-baseline history through Explore; Season Report
shows the selected season's corresponding comparison. See [D-70](DECISIONS.md).
The approved Home-court refinement adds an optional raw 5+ line and paired seasonal
comparisons, with actual counts and one general sample-size note (D-114 amendment).
The homepage uses the same latest ten completed seasons for both compared groups (D-112).
Officiating stays focused; prior referee studies remain in the research archive.

Fatigue coefficients require an explicit owner decision under ADR 0006. Schema changes require
manual SQL application. Do not revive rejected model or brand alternatives without new evidence
and an owner decision; [Decisions](DECISIONS.md) retains those reasons.

## Completed release

The seven approved recruiter/user polish findings are recorded in
[D-69](DECISIONS.md) and the [verification record](design/seven-polish-fixes-review.md).
The separate feature suggestions remain proposals; this work does not expand the deferred scope.

The approved rest-focused redesign and three-season Officiating explorer were deployed through
PRs #84 and #85 on 2026-09-08. See [release verification](design/redesign-release-review.md).


## Closeout checkpoint — 2026-10-18

This is the current disposition of the retained 28-item launch record. Earlier dated reports
remain evidence snapshots, not live task lists. Code prepared in the closeout branch is not
released until its PR, independent review and deployment checks are complete.

| # | Item | Current disposition |
| --- | --- | --- |
| 1 | First revised nightly run | Verified in prior follow-up; latest scheduled run also succeeded. This is preseason evidence. |
| 2 | Original Outlook test email | Original message was deleted; historical receipt cannot be recovered. Human evidence excluded from this closeout. |
| 3 | UptimeRobot phone push | Owner declined; closed as declined. |
| 4 | Second Sentry email | Earlier owner follow-up confirmed routing and test receipt. |
| 5 | GitHub failure-email receipt | Remains a human inbox check, excluded here. |
| 6 | Off-Mac backup | Owner declined; closed as declined, without an off-Mac recovery claim. |
| 7 | Physical iPhone | Human check, excluded. |
| 8 | Sensitive DB credential | Storage/rotation already completed; no new credential work. |
| 9 | Sentry source maps | Client symbolication verified on production 69b5e02: deliberate event d2332a30 resolves to original source/context. Test issue resolved; server-event verification remains unobserved. |
| 10 | Supabase plan | Pro for launch; owner review around November 5. |
| 11–16 | Real finals, state sequence, rescore, evening cron, nightly writes, launch checklist | Opening-night validation, excluded. |
| 17 | Concurrency | Bounded structural investigation completed; no production capacity guarantee or load test claimed. |
| 18 | Odds feed | Owner excluded feeds from scope; closed. |
| 19 | Postponement | Owner selected explicit postponed/cancelled support; implementation and persistence review required before release. |
| 20 | Hosting limits | Read-only investigation completed; actual launch usage remains future evidence. |
| 21 | TLS | Fresh verified TLS 1.3 connection; certificate expires January 4, 2027. Future renewal is not yet observed. |
| 22 | December schedule additions | Wait for published fixtures; later ingest is a separate reviewed production operation. |
| 23 | Home-court chart | Producer redraw and pinned checks completed in the prior remediation. |
| 24 | Generated figures/source provenance | Fresh 415-report NBA snapshot validated; 386 regular-season reports reproduce published content exactly. Full cached-corpus Legends rebuild is byte-identical. See [source reproduction](research/2026-10-18-source-reproduction.md). |
| 25 | Independent historical scores/dates/OT | Prior comparison retained. No new played games since it; first new-slate comparison belongs to opening-night validation. Pre-2002 OT and deliberately excluded fixtures remain documented coverage limits. |
| 26 | Branch/worktree cleanup | Earlier merged branches/worktrees removed; archived leftovers preserved. New closeout worktrees are active work, not leftovers to discard. |
| 27 | v1.0.0 release | Official date October 19, 2026; owner superseded the completed-slate prerequisite (D-117). Release/tag evidence lives in GitHub and CHANGELOG.md. |
| 28 | Historical timeout watch | Sentry #4 remains open, one Oct 7 event and no recurrence at this read. Do not claim root cause fixed. |

Other decisions and limits:

- **Approved:** antislop throughout, confirmed accessibility/loading/layout fixes, explicit held-game
  lifecycle support, current GitHub scheduler plus monitor with its timing limitation documented.
- **Deferred by the owner:** shareable Model Results filters, additional chart keyboard actions,
  configurable Schedule column. Broader table redesign remains deferred without a measured defect.
- **Already settled:** 12px footer notice, visible Find a page entry, no odds feed, no phone push
  or off-Mac backup. Shared stat tiles already exist.
- **No calculation change needed:** Schedule Edge sums capped per-side date intervals. Because
  both sides require a previous game, `min(daysSince, 5) - min(oppDaysSince, 5)` equals
  `min(daysOff, 4) - min(oppDaysOff, 4)`. Its days-off net description is consistent.
- **Historical incident:** the October 3 API 500 is still unidentified and distinct from Sentry's
  October 7 timeout. No reproducible current fault has been established; retain incident history
  and monitor recurrence rather than invent a fix.
- **Previously load-sensitive tests:** the two offseason Games cases and the retracting-header
  navigation case passed against the built candidate. No blind timeout or skipped-test change
  was made; these bounded passes do not establish behavior under every load.
- **Ordering:** equal-tip games use a deterministic external-ID tie-break. ESPN's universal
  tie-break is not a dependency or a verified provider contract.
- **Access:** authenticated Chrome can inspect Vercel deployments and previews, including
  Dependabot previews. The connector limitation does not block dashboard verification.
- **Claude roadmap:** the visible artifact was stale at this read (#170 still marked open).
  Repository decisions and this table own current status; no artifact publication is claimed.

## Dated audit snapshots — confirmed repairs closed by v1.0.3

The sections below retain the findings as recorded before correction. The release status
above supersedes their repair-pending language; source and future-observation limits remain open.

### Opening-quarter schedule/travel findings (2026-10-20)

The [read-only audit](research/2026-10-20-opening-quarter-travel-review.md) and [30-team airport reference](reports/2026-10-20-schedule-travel-audit.html) leave these concrete follow-ups open:

- Resolve the scorer retaining prior away streaks on homecoming games; measure historical consequences before a controlled rescore. No coefficient change is implied.
- Represent Austin’s actual venue independently from the Spurs’ home-court status.
- Refresh the confirmed October 23 CHI–MIL tip change; reconcile October 24 HOU–ATL’s provider conflict.
- Replace “Miles flown” with explicit estimated venue-distance wording; distinguish scheduled away streaks from actual time on the road.
- Recheck December after Cup assignments, including subsequent rolling travel/workload. Airport preferences and intermediate home returns remain sourced research candidates rather than verified itineraries.

### Full-season extension and itinerary evidence (2026-10-20)

The [full assigned-season report](research/2026-10-20-full-season-travel-review.md) supersedes the opening-quarter scope. Three Austin fixtures and two stale tips are confirmed; the Houston–Atlanta conflict is resolved by the October 13 team/venue announcement, while the production correction remains open. Homecoming semantics affect 185 assigned home-game scores; the exported home-stand feature also needs review. Keep these findings open until a verified correction, rather than treating audit completion as a repaired model. D-120 keeps the visible Mileage term with details in Behind the Data. Future Cup checks must include the physically played championship in workload context independently of regular-season publication eligibility.

### All-season audit extension (2026-10-20)

The owner requested the same audit across every stored season. The [all-season research](research/2026-10-20-historical-audit/README.md) now covers 51,695 games and 103,390 score sides across 42 season labels. Current-engine replay matches every stored score/component; independent density/rest/Mileage arithmetic agrees under recorded venue assumptions. The shared streak semantics persist historically: 25,046 home appearances retain a prior away streak and 25,095 away appearances retain the exported home-stand feature. A single-change homecoming diagnostic changes 6,125 published home scores, while the pooled rested-team-at-home win rate moves 61.1889% to 61.1417%. This is sensitivity evidence, not a model change or repair.

Keep source adjudication, confirmed historical venue corrections, early overtime gaps, the homecoming policy decision and dependent artifact regeneration as separate follow-ups. External source coverage varies by season and field; provider disagreements are not automatically database errors. Actual charter airports and intermediate home stops remain unobserved for most historical journeys. Any controlled production correction needs exact affected rows, backup/rollback, independent review and the applicable owner approval before persistent-data replacement.
