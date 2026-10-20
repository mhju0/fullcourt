# Historical overtime correction — 2026-10-20

Status: released in [v1.0.7](https://github.com/mhju0/fullcourt/releases/tag/v1.0.7).
The owner approved the frozen update; the actual production snapshot matches the reviewed
after-state. The tested production build was promoted and canonical checks passed.

Production acceptance on 2026-10-20: PR #187, merge `65605ae972c2df0391d1eee0a9d246dafe29079a`
(source-identical to reviewed `7aa04e8292bf2ecf1a5e920896d5336c968d03bb`),
Vercel deployment `dpl_6MEYfJzbvWn3BcvXXB1Viie5eyuj`. The canonical site passed
86 API responses / 45,837 independent numerical comparisons with zero mismatches,
61 Behind the Data browser tests and a database health check. Both scheduled writers
were restored afterward; deployment protection was preserved. The local acceptance
record retains hashes, before/after captures and rollback evidence.

## Why this follow-up was necessary

A fresh independent arithmetic audit reproduced the existing public win rates, season
reports and schedule summaries from the stored rows. A separate source-coverage check
then found old games whose zero overtime input had not been confirmed. Official NBA
box scores established that some of those games went to overtime. The arithmetic was
correct for the inputs; the inputs still needed repair.

Overtime changes the fatigue bonus at a team's next appearance. This can change whether
that later game belongs to a rest-gap bin. It does not change the game winner, home-court
baseline or fatigue coefficients. An overtime count is retained exactly even when the
ratified bonus groups two or more overtimes together.

## Source decisions

The ordinary validator requires matching fixture identity, Eastern date, teams, final
scores, numbered periods, period types and totals. Both teams' period counts must agree,
and the score must be tied before each overtime. Available team minutes and explicit
final-status duration must agree too. Missing information is not converted into confirmed
regulation.

Some NBA archive headline scores disagree with their own period totals. Those original
responses and strict rejections remain preserved. A separate, reviewed adjudication is
limited to an exact fixture and conflict, with retained source hashes. A corroborated
duration field can be accepted without replacing the stored result or treating every
other field in the source as correct.

For the January 31, 1989 Detroit–Chicago game, the NBA's fifth period and two 265-minute
team totals agree on one overtime. The [official Bulls media guide](https://chibullsdigital.com/mediaGuide/2022_ChicagoBulls_MG_NBA_HI.pdf),
PDF page 127 (printed page 125), also lists that exact 98–104 result in its overtime table.
The archive's inconsistent regulation-period total remains recorded.

## Frozen source and candidate results

The source pass covers all 5,815 previously unconfirmed inputs. The ordinary strict
validator accepts 5,801 records; 14 fixture-specific adjudications preserve their strict
rejections and add reviewed evidence. The resulting counts are 5,469 regulation games,
304 one-overtime games, 35 two-overtime games, six three-overtime games and one five-overtime
game. No unknown in this specific source-coverage set is filled by a default. Thirteen
contemporary press records corroborate disputed fixture scores; their duration evidence
comes from the NBA's period and team-minute records. The Bulls guide separately supports
the remaining overtime adjudication.

The candidate corrects 346 stored overtime inputs and 683 fatigue rows: 681 scores
change, while two scores remain at zero but acquire the overtime flag. An independent
raw-row calculation, without application imports, gives:

| Eligible historical group, 1985–86 through 2025–26 | Before | Corrected candidate |
| --- | --- | --- |
| All home teams | 28,225 / 47,094 (59.9%) | Unchanged |
| Rested home team, RA ≥0.5 | 17,190 / 28,117 (61.1%) | 17,180 / 28,109 (61.1%) |
| Rested home team, RA ≥5 | 2,544 / 3,899 (65.2%) | 2,543 / 3,901 (65.2%) |
| Rested visiting team, RA ≥0.5 | 4,530 / 10,669 (42.5%) | 4,530 / 10,676 (42.4%) |

The historical large-gap rate changes from 65.2475% to 65.1884%; both round to 65.2%.
The latest ten completed seasons remain unchanged: 357 wins in 587 large-gap games
(60.8%), against 6,670 home wins in 11,863 games (56.2%). These are candidate calculations,
not a claim of a completed production update.

## Recalculation and preservation

[ADR 0015](../../adr/0015-historical-overtime-requires-period-evidence.md) defines the
input and transition contract. The new tool is separate from the earlier one-shot
historical correction. It accepts only overtime input changes, replays the complete
fatigue population and preserves unchanged score rows, resolved predictions, teams and
playoff tables. The cumulative ingestion registry retains earlier venue, type and
tip-time corrections.

The release requires every fatigue-dependent publication to be regenerated from a new
feature export and a newly prepared model table. The original fitting windows and ratified coefficients
remain fixed. Independent Shooting, Shot Value, Officiating and playoff outputs must
remain unchanged where their inputs did not change.

## Limits of the result

The win rates describe historical groups selected by the model. Home court, team strength,
season composition and other factors differ between those groups; a corrected historical
rate is not a causal estimate or a forecast success guarantee. Mileage remains a geometric
estimate from recorded venues and dated bases, not observed flights or private itineraries.

The final acceptance record must distinguish verified source fields, unresolved source
conflicts, local rehearsal, production application and observed public results.

## Local transition evidence

The exact source-bound candidate passed 16 unmocked PostgreSQL checks: injected-stage
rollback, source refusal, full-domain drift refusal, ordinary-writer locking, atomic apply,
retry, reconnect, byte preservation and conditional rollback. The complete six-table baseline
hash also matches after an actual PostgreSQL server restart. A subsequent local apply
and second real server restart preserve the exact corrected after-state. Both restart
checks use independent read-only node-postgres captures without correction-tool imports.
This is local verification; production application and public acceptance remain pending.

## Regenerated publication checks

All 15 producer commands completed successfully from the corrected local after-state,
including a fresh feature export and mandatory model-table preparation. The export contains
103,398 team-game rows; every stored resolved-side score comparison passes without missing
rows or mismatches. Historical rest-split and ablation figures change with the repaired
inputs. Home/rest-confound and time-zone artifacts remain byte-identical. The market
benchmark changes only its generation date; fitting metrics change only the model-table
hash, and Availability changes only its input-coverage hash. The diagnostic fitted weights
are not adopted as site coefficients. Modern model-table values from 1996 onward agree
with the authenticated previous inputs.

The full unit suite passes (1,363 tests in 117 files), as do 113 Python contracts and type
checking. Lint has no errors and two existing warnings in an unchanged cron test. A separate
201-test targeted pass covers generated claims and schedule agreement. These checks establish
local producer and implementation consistency; the public release still needs exact-candidate
review, production approval and deployed readback.

The production build passes. An independent oracle compares 86 local API responses against
the actual post-restart database snapshot: 45,837 fields match with zero numeric or workload
flag discrepancies, covering all 42 Season Reports, 41 rankable Schedule Edge seasons and
analysis thresholds. All 61 Behind the Data browser tests pass, including mobile navigation,
deep links, no-JavaScript evidence and print state. Manual desktop/mobile checks confirm the
corrected homepage sample, revised source/interpretation explanations and bounded table
scrolling without document overflow. These observations use the rebuilt local site, not
the still-unchanged production deployment.
