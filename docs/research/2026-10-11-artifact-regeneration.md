# Launch artifact regeneration follow-up — 2026-10-11

Baseline: main `0e9f60dabdaf2f41f69c0c4348e778a676c0d7cd` after owner-approved PR #124.
[Verified] This bounded follow-up addresses launch items23 and24 and preserves the production
verification records. No provider downloads, production queries/writes, coefficient changes,
schema changes, or additional merge occurred.

## Item23 — research chart regenerated

[Verified] Executed the unchanged `scripts/plot_home_advantage_trend.py` using Matplotlib3.10.8
in a temporary Python environment. Input was the committed JSON regenerated earlier on Oct11.
The PNG changed; the JSON, CSV and producer did not. All41 annual observations,47,143 eligible
games and164 count/rate/gap/CSV checks reconcile at the producer’s six-decimal rounding precision.
An initial1e-9 validation tolerance failed because stored rates are rounded; rerunning with
5.01e-7 (half of the last retained decimal plus numerical allowance) passed. The image was
visually inspected for axes, legend, labels, both annual lines and the season-baseline gap.
This is the historical exploratory PNG, not a product-chart redesign.

[Evidence](../reports/2026-10-11-remediation/evidence/chart-regeneration.json).

## Item24 — partial verification; unexpected source/currentness differences

[Verified] Original ignored inputs were copied into the isolated worktree. The source checkout
was not edited. Original bytes for4,553 published JSON files were preserved before running.
The official generator’s global fetch was overridden to throw, preventing provider requests;
its cached run logged zero provider errors. Database readers used the explicit restored local
PostgreSQL18 database at127.0.0.1:55432. The shooting reader also sets a read-only transaction.
All generated published JSON was restored from exact preserved bytes after comparison,
including timestamp-only changes. Research evidence is retained separately.

| Producer actually executed | Observed comparison | Limit |
| --- | --- | --- |
| `scripts/fetch_officials.ts` | Whistle12636→12632 games; foul-style11952→11948;4 unmatched;573 existing missing summaries;0 provider errors | Substantive difference; not published |
| `scripts/analyze_officials_splits.ts` | Analytical JSON unchanged; only generated date differs | Cached summaries, not fresh provider fidelity |
| `ml/referee_career_windows.py` | Replication444/444 cells passes against the newly generated foul-style input; resulting figures differ from original publication | Gate proves internal agreement with changed population, not agreement with original publication |
| `ml/build_referee_legends.py` | Byte-identical | Reused six research intermediates; did not rerun all upstream referee studies |
| `scripts/export_player_rest.py` | All figures unchanged; generated dateOct4→Oct11 only.2,837 players;14,493 player-seasons;1,296 career estimates | Cached boxscores and restored local game dates; not fresh full external source comparison |
| `ml/publish_officiating.py` | Available three immutable snapshots reproduced1,152 detail files exactly;12-season index retained | Latest2025-26 index hash/refresh provenance differs: publishedSep8 vs snapshotSep6. Other nine seasons were not republished |

[Verified] `fetch_officials.ts` takes first/last/season count from clock-driven `NBA_SEASONS`,
not collected games, so an unplayed2026-27 becomes a coverage claim after rollover.
The four lost matches compare corrected stored dates against cached ESPN date/pairing:

| Stored date / pairing | Cached scoreboard date | Event ID |
| --- | --- | --- |
| 2020-02-23 DET at POR | 2020-02-24 |401161490 |
| 2020-02-28 DEN at LAC | 2020-02-29 |401161528 |
| 2020-02-29 POR at ATL | 2020-03-01 |401161530 |
| 2020-02-29 GSW at PHX | 2020-03-01 |401161536 |

[Verified] Cached event/summary timestamps also fall on the later Eastern date. Merely
converting UTC to Eastern cannot resolve these four historical inconsistencies.
[Inferred] This is consistent with the four2019-20 date corrections recorded in the Oct4
handoff; it does not independently reverify their actual dates against NBA source records.

The independent read-only source review confirmed coverage-label derivation, the four cache
locations, unchanged timing figures and the limits of the career replication gate.
No source-matching or publication-policy fix was implemented after this scope growth.

## Recommended next bounded fixes

1. [Inferred] Derive referee coverage metadata from the collected population. Add failing
   regression tests for an upcoming season with no final rows before changing the generator.
2. [Inferred] Reconcile the four documented date corrections with authoritative event identity
   and preserve explicit provenance. Do not use an unqualified adjacent-day/team-pairing fallback;
   repeats, corrections and date-boundary ambiguity need identity safeguards.
3. [Inferred] Test failure/refusal when corrected stored dates and cached provider identity cannot
   be reconciled. A green generator exit with4 unmatched games is insufficient publication evidence.
4. [Inferred] Add failing tests for refusing an older snapshot when report IDs remain unchanged;
   current publisher checks ID continuity but does not guard snapshot age. Obtain the latestSep8 Officiating snapshot or its exact immutable source evidence
   before claiming full regeneration. Never regress source hash/refresh provenance using an older
   initial-publication command. Preserve all content-addressed report versions.
5. [Unknown] Full upstream Legends research and all12-season Officiating regeneration are not
   established by these cached partial checks. Item24 remains blocked/partial.

[Comparison and logs](../reports/2026-10-11-remediation/evidence/artifact-regeneration.json)
retain both unexpected analytical differences and exact source limitations. The research
regenerated referee JSON in that evidence folder is unpublished diagnostic output, not product
artifacts or an approved new set of figures.

## Next launch check

[Verified] The newest `daily-update.yml` run remains38097482294, started2026-10-11 00:09:47UTC.
The target Oct12 run is unavailable. Item1 remains waiting, not completed from an earlier green.
All owner/future checks remain in the HTML report. No branch deletion was requested.
