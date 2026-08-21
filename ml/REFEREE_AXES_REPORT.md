# Referee axes — ADR 0007, measured

Corpus: **12,813 regular-season games**, 499,594 foul plays, 11 seasons (2015-16 … 2025-26).
Officials tested: those with >= 200 games. Permutations: 2,000. Axis A drops 88 bubble games.

`spread ratio` is the observed between-official spread divided by what the null produces; 1.00 means officials differ no more than random subsets of games do. `extreme` counts |z| >= 2 against the count noise alone yields.

## Whistle volume (fouls per game)

| statistic | league mean | spread ratio | p | extreme (\|z\|>=2) | expected |
|---|---|---|---|---|---|
| `vol_shooting` | 19.453 | 1.47 | 0.0000 | 22 | 3.4 |
| `vol_personal` | 12.577 | 1.47 | 0.0000 | 33 | 3.4 |
| `vol_looseBall` | 2.356 | 2.31 | 0.0000 | 34 | 3.4 |
| `vol_offensive` | 2.378 | 2.04 | 0.0000 | 30 | 3.4 |
| `vol_technical` | 0.736 | 1.71 | 0.0000 | 17 | 3.4 |
| `vol_total` | 38.961 | 2.15 | 0.0000 | 32 | 3.4 |

## Axis A — home/away tilt by foul type

| statistic | league mean | spread ratio | p | extreme (\|z\|>=2) | expected |
|---|---|---|---|---|---|
| `A_shooting_diff` | 0.202 | 1.22 | 0.0090 | 6 | 3.4 |
| `A_personal_diff` | 0.101 | 1.10 | 0.1270 | 7 | 3.4 |
| `A_looseBall_diff` | 0.026 | 1.14 | 0.0510 | 7 | 3.4 |
| `A_offensive_diff` | 0.029 | 1.16 | 0.0350 | 4 | 3.4 |
| `A_technical_diff` | -0.037 | 1.01 | 0.4310 | 5 | 3.4 |
| `A_total_diff` | 0.340 | 1.36 | 0.0000 | 10 | 3.4 |
| `A_shooting_share` | 0.505 | 1.21 | 0.0130 | 6 | 3.4 |
| `A_personal_share` | 0.503 | 1.17 | 0.0275 | 7 | 3.4 |
| `A_looseBall_share` | 0.506 | 1.00 | 0.4980 | 4 | 3.4 |
| `A_offensive_share` | 0.505 | 1.09 | 0.1640 | 3 | 3.4 |
| `A_technical_share` | 0.475 | 1.12 | 0.0980 | 6 | 3.4 |
| `A_total_share` | 0.504 | 1.39 | 0.0000 | 11 | 3.4 |

## Axis C — timing

| statistic | league mean | spread ratio | p | extreme (\|z\|>=2) | expected |
|---|---|---|---|---|---|
| `C_q1` | 7.835 | 1.54 | 0.0000 | 15 | 3.4 |
| `C_q2` | 9.878 | 1.55 | 0.0000 | 16 | 3.4 |
| `C_q3` | 10.058 | 1.55 | 0.0000 | 16 | 3.4 |
| `C_q4` | 10.866 | 1.48 | 0.0000 | 15 | 3.4 |
| `C_q1_share` | 0.203 | 1.24 | 0.0080 | 8 | 3.4 |
| `C_q2_share` | 0.256 | 1.01 | 0.4130 | 3 | 3.4 |
| `C_q3_share` | 0.260 | 1.11 | 0.1020 | 5 | 3.4 |
| `C_q4_share` | 0.280 | 1.16 | 0.0470 | 7 | 3.4 |
| `C_q4_last2` | 2.414 | 1.05 | 0.2675 | 9 | 3.4 |
