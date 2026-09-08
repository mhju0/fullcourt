# Referee season context and offensive whistle: descriptive protocol

Registered before computing this study's results on 2026-09-06. Research only; no published artifact changes.

## Fixed questions and population

1. For each cached regular season, how many regulation foul events and technical foul events occur per game? Report home/away foul counts and the share of games with a technical. Compare latest available season with the immediately preceding season descriptively.
2. In the latest cached regular season, do high-scoring players attempt more free throws relative to field-goal attempts? Define stars as the top 30 in season points per game among players with at least 40 appearances; ties use athlete ID. Compare aggregate FTA/FGA, FTA per 36 minutes, and shooting fouls drawn per 36 against other qualifying players. These measures describe offensive activity; none isolates favorable officiating.
3. Audit missingness before interpreting: game availability, identified foul teams/drawers, box-score attempts, minutes and point fields. Report covered dates. Do not infer a complete season from the label.

Input: existing `ml/data/referee/{games,fouls,players}.csv`; latest-season ESPN summary cache `ml/data/officials/ev-{event_id}.json`. Include regular-season games with at least three officials, play stream and player rows. Count regulation foul events only (periods 1–4), retaining overtime games but excluding their overtime events. Existing extractor excludes duplicate Offensive Foul Turnover events. Technical means the foul type contains `technical` case-insensitively. No individual referee rankings or inferential tests. Compare foul counts, not accuracy.

Stars/nonstars comparison requires positive minutes and parseable points, FGA and FTA, each valid player-game counted once. Publish missingness and suppress comparisons if fewer than 95% of positive-minute player-games have complete box fields. Do not substitute fouls committed for fouls drawn. A missing drawer is missing, not proof no foul was drawn. Field-goal attempts exclude fouled attempts without a made basket; FTA/FGA therefore is not a probability of receiving a whistle. Offensive role, shot location, driving, intentional fouls and technical free throws remain uncontrolled. No conclusion about superstar bias is permitted.

Reproducible implementation and result sections will be appended after this protocol is saved. Named player comparisons, possession-adjusted modeling, playoff series extension, and new correctness data are outside this bounded study.

## Results

Run: `python3 ml/referee_season_secondary_20260906.py` from any directory. Machine-readable results: [2026-09-06-referee-season-secondary.json](2026-09-06-referee-season-secondary.json). Source: cached ESPN summaries and their existing flat extraction; no network or database access.

Latest sample: **1,223 regular-season games**, 2025-10-21 through 2026-04-12. This is a cached sample, not asserted complete coverage. The preceding season contributes 1,230 games.

| Question | 2024–25 | 2025–26 |
|---|---:|---:|
| Regulation foul events per game | 36.92 | 39.51 |
| Regulation technical events per game | 0.662 | 0.665 |
| Games with a regulation technical | 531 / 1,230 (43.2%) | 521 / 1,223 (42.6%) |
| Away minus home regulation foul events per game | +0.029 | +0.320 |

The latest sample has **2.59 more foul events per game** while technical-event frequency is nearly unchanged. This could be a useful small season-context chart. It does not identify what caused the change. Counts include foul-event types such as technicals and are not team box-score personal-foul totals. Across the eleven-season sample, foul events per game vary rather than increasing continuously; the complete series is in the JSON. Counts are not possession-adjusted, and neutral-site games remain in the descriptive home/away labels.

Latest regulation sample: 48,319 foul events, 813 technical events, 34 foul events without an identified participating team (0.07%). The script independently verifies the home/away/unidentified partition.

### Offensive activity, not superstar treatment

| Latest-season group | Players | Player-games | FTA / FGA | FTA / 36 minutes |
|---|---:|---:|---:|---:|
| Top 30 points/game, minimum 40 appearances | 30 | 1,919 | 0.364 | 6.94 |
| Other players with 40+ appearances | 333 | 20,723 | 0.241 | 3.01 |

All **26,384 positive-minute player-games** had parseable points, FG and FT box fields; all 1,223 eligible payloads were present. The table above excludes players below 40 appearances, accounting for its smaller player-game denominator. Box-score exposure includes overtime consistently for attempts and minutes.

High scorers take more free throws relative to field-goal attempts in this sample. This is **not evidence of a favorable referee whistle**: scoring rank itself includes free throws, and role, shot location, drives, contact, intentional fouling and technical free throws are uncontrolled. FTA/FGA is not a foul-call probability because fouled missed shots do not count as field-goal attempts.

**Fouls drawn cannot currently be computed from participant index 1.** None of the latest season's 25,362 regulation shooting fouls has that drawer field; including overtime, all 25,487 shooting fouls lack it. The raw payload cross-check also found no second participant on those regulation shooting plays. The JSON therefore reports the proposed per-36 shooting-fouls-drawn comparison as `null`, not zero. Modern play text might permit a new extractor, but would require its own validation; this study did not parse it. Missing drawer fields affect most seasons after 2016–17, so this assumption should not be inherited into future longitudinal player analysis.

## Validation and interpretation boundary

- A separate raw-JSON pass independently reproduced all 48,319 regulation foul events, 813 technical events and 521 games with technicals in the latest season, matching the CSV-based main calculation exactly.
- A separate pass over `players.csv` independently reproduced the top-30 group's membership aggregates: 1,919 appearances, 48,326 points and 65,004 minutes, matching the box-payload calculation.
- The reproducible script checks duplicate game IDs, duplicate player-game box entries, and foul-team partition totals. All passed.
- Existing official-level causal or bias claims are neither rerun nor expanded. These results support a season-context display and expose an offensive-whistle data gap; they do not justify a named fairness leaderboard.
