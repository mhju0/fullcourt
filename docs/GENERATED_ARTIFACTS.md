# Generated analytics ownership

[Verified] This inventory links the producing code to the published artifact and its guard.
Run commands from the repository root, with the appropriate Python environment from
[Testing](TESTING_AND_CICD.md). A command here is an operating reference, not permission to
write production data. Inspect the exported database target before any database operation.
Never edit a published figure directly; regenerate and review its tests and corresponding copy.

The active fatigue research tools require successful content provenance for both intermediate
CSVs. Follow the [research input sequence](../ml/README.md#fatigue-research-input-provenance)
before rebuilding Availability, time-zone or fatigue-evaluation output. A retained CSV without
its success receipt fails closed; regenerating intermediates does not authorize a model fit or
publication. The receipts prove local input consistency, not freshness against the current DB.

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
| `ml/fatigue_ablation_facts.json` | `ml/ablate_fatigue_terms.py`; prepared `fatigue_model_table.csv` | Rest-advantage method ablation table; `fatigue-ablation-facts.test.ts` | `python ml/ablate_fatigue_terms.py` after the three harness steps |
| `ml/fatigue_fit_metrics.json` | `ml/fit_fatigue_weights.py`; prepared `fatigue_model_table.csv` | Input to `ml/timezone_test.py` (time-zone method); `ml/tests/test_timezone_fit_metrics.py`, `timezone-null.test.ts` | `python ml/fit_fatigue_weights.py` after the three harness steps; no coefficient is adopted from it |
| `ml/playoff_round_split.json` | `ml/train_series_model.py`; stored playoff series features | `/playoffs` and playoff method page; `playoff-rest-facts.test.ts` | `python ml/train_series_model.py` with an explicit read-only database target |
| `src/data/timezone-null.json` | `ml/timezone_test.py` (since 2026-10-15; it writes the JSON and `ml/data/timezone_report.txt` in one run, including the short-rest sensitivity block) | Time-zone method; `timezone-null.test.ts` | Needs fresh `fatigue_features.csv` and `fatigue_model_table.csv` (all three harness steps); copy the report into `ml/TIMEZONE_REPORT.md` in the same commit |
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

[Verified] The Oct11 referee regeneration was not a no-difference refresh: four corrected dates
failed cached ESPN matching, and `fetch_officials.ts` took coverage labels from the season list
rather than collected games. Do not publish the diagnostic outputs without resolving and
reviewing those differences. The initial three-snapshot Officiating command above is not a
full12-season/current-provenance rebuild; older snapshots can regress the latest index hash
and refresh metadata. Preserve current publication until exact source provenance is available.

## Referee generation guards — 2026-10-12

`scripts/fetch_officials.ts` retains its existing configured-season input selection and analytic
filters. Whistle coverage comes from collected valid games; foul-style coverage comes from
its regulation games that clear the existing foul-count floor. Neither output claims an
unplayed configured season. Empty input or an empty eligible population refuses publication.

The four corrected 2019–20 dates use an explicit NBA external-ID → ESPN event-ID crosswalk in
`scripts/referee-event-identity.ts`, with canonical stored dates, teams and final scores pinned
to the [research record](research/2026-10-11-artifact-regeneration.md) and independently checked
NBA identities. This is the only date exception. Both scoreboard and summary must agree on
event/competition ID, regular-season identity, teams, final scores, completed status and the
expected provider date. An unknown missing or ambiguous match, a changed exception identity,
or a fetch/summary identity error refuses generation.

Validated summaries that lack officials or usable free-throw statistics remain counted as
skipped data. Collected whistle and eligible foul-style game counts must each meet the current
committed publication's count. Every refusal and all output serialization happen before
writing `officials-games.json` or either published JSON. The count floor detects aggregate
loss; it does not prove membership continuity or fresh provider fidelity. The boundary tests
use field projections of retained ESPN responses with their original cache hashes, and check
that refusal preserves existing outputs. Published figures are unchanged by this guard work.


## Database-derived HTML cutover

Database-backed static/prerendered pages and ISR output are generated artifacts too.
For a coordinated data correction, keep readers gated and writers paused while the root:

1. Applies the approved correction and independently verifies its exact AFTER state.
2. Builds the matching source against that verified state. If reusing a build made against
   earlier data, explicitly invalidates and re-renders the affected output. Waiting for an
   ISR interval does not prove that a stale response has been replaced.
3. Checks the actual staged homepage SSR/prerendered headline, game count and baseline/lift,
   followed by its hydrated browser state and corresponding API values, before promotion.
4. Verifies canonical HTML/browser and APIs on the promoted deployment before restoring
   normal readers/writers and recording acceptance.

The [V11 release-order record](research/2026-10-20-arena-shooting/AUDIT_LEDGER.md#v11-production-build-before-data-apply-2026-10-20)
retains a failure where all API comparisons passed but a pre-apply homepage build still
served old values. API-only parity cannot establish rendered-page acceptance.

The existing `e2e/home.spec.ts` regression, “headline rates and samples use the same full
completed-season history”, derives expected values from real `/api/analysis` responses at
thresholds 0 and 5 and checks the rendered rates, samples, baseline, period/date and edge.
After staged HTML parity, run it against the explicitly selected real deployment before
accepting the release (root runs canonical verification after promotion):

```sh
PLAYWRIGHT_BASE_URL=https://fullcourt.fyi pnpm exec playwright test e2e/home.spec.ts -g 'headline rates and samples'
```

Use the exact staged URL for its pre-promotion run. Preserve the full 13-field staged
homepage parity receipt alongside the browser result. The secret-free fixture-backed CI
browser gate does not certify database-derived SSG on a real deployment.
