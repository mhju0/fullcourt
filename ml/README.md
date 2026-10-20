# Offline analysis and publication

This directory contains current publication tools and retained research. An old study is not
necessarily obsolete: its pre-registration, evaluation result, and producer are the evidence
behind a published claim or a rejected model change.

| Study / publication | Entry points | Evidence / output |
| --- | --- | --- |
| NBA Last Two Minute reports | `collect_l2m_season.py`, `analyze_l2m_season.py`, `compare_l2m_seasons.py`, `publish_officiating.py` | [Operations](../docs/OFFICIATING.md), [research index](../docs/research/README.md), `src/data/officiating.json`, public report JSON |
| Playoff series model | `build_series_dataset.py`, `compute_series_features.py`, `train_series_model.py`, `predict_series.py` | [PHASE3_REPORT.md](PHASE3_REPORT.md); database series/prediction tables |
| Previous-round workload | `compute_prior_grind.py`, `playoff_rest_report.py` | [PLAYOFF_REST_REPORT.md](PLAYOFF_REST_REPORT.md), `playoff_rest_facts.json` |
| Availability | `availability_cost.py`, `availability_quality.py`, `availability_facts.py` | `availability_facts.json` and the pinned frontend facts |
| Ratified-fatigue evaluation | `prepare_fatigue_dataset.py`, `fit_fatigue_weights.py`, `ablate_fatigue_terms.py`, `four_term_model.py`, `ceiling_test.py` | [ADR 0006](../docs/adr/0006-fatigue-weights-were-fitted-and-the-model-was-not-changed.md); no authorization to change coefficients |
| Time zones | `timezone_test.py` | [Pre-registration](timezone_preregistration.md), [report](TIMEZONE_REPORT.md) |
| Historical referee studies | `extract_referee_corpus.py`, `referee_axes.py`, `referee_player_axes.py`, `referee_career_windows.py`, related `referee_*.py`, `build_referee_legends.py` | Pre-registrations and `REFEREE_*_REPORT.md`; rendered in the historical archive |

`requirements.txt` defines the analysis environment. Tests under `tests/` verify publication
and playoff contracts. Not every analysis runs in the daily pipeline. Read the relevant study
before reproducing it; chronology and exclusion rules are part of the result.

`data/` stores local raw caches and intermediate evidence. `shot_value/` contains local trained
models and metrics. Both are ignored and are not a portable database/bootstrap bundle. Preserve
them when cleaning build output; published artifacts have independent committed copies and tests.

## Fatigue research input provenance

Run the export and preparation in order before an active research consumer:

```sh
pnpm exec tsx scripts/export_fatigue_features.ts
python ml/prepare_fatigue_dataset.py
# Then run the relevant study, after reviewing its publication outputs.
```

The exporter reads the configured database and compares rebuilt scores with stored scores.
It replaces `data/fatigue_features.csv` only after that fidelity check succeeds, and writes
`data/fatigue_features.csv.provenance.json` last. The receipt pins the CSV bytes and the
exporter's computation dependencies, venue/correction registries, dependency lock and
`tsconfig.json` import-resolution settings.
`scripts/fatigue-artifact-sources.json` lists that source scope; a Vitest import-closure test
resolves imports using that actual TypeScript configuration and requires every local
exporter dependency to remain included. `--verify-only` checks fidelity
without issuing or replacing a CSV receipt.

Preparation validates that receipt, then pins its exact bytes, the feature CSV, preparation
code/environment declaration, and the sorted filenames and SHA-256 contents of every matching
`shooting/player_boxscores_*.csv` and `shooting/team_boxscores_*.csv`. It replaces the model CSV
only after those inputs still match and writes `data/fatigue_model_table.csv.provenance.json`
last. Both producers invalidate the previous success receipt before a writing attempt; a failed
attempt preserves the previous CSV but leaves it unusable until a successful rerun.

`fit_fatigue_weights.py`, `four_term_model.py`, `ceiling_test.py`, `availability_cost.py`,
`availability_quality.py`, `availability_facts.py` and `timezone_test.py` validate this chain
at entry, before loading analysis data or writing any output. `ablate_fatigue_terms.py`
validates the feature export it consumes. Missing receipts, changed source/data, and cache
additions, deletions or renames fail with rerun instructions. Existing CSVs cannot be blessed
by adding receipts manually: rerun their actual producers. File hashes are streamed.

These guards establish local content consistency and a successful export fidelity check.
They do not query the database at consumption time or prove that the database/cache is current
or that provider facts are correct. They do not authorize coefficient changes or publication.
Historical reports, preregistrations and evidence receipts remain frozen.
