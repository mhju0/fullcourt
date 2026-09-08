# Independent L2M snapshot validation

Audited `ml/data/l2m-research/2025-26/20260906T143154961791Z` and `ml/analyze_l2m_season.py` against `docs/research/2026-09-06-l2m-season-results.json` on 2026-09-06. No parent calculation files or existing referee corpus were changed. Independent reductions loaded each raw report directly without importing the analyzer.

## Counts reproduced

415 reports; 8,083 assessment rows; CC 1,965, CNC 5,706, IC 74, INC 335, ungraded 3. Thus **409 IC/INC assessments**, 249 reports containing one or more, and **166 reports with no IC/INC assessment**. Distinct game-period count is 473. All phase-level grade counts match: regular season 376 errors across 386 reports, playoffs 32 across 26, play-in 1 across 3. Period names are only Q4/Q5/Q6; no listed clock exceeds two minutes.

“Zero errors” means no **graded IC/INC assessment**, not a demonstrated perfectly officiated game. Three ungraded `Stoppage: Clock` rows describe clock problems in their comments; they should remain separately disclosed rather than silently counted as correct. They occur in `0022500123`, `0022501218`, and `0042500404`.

Sample checks against raw NBA report text:

- [INC sample, 0022500001](https://official.nba.com/l2m/L2MReport.html?gameId=0022500001): Q4 01:15.8, shooting foul, Gilgeous-Alexander / Thompson. Narrative describes contact affecting the driving shot; treating the INC as an incorrect non-call is consistent.
- [IC sample, 0022500027](https://official.nba.com/l2m/L2MReport.html?gameId=0022500027): Q4 00:19.9, loose-ball foul, Harden / Bey. Narrative describes marginal contact; treating the IC as an incorrect call is consistent.
- [Zero sample, 0022500005](https://official.nba.com/l2m/L2MReport.html?gameId=0022500005): no IC/INC rows.
- [Overtime sample, 0022500001](https://official.nba.com/l2m/L2MReport.html?gameId=0022500001): Q5 01:29.2 is a separate overtime assessment window, correctly kept rather than merged with Q4.

Independently confirmed **20 reports** whose `Errors in Favor` summary totals disagree with the IC+INC event count, and **zero error rows with a populated `teamIdInFavor`**. Suppression of a beneficiary-team ledger is justified. No inferential claims were tested.

## Assignment gaps resolved as supplemental evidence

The original strict join correctly refused these five cases. The evidence below permits explicit, reviewed overrides in a separate research join file; it does not justify relaxing all score checks or rewriting raw reports.

| NBA game ID | ESPN event ID | Working three officials | Evidence |
|---|---|---|---|
| 0022500392 | 401810247 | Pat Fraher; Scott Twardoski; Suyash Mehta | [ESPN summary API](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401810247); [NBA box score](https://www.nba.com/game/phx-vs-gsw-0022500392/box-score) |
| 0022500672 | 401810527 | Brian Forte; Rodney Mott; Robert Hussey | [NBA official scorer gamebook, page 1](https://statsdmz.nba.com/pdfs/20260128/20260128_CHIIND_book.pdf) |
| 0052500111 | 401866755 | Zach Zarba; Curtis Blair; Gediminas Petraitis | [ESPN summary API](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401866755) |
| 0052500121 | 401866754 | James Capers; Eric Dalen; Nick Buchert | [ESPN summary API](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401866754) |
| 0052500131 | 401866756 | James Williams; Sean Corbin; Karl Lane | [ESPN summary API](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401866756) |

The play-in summaries list fourth standby officials with `order: 4`; the table uses explicit orders 1–3. Date/team/opponent/scores all match those L2M reports. The fresh IND ESPN response still has no officials, so the NBA gamebook supplies them and confirms the same 113–110 score/date/opponent.

For **0022500392**, the L2M metadata says 119–114 while both the NBA box-score totals and fresh ESPN summary say **119–116**. The NBA page's game ID itself matches the L2M ID. This is a source-metadata discrepancy, not a different game. Preserve both original values and document a score-mismatch override for this specific join.

Downloaded supplemental evidence is isolated under `ml/data/l2m-research/assignment-validation-20260906/`: five ESPN summaries, two date scoreboards, and `20260128_CHIIND_book.pdf`. The NBA gamebook SHA256 is `1041f16e30fa111f8771fe0d6e17f56df253f26d281c6fb7dac6402af4444123`. Direct NBA CDN box-score requests returned HTTP 403; the public NBA gamebook was accessible and downloaded successfully.

## Code review observations

No error-counting defect found in the inspected snapshot calculation. Row-ordinal identity correctly avoids merging distinct assessments attached to one video. Assignment exposure is correctly tripled at the official level and remains an association, not individual responsibility. Phase separation and inclusion of zero-IC/INC reports are correct.

The `reviewed_periods` denominator is distinct periods represented by assessment rows, not independently verified full-window exposure. It is preferable to raw games for OT context but should retain that definition. Complete acquisition of an index is not proof the index includes every eligible game. Per-call accuracy percentages would also inherit selected CNC coverage and should not be presented as whole-game accuracy.
