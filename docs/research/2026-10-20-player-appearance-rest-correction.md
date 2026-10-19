# Player appearance/rest correction — 2026-10-20

Status: v1.0.4 correction record. Exact review, preview and deployed acceptance are
recorded in Git/PR/release evidence; preparation is not production verification.

## Confirmed defects and scope

The old Shooting producer derived personal rest after filtering to regular games with
shot attempts. Actual zero-shot and nonregular competitive appearances could disappear.
Official NBA box scores confirm Dean Wade played 9:15 with zero FGA on February 27,
2024, then played February 28. His last shooting game was February 25; the old interval
was three days instead of one. See [February 27](https://www.nba.com/game/dal-vs-cle-0022300832/box-score)
and [February 28](https://www.nba.com/game/cle-vs-chi-0022300846/box-score).

Five alternate IDs also disappeared before Availability's rolling histories. Their
source-validated joins are restored; complete canonical fixture coverage is checked
before any windows. Uncertain participation and duration are separate facts, and an
unclear box score cannot prove absence or zero minutes. See [ADR 0013](../adr/0013-player-rest-follows-confirmed-appearances.md)
and [ADR 0014](../adr/0014-availability-preserves-regular-season-history.md).

One contemporary AP full box score places Sarunas Marciulionis's seven points under
Denver in the November 10, 1996 game. The current NBA archive/cache assigns that player
to Cleveland, explaining the conflicting archive total. An exact one-row team/side
source correction fixes his season label and Availability history. Shot/rest numbers
and the stored 101–86 score remain unchanged. The [primary newspaper scan](https://newspapers.swco.ttu.edu/server/api/core/bitstreams/85f6d376-0ea9-4115-a879-16835eaff7e6/content)
contains the AP roundup on PDF page 16 and full box on page 17. Its small box headline
has a conflicting 84; the Denver total, quarter totals and roundup agree on 86. Raw
captures, visual proof and this discrepancy are retained rather than normalized away.

## Generated comparison

Values below are copied programmatically from the repaired producers' before/after
verification records. The [machine-readable evidence](2026-10-20-player-appearance-rest-correction.json)
pins outcome identities, generated artifacts and Availability producer sources.

- Shooting keeps all 696,961 outcome identities, 5,917,676 FGA,
  2,698,967 FGM and 574,759 made threes. All
  14,493 whole-season numeric summaries are unchanged.
- 15,343 rest-arm assignments change; the raw shots are not added or removed.
- Qualified player-seasons: 9,354 → 9,450;
  career estimates: 1,296 → 1,309.
  Attempt floors and empirical-Bayes protocol are unchanged.
- Source uncertainty withholds 127 rest classifications
  (889 FGA), 636 load classifications,
  and 668 minute-history classifications separately.

| Availability cohort | Regression games | Eligible team rows |
| --- | ---: | ---: |
| Before | 33,166 | 66,622 |
| Identity aliases only | 33,172 | 66,632 |
| Source-aware final | 25,435 | 51,662 |

The five aliases restore ten fixture sides and six eligible regression games, including
one later window endpoint. Conservative source handling then removes uncertain histories.
The final margin comparison covers 1997-98 through 2025-26.
All 71,092 canonical regular-final sides in the
supported cache seasons match before windowing; a future missing fixture fails validation.
The reduction is primarily driven by truly blank recorded minutes, not by treating a
reported zero clock as an unbounded positive-minute appearance.

| Availability association (points of margin) | Before | Corrected |
| --- | ---: | ---: |
| Best player absent | 2.968 | 3.027 |
| Home court | 2.845 | 2.697 |
| Back-to-back | 1.763 | 1.856 |
| Visiting altitude | 1.412 | 1.734 |
| Prior overtime | 0.552 | 0.538 |

These are retrospective associations in source-supported games, not causal effects or
forecasts. Availability retains its regular-season positive-recorded-minute history;
Shooting uses confirmed competitive participation for rest. Annual absence rates now
preserve calendar gaps and show endpoint counts, without extrapolating a threefold
league-wide trend from a sparse early sample.

## Display precision

D-125 appends exact whole/no-rest/rested integer `2*FGM + 3PM` numerators while retaining
the original eleven packed columns. Season and pooled career rates now share exact
count-based calculations, fixing a rendered +23.9 versus +24.0 discrepancy for identical
arms. Existing payloads keep a legacy fallback. Classification, attempts, thresholds,
standard errors and shrinkage protocols are unchanged; all appended integers are checked
against the source shots.

## Verification boundary

Focused producer tests, full-cache outcome preservation, the authentic Wade witness,
context reproduction, all-three Availability replay and frozen input/output hashes pass.
An independent chronological reference checks every shooting rest/workload field.
No production database, fatigue coefficient, resolved prediction or v1.0.3 team-score
change is part of this patch. Opening-night observation, physical-device testing, future
Cup assignments, unconfirmed overtime and real travel itineraries remain separate limits.
