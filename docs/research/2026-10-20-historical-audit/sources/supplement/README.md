# Additive ESPN bulk supplement — 2026-10-20

The original source audit remains frozen. This supplement exercises a subsequently identified, documented archive without retrying Basketball Reference or making individual game requests. Only three CSV assets were captured from the [SportsDataverse ESPN NBA schedules release](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/espn_nba_schedules): `nba_schedule_1994.csv`, `nba_schedule_1995.csv`, and `nba_schedule_1996.csv`. File years are season ending years. These are archived ESPN observations, not database exports and not a second independent source from the prior ESPN team schedules.

All **3,621 stored games** in 1993–94, 1994–95 and 1995–96 match the archive by Eastern date and normalized home/away identity. This adds **218 previously unchecked date/identity and score rows**, completing those three seasons' coverage. No source date or side contradiction is asserted among these matched games.

| Season | Stored / matched | Newly checked date / identity | OT verified | OT still unknown | Additional known OT defaults |
|---|---:|---:|---:|---:|---:|
| 1993–94 | 1,184 | 77 | 1,179 | 5 | 50 |
| 1994–95 | 1,180 | 73 | 1,179 | 1 | 77 |
| 1995–96 | 1,257 | 68 | 1,252 | 5 | 67 |
| Total | 3,621 | 218 | 3,610 | 11 | 194 |

The authentic CSV has `home_linescores` and `away_linescores` containing serialized period dictionaries, plus final scores, completion status and period labels. The parser uses `ast.literal_eval` on individual dictionary literals, never executable evaluation. OT is accepted only when:

1. Both teams have a complete consecutive numbered period sequence starting at 1, with at least four periods and equal sequence lengths.
2. Both period sums equal that team's reported final score.
3. For games with extra periods, scores are tied after regulation and each non-final overtime period.
4. The game is reported complete and the final score is not tied.

All **3,610 accepted rows pass every condition**, including all 194 positive-OT rows. The 11 excluded rows have missing or placeholder period labels; one is the 1995 Finals Game 4 with four zero-valued, unnumbered line entries. Their default `0` is not verified. No non-tied-regulation or non-tied-intermediate-OT candidate was admitted. The provider's `status_period` alone is not used to infer OT.

There is one additional unresolved score disagreement: **ATL at IND, 1994-05-19**, stored Indiana 98 versus ESPN 97. It is retained as a provider disagreement, not a confirmed database correction.

Two source-only rows are archive anomalies, not established missing games: a duplicate Dallas–Denver observation on 1993-12-05 with a spurious `DEV` team abbreviation/ID, alongside the normal `DEN` row with the same score; and an Orlando–Miami postseason observation on 1995-06-11 alongside the genuine Houston–Orlando Finals game. Neither is inserted or used to infer a missing fixture.

## Final combined coverage

[combined-season-field-coverage.csv](combined-season-field-coverage.csv) is the additive **final combined** 42-season matrix. The parent [season-field-coverage.csv](../season-field-coverage.csv) remains the original frozen core matrix. For these three seasons, the prior sources had zero OT coverage; the 3,610 newly validated OT rows therefore have no overlap. The 218 additional date/identity/score rows are calculated by game-ID set difference, not by adding all 3,621 rows a second time. Other fields, including tip and neutral-site comparison, remain unchanged because this supplement makes no new truth claims for them.

| Measure | Original core | Final combined |
|---|---:|---:|
| Date / identity source-checked | 45,913 | 46,131 |
| Completed score source-checked | 44,713 | 44,931 |
| Completed OT source-checked | 41,070 | 44,680 |
| Completed OT still unknown | 9,425 | 5,815 |
| Distinct known stored zero-OT defaults | 589 | 783 |
| Distinct games with score disagreements | 16 | 17 |

The total final-game denominator remains 50,495, with 1,200 additional scheduled games. Future OT is not an observed outcome. Early 1988–89 through 1992–93 gaps remain; no archive covering them was discovered in the bounded inventory check. These source comparisons do not establish that missingness is unbiased or conservative, nor that repairing an input improves predictive accuracy.

## Reproduction and evidence

Run `python3 docs/research/2026-10-20-historical-audit/sources/supplement/compare_bulk.py` from the repository root. It only reads local immutable captures and writes this supplement. The script was executed successfully after the complete period/tie checks were added. Counts and original artifact hashes were independently asserted. No application, model, database or parent frozen artifact was changed.

[manifest.json](manifest.json) pins the supplement's raw capture manifest, three original CSVs and research artifacts, and records the verified original core manifest hash. Raw CSVs and the URL/timestamp/hash capture manifest remain ignored under `docs/audit/2026-10-20-historical-audit/sources/supplement/`.
