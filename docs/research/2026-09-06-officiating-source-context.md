# Season context for an NBA officiating report

Research date: 2026-09-06. Official-source research only; implementation and editorial choices below are proposals.

## Season boundary

2026-27 begins October 20, 2026. September 6 is offseason; a report built now should identify 2025-26 as the completed-season baseline. [NBA schedule announcement](https://www.nba.com/news/2026-27-nba-regular-season-schedule)

The official 2025-26 L2M archive includes reports through June 13, 2026. It includes postseason games beneath a misleading regular-season heading: determine competition phase from game metadata, not the heading. [Official archive](https://official.nba.com/2025-26-nba-officiating-last-two-minute-reports/)

## Documented emphasis, rather than inferred intent

The NBA published three 2025-26 training topics on September 26, 2025: protecting jump shooters' landing space, high-five contact on jump shots, and straight-line pathway plays. These are league training priorities; they do not establish a particular official's personal agenda. The page identifies the topics but its linked videos contain the detailed examples. This research verified the page text, not a frame-by-frame interpretation of those videos. [2025-26 Points of Emphasis](https://official.nba.com/2025-26-points-of-emphasis/)

There is historical official documentation of interpretive guidance about non-basketball movements in 2021-22. That is a valid season-specific research topic, but should not be described as newly introduced in 2025-26. [NBA education video](https://www.nba.com/watch/video/2021-22-points-of-education-non-basketball-moves), [December 2021 update](https://official.nba.com/update-2021-22-points-of-education/)

No official 2026-27 emphasis publication or 2025-26 defensive-three-second emphasis was verified in this search. This is an evidence gap, not proof that no additional training guidance exists.

**Analysis implication:** describe observed changes as changes in reviewed decisions or foul rates. Establishing why they changed requires more evidence. Players adapting, lineup changes, pace, shot selection, crew assignments, and selection into close games can all change the data without a new referee directive. A monthly trend can test whether a pattern persists; it cannot independently establish intent.

## What L2M actually measures

The official FAQ defines eligibility as a lead of three points or fewer at any point in the final two minutes of the fourth quarter or overtime. Reports cover calls and selected material non-calls, not every potential officiating decision throughout a game. A material non-call concerns the possession's outcome or a rule misunderstanding. Incorrect judgments require clear, conclusive video evidence. [L2M FAQ](https://official.nba.com/nba-last-two-minute-reports-frequently-asked-questions/)

The current archive explains that some peripheral incidents or observations requiring technical aids may appear in brackets without an incorrect grade. The NBA can revise its assessment. Consequently, counting words such as “contact” or “violation” in comments is not equivalent to counting official mistakes. Retain structured grades and preserve revisions. [Current reporting notes](https://official.nba.com/2025-26-nba-officiating-last-two-minute-reports/)

Proposed denominator discipline:

- Show reviewed games beside error totals. More reviewed exposure creates more opportunities for errors.
- Separate incorrect whistles from missed whistles. If reporting an error share, label it “of reviewed decisions,” because correct non-calls are selected rather than an exhaustive census.
- Report minutes or reviewed periods as well as games when comparing overtime exposure.
- Separate regular season and postseason before comparing seasons.
- Retain events whose team benefit is unknown. Do not force every technical or administrative event into a team advantage.
- A net error difference is a descriptive balance; it does not establish intentional bias or the result that would have occurred with different officiating.

## Crew attribution and replay grading

Daily assignments identify a crew chief, referee and umpire. Assignments establish who worked the game, not who was responsible for every event. [NBA explanation of assignment information](https://pr.nba.com/nba-official-relaunch-website/)

The inspected official opening-night payload (`0022500001`, Houston at Oklahoma City, October 21, 2025) contains game metadata, summary statistics and reviewed events, but no individual referee attribution. Use wording such as “reviewed errors in games worked” when joining external assignments and preserve the exact three-person crew. Do not count one event three times in league totals. [Official JSON](https://official.nba.com/l2m/json/0022500001.json)

A successful challenge can overturn an original decision under the official challenge rule. Therefore original-call accuracy and the final decision after review must be treated as distinct questions. [Rule 14](https://official.nba.com/rule-no-14-coachs-challenge/)

The inspected opening-night payload contains a successful challenge at Q4 01:42.8: the original foul against Jabari Smith Jr. was overturned, with the resulting event graded `CNC` and typed `Stoppage: Inadvertent Whistle`. At Q4 00:53.1, an unsuccessful challenge retains a `CC` loose-ball foul. This directly demonstrates that counting incorrect grades does **not** capture every original whistle that was wrong before replay. Keep overturned original calls separate from **NBA-reviewed errors**, with no automatic addition or double count. [Official report](https://official.nba.com/l2m/L2MReport.html?gameId=0022500001), [JSON](https://official.nba.com/l2m/json/0022500001.json)

That sample also has empty per-event `teamIdInFavor` / `errorInFavor` fields even for mistakes, while its summary supplies errors in favor of each side. The subsequent full-snapshot audit below supersedes the initial assumption that those summary totals are safe to use directly. [JSON](https://official.nba.com/l2m/json/0022500001.json)

## Focus suggested by the source constraints

Start with a season ledger of reviewed late-game errors, then select one strong finding from it. Team benefit and missed-versus-wrong-whistle composition answer recognizable fan questions with fewer unsupported assumptions than an individual “worst referee” ranking. Crew and monthly slices are useful exploratory views, but need their exposure shown. These are research priorities, not a proposed six-section page or a finalized design.

## Full-snapshot beneficiary integrity audit

Independently examined the 415 report JSON files in `ml/data/l2m-research/2025-26/20260906T143154961791Z`. Source: [2025-26 official archive](https://official.nba.com/2025-26-nba-officiating-last-two-minute-reports/). Findings apply to that retrieved snapshot, not future revisions.

There are **409 IC/INC event rows**, but the source `Errors in Favor` summaries total **388**. Twenty games disagree, accounting for a deficit of 21. Every `Possessions in Favor` summary is zero; adding that field does not reconcile anything.

Inspection localizes the 21 discrepancies to these IC circumstances. This is a description of the observed mismatch, not a verified NBA exclusion policy:

| Circumstance in comments | Rows | Example official payload |
|---|---:|---|
| Incorrect out-of-bounds possession | 10 | [0022500179](https://official.nba.com/l2m/json/0022500179.json) |
| Foul assessed to wrong player on the same team | 5 | [0022500158](https://official.nba.com/l2m/json/0022500158.json) |
| Foul reassignment with inconsistent team labeling in comment | 1 | [0022500623](https://official.nba.com/l2m/json/0022500623.json) |
| Foul should have been on the other team | 3 | [0022500597](https://official.nba.com/l2m/json/0022500597.json) |
| Shooting foul should have been non-shooting | 1 | [0022500797](https://official.nba.com/l2m/json/0022500797.json) |
| Stepped-out turnover should instead have produced possession for that team | 1 | [0042500105](https://official.nba.com/l2m/json/0042500105.json) |

Incorrect out-of-bounds decisions are not consistently excluded: 13 `IC / Stoppage: Out-of-Bounds` rows exist overall, and three occur in games whose summary total reconciles. Same-team foul reassignment can plausibly lack a simple immediate team beneficiary, but that cannot explain omitted possession awards and opposite-team foul corrections.

**Matching totals do not establish correct team attribution.** In [0022500672](https://official.nba.com/l2m/json/0022500672.json), the only incorrect event says possession was given to Chicago but should have gone to Indiana. Indiana is the home team; the summary records home 1, away 0. It assigns the error to the side disadvantaged by the documented possession award. In [0022500858](https://official.nba.com/l2m/json/0022500858.json), the four-error summary credits all four to home Detroit, but the out-of-bounds explanation says Detroit should have received possession: that event disadvantaged Detroit. Neither example can be fixed by excluding only the 20 games with total mismatches.

### CP and DP are not universal beneficiary fields

In ordinary missed-foul rows, `CP` identifies the committing player and that player's team benefits from the missed whistle. In a wrongly called ordinary foul, the other side generally benefits. However:

- [0022500088](https://official.nba.com/l2m/json/0022500088.json) has `INC / N/A`, `CP=Kings`, `DP=Suns`: a Sacramento three-pointer was recorded as two. Treating `INC` as benefiting CP would reverse the affected side.
- [0022500271](https://official.nba.com/l2m/json/0022500271.json) identifies players from both teams in a missed double-lane violation. Actual free-throw/possession context is needed.
- [0022500623](https://official.nba.com/l2m/json/0022500623.json) labels both Jackson Jr. and Koloko `(MEM)` in a foul reassignment despite the game being Memphis–Atlanta. Comment team tags cannot be accepted without validation against dated game participants.
- Same-team wrong-player fouls remain officiating mistakes even if their immediate team impact is neutral. They should not automatically be called benefits for the opponent; personal foul counts and disqualification context may matter.

### Data decision

**Do not publish team beneficiary rankings from these summary fields yet.** Reliable counts remain feasible, but require reconstruction and review: dated player-to-team identities, event-type-aware interpretation of the actual and correct ruling, and game play-by-play for ambiguous administrative events. Retain unknown/neutral states and the source summary separately. Review every disagreement, including allocation disagreements in games with matching totals. A roster join alone does not solve the problem.

Error-grade totals, error types and report exposure can be analyzed now. They do not require assigning a benefited team. The source summary's 388 should not silently replace the 409 reviewed incorrect events, and the two numbers should not be described as interchangeable measures.
