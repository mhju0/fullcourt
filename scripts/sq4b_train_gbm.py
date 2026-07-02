"""[Shot Quality Model, Phase SQ-4b] Expected Shot Value (xeFG%) — GBM bake-off.

Third and FINAL location-only candidate for ``P(make)``: a gradient-boosted tree
(``sklearn.HistGradientBoostingClassifier``) evaluated against the SQ-4 zone-average
**baseline** and the SQ-4 **logistic regression** under the IDENTICAL walk-forward
protocol. Metrics reports ONLY — no DB, no ``shot_grid`` / ``shot_value_surface``, no
nba_api, no psycopg2/dotenv. Surfacing a winner is SQ-5's job, not this script's.

Protocol identity (the whole point of this phase):
  * The loader, preprocessing, features, per-fold standardization, baseline and logit
    prediction paths, and the metric definitions are IMPORTED verbatim from
    ``scripts/sq4_train_shot_value.py`` — nothing is re-implemented. This script only adds
    ``fit_gbm`` and a single walk-forward loop that scores all THREE models on the SAME
    train/val split, the SAME standardized design matrix ``X`` (``_build_X``), and the SAME
    per-fold TRAIN statistics. Because baseline+logit run through SQ-4's own functions, this
    script RE-DERIVES SQ-4's pooled numbers and hard-fails if they do not reproduce — that
    reproduction is the machine-checked proof the comparison is apples-to-apples.

GBM design (fixed a priori; see the report for rationale):
  * TARGET / FEATURES = IDENTICAL to SQ-4 (distance, angle, is3, period, home). No new
    feature is added, so the only thing that changes between logit and GBM is the model
    family — a fair head-to-head. GBM is scale-invariant, but it is still fed the SAME
    standardized ``_build_X`` output so its inputs are byte-for-byte the logit's inputs.
  * MODEL = HistGradientBoostingClassifier with ONE conservative, frozen hyper-parameter
    set (no per-fold tuning — that would leak val signal and over-engineer a demo). Raw
    ``predict_proba`` (no post-hoc calibration).
  * VALIDATION = expanding-window walk-forward by season, val t = 1997-98 .. 2025-26
    (29 folds), train = every season < t. GBM's ``early_stopping`` validation split is
    carved out of the TRAIN fold only, so it never peeks at the walk-forward val season.

Outputs (all under ml/shot_value/; every digit is re-read from these files, never trusted
from stdout, because the rtk proxy has masked stdout digits before):
    sq4b_metrics.txt        3-model pooled/macro metrics, GBM-vs-baseline + GBM-vs-logit
                            improvement %, verdict, GBM hyper-parameters + rationale, the
                            SQ-4 baseline/logit reproduction ledger, zone-overprediction
                            check, self-checks, and the location-only conclusion.
    sq4b_folds.csv          per (season, model): log_loss, brier, accuracy, n_val, n_train,
                            train span, expected/actual eFG%.
    sq4b_calibration.csv    per (model, season incl. ALL): 10-bin reliability data.
    sq4b_efg_by_zone.csv    per (model, zone): pooled expected vs actual eFG%.
    sq4b_gbm_full.pkl       (optional) GBM + scaler stats trained on ALL loaded seasons, for
                            SQ-5. LOCAL ONLY; nothing DB-related. Suppress with --skip-pickle.

Run from the project root, in the ml venv:
    ./ml/.venv/bin/python scripts/sq4b_train_gbm.py
    ./ml/.venv/bin/python scripts/sq4b_train_gbm.py --max-seasons 4   # fast smoke (PARTIAL)
    ./ml/.venv/bin/python scripts/sq4b_train_gbm.py --skip-pickle
"""

from __future__ import annotations

import argparse
import logging
import pickle
import sys
from pathlib import Path

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier

# Make the sibling SQ-4 module importable regardless of how this file is launched. When run
# as ``python scripts/sq4b_train_gbm.py`` CPython already puts scripts/ on sys.path[0]; this
# insert just makes that explicit and robust.
sys.path.insert(0, str(Path(__file__).resolve().parent))

# --- SQ-4 protocol surface: imported verbatim, NOT re-implemented -----------------------
# Loader / preprocessing / features / per-fold pieces / metrics + the constants that pin the
# "valid shot" set and the SQ-3 reproduction anchors. Signatures are used unchanged.
from sq4_train_shot_value import (  # noqa: E402  (import must follow the sys.path insert)
    load_all,
    _process_file,
    _concat,
    _build_X,
    baseline_predict,
    fit_logit,
    _metrics,
    season_dirs,
    save_full_model,  # (unused here; GBM has its own pickle path) kept for surface parity
    write_folds_csv,
    write_calibration_csv,
    write_efg_by_zone_csv,
    OUT_DIR,
    DATA_DIR,
    CONT_FEATURES,
    HOME_MATCH_MIN,
    N_CAL_BINS,
    EPS,
    CLIP_X_MIN,
    CLIP_X_MAX,
    CLIP_Y_MIN,
    CLIP_Y_MAX,
    THREE_PT_LABEL,
    SHOT_TYPES,
    SQ3_TOTAL_ROWS,
    SQ3_NO_LOCATION,
    SQ3_OUT_OF_GRID,
    SQ3_INCLIP,
    _fmt,
)

logger = logging.getLogger("sq4b_train_gbm")

MODELS = ("baseline", "logit", "gbm")

# The exact SQ-4 pieces this script reuses, referenced once so the "protocol surface" is
# explicit and no import lints as unused. If SQ-4 ever renames one of these, this import list
# fails loudly instead of silently drifting out of protocol identity.
_PROTOCOL_SURFACE = (
    load_all, _process_file, _concat, _build_X, baseline_predict, fit_logit, _metrics,
    season_dirs, save_full_model, write_folds_csv, write_calibration_csv,
    write_efg_by_zone_csv, CONT_FEATURES, HOME_MATCH_MIN, N_CAL_BINS, EPS,
    CLIP_X_MIN, CLIP_X_MAX, CLIP_Y_MIN, CLIP_Y_MAX, THREE_PT_LABEL, SHOT_TYPES,
    SQ3_TOTAL_ROWS, SQ3_NO_LOCATION, SQ3_OUT_OF_GRID, SQ3_INCLIP,
)

# --- GBM hyper-parameters: fixed a priori, frozen across all 29 folds -------------------
# One conservative config, chosen up front and never tuned per fold (per-fold grid search
# would leak val signal and over-fit a portfolio demo). Only these are set explicitly; every
# other HGBC default (max_bins=255, min_samples_leaf=20, n_iter_no_change=10, tol=1e-7,
# scoring='loss') is left at sklearn's default and noted in the report.
GBM_PARAMS = {
    "learning_rate": 0.1,        # conservative shrinkage
    "max_leaf_nodes": 31,        # moderate per-tree capacity
    "max_iter": 200,             # boosting rounds (early stopping may cut short)
    "l2_regularization": 1.0,    # leaf-value shrinkage
    "early_stopping": True,      # monitor a TRAIN-internal holdout
    "validation_fraction": 0.1,  # that holdout = 10% of TRAIN only (no val leakage)
    "random_state": 42,          # deterministic internal split -> reproducible fit
}

# --- SQ-4 reproduction anchors (read 2026-07-02 from ml/shot_value/sq4_metrics.txt) ------
# baseline+logit run through SQ-4's own functions, so this script must reproduce these to the
# 6th decimal. A mismatch means the protocol drifted -> hard fail (no honest bake-off).
SQ4_POOLED = {
    "baseline": {"log_loss": 0.665382, "brier": 0.236276, "accuracy": 0.615914},
    "logit": {"log_loss": 0.669353, "brier": 0.238223, "accuracy": 0.605174},
}
SQ4_TOTAL_VALID = 5922214
SQ4_VAL_SHOT_SUM = 5733836
SQ4_FIRST_FOLD_N_TRAIN = 188378
REPRO_TOL = 1e-6  # identical code path -> equal to 6 dp; tolerance guards float summation

# Zones whose logit blow-ups SQ-4 flagged; the report checks whether GBM tames them.
ZONE_WATCH = [
    ("In The Paint (Non-RA)", "Less Than 8 ft."),
    ("Above the Break 3", "Back Court Shot"),
]


def fit_gbm(X_tr: np.ndarray, y_tr: np.ndarray) -> HistGradientBoostingClassifier:
    """Fit the frozen-hyper-parameter GBM on a fold's TRAIN matrix. New model family only;
    the X it receives is the SAME standardized ``_build_X`` output the logit is fed."""
    clf = HistGradientBoostingClassifier(**GBM_PARAMS)
    clf.fit(X_tr, y_tr)
    return clf


# ======================================================================================
# Walk-forward bake-off: one pass, three models, identical split/X/standardization
# ======================================================================================

def run_bakeoff(seasons: list[str], per_season: dict, per_season_nvalid: dict, vocab: dict,
                vocab_labels: list, gstats: dict, include_home: bool, home_rate: float,
                partial: bool) -> dict:
    """Mirror SQ-4's fold loop exactly, scoring baseline/logit/gbm on the SAME per-fold
    train/val split, mean/std, and design matrix. baseline+logit go through the imported
    SQ-4 functions untouched; gbm is the only new prediction path."""
    vocab_size = len(vocab)
    val_seasons = seasons[1:]  # season 0 (1996-97) is train-only forever
    fold_rows: list[dict] = []
    cal = {m: {} for m in MODELS}
    pooled = {m: {"sum_ll": 0.0, "sum_br": 0.0, "n_correct": 0, "n": 0,
                  "pmin": np.inf, "pmax": -np.inf} for m in MODELS}
    macro = {m: {"ll": [], "br": [], "acc": []} for m in MODELS}
    zone_n = np.zeros(vocab_size, dtype=np.float64)
    zone_actual = np.zeros(vocab_size, dtype=np.float64)
    zone_exp = {m: np.zeros(vocab_size) for m in MODELS}

    features = ["distance", "angle", "period", "is3"] + (["home"] if include_home else [])
    first_fold_train: list[str] = []

    for i, val_season in enumerate(val_seasons, start=1):
        train_names = seasons[:i]
        if i == 1:
            first_fold_train = list(train_names)

        # --- fold TRAIN aggregates (IDENTICAL construction to SQ-4 run()) ---
        z_tr = _concat(per_season, train_names, "zcode")
        made_tr = _concat(per_season, train_names, "made")
        cont_tr = np.column_stack([_concat(per_season, train_names, c)
                                   for c in CONT_FEATURES]).astype(np.float64)
        mean = cont_tr.mean(axis=0)
        std = cont_tr.std(axis=0)
        std = np.where(std < 1e-12, 1.0, std)

        tr_arr = {c: _concat(per_season, train_names, c)
                  for c in ("distance", "angle", "period", "is3", "home")}
        X_tr = _build_X(tr_arr, mean, std, include_home)  # shared by logit AND gbm
        y_tr = made_tr.astype(np.int8)

        val = per_season[val_season]
        z_val = val["zcode"]
        y_val = val["made"].astype(np.int8)
        X_val = _build_X(val, mean, std, include_home)
        w = np.where(val["is3"] == 1, 1.5, 1.0)
        actual_efg = float((val["made"].astype(np.float64) * w).mean())

        # --- three model predictions on the SAME split/X ---
        clf_logit = fit_logit(X_tr, y_tr)     # SQ-4's exact logit path
        clf_gbm = fit_gbm(X_tr, y_tr)         # NEW: only added model
        preds = {
            "baseline": baseline_predict(z_tr, made_tr, z_val, vocab_size),  # SQ-4 path
            "logit": clf_logit.predict_proba(X_val)[:, 1],
            "gbm": clf_gbm.predict_proba(X_val)[:, 1],
        }

        np.add.at(zone_n, z_val, 1.0)
        np.add.at(zone_actual, z_val, val["made"].astype(np.float64) * w)
        span = f"{train_names[0]}..{train_names[-1]}"
        for m in MODELS:
            p = preds[m]
            ll, br, acc = _metrics(y_val, p)
            fold_rows.append({
                "season": val_season, "model": m, "n_val": int(y_val.shape[0]),
                "n_train": int(y_tr.shape[0]), "train_span": span,
                "log_loss": ll, "brier": br, "accuracy": acc,
                "expected_efg": float((p * w).mean()), "actual_efg": actual_efg,
            })
            pc = pooled[m]
            pc["sum_ll"] += ll * y_val.shape[0]
            pc["sum_br"] += br * y_val.shape[0]
            pc["n_correct"] += int(((p >= 0.5).astype(np.int8) == y_val).sum())
            pc["n"] += int(y_val.shape[0])
            pc["pmin"] = min(pc["pmin"], float(p.min()))
            pc["pmax"] = max(pc["pmax"], float(p.max()))
            macro[m]["ll"].append(ll)
            macro[m]["br"].append(br)
            macro[m]["acc"].append(acc)
            np.add.at(zone_exp[m], z_val, p * w)

            bins = np.clip((p * N_CAL_BINS).astype(np.int64), 0, N_CAL_BINS - 1)
            mat = cal[m].setdefault(val_season, np.zeros((3, N_CAL_BINS)))
            mat[0] += np.bincount(bins, minlength=N_CAL_BINS)
            mat[1] += np.bincount(bins, weights=p, minlength=N_CAL_BINS)
            mat[2] += np.bincount(bins, weights=y_val.astype(np.float64), minlength=N_CAL_BINS)
        logger.info("fold %2d/%d val=%s train=%s n_train=%d n_val=%d",
                    i, len(val_seasons), val_season, span, y_tr.shape[0], y_val.shape[0])

    # pooled "ALL" calibration = sum of the per-season reliability matrices
    for m in MODELS:
        allmat = np.zeros((3, N_CAL_BINS))
        for s, mat in cal[m].items():
            if s != "ALL":
                allmat += mat
        cal[m]["ALL"] = allmat

    # ---- aggregate metrics ----
    pooled_out, macro_out = {}, {}
    for m in MODELS:
        pc = pooled[m]
        pooled_out[m] = {
            "log_loss": pc["sum_ll"] / pc["n"], "brier": pc["sum_br"] / pc["n"],
            "accuracy": pc["n_correct"] / pc["n"], "n": pc["n"],
            "pmin": pc["pmin"], "pmax": pc["pmax"],
        }
        macro_out[m] = {
            "log_loss": float(np.mean(macro[m]["ll"])),
            "brier": float(np.mean(macro[m]["br"])),
            "accuracy": float(np.mean(macro[m]["acc"])),
        }

    # ---- self-verification + SQ-4 reproduction ledger ----
    total_valid = gstats["n_valid"]
    sum_nval = sum(per_season_nvalid[s] for s in val_seasons)
    expected_sum_nval = total_valid - per_season_nvalid[seasons[0]]
    checks: list[tuple[str, bool, str]] = []

    ff_ok = first_fold_train == [seasons[0]]
    checks.append(("first_fold_train_is_only_earliest_season", ff_ok,
                   f"fold-1 train = {first_fold_train} (n_train="
                   f"{per_season_nvalid[seasons[0]]}); expected [{seasons[0]}]"))

    nval_ok = sum_nval == expected_sum_nval
    checks.append(("val_shot_count_reconciles_with_total_valid", nval_ok,
                   f"sum(n_val over folds)={sum_nval} == total_valid({total_valid}) - "
                   f"n_valid({seasons[0]})({per_season_nvalid[seasons[0]]}) = {expected_sum_nval}"))

    mono_ok = True
    prev = -1
    for i, val_season in enumerate(val_seasons, start=1):
        n_tr = sum(per_season_nvalid[s] for s in seasons[:i])
        if n_tr <= prev or any(s >= val_season for s in seasons[:i]):
            mono_ok = False
        prev = n_tr
    checks.append(("train_grows_and_precedes_val_every_fold", mono_ok,
                   "n_train strictly increases and every train season < val season"))

    prob_ok = True
    prob_detail = []
    for m in MODELS:
        lo, hi = pooled_out[m]["pmin"], pooled_out[m]["pmax"]
        ok = (lo >= -1e-9) and (hi <= 1.0 + 1e-9)
        prob_ok = prob_ok and ok
        prob_detail.append(f"{m}:[{_fmt(lo)},{_fmt(hi)}]")
    checks.append(("all_P(make)_within_[0,1]", prob_ok, "  ".join(prob_detail)))

    # SQ-4 protocol-identity reproduction ledger: baseline+logit run through SQ-4's own
    # functions, so on a FULL run their pooled numbers must equal the SQ-4 anchors to 6 dp.
    # The ledger is always computed (shown in the report), but only ENFORCED on a full run —
    # the anchors are 30-season pooled values a partial smoke run cannot reproduce.
    repro_rows: list[tuple[str, str, float, float, bool]] = []
    repro_ok = True
    for m in ("baseline", "logit"):
        for metric in ("log_loss", "brier", "accuracy"):
            mine = pooled_out[m][metric]
            ref = SQ4_POOLED[m][metric]
            ok = abs(mine - ref) < REPRO_TOL
            repro_ok = repro_ok and ok
            repro_rows.append((m, metric, mine, ref, ok))

    # first-fold n_train is a season-boundary invariant that holds even on a partial run
    # (1996-97 is always the earliest season and thus fold-1's sole train season).
    first_n_train = per_season_nvalid[seasons[0]]
    ftn_ok = first_n_train == SQ4_FIRST_FOLD_N_TRAIN
    checks.append(("SQ4_first_fold_n_train_reproduced", ftn_ok,
                   f"first-fold n_train={first_n_train} (SQ-4={SQ4_FIRST_FOLD_N_TRAIN})"))

    if not partial:
        checks.append(("SQ4_baseline_logit_pooled_reproduced", repro_ok,
                       "baseline+logit pooled log_loss/brier/accuracy match SQ-4 within "
                       f"{REPRO_TOL}"))
        tv_ok = total_valid == SQ4_TOTAL_VALID
        checks.append(("SQ4_total_valid_reproduced", tv_ok,
                       f"total_valid={total_valid} (SQ-4={SQ4_TOTAL_VALID})"))
        vss_ok = sum_nval == SQ4_VAL_SHOT_SUM
        checks.append(("SQ4_val_shot_sum_reproduced", vss_ok,
                       f"sum(n_val)={sum_nval} (SQ-4={SQ4_VAL_SHOT_SUM})"))

        loc_ok = (gstats["n_no_loc"] == SQ3_NO_LOCATION) and (gstats["n_out"] == SQ3_OUT_OF_GRID)
        checks.append(("SQ3_loc_drops_reproduced", loc_ok,
                       f"no_location={gstats['n_no_loc']} (SQ-3={SQ3_NO_LOCATION}), "
                       f"out_of_grid={gstats['n_out']} (SQ-3={SQ3_OUT_OF_GRID})"))
        raw_ok = gstats["n_raw"] == SQ3_TOTAL_ROWS
        checks.append(("SQ3_total_rows_reproduced", raw_ok,
                       f"n_raw={gstats['n_raw']} (SQ-3={SQ3_TOTAL_ROWS})"))
        inclip_ok = (gstats["n_valid"] + gstats["n_extra_drop"]) == SQ3_INCLIP
        checks.append(("SQ3_inclip_reconciles", inclip_ok,
                       f"valid({gstats['n_valid']}) + extra_drop({gstats['n_extra_drop']}) "
                       f"== SQ-3 in-clip({SQ3_INCLIP})"))
    else:
        checks.append(("SQ3_and_SQ4_pooled_anchor_checks", True,
                       "SKIPPED (partial run — SQ-3 drop anchors and SQ-4 pooled/valid/"
                       "val-shot anchors are only valid on the full 30-season cache)"))

    all_pass = all(ok for _, ok, _ in checks)
    return {
        "fold_rows": fold_rows, "cal": cal, "pooled": pooled_out, "macro": macro_out,
        "zone_n": zone_n, "zone_actual": zone_actual, "zone_exp": zone_exp,
        "features": features, "vocab_size": vocab_size, "repro_rows": repro_rows,
        "checks": checks, "all_pass": all_pass, "total_valid": total_valid,
        "n_folds": len(val_seasons), "fold_first": val_seasons[0], "fold_last": val_seasons[-1],
    }


# ======================================================================================
# Report writer (metrics txt only — folds/cal/zone reuse the SQ-4 writers)
# ======================================================================================

def _improvement(bl: dict, cand: dict) -> tuple[float, float, float, bool, bool]:
    ll_imp = 100.0 * (bl["log_loss"] - cand["log_loss"]) / bl["log_loss"]
    br_imp = 100.0 * (bl["brier"] - cand["brier"]) / bl["brier"]
    acc_delta = 100.0 * (cand["accuracy"] - bl["accuracy"])
    return ll_imp, br_imp, acc_delta, cand["log_loss"] < bl["log_loss"], cand["brier"] < bl["brier"]


def _zone_index(vocab_labels: list, basic: str, rng: str) -> int | None:
    for zi, (b, r) in enumerate(vocab_labels):
        if b == basic and r == rng:
            return zi
    return None


def write_metrics_txt(path: Path, ctx: dict) -> None:
    L: list[str] = []
    a = L.append
    a("# SQ-4b Expected Shot Value (xeFG%) — GBM bake-off (baseline vs logit vs GBM)")
    a(f"run_mode = {ctx['mode']}")
    a(f"seasons loaded = {ctx['n_seasons']}  ({ctx['season_first']} .. {ctx['season_last']})")
    a(f"walk-forward folds (val seasons) = {ctx['n_folds']}  "
      f"({ctx['fold_first']} .. {ctx['fold_last']})")
    a(f"total valid (in-clip) shots loaded = {ctx['total_valid']}")
    a(f"vocab size (SHOT_ZONE_BASIC x SHOT_ZONE_RANGE combos) = {ctx['vocab_size']}")
    a("")
    a("## Configuration (SQ-4-identical except the added GBM)")
    a("  target        = SHOT_MADE_FLAG (0/1) -> P(make)")
    a(f"  features      = {ctx['features']}   (IDENTICAL to SQ-4; no new feature -> fair test)")
    a("  baseline      = empirical make% per SHOT_ZONE_BASIC x SHOT_ZONE_RANGE "
      "(unseen zone -> overall train make%)   [imported from SQ-4]")
    a("  logit         = LogisticRegression(C=1.0, solver='lbfgs', max_iter=1000, "
      "class_weight=None)   [imported from SQ-4]")
    a("  standardize   = distance/angle/period on each fold's TRAIN only (is3/home raw); the")
    a("                  SAME _build_X output is fed to logit AND gbm. GBM is scale-invariant,")
    a("                  so standardization is harmless for it — kept only to make the inputs")
    a("                  byte-identical to the logit's (apples-to-apples).")
    a("  validation    = expanding-window walk-forward by season (train = all seasons < t)")
    a(f"  home feature  = {ctx['home_decision']}  "
      f"(match_rate={_fmt(ctx['home_rate'], 6)}, threshold={HOME_MATCH_MIN})")
    a("")
    a("## GBM hyper-parameters (HistGradientBoostingClassifier; fixed a priori, NO per-fold tuning)")
    for k, v in GBM_PARAMS.items():
        a(f"  {k:<20} = {v}")
    a("  (raw predict_proba — no post-hoc calibration)")
    a("  defaults kept   = max_bins=255, min_samples_leaf=20, n_iter_no_change=10, tol=1e-7, "
      "scoring='loss', max_depth=None")
    a("  RATIONALE: one conservative config chosen up front and frozen across all 29 folds.")
    a("    No fold-wise grid search — that would leak val signal into model selection and")
    a("    over-engineer a portfolio demo. early_stopping's validation_fraction is carved out")
    a("    of the TRAIN fold ONLY, so the walk-forward val season is never touched during fit.")
    a("")
    a("## Overall metrics — POOLED (shot-weighted over all val shots)  [PRIMARY]")
    a(f"  {'model':<10} {'log_loss':>12} {'brier':>12} {'accuracy':>12} {'n_val':>12}")
    for m in MODELS:
        p = ctx["pooled"][m]
        a(f"  {m:<10} {_fmt(p['log_loss']):>12} {_fmt(p['brier']):>12} "
          f"{_fmt(p['accuracy']):>12} {p['n']:>12}")
    a("")
    a("## Overall metrics — MACRO (unweighted mean of per-season folds)  [secondary]")
    a(f"  {'model':<10} {'log_loss':>12} {'brier':>12} {'accuracy':>12}")
    for m in MODELS:
        mm = ctx["macro"][m]
        a(f"  {m:<10} {_fmt(mm['log_loss']):>12} {_fmt(mm['brier']):>12} "
          f"{_fmt(mm['accuracy']):>12}")
    a("")
    bl = ctx["pooled"]["baseline"]
    lo = ctx["pooled"]["logit"]
    gb = ctx["pooled"]["gbm"]
    a("## GBM vs baseline (pooled; positive % = GBM better, lower error)  [THE headline]")
    ll_imp, br_imp, acc_delta, won_ll, won_br = _improvement(bl, gb)
    a(f"  log_loss improvement = {_fmt(ll_imp, 4)} %   "
      f"({_fmt(bl['log_loss'])} -> {_fmt(gb['log_loss'])})")
    a(f"  brier    improvement = {_fmt(br_imp, 4)} %   "
      f"({_fmt(bl['brier'])} -> {_fmt(gb['brier'])})")
    a(f"  accuracy delta       = {_fmt(acc_delta, 4)} pp")
    verdict = ("GBM BEATS baseline on both log-loss and Brier" if (won_ll and won_br)
               else "GBM beats baseline on log-loss only" if won_ll
               else "GBM beats baseline on Brier only" if won_br
               else "GBM does NOT beat baseline on the primary metrics")
    a(f"  VERDICT: {verdict}.")
    a("")
    a("## GBM vs logit (pooled; positive % = GBM better)  [for context]")
    ll_i2, br_i2, acc_d2, _, _ = _improvement(lo, gb)
    a(f"  log_loss improvement = {_fmt(ll_i2, 4)} %   "
      f"({_fmt(lo['log_loss'])} -> {_fmt(gb['log_loss'])})")
    a(f"  brier    improvement = {_fmt(br_i2, 4)} %   "
      f"({_fmt(lo['brier'])} -> {_fmt(gb['brier'])})")
    a(f"  accuracy delta       = {_fmt(acc_d2, 4)} pp")
    a("")
    a("## SQ-4 protocol-identity reproduction (baseline+logit run through SQ-4's own functions)")
    a("  These MUST reproduce ml/shot_value/sq4_metrics.txt to the 6th decimal, or the")
    a("  comparison is not apples-to-apples and the run hard-fails.")
    a(f"  {'model':<10} {'metric':<10} {'sq4b':>12} {'sq4':>12} {'match':>8}")
    for m, metric, mine, ref, ok in ctx["repro_rows"]:
        a(f"  {m:<10} {metric:<10} {_fmt(mine):>12} {_fmt(ref):>12} "
          f"{('MATCH' if ok else 'DIFF'):>8}")
    a("")
    a("## Zone-overprediction check (does GBM tame the logit blow-ups SQ-4 flagged?)")
    a(f"  {'zone':<38} {'actual':>10} {'baseline':>10} {'logit':>10} {'gbm':>10} {'n_val':>10}")
    for basic, rng in ZONE_WATCH:
        zi = _zone_index(ctx["vocab_labels"], basic, rng)
        label = f"{basic} | {rng}"
        if zi is None or ctx["zone_n"][zi] <= 0:
            a(f"  {label:<38} {'(zone not found / empty)':>52}")
            continue
        n = ctx["zone_n"][zi]
        act = ctx["zone_actual"][zi] / n
        row = [ctx["zone_exp"][m][zi] / n for m in MODELS]
        a(f"  {label:<38} {_fmt(act):>10} {_fmt(row[0]):>10} {_fmt(row[1]):>10} "
          f"{_fmt(row[2]):>10} {int(n):>10}")
    a("  (baseline is a step-function fit exactly to zone rates; the question is whether GBM's")
    a("   smooth non-linear distance x angle surface lands closer to actual than the logit did.)")
    a("")
    a("## Self-verification (walk-forward integrity / leakage guards / SQ-4 reproduction)")
    for name, ok, detail in ctx["checks"]:
        a(f"  [{'PASS' if ok else 'FAIL'}] {name}: {detail}")
    a("")
    a("## Leakage guards (asserted by construction)")
    a("  - features are strictly per-shot: no outcome-derived and no future information.")
    a("  - NO player-season aggregates (nothing peeks at a shooter's full-season form).")
    a("  - baseline zone rates AND standardization stats come from each fold's TRAIN only.")
    a("  - GBM is fit on the TRAIN fold only; early_stopping's holdout is a split OF the train")
    a("    fold, never the walk-forward val season.")
    a("  - folds split on season boundaries only; train seasons are always strictly < val.")
    a("")
    a("## Conclusion — location-only signal")
    if won_ll and won_br:
        a("  GBM beats the zone-average baseline on both primary metrics: a non-linear tree")
        a("  extracts calibration the 9-cell step-function misses. GBM is the location-only")
        a("  ceiling and the candidate SQ-5 should surface. Location signal is NOT yet exhausted")
        a("  at the zone level.")
    else:
        a("  Even a non-linear gradient-boosted tree on the SAME 5 location features CANNOT beat")
        a("  the zone-average baseline on the primary metrics. This is the third and final")
        a("  location-only candidate (baseline, logit, GBM); the location-only signal is")
        a("  EXHAUSTED at the zone level — SHOT_ZONE_BASIC x SHOT_ZONE_RANGE already captures")
        a("  essentially all the make-probability structure available from position alone.")
        a("  SQ-5 should surface the zone baseline as xeFG%. Per scope: NO SQ-4c / no further")
        a("  location-only model.")
    a("  Follow-up candidate (OUT of SQ-4b scope): the only way past this ceiling is NEW signal")
    a("  — ACTION_TYPE bucket, shooter identity, or rolling recency — none of which is a")
    a("  location-only feature; defender distance / shot clock are absent from public nba_api.")
    a("")
    a(f"OVERALL = {'PASS' if ctx['all_pass'] else 'FAIL'}")
    path.write_text("\n".join(L) + "\n")
    logger.info("wrote %s", path)


def save_full_gbm(path: Path, seasons: list[str], per_season: dict, vocab: dict,
                  vocab_labels: list, include_home: bool) -> None:
    """Train the GBM on ALL loaded seasons and pickle it LOCALLY for SQ-5. Touches no DB and
    no model_version column (that belongs to SQ-5). Standardization stats are stored so SQ-5
    can reproduce the exact input transform, even though the tree is scale-invariant."""
    z = _concat(per_season, seasons, "zcode")  # noqa: F841 (kept for payload parity/debug)
    made = _concat(per_season, seasons, "made")
    cont = np.column_stack([_concat(per_season, seasons, c)
                            for c in CONT_FEATURES]).astype(np.float64)
    mean = cont.mean(axis=0)
    std = np.where(cont.std(axis=0) < 1e-12, 1.0, cont.std(axis=0))
    arr = {c: _concat(per_season, seasons, c)
           for c in ("distance", "angle", "period", "is3", "home")}
    X = _build_X(arr, mean, std, include_home)
    clf = fit_gbm(X, made.astype(np.int8))
    payload = {
        "note": "SQ-4b local artifact; NOT a DB surface (SQ-5 owns model_version + writes).",
        "model_type": "HistGradientBoostingClassifier",
        "gbm_params": dict(GBM_PARAMS),
        "trained_seasons": list(seasons),
        "features": ["distance", "angle", "period", "is3"] + (["home"] if include_home else []),
        "cont_features": list(CONT_FEATURES),
        "scaler_mean": mean, "scaler_std": std,
        "gbm": clf,
        "zone_labels": list(vocab_labels),
    }
    with open(path, "wb") as f:
        pickle.dump(payload, f)
    logger.info("wrote %s (GBM trained on all %d loaded seasons)", path, len(seasons))


def main() -> int:
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    ap = argparse.ArgumentParser(description="SQ-4b GBM Expected Shot Value bake-off.")
    ap.add_argument("--max-seasons", type=int, default=None,
                    help="load only the first N seasons (fast smoke run; marks reports PARTIAL)")
    ap.add_argument("--skip-pickle", action="store_true",
                    help="do not write the local full-data GBM pickle")
    args = ap.parse_args()

    if not DATA_DIR.exists():
        logger.error("shot cache dir not found: %s", DATA_DIR)
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    seasons = season_dirs(args.max_seasons)
    if len(seasons) < 2:
        logger.error("need >= 2 seasons for walk-forward; found %d", len(seasons))
        return 1
    partial = args.max_seasons is not None
    logger.info("seasons: %s .. %s (%d)%s", seasons[0], seasons[-1], len(seasons),
                "  [PARTIAL smoke run]" if partial else "")

    per_season, per_season_nvalid, vocab, vocab_labels, gstats = load_all(seasons)

    home_rate = (gstats["home_matched"] / gstats["n_valid"]) if gstats["n_valid"] else 0.0
    include_home = home_rate >= HOME_MATCH_MIN
    home_decision = ("INCLUDED" if include_home
                     else f"EXCLUDED (match_rate {home_rate:.4f} < {HOME_MATCH_MIN})")
    logger.info("home feature: %s (match_rate=%.6f)", home_decision, home_rate)

    res = run_bakeoff(seasons, per_season, per_season_nvalid, vocab, vocab_labels, gstats,
                      include_home, home_rate, partial)

    write_folds_csv(OUT_DIR / "sq4b_folds.csv", res["fold_rows"])
    write_calibration_csv(OUT_DIR / "sq4b_calibration.csv", res["cal"])
    write_efg_by_zone_csv(OUT_DIR / "sq4b_efg_by_zone.csv", vocab_labels,
                          res["zone_n"], res["zone_actual"], res["zone_exp"])
    write_metrics_txt(OUT_DIR / "sq4b_metrics.txt", {
        "mode": "PARTIAL" if partial else "FULL",
        "n_seasons": len(seasons), "season_first": seasons[0], "season_last": seasons[-1],
        "n_folds": res["n_folds"], "fold_first": res["fold_first"],
        "fold_last": res["fold_last"], "total_valid": res["total_valid"],
        "vocab_size": res["vocab_size"], "features": res["features"],
        "home_decision": home_decision, "home_rate": home_rate,
        "pooled": res["pooled"], "macro": res["macro"],
        "repro_rows": res["repro_rows"], "vocab_labels": vocab_labels,
        "zone_n": res["zone_n"], "zone_actual": res["zone_actual"], "zone_exp": res["zone_exp"],
        "checks": res["checks"], "all_pass": res["all_pass"],
    })

    if not args.skip_pickle:
        save_full_gbm(OUT_DIR / "sq4b_gbm_full.pkl", seasons, per_season, vocab,
                      vocab_labels, include_home)

    if not res["all_pass"]:
        logger.error("SELF-CHECK FAILURES — see %s", OUT_DIR / "sq4b_metrics.txt")
        return 1
    logger.info("SQ-4b complete; all self-checks PASS. Reports in %s", OUT_DIR)
    return 0


if __name__ == "__main__":
    sys.exit(main())
