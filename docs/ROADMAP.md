# Roadmap

Current commitments, updated in place. Completed work belongs in Git/release records and
rationale in [Decisions](DECISIONS.md), not another running implementation log.

## Maintenance

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

## Deferred ideas

Exportable graphics, universal search, new analytical findings, and additional season reports
beyond the existing data pipeline remain future work. They are not unfinished redesign tasks.
Performance changes should begin with a measured query or interaction problem.

## Standing boundaries

No accounts or persisted personal preferences. Games owns matchups, Season Report owns completed
outcomes, Schedule Edge owns demands and advantages, and Model Results owns historical evaluation.
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
