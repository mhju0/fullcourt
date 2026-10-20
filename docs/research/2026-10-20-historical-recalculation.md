# Historical recalculation — 2026-10-20

Status: delivered in v1.0.3 on October 20, 2026 (KST). Production application and the
canonical deployment are verified. This is a
correction of verified inputs and workload geometry, not a fitted operational model.
The original audit remains an immutable diagnostic record; its one-change impact is not
the combined result below. [ADR 0011](../adr/0011-physical-venues-and-historical-correction.md)
records the accepted semantics.

## Combined win-rate comparison

Each percentage below is generated from the frozen candidate's report. Wins are divided by
games, not averaged across seasons. These current analyses do not rewrite resolved historical
prediction records or establish a causal rest effect.

| Cohort | Before | Corrected candidate |
| --- | --- | --- |
| All history: rested home, RA ≥0.5 | 16,778 / 27,420 (61.2%) | 17,190 / 28,117 (61.1%) |
| All history: home baseline | 28,234 / 47,112 (59.9%) | 28,225 / 47,094 (59.9%) |
| All history: rested home, RA ≥5 | 2,452 / 3,756 (65.3%) | 2,544 / 3,899 (65.2%) |
| Recent ten completed seasons: rested home, RA ≥0.5 | 3,720 / 6,386 (58.3%) | 3,834 / 6,599 (58.1%) |
| Recent ten completed seasons: home baseline | 6,671 / 11,866 (56.2%) | 6,670 / 11,863 (56.2%) |
| Recent ten completed seasons: rested home, RA ≥5 | 340 / 555 (61.3%) | 357 / 587 (60.8%) |

## Scope and source boundaries

- 42 stored seasons; 51,695→51,699 games and 103,390→103,398 team-game score rows.
- 1,075 existing games have accepted input changes: 783 overtime facts, 109 postseason
  sublabels, 189 neutral/city corrections (including 171 existing bubble games), and two
  future tip times. Categories overlap. No existing final score, team pairing, date or ID changes.
- Add exactly the three completed Cup finals and 2020 play-in as nonregular workload context.
  Their eight score sides are new. Existing composite scores change on 9,446 sides.
- Preserve all 27,420 resolved predictions byte-for-byte. Eligible unresolved forecasts have
  24 insertions, one deletion and 60 updates; other historical records remain intact.
- The physical fixture register has 171 entries. The bounded restart contains 172 neutral
  games, using a documented Disney-campus proxy and participating-team operating base. This
  corrects geography; the normal-travel fatigue model remains unvalidated and excluded there.
- No coefficient, current threshold, one-mile tolerance, window, rounding or schema change.
  Research fits are rerun as diagnostics under the existing protocol, not adopted as weights.

The 17 provider score observations remain unpatched: 15 show conflicting nonzero scores and
two ESPN rows are missing 0–0 placeholders. Accessible evidence did not settle them with a
primary gamebook; provider agreement alone is insufficient. Another 5,815 final games lack
overtime-source confirmation. Unknown inputs are not filled by guessing.

Mileage remains an estimated straight-line chain of scheduled venues. Actual aircraft routes,
airports, overnight locations and intermediate home returns are not reconstructed. Future
unassigned Cup fixtures remain unknown and require the controlled schedule-seeding procedure.

## Corrected playoff revision

Eleven stale feature values are corrected from full official standings and play-in dates
([ADR 0012](../adr/0012-playoff-data-revisions-preserve-model-history.md)). All 2,099 existing
playoff prediction rows remain unchanged. The new `logistic_grind_v2_r20261020` revision adds
600 known-results fits and 450 strictly earlier-season OOS predictions; the 150 early-series
OOS gaps remain unavailable. The model features and evaluation protocol are unchanged.

Current OOS accuracy is 75.1% across 450 series, against the
74.4% baseline. New probabilities were independently refitted
from the manifest matrices: all 1,050 match exactly. These replay and hindsight outputs are
versioned research results, not contemporaneous logged wagers.

## Frozen transition

- Candidate file SHA-256: `9e8c6ebd9658d3ed0fbdedaaefa685f0d14124580c837f8b6910929769911490`
- Before database domain: `9ff73d5f9473c3a3fe22a807260882127df17f924742f098ed9ce5c7ee3c38f6`
- After database domain: `5b5b1badaf4fbfc2ca67bd8263f15fe185cc8e5ed9045718987e1a4fee683278`
- Production target fingerprint: `dcc81fb0e141afe02c1a40e6eadfd9cbead02678ccc1f5d4d5f2e6a6507fc806`

Full snapshot, source hashes, raw backup and detailed rehearsals are retained locally under
`docs/audit/history-recalculation/`; they are intentionally not public application assets.
Production requires this externally supplied reviewed manifest SHA, target and before-state
checks, verified TLS, actual table locks, one transaction and a post-write checksum. Conditional
rollback uses the same manifest and refuses later drift.

## Verification state

The exact candidate passed 17 real PostgreSQL apply/retry/locking/drift/rollback checks
and a separate frozen-source guard. Actual server stop/start preserves the full six-table
checksum. Independent geometry/density/rest/Mileage checks cover all 103,398 score sides;
three Cup seasons retain 1,230 regular targets and 82 team games. All 600 playoff features
and 1,050 selected-revision API predictions match their producers.

All 20 producer stages completed. The full Vitest suite passes 116 files / 1,354 tests;
typecheck and production build pass, ESLint has no errors (two pre-existing test warnings),
and the production dependency audit reports no vulnerabilities. Ten connected API requests
pass and the analysis endpoint matches 28,117 calls / 17,190 wins. The unnecessary venue
registry is absent from the final browser bundles. Cache mutation checks pass; its measured
51ms fingerprint is below the 150ms full loader.

The independent Class 3 review accepted exact head `31fc96f3e5ae848209c53ab7f3cc4b90aafeb50f`;
all 31 frozen source blobs match the approved manifest. PR #182 merged it at
`0f30d34594e7abb50e9881fff25315ab6208f1a2` with an identical file tree.

The owner approved production apply and conditional rollback. A fresh 17,478,028-byte
public-schema backup (SHA-256 `d6bf44ff7f5145f0135861a29fe98a0bfd439e900a5138238894b2db5721e189`)
was restored to a separate PostgreSQL database and matched the complete reviewed baseline.
Apply completed, then an independent read-only production capture matched the exact
six-table after-state. No schema migration or coefficient change occurred.

Vercel deployment `dpl_AB8Fc1sBfoHNptroC9Z8jDW6kM8c` was built after apply from the exact
merge SHA, checked while protected, then promoted to fullcourt.fyi. The canonical alias
was read back against that deployment. CDN/data caches were purged. Twelve public API
requests pass; all ten core data payloads equal the corrected local payloads exactly.
Fourteen public routes return 200, and live browser checks confirm the updated homepage
and Model Results. Desktop and 390-pixel schedule/playoff checks show no page overflow.
Scheduled GitHub and Vercel writers were restored after verification.

CI correctness, Python producer contracts, PostgreSQL, CodeQL and rendered browser gates
pass. One upstream Google Fonts/Turbopack build failure passed on retry; this is a
build-reliability follow-up, not a claimed runtime data defect.

The [cutover runbook](../../scripts/history-correction/README.md) covers writer suspension,
fresh backup and drift checks, maintenance responses, coherent application/artifact activation,
cache verification and rollback. The owner supplied the required immediate approval before the production
mass update under AGENTS.md.

## Subsequent cross-module finding

After v1.0.3 deployment, a separate source-history audit confirmed that Player Shooting
filtered out played zero-shot games before calculating personal rest, and five alternate
game IDs were absent from Availability's rolling histories. These are being repaired and
measured separately in v1.0.4; the team-fatigue and database verification above remains
valid. See the [player-source follow-up](2026-10-20-player-appearance-rest-correction.md).

## Subsequent source audit — 2026-10-20

The figures and limitations above record the v1.0.3 release, rather than a continuously
updated total. A subsequent audit adjudicated all 5,815 previously unconfirmed overtime
inputs and prepared a separate correction for 346 positive overtime counts. See the
[overtime correction record](2026-10-20-overtime-correction/README.md) for its exact source
evidence, changed cohorts and separate production-acceptance status. Primary records
also support retaining the stored results for the 17 score observations; two internally
conflicting NBA archive records remain documented. These findings do not rewrite the
original release's frozen manifest or imply that the follow-up has been deployed.
