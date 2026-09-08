# NBA season officiating study: first data pass

Research date: 2026-09-06. The owner requested data first, followed by a discussion of a small number of engaging highlights. This is a research dataset and report, not a product release or finished visualization.

## What is collected

All **415 unique L2M reports linked from the NBA's 2025–26 index** downloaded and passed structural validation, covering October 21, 2025 through June 13, 2026. Raw JSON and index snapshots are stored locally with retrieval times and SHA-256 hashes. Report identities, grading vocabulary, duplicate rows and aggregate partitions are checked. This is complete acquisition of the indexed reports, not an independent audit that the NBA published a report for every eligible game. [NBA season index](https://official.nba.com/2025-26-nba-officiating-last-two-minute-reports/)

September 6 is offseason. Treat this as the completed-season baseline for future accumulation; the 2026–27 regular season starts October 20. Collection is parameterized by season, but no future reports are invented and no production schedule is enabled. [NBA schedule announcement](https://www.nba.com/news/2026-27-nba-regular-season-schedule)

The [protocol](../../ml/l2m_season_preregistration.md) was saved before report-level calculations. Outputs: [L2M results](2026-09-06-l2m-season-results.json), [other season calculations](2026-09-06-referee-season-secondary.md), [official-source context and beneficiary audit](2026-09-06-officiating-source-context.md).

## The first usable findings

### Most reviewed errors were missed calls

| Phase | Reports | Reviewed periods | Wrong calls (IC) | Missed calls (INC) | Total errors | Games with an error |
|---|---:|---:|---:|---:|---:|---:|
| Regular season | 386 | 438 | 68 | 308 | 376 | 234 |
| Play-in | 3 | 4 | 0 | 1 | 1 | 1 |
| Playoffs | 26 | 31 | 6 | 26 | 32 | 14 |
| All phases | 415 | 473 | 74 | 335 | 409 | 249 |

**308 of 376 regular-season errors were incorrect non-calls: 81.9%.** Of the 386 reviewed regular-season games, 234 (60.6%) had at least one IC/INC grade and 152 (39.4%) had neither grade. This is not a claim those 152 games were perfectly officiated: ungraded clock observations and calls outside these windows are separate. These are errors recognized in the selected L2M windows, not all errors in those games.

There are 8,083 assessment rows across all phases: 1,965 CC, 5,706 CNC, 74 IC, 335 INC, and 3 ungraded. Preserve ungraded entries; never silently count them as correct. A broad “NBA referee accuracy” percentage would overstate what this selected set measures.

An assessed row is not necessarily a distinct possession or video clip. Several decisions can share a video event. The data retains them separately while counting each assessment once in league totals.

### The categories make this more concrete

Regular-season reviewed errors, with the raw source categories retained:

| Category | Missed calls | Wrong calls | Total |
|---|---:|---:|---:|
| Shooting fouls | 74 | 28 | 102 |
| Personal fouls | 54 | 16 | 70 |
| Defensive three seconds | 37 | 0 | 37 |
| Traveling | 34 | 3 | 37 |
| Loose-ball fouls | 28 | 4 | 32 |
| Offensive three-second violations | 23 | 0 | 23 |
| Offensive fouls | 20 | 1 | 21 |
| Out of bounds | 2 | 10 | 12 |

The owner's defensive-three-second example is measurable: **37 missed calls** appear in these reports, alongside 3 correct calls and 18 correct non-calls in that category. This does not estimate the rate for all defensive-three-second opportunities throughout NBA games. It also does not establish a league crackdown or a referee's agenda.

### Current-season context differs from the prior season

The separate cached ESPN study finds **39.51 regulation foul events per game in 2025–26 versus 36.92 in 2024–25**. Technical events were nearly unchanged at 0.665 versus 0.662 per game. The latest sample covers 1,223 games; the prior sample covers 1,230. These are regulation play-event counts, not possession-adjusted rates or box-score personal-foul totals. [Calculation and validation](2026-09-06-referee-season-secondary.md)

The NBA's verified 2025–26 emphasis topics were landing space, high-five contact and straight-line pathways. A measured change in foul counts does not isolate the effect of those instructions. No verified defensive-three-second emphasis was found for that season. [Official points of emphasis](https://official.nba.com/2025-26-points-of-emphasis/)

## Crew reporting: feasible, with the right unit

All **415 reports are linked to three assigned officials** through cached ESPN game data, matching Eastern game date, home/away teams and final scores, with five separately sourced exceptions. The [assignment corrections](2026-09-06-l2m-assignment-corrections.json) include fresh play-in summaries, an NBA gamebook for missing officials, and a documented L2M score typo. The exact trio and each official's assignment exposure are exported separately. Neither identifies who personally made or missed a call.

An error is counted once in league totals and once in its trio's history. It appears in the assignment history of all three officials, so adding those individual histories produces three times the error count. The analyzer checks this reconciliation explicitly. Zero-error reports remain in every exposure denominator.

The regular-season sample contains **382 exact trios; 378 appear once, and no trio appears more than twice**. The 78 individual officials have between 1 and 27 reviewed games each. These are L2M-report exposures, not their total season assignments. A more useful eventual entry may be “NBA-reviewed errors in games worked,” accompanied by reviewed games, reviewed periods, IC and INC. It is not a personal referee grade or a “mistakes caused” count. Regular-season and playoff histories remain separate.

The [independent validation note](2026-09-06-l2m-validation.md) records missing-assignment resolution, source conflicts and inspected examples. Raw source conflicts are preserved, not overwritten.

## Why team helped/hurt totals are held back

All 409 error rows have empty explicit `teamIdInFavor` fields. The source's aggregate “Errors in Favor” sums to **388**, whereas the reviewed event rows contain **409** errors. Twenty games disagree. More seriously, some games with matching totals still allocate an error to the opposite side from the written decision. Blindly trusting the summary would create a misleading team leaderboard.

The official Indiana–Chicago report for January 28, 2026 says the ball was awarded to Chicago but should have gone to Indiana; its summary credits the home team. Similarly, CP/DP fields do not have a universal beneficiary interpretation across foul, scoring and administrative events. The source-context note preserves examples and the independent audit. [Indiana–Chicago report JSON](https://official.nba.com/l2m/json/0022500672.json)

The next team-ledger study needs dated player-team mapping and rules for each event category, plus manual resolution or an unknown/neutral bucket for ambiguous rows. Same-team wrong-player foul assignments can harm an individual while leaving team free throws unchanged. Do not force these into a binary team-benefit score. No fabricated net points or alternative winners are calculated.

## Status of the other fan questions

| Question | Data outcome in this pass |
|---|---|
| Will the game flow? | Season foul-volume and technical trends calculated. Wall-clock viewing duration and review delay are not inferred from foul totals. |
| Are equivalent plays called consistently? | L2M correctness is available for selected events, but comparable-contact opportunities are not a complete census. Monthly counts are exported; no consistency or causal trend claim is made. |
| Does this official hurt my team? | Assignment histories are calculable; reliable error beneficiaries require reconstruction. Win rates alone cannot answer fairness. |
| Do stars get favorable offensive calls? | FTA/FGA and FTA/36 calculated for top-30 scorers versus other qualifying players. Differences are not evidence of favoritism; scoring, role and contact opportunities are uncontrolled. All 25,487 latest-season shooting fouls lack the extracted drawer ID, so fouls-drawn rates are suppressed. |
| Who gets bad late-game calls? | Event grades and error categories validated. Team allocation is held back for the concrete source-integrity problems above. |
| Who gives soft technicals? | Technical frequency is calculated. Whether a technical was justified, plus rescissions and original calling official, requires further evidence. |

The extender story is an additional future study: the existing playoff script studies player–official records, not pregame series-extension opportunities. No new extender verdict is asserted here.

## What deserves the next discussion

The most immediately defensible material is **missed calls versus wrong whistles**, followed by **which rules account for the errors**. The season whistle-volume comparison offers context. These are candidate highlights, not a commitment to three sections. The source also supports a cumulative ledger with date, matchup, three officials, error counts and source links, without assuming it needs its own referee page.

Before visualization, decide which question has enough value to become the lead. Team benefit is likely engaging, but it is not yet dependable enough to lead. Monthly and named-official slices should remain supporting evidence until their exposure and uncertainty can be communicated clearly. A future in-season collection should recheck recently published reports for revisions, expose freshness/coverage, and retain empty or pending states.

## Reproduction

From the repository root, collection makes a new timestamped snapshot:

```sh
python3 ml/collect_l2m_season.py --season 2025-26
```

Reproduce this study from the saved snapshot and sourced assignment corrections:

```sh
python3 ml/analyze_l2m_season.py \
  ml/data/l2m-research/2025-26/20260906T143154961791Z \
  --assignment-corrections docs/research/2026-09-06-l2m-assignment-corrections.json \
  --out docs/research/2026-09-06-l2m-season-results.json
python3 ml/referee_season_secondary_20260906.py
python3 -m unittest discover -s ml/tests -p 'test_l2m_season.py'
```

Raw L2M snapshots and assignment evidence live in ignored `ml/data/l2m-research/`; the existing ESPN inputs live in ignored `ml/data/referee/` and `ml/data/officials/`. Versioned code and research outputs do not make the large local source caches portable. The source manifest and hashes identify what was used. No frontend build is required for these isolated Python research tools and Markdown notes; the product and published artifacts were not edited.

Validation completed: four focused Python tests passed; the full analyzer passed source-hash and partition checks with 415/415 assignment joins; an independent calculation reproduced grades, phase counts and represented periods; manually inspected IC, INC, ungraded, overtime and no-IC/INC examples are recorded in the validation note. Local documentation links and `git diff --check` passed.
