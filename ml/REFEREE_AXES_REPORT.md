# Referee axes — ADR 0007, measured

Corpus: **13,114 regular-season games**, 511,534 foul plays, 11 seasons (2015-16 … 2025-26).
Officials tested: those with >= 200 games. Permutations: 2,000. Axis A drops 88 bubble games.

`spread ratio` is the observed between-official spread divided by what the null produces; 1.00 means officials differ no more than random subsets of games do. `extreme` counts |z| >= 2 against the count noise alone yields.

## Whistle volume (fouls per game)

| statistic | league mean | spread ratio | p | extreme (\|z\|>=2) | expected |
|---|---|---|---|---|---|
| `vol_shooting` | 19.441 | 1.45 | 0.0000 | 21 | 3.4 |
| `vol_personal` | 12.607 | 1.47 | 0.0000 | 33 | 3.4 |
| `vol_looseBall` | 2.359 | 2.35 | 0.0000 | 34 | 3.4 |
| `vol_offensive` | 2.377 | 2.05 | 0.0000 | 29 | 3.4 |
| `vol_technical` | 0.736 | 1.75 | 0.0000 | 19 | 3.4 |
| `vol_total` | 38.976 | 2.16 | 0.0000 | 30 | 3.4 |

## Axis A — home/away tilt by foul type

| statistic | league mean | spread ratio | p | extreme (\|z\|>=2) | expected |
|---|---|---|---|---|---|
| `A_shooting_diff` | 0.197 | 1.19 | 0.0215 | 7 | 3.4 |
| `A_personal_diff` | 0.104 | 1.10 | 0.1310 | 8 | 3.4 |
| `A_looseBall_diff` | 0.027 | 1.13 | 0.0710 | 7 | 3.4 |
| `A_offensive_diff` | 0.030 | 1.16 | 0.0235 | 4 | 3.4 |
| `A_technical_diff` | -0.038 | 1.01 | 0.4610 | 4 | 3.4 |
| `A_total_diff` | 0.339 | 1.35 | 0.0000 | 10 | 3.4 |
| `A_shooting_share` | 0.505 | 1.18 | 0.0260 | 6 | 3.4 |
| `A_personal_share` | 0.503 | 1.16 | 0.0410 | 10 | 3.4 |
| `A_looseBall_share` | 0.506 | 1.00 | 0.4960 | 5 | 3.4 |
| `A_offensive_share` | 0.506 | 1.08 | 0.1765 | 3 | 3.4 |
| `A_technical_share` | 0.475 | 1.11 | 0.1030 | 5 | 3.4 |
| `A_total_share` | 0.504 | 1.38 | 0.0000 | 12 | 3.4 |

## Axis C — timing

| statistic | league mean | spread ratio | p | extreme (\|z\|>=2) | expected |
|---|---|---|---|---|---|
| `C_q1` | 7.837 | 1.55 | 0.0000 | 15 | 3.4 |
| `C_q2` | 9.880 | 1.55 | 0.0000 | 16 | 3.4 |
| `C_q3` | 10.060 | 1.58 | 0.0000 | 17 | 3.4 |
| `C_q4` | 10.877 | 1.50 | 0.0000 | 16 | 3.4 |
| `C_q1_share` | 0.203 | 1.25 | 0.0040 | 8 | 3.4 |
| `C_q2_share` | 0.256 | 1.03 | 0.3685 | 2 | 3.4 |
| `C_q3_share` | 0.260 | 1.13 | 0.0815 | 4 | 3.4 |
| `C_q4_share` | 0.281 | 1.16 | 0.0345 | 8 | 3.4 |
| `C_q4_last2` | 2.414 | 1.05 | 0.2740 | 8 | 3.4 |
