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
