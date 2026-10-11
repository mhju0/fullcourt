# Generator publication guards — 2026-10-12

Baseline: owner-approved PR #125 main `3445fcdbf3444a938460830990116ae4f8db1489`.
Scope: observed referee coverage, four exact corrected-date identities, and monotonic
Officiating snapshot publication. No model, schema, frontend or published JSON changes.
No production writer, provider load test or manual cron dispatch.

## Corrected-date identity evidence

[Verified] Read-only restored database rows use these NBA external IDs, canonical ET dates,
regular-season status and final scores. Authentic cached ESPN headers/competitions agree
on IDs, teams, scores, 2020 season/type2 and completed/post status, while their dates are later.
The test fixture retains minimized real payloads and their original source hashes.

| NBA game | Canonical date and result | ESPN event | NBA date/result evidence |
| --- | --- | --- | --- |
| 0021900848 | 2020-02-23 DET104 @ POR107 | 401161490 | [Pistons game](https://www.nba.com/pistons/game/0021900848) |
| 0021900886 | 2020-02-28 DEN103 @ LAC132 | 401161528 | [NBA game](https://www.nba.com/game/den-vs-lac-0021900886/play-by-play) |
| 0021900888 | 2020-02-29 POR117 @ ATL129 | 401161530 | [Trail Blazers recap](https://www.nba.com/blazers/news/road-trip-gets-worse-loss-atlanta) |
| 0021900894 | 2020-02-29 GSW115 @ PHX99 | 401161536 | [Suns game](https://www.nba.com/suns/game/0021900894) |

These four mappings do not establish a general nearby-date lookup. Canonical stored dates
are preserved; summaries with the wrong game identity cannot be counted as missing data.

## Verification

[Verified] Original tests reproduced the incorrect referee season metadata and older-snapshot
acceptance before implementation. The Officiating CLI rejects the authentic Sep6 2025–26
snapshot against the published Sep8 season: exit1, index SHA unchanged, no details written.
[Evidence](../reports/2026-10-11-remediation/evidence/generator-guards/officiating-authentic-refusal.json).

[Verified] Full cached generator-interface run:13,209 input/matched games,12,636 collected,
11,952 foul-style eligible,573 existing incomplete summaries,zero unmatched/provider errors.
14,974 cached JSON reads; network fetch disabled. All analytical fields and coverage match
the current publication; only generated date differs. Output went to an isolated temporary
directory, and all4,555 published JSON files retain their baseline hashes.
[Comparison](../reports/2026-10-11-remediation/evidence/generator-guards/referee-offline-regeneration.json).

[Verified] The actual CLI entry point also ran with an explicit restored local database and
global fetch disabled from a separate temporary working directory. It reproduced both
artifacts, preserving each corrected date and all analytical fields.
[CLI evidence](../reports/2026-10-11-remediation/evidence/generator-guards/referee-cli.json).

[Verified] Node22 lint/typecheck/1,148 unit tests in90 files/build/production dependency audit
and Python7+42 contracts passed. Initial pnpm auto-install failed against a shared modules
symlink; a frozen install into this worktree resolved it and all gates reran successfully.
No product E2E repeat for this script-only change; PR124's419 tests remain historical evidence.
[Checks](../reports/2026-10-11-remediation/evidence/generator-guards/verification.json).
Exact-candidate independent review is pending; no merge or deployment of this batch.

## Remaining limits

[Unknown] Fresh provider fidelity, all12 Officiating seasons regenerated from latest snapshots,
and full upstream Legends research remain unverified. A count floor does not detect every
same-size corpus substitution. Local refusal and regression tests do not establish production
writer execution. All28 launch statuses remain in the HTML report; item1 is waiting for Oct12.
