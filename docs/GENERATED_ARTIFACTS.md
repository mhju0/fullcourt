# Generated analytics ownership

[Verified] This inventory links the producing code to the published artifact and its guard.
Run commands from the repository root, with the appropriate Python environment from
[Testing](TESTING_AND_CICD.md). A command here is an operating reference, not permission to
write production data. Inspect the exported database target before any database operation.
Never edit a published figure directly; regenerate and review its tests and corresponding copy.

| Published output | Producer / inputs | Consumer / guard | Regeneration |
| --- | --- | --- | --- |
| `src/data/referee-whistle.json`, `referee-foul-style.json` | `scripts/fetch_officials.ts`; ESPN officiating records and matched stored games | Historical referee research; `referee-whistle.test.ts`, `referee-foul-style.test.ts` | `corepack pnpm exec tsx scripts/fetch_officials.ts`; inspect script arguments and provider scope first |
| `src/data/referee-timing.json` | `scripts/analyze_officials_splits.ts`; cached `ml/data/officials` | Referee methods/archive; `referee-timing.test.ts` | `corepack pnpm exec tsx scripts/analyze_officials_splits.ts` |
| `src/data/referee-career-drift.json` | `ml/referee_career_windows.py`; `ml/data/officials/officials-games.json`, published foul-style replication gate | `/behind-the-data/referees`; `referee-career-drift.test.ts` | `python ml/referee_career_windows.py` after restoring its ignored local inputs |
| `src/data/referee-legends.json` | `ml/build_referee_legends.py`; axes, player axes, exploratory, makeup, playoff claims and confound results under `ml/data/referee` | Referee archive; `referee-legends.test.ts` | `python ml/build_referee_legends.py` |
| `src/data/officiating.json`, public per-game report JSON | `ml/publish_officiating.py`; collected/analyzed L2M records | `/officiating`; `officiating.test.ts`, `ml/tests/test_officiating_publish.py` | Follow [Officiating operations](OFFICIATING.md); collector/publisher season and scope flags matter |
| `src/data/win-total-benchmark.json` | `scripts/fetch_win_totals.ts`; archived win-total lines and stored completed game/schedule data | Schedule Edge; `win-total-benchmark.test.ts` | `corepack pnpm exec tsx scripts/fetch_win_totals.ts` |
| `public/data/player-rest.json` | `scripts/export_player_rest.py`; shared shooting helpers, player boxscores, birthdays and game dates | `/shooting`; `player-rest.test.ts` | `python scripts/export_player_rest.py` |
| `ml/home_rest_confound_facts.json` and `src/lib/home-rest-confound-facts.ts` | `scripts/measure_home_rest_confound.ts`; stored schedule/fatigue/results | Rest-advantage method; `home-rest-confound-facts.test.ts` | `corepack pnpm exec tsx scripts/measure_home_rest_confound.ts`; keep generated JSON and typed mirror aligned |
| Rest split facts / typed mirror | `scripts/measure_uncalled_half.ts`; completed game/fatigue population | Model and method pages; `rest-split-facts.test.ts` | `corepack pnpm exec tsx scripts/measure_uncalled_half.ts`; review the output and mirror together |
| `ml/availability_facts.json` / typed mirror | `ml/availability_facts.py`; shooting boxscores, fatigue features and prepared model table | `/availability`; `availability-facts.test.ts` | `python ml/availability_facts.py` after rebuilding required input files |
| `ml/playoff_rest_facts.json` / typed mirror | `ml/playoff_rest_report.py`; stored games and playoff series | `/playoffs`; `playoff-rest-facts.test.ts` | `python ml/playoff_rest_report.py` with an explicit read-only database target |
| `src/data/timezone-null.json` | [Unknown] No writer for this exact committed snapshot was found in tracked scripts. `ml/timezone_test.py` regenerates its separate research report, not this JSON | Time-zone method; `timezone-null.test.ts` | Do not treat rerunning the research report as regenerating the published snapshot; establish the extraction protocol before changing it |
| Database `shot_grid`, `shot_value_surface` | `scripts/aggregate_shot_grid.py`, `scripts/sq5_write_surface.py`; local shot cache and fitted model artifacts | `/shot-quality`; model/pipeline contracts | These commands write a database. Follow [pipeline documentation](DATA_PIPELINE.md); production requires owner approval |

[Verified] The new career-drift guard checks the rendered denominators, percentages and the
claims about changing careers. It does not prove that ESPN supplied correct inputs or replace
the producer's replication gate. Ignored caches and historical research remain intact.

## 2026-10-11 regeneration follow-up

[Verified] The historical home-advantage PNG is produced by
`scripts/plot_home_advantage_trend.py` from the committed
`docs/research/2026-09-11-home-advantage-trend.json`; Matplotlib is required.
The figure was redrawn without changing its data or producer.
[Follow-up](research/2026-10-11-artifact-regeneration.md) records the checks.

[Verified] Current referee regeneration is not a no-difference refresh: four corrected dates
fail cached ESPN matching, and `fetch_officials.ts` takes coverage labels from the season list
rather than collected games. Do not publish the diagnostic outputs without resolving and
reviewing those differences. The initial three-snapshot Officiating command above is not a
full12-season/current-provenance rebuild; older snapshots can regress the latest index hash
and refresh metadata. Preserve current publication until exact source provenance is available.
