"""[Shot Quality Model, Phase SQ-4] Expected Shot Value (xeFG%) — TRAIN & EVALUATE.

Fits and walk-forward-evaluates a location-based ``P(make)`` model on the LOCAL per-shot
cache (``ml/data/shots/{season}/{team_abbr}.csv.gz``). It compares a zone-average
**baseline** against a **logistic regression** and writes metrics reports ONLY. It never
connects to Postgres, never writes ``shot_grid`` / ``shot_value_surface``, and never calls
nba_api. The DB surface is a later phase (SQ-5); this step produces the honest bake-off
that SQ-5 depends on.

Design (fixed by the SQ-4 spec; see docs/SHOT_QUALITY_DESIGN.md §4):
  * TARGET  = SHOT_MADE_FLAG (0/1) -> P(make).
  * FEATURES (available fields only; NO tracking, NO player identity):
      - distance = SHOT_DISTANCE (ft), cross-checked against sqrt(LOC_X^2+LOC_Y^2)/10.
      - angle    = arctan2(|LOC_X|, LOC_Y) radians (0 = straight-on, ~pi/2 = corner).
                   |LOC_X| folds left/right onto one angle (the stored SQ-3 grid is
                   unfolded; the MODEL folds so mirror-image shots share an angle).
      - is3      = SHOT_TYPE == '3PT Field Goal'.
      - period   = PERIOD (treated as an ordinal continuous feature).
      - home     = the shooting team is the home team, derived per file from HTM/VTM vs
                   the team's own abbreviation (relocation-safe; INCLUDED only if the
                   global match rate clears HOME_MATCH_MIN, else dropped + logged).
    Continuous features (distance, angle, period) are standardized with the FOLD'S TRAIN
    statistics only (no leakage); is3/home stay raw 0/1.
  * MODELS (2 only; GBM/player/rolling variants are out of scope -> SQ-4b):
      1. baseline = empirical make% per SHOT_ZONE_BASIC x SHOT_ZONE_RANGE over the train
         pool; a val shot gets its zone's train make%, unseen zones get the overall train
         make%.
      2. logit    = sklearn LogisticRegression(penalty='l2', C=1.0, solver='lbfgs',
                    class_weight=None).
  * VALIDATION = expanding-window walk-forward by season: for val season t, train = every
    season < t. t = 1997-98 .. 2025-26 (29 folds). Split on SEASON boundaries only (a
    random split would leak the post-2015 3-point-revolution shot mix into a "1990s" fit).
  * METRICS (primary = log-loss, Brier): per-fold + pooled (shot-weighted) + macro
    (per-season mean); accuracy is secondary. Plus a reliability (calibration) curve and
    expected-vs-actual eFG% by season and by zone, where
        expected eFG% = mean over val shots of P(make) * (1.5 if is3 else 1.0)
        actual  eFG%  = (FGM + 0.5*FG3M) / FGA  == mean of made * (1.5 if is3 else 1.0).

Outputs (all under ml/shot_value/; digits are re-read from these files, never trusted from
stdout, because the rtk proxy has masked stdout digits before):
    sq4_metrics.txt        overall pooled/macro metrics, logit-vs-baseline improvement %,
                           verdict, home-feature decision, distance cross-check, self-checks.
    sq4_folds.csv          per (season, model): log_loss, brier, accuracy, n_val, n_train,
                           train span, expected/actual eFG%.
    sq4_calibration.csv    per (model, season incl. ALL): 10-bin reliability data.
    sq4_efg_by_zone.csv    per (model, zone): pooled expected vs actual eFG%.
    sq4_logit_full.pkl     (optional) logit + scaler stats + baseline zone table trained on
                           ALL seasons, for SQ-5. LOCAL ONLY; nothing DB-related.

Run from the project root, in the ml venv:
    ./ml/.venv/bin/python scripts/sq4_train_shot_value.py
    ./ml/.venv/bin/python scripts/sq4_train_shot_value.py --max-seasons 4   # fast smoke (PARTIAL)
    ./ml/.venv/bin/python scripts/sq4_train_shot_value.py --skip-pickle
"""

from __future__ import annotations

import argparse
import logging
import pickle
import re
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, brier_score_loss, log_loss

logger = logging.getLogger("sq4_train_shot_value")

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "ml" / "data" / "shots"
OUT_DIR = REPO_ROOT / "ml" / "shot_value"

SEASON_RE = re.compile(r"^\d{4}-\d{2}$")

# Half-court clip in 1/10 ft — IDENTICAL to SQ-3 (scripts/aggregate_shot_grid.py) so the
# "valid shot" set matches the grid exactly (a cross-module consistency anchor).
CLIP_X_MIN, CLIP_X_MAX = -250, 250
CLIP_Y_MIN, CLIP_Y_MAX = -50, 420
THREE_PT_LABEL = "3PT Field Goal"
SHOT_TYPES = ("2PT Field Goal", "3PT Field Goal")

# SQ-3 verified anchors (ml/data/shots/_grid_probe.txt, read 2026-07-02). Used as hard
# consistency checks on a FULL run: the LOC-based drops here must reproduce SQ-3's exactly.
SQ3_TOTAL_ROWS = 5934239
SQ3_NO_LOCATION = 547
SQ3_OUT_OF_GRID = 11477
SQ3_INCLIP = SQ3_TOTAL_ROWS - SQ3_NO_LOCATION - SQ3_OUT_OF_GRID  # 5,922,215

NEEDED_COLUMNS = [
    "LOC_X", "LOC_Y", "SHOT_DISTANCE", "SHOT_TYPE",
    "SHOT_ZONE_BASIC", "SHOT_ZONE_RANGE", "SHOT_MADE_FLAG", "PERIOD", "HTM", "VTM",
]
CONT_FEATURES = ["distance", "angle", "period"]  # standardized per fold
HOME_MATCH_MIN = 0.995  # include the home feature only if this share of shots resolve cleanly
N_CAL_BINS = 10
EPS = 1e-15  # log-loss clip (baseline zone rates can be exactly 0 or 1 in tiny zones)


# ======================================================================================
# Step 1: load + preprocess the local per-shot cache (streamed one file at a time)
# ======================================================================================

def _zero_dc() -> dict:
    return {"n": 0, "sum_d": 0.0, "sum_s": 0.0, "sum_d2": 0.0, "sum_s2": 0.0,
            "sum_ds": 0.0, "sum_absdiff": 0.0, "n_big": 0}


def _acc_dc(dst: dict, src: dict) -> None:
    for k in dst:
        dst[k] += src[k]


def season_dirs(max_seasons: int | None) -> list[str]:
    dirs = sorted(
        (p.name for p in DATA_DIR.iterdir() if p.is_dir() and SEASON_RE.match(p.name))
    )
    if max_seasons is not None:
        dirs = dirs[:max_seasons]
    return dirs


def _process_file(path: Path, vocab: dict, vocab_labels: list) -> tuple[dict | None, dict]:
    """Read one team-season file into compact feature arrays for its in-clip valid shots.

    Returns (arrays | None, stats). ``arrays`` is None when the file has no valid rows.
    Mutates ``vocab`` (SHOT_ZONE_BASIC||SHOT_ZONE_RANGE -> int code) and ``vocab_labels``.
    """
    df = pd.read_csv(path, usecols=NEEDED_COLUMNS)
    n_raw = len(df)
    st = {"n_raw": n_raw, "n_no_loc": 0, "n_out": 0, "n_valid": 0,
          "n_extra_drop": 0, "home_matched": 0, "dc": _zero_dc()}
    if n_raw == 0:
        return None, st

    x = pd.to_numeric(df["LOC_X"], errors="coerce")
    y = pd.to_numeric(df["LOC_Y"], errors="coerce")
    loc_ok = x.notna() & y.notna()
    inx = (x >= CLIP_X_MIN) & (x < CLIP_X_MAX)
    iny = (y >= CLIP_Y_MIN) & (y < CLIP_Y_MAX)
    inclip = loc_ok & inx & iny
    st["n_no_loc"] = int((~loc_ok).sum())
    st["n_out"] = int((loc_ok & ~(inx & iny)).sum())

    made = pd.to_numeric(df["SHOT_MADE_FLAG"], errors="coerce")
    dist = pd.to_numeric(df["SHOT_DISTANCE"], errors="coerce")
    period = pd.to_numeric(df["PERIOD"], errors="coerce")
    stype = df["SHOT_TYPE"]
    extra_ok = made.isin([0, 1]) & dist.notna() & period.notna() & stype.isin(SHOT_TYPES)
    keep = inclip & extra_ok
    st["n_extra_drop"] = int((inclip & ~extra_ok).sum())
    n_valid = int(keep.sum())
    st["n_valid"] = n_valid
    if n_valid == 0:
        return None, st

    k = keep.to_numpy()
    xk = x.to_numpy()[k].astype(np.float64)
    yk = y.to_numpy()[k].astype(np.float64)
    distk = dist.to_numpy()[k].astype(np.float32)
    periodk = period.to_numpy()[k].astype(np.float32)
    madek = made.to_numpy()[k].astype(np.int8)
    is3k = (stype.to_numpy()[k] == THREE_PT_LABEL).astype(np.int8)
    anglek = np.arctan2(np.abs(xk), yk).astype(np.float32)
    loc_distk = np.sqrt(xk * xk + yk * yk) / 10.0

    # home/away: the shooting team's own abbreviation is the value present in HTM|VTM of
    # EVERY row (the team plays every game in its file); opponents appear fewer times. This
    # is derived from the data, so franchise relocations/abbrev changes don't break it.
    combined = pd.concat([df["HTM"], df["VTM"]], ignore_index=True).dropna()
    own = combined.value_counts().idxmax() if len(combined) else None
    htm_k = df["HTM"].to_numpy()[k]
    vtm_k = df["VTM"].to_numpy()[k]
    if own is not None:
        homek = (htm_k == own).astype(np.int8)
        st["home_matched"] = int(((htm_k == own) | (vtm_k == own)).sum())
    else:
        homek = np.zeros(n_valid, dtype=np.int8)

    # zone code = SHOT_ZONE_BASIC || SHOT_ZONE_RANGE, factorized into a global vocabulary.
    zb = pd.Series(df["SHOT_ZONE_BASIC"].to_numpy()[k]).astype(str)
    zr = pd.Series(df["SHOT_ZONE_RANGE"].to_numpy()[k]).astype(str)
    combo = zb + "||" + zr
    for cval in combo.unique():
        if cval not in vocab:
            vocab[cval] = len(vocab)
            b, r = cval.split("||", 1)
            vocab_labels.append((b, r))
    codes = combo.map(vocab).to_numpy(dtype=np.int32)

    for nm, arr in (("distance", distk), ("angle", anglek), ("period", periodk)):
        if not np.isfinite(arr).all():
            raise ValueError(f"non-finite values in feature {nm!r} from {path}")

    diff = distk.astype(np.float64) - loc_distk
    st["dc"] = {
        "n": n_valid,
        "sum_d": float(loc_distk.sum()),
        "sum_s": float(distk.astype(np.float64).sum()),
        "sum_d2": float((loc_distk * loc_distk).sum()),
        "sum_s2": float((distk.astype(np.float64) ** 2).sum()),
        "sum_ds": float((loc_distk * distk.astype(np.float64)).sum()),
        "sum_absdiff": float(np.abs(diff).sum()),
        "n_big": int((np.abs(diff) > 3.0).sum()),
    }
    arrays = {"distance": distk, "angle": anglek, "period": periodk,
              "is3": is3k, "home": homek, "made": madek, "zcode": codes}
    return arrays, st


def load_all(seasons: list[str]) -> tuple[dict, dict, dict, list, dict]:
    """Load every season into per-season compact arrays. Returns
    (per_season_arrays, per_season_nvalid, vocab, vocab_labels, global_stats)."""
    vocab: dict[str, int] = {}
    vocab_labels: list[tuple[str, str]] = []
    gstats = {"n_raw": 0, "n_no_loc": 0, "n_out": 0, "n_valid": 0,
              "n_extra_drop": 0, "home_matched": 0, "dc": _zero_dc()}
    per_season: dict[str, dict] = {}
    per_season_nvalid: dict[str, int] = {}
    keys = ("distance", "angle", "period", "is3", "home", "made", "zcode")

    for season in seasons:
        parts = {kk: [] for kk in keys}
        for f in sorted((DATA_DIR / season).glob("*.csv.gz")):
            arrays, st = _process_file(f, vocab, vocab_labels)
            gstats["n_raw"] += st["n_raw"]
            gstats["n_no_loc"] += st["n_no_loc"]
            gstats["n_out"] += st["n_out"]
            gstats["n_valid"] += st["n_valid"]
            gstats["n_extra_drop"] += st["n_extra_drop"]
            gstats["home_matched"] += st["home_matched"]
            _acc_dc(gstats["dc"], st["dc"])
            if arrays is not None:
                for kk in keys:
                    parts[kk].append(arrays[kk])
        if parts["made"]:
            per_season[season] = {kk: np.concatenate(parts[kk]) for kk in keys}
        else:
            dt = {"distance": np.float32, "angle": np.float32, "period": np.float32,
                  "is3": np.int8, "home": np.int8, "made": np.int8, "zcode": np.int32}
            per_season[season] = {kk: np.array([], dtype=dt[kk]) for kk in keys}
        per_season_nvalid[season] = int(per_season[season]["made"].shape[0])
        logger.info("loaded %s: valid=%d cumulative_valid=%d",
                    season, per_season_nvalid[season], gstats["n_valid"])
    return per_season, per_season_nvalid, vocab, vocab_labels, gstats


# ======================================================================================
# Step 2: walk-forward fit + predict
# ======================================================================================

def _concat(per_season: dict, names: list[str], key: str) -> np.ndarray:
    return np.concatenate([per_season[s][key] for s in names])


def _standardize(cont: np.ndarray, mean: np.ndarray, std: np.ndarray) -> np.ndarray:
    return (cont - mean) / std


def _build_X(arr: dict, mean: np.ndarray, std: np.ndarray, include_home: bool) -> np.ndarray:
    cont = np.column_stack([arr["distance"], arr["angle"], arr["period"]]).astype(np.float64)
    cont = _standardize(cont, mean, std)
    bins = [arr["is3"].astype(np.float64)]
    if include_home:
        bins.append(arr["home"].astype(np.float64))
    return np.hstack([cont, np.column_stack(bins)])


def baseline_predict(z_tr: np.ndarray, made_tr: np.ndarray, z_val: np.ndarray,
                     vocab_size: int) -> np.ndarray:
    """Empirical zone make-rate from train; unseen zones -> overall train make-rate."""
    attempts = np.bincount(z_tr, minlength=vocab_size).astype(np.float64)
    makes = np.bincount(z_tr, weights=made_tr.astype(np.float64),
                        minlength=vocab_size).astype(np.float64)
    global_rate = float(made_tr.mean())
    rate = np.divide(makes, attempts, out=np.full(vocab_size, global_rate),
                     where=attempts > 0)
    return rate[z_val]


def fit_logit(X_tr: np.ndarray, y_tr: np.ndarray) -> LogisticRegression:
    # Default penalty is L2 (C=1.0); we leave `penalty` unset because sklearn 1.8 deprecated
    # passing it explicitly. So this is L2-regularized, C=1.0, no class weighting.
    clf = LogisticRegression(C=1.0, solver="lbfgs", max_iter=1000, class_weight=None)
    clf.fit(X_tr, y_tr)
    return clf


def _metrics(y: np.ndarray, p: np.ndarray) -> tuple[float, float, float]:
    pc = np.clip(p, EPS, 1.0 - EPS)
    ll = float(log_loss(y, pc, labels=[0, 1]))
    br = float(brier_score_loss(y, p))
    acc = float(accuracy_score(y, (p >= 0.5).astype(np.int8)))
    return ll, br, acc


# ======================================================================================
# Report writers
# ======================================================================================

def _fmt(v: float, nd: int = 6) -> str:
    return f"{v:.{nd}f}"


def write_folds_csv(path: Path, fold_rows: list[dict]) -> None:
    header = ("season,model,n_val,n_train,train_span,log_loss,brier,accuracy,"
              "expected_efg,actual_efg\n")
    lines = [header]
    for r in fold_rows:
        lines.append(
            f"{r['season']},{r['model']},{r['n_val']},{r['n_train']},{r['train_span']},"
            f"{_fmt(r['log_loss'])},{_fmt(r['brier'])},{_fmt(r['accuracy'])},"
            f"{_fmt(r['expected_efg'])},{_fmt(r['actual_efg'])}\n"
        )
    path.write_text("".join(lines))
    logger.info("wrote %s (%d fold rows)", path, len(fold_rows))


def write_calibration_csv(path: Path, cal: dict) -> None:
    """cal[model][season] = float array (3, N_CAL_BINS): rows count / sum_pred / sum_obs."""
    lines = ["model,season,bin_lo,bin_hi,pred_mean,obs_rate,count\n"]
    for model in sorted(cal):
        for season in sorted(cal[model], key=lambda s: (s != "ALL", s)):
            mat = cal[model][season]
            for b in range(N_CAL_BINS):
                cnt = mat[0, b]
                lo, hi = b / N_CAL_BINS, (b + 1) / N_CAL_BINS
                if cnt > 0:
                    pm = mat[1, b] / cnt
                    obs = mat[2, b] / cnt
                    lines.append(f"{model},{season},{lo:.1f},{hi:.1f},"
                                 f"{_fmt(pm)},{_fmt(obs)},{int(cnt)}\n")
                else:
                    lines.append(f"{model},{season},{lo:.1f},{hi:.1f},,,0\n")
    path.write_text("".join(lines))
    logger.info("wrote %s", path)


def write_efg_by_zone_csv(path: Path, vocab_labels: list, zone_n: np.ndarray,
                          zone_actual: np.ndarray, zone_exp: dict) -> None:
    lines = ["model,zone_basic,zone_range,n_val,expected_efg,actual_efg\n"]
    order = np.argsort(-zone_n)  # busiest zones first
    for model in sorted(zone_exp):
        for zi in order:
            n = zone_n[zi]
            if n <= 0:
                continue
            b, r = vocab_labels[zi]
            exp = zone_exp[model][zi] / n
            act = zone_actual[zi] / n
            lines.append(f"{model},{b},{r},{int(n)},{_fmt(exp)},{_fmt(act)}\n")
    path.write_text("".join(lines))
    logger.info("wrote %s", path)


def write_metrics_txt(path: Path, ctx: dict) -> None:
    L: list[str] = []
    a = L.append
    a("# SQ-4 Expected Shot Value (xeFG%) — model bake-off metrics")
    a(f"run_mode = {ctx['mode']}")
    a(f"seasons loaded = {ctx['n_seasons']}  ({ctx['season_first']} .. {ctx['season_last']})")
    a(f"walk-forward folds (val seasons) = {ctx['n_folds']}  "
      f"({ctx['fold_first']} .. {ctx['fold_last']})")
    a(f"total valid (in-clip) shots loaded = {ctx['total_valid']}")
    a(f"vocab size (SHOT_ZONE_BASIC x SHOT_ZONE_RANGE combos) = {ctx['vocab_size']}")
    a("")
    a("## Configuration")
    a("  target        = SHOT_MADE_FLAG (0/1) -> P(make)")
    a(f"  features      = {ctx['features']}")
    a("  logit         = LogisticRegression(penalty='l2', C=1.0, solver='lbfgs', "
      "max_iter=1000, class_weight=None)")
    a("  baseline      = empirical make% per SHOT_ZONE_BASIC x SHOT_ZONE_RANGE "
      "(unseen zone -> overall train make%)")
    a("  standardize   = distance/angle/period, fit on each fold's TRAIN only "
      "(is3/home left raw 0/1)")
    a("  validation    = expanding-window walk-forward by season (train = all seasons < t)")
    a(f"  home feature  = {ctx['home_decision']}  "
      f"(match_rate={_fmt(ctx['home_rate'], 6)}, threshold={HOME_MATCH_MIN})")
    a("")
    a("## Overall metrics — POOLED (shot-weighted over all val shots)  [PRIMARY]")
    a(f"  {'model':<10} {'log_loss':>12} {'brier':>12} {'accuracy':>12} {'n_val':>12}")
    for m in ("baseline", "logit"):
        p = ctx["pooled"][m]
        a(f"  {m:<10} {_fmt(p['log_loss']):>12} {_fmt(p['brier']):>12} "
          f"{_fmt(p['accuracy']):>12} {p['n']:>12}")
    a("")
    a("## Overall metrics — MACRO (unweighted mean of per-season folds)  [secondary]")
    a(f"  {'model':<10} {'log_loss':>12} {'brier':>12} {'accuracy':>12}")
    for m in ("baseline", "logit"):
        mm = ctx["macro"][m]
        a(f"  {m:<10} {_fmt(mm['log_loss']):>12} {_fmt(mm['brier']):>12} "
          f"{_fmt(mm['accuracy']):>12}")
    a("")
    a("## logit vs baseline (pooled; positive % = logit better, lower error)")
    bl, lo = ctx["pooled"]["baseline"], ctx["pooled"]["logit"]
    ll_imp = 100.0 * (bl["log_loss"] - lo["log_loss"]) / bl["log_loss"]
    br_imp = 100.0 * (bl["brier"] - lo["brier"]) / bl["brier"]
    a(f"  log_loss improvement = {_fmt(ll_imp, 4)} %   "
      f"({_fmt(bl['log_loss'])} -> {_fmt(lo['log_loss'])})")
    a(f"  brier    improvement = {_fmt(br_imp, 4)} %   "
      f"({_fmt(bl['brier'])} -> {_fmt(lo['brier'])})")
    a(f"  accuracy delta       = {_fmt(100.0 * (lo['accuracy'] - bl['accuracy']), 4)} pp")
    won_ll = lo["log_loss"] < bl["log_loss"]
    won_br = lo["brier"] < bl["brier"]
    verdict = ("logit BEATS baseline on both log-loss and Brier" if (won_ll and won_br)
               else "logit beats baseline on log-loss only" if won_ll
               else "logit beats baseline on Brier only" if won_br
               else "logit does NOT beat baseline on the primary metrics")
    a(f"  VERDICT: {verdict}.")
    a("  (Honest framing per SHOT_QUALITY_DESIGN.md: the bar is calibration, not accuracy —")
    a("   a single make/miss is near a coin flip within any zone, so log-loss/Brier is the")
    a("   test, and a logit's win is a finer-resolution calibration win, not a big-accuracy one.)")
    a("")
    a("## Distance cross-check (SHOT_DISTANCE vs sqrt(LOC_X^2+LOC_Y^2)/10, over valid shots)")
    dc = ctx["dc"]
    a(f"  n = {dc['n']}")
    a(f"  mean|diff| = {_fmt(dc['mean_abs'])} ft   share |diff|>3ft = {_fmt(dc['frac_big'])}")
    a(f"  pearson r  = {_fmt(dc['r'])}")
    a(f"  assessment = {dc['assessment']}")
    a("")
    a("## Self-verification (walk-forward integrity / leakage guards)")
    for name, ok, detail in ctx["checks"]:
        a(f"  [{'PASS' if ok else 'FAIL'}] {name}: {detail}")
    a("")
    a("## Leakage guards (asserted by construction)")
    a("  - features are strictly per-shot: no outcome-derived and no future information.")
    a("  - NO player-season aggregates (nothing peeks at a shooter's full-season form).")
    a("  - baseline zone rates AND standardization stats come from each fold's TRAIN only.")
    a("  - folds split on season boundaries only; train seasons are always strictly < val.")
    a("")
    a("## Follow-up candidates (out of SQ-4 scope)")
    a("  - SQ-4b: gradient-boosted P(make) on the same features (non-linear dist x angle).")
    a("  - optional: ACTION_TYPE bucket, player identity, rolling-window recency — all deferred.")
    a("")
    a(f"OVERALL = {'PASS' if ctx['all_pass'] else 'FAIL'}")
    path.write_text("\n".join(L) + "\n")
    logger.info("wrote %s", path)


# ======================================================================================
# Orchestration
# ======================================================================================

def run(seasons: list[str], per_season: dict, per_season_nvalid: dict, vocab: dict,
        vocab_labels: list, gstats: dict, include_home: bool, home_rate: float,
        partial: bool) -> dict:
    vocab_size = len(vocab)
    val_seasons = seasons[1:]  # season 0 is train-only forever
    fold_rows: list[dict] = []
    cal = {"baseline": {}, "logit": {}}
    pooled = {m: {"sum_ll": 0.0, "sum_br": 0.0, "n_correct": 0, "n": 0,
                  "pmin": np.inf, "pmax": -np.inf} for m in ("baseline", "logit")}
    macro = {m: {"ll": [], "br": [], "acc": []} for m in ("baseline", "logit")}
    zone_n = np.zeros(vocab_size, dtype=np.float64)
    zone_actual = np.zeros(vocab_size, dtype=np.float64)
    zone_exp = {"baseline": np.zeros(vocab_size), "logit": np.zeros(vocab_size)}

    features = ["distance", "angle", "period", "is3"] + (["home"] if include_home else [])
    first_fold_train: list[str] = []

    for i, val_season in enumerate(val_seasons, start=1):
        train_names = seasons[:i]
        if i == 1:
            first_fold_train = list(train_names)
        z_tr = _concat(per_season, train_names, "zcode")
        made_tr = _concat(per_season, train_names, "made")
        cont_tr = np.column_stack([_concat(per_season, train_names, c)
                                   for c in CONT_FEATURES]).astype(np.float64)
        mean = cont_tr.mean(axis=0)
        std = cont_tr.std(axis=0)
        std = np.where(std < 1e-12, 1.0, std)

        tr_arr = {c: _concat(per_season, train_names, c)
                  for c in ("distance", "angle", "period", "is3", "home")}
        X_tr = _build_X(tr_arr, mean, std, include_home)
        y_tr = made_tr.astype(np.int8)

        val = per_season[val_season]
        z_val = val["zcode"]
        y_val = val["made"].astype(np.int8)
        X_val = _build_X(val, mean, std, include_home)
        w = np.where(val["is3"] == 1, 1.5, 1.0)
        actual_efg = float((val["made"].astype(np.float64) * w).mean())

        clf = fit_logit(X_tr, y_tr)
        preds = {
            "baseline": baseline_predict(z_tr, made_tr, z_val, vocab_size),
            "logit": clf.predict_proba(X_val)[:, 1],
        }

        np.add.at(zone_n, z_val, 1.0)
        np.add.at(zone_actual, z_val, val["made"].astype(np.float64) * w)
        span = f"{train_names[0]}..{train_names[-1]}"
        for m, p in preds.items():
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

    # Build the pooled "ALL" calibration by summing the per-season reliability matrices.
    for m in cal:
        allmat = np.zeros((3, N_CAL_BINS))
        for s, mat in cal[m].items():
            if s != "ALL":
                allmat += mat
        cal[m]["ALL"] = allmat

    # ---- aggregate metrics ----
    pooled_out, macro_out = {}, {}
    for m in ("baseline", "logit"):
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

    # ---- distance cross-check aggregation ----
    dc = gstats["dc"]
    n = dc["n"]
    mean_abs = dc["sum_absdiff"] / n if n else 0.0
    frac_big = dc["n_big"] / n if n else 0.0
    if n:
        cov = dc["sum_ds"] / n - (dc["sum_d"] / n) * (dc["sum_s"] / n)
        var_d = dc["sum_d2"] / n - (dc["sum_d"] / n) ** 2
        var_s = dc["sum_s2"] / n - (dc["sum_s"] / n) ** 2
        r = cov / (np.sqrt(var_d * var_s)) if var_d > 0 and var_s > 0 else float("nan")
    else:
        r = float("nan")
    dc_assessment = ("consistent (r>=0.99, mean|diff|<1ft) — SHOT_DISTANCE agrees with LOC"
                     if (r >= 0.99 and mean_abs < 1.0)
                     else "MINOR divergence (see numbers)" if (r >= 0.95)
                     else "LARGE divergence — investigate LOC/units")

    # ---- self-verification checks ----
    total_valid = gstats["n_valid"]
    sum_nval = sum(per_season_nvalid[s] for s in val_seasons)
    expected_sum_nval = total_valid - per_season_nvalid[seasons[0]]
    checks: list[tuple[str, bool, str]] = []

    ff_ok = first_fold_train == [seasons[0]]
    checks.append(("first_fold_train_is_only_earliest_season", ff_ok,
                   f"fold-1 train = {first_fold_train} (n_train="
                   f"{per_season_nvalid[seasons[0]]}); expected [{seasons[0]}]"))

    checks.append(("val_shot_count_reconciles_with_total_valid", sum_nval == expected_sum_nval,
                   f"sum(n_val over folds)={sum_nval} == total_valid({total_valid}) - "
                   f"n_valid({seasons[0]})({per_season_nvalid[seasons[0]]}) = {expected_sum_nval}"))

    # monotonic train growth + train strictly before val
    mono_ok = True
    prev = -1
    for i, val_season in enumerate(val_seasons, start=1):
        n_tr = sum(per_season_nvalid[s] for s in seasons[:i])
        if n_tr <= prev:
            mono_ok = False
        if any(s >= val_season for s in seasons[:i]):
            mono_ok = False
        prev = n_tr
    checks.append(("train_grows_and_precedes_val_every_fold", mono_ok,
                   "n_train strictly increases and every train season < val season"))

    prob_ok = True
    prob_detail = []
    for m in ("baseline", "logit"):
        lo, hi = pooled_out[m]["pmin"], pooled_out[m]["pmax"]
        ok = (lo >= -1e-9) and (hi <= 1.0 + 1e-9)
        prob_ok = prob_ok and ok
        prob_detail.append(f"{m}:[{_fmt(lo)},{_fmt(hi)}]")
    checks.append(("all_P(make)_within_[0,1]", prob_ok, "  ".join(prob_detail)))

    if not partial:
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
        checks.append(("SQ3_anchor_checks", True,
                       "SKIPPED (partial run — anchors only valid on the full 30-season cache)"))

    all_pass = all(ok for _, ok, _ in checks)
    return {
        "fold_rows": fold_rows, "cal": cal, "pooled": pooled_out, "macro": macro_out,
        "zone_n": zone_n, "zone_actual": zone_actual, "zone_exp": zone_exp,
        "features": features, "vocab_size": vocab_size,
        "dc": {"n": n, "mean_abs": mean_abs, "frac_big": frac_big, "r": r,
               "assessment": dc_assessment},
        "checks": checks, "all_pass": all_pass, "total_valid": total_valid,
        "n_folds": len(val_seasons), "fold_first": val_seasons[0], "fold_last": val_seasons[-1],
    }


def save_full_model(path: Path, seasons: list[str], per_season: dict, vocab: dict,
                    vocab_labels: list, include_home: bool) -> None:
    """Train logit + baseline zone table on ALL loaded seasons and pickle them LOCALLY for
    SQ-5. This touches no DB and no model_version column (that belongs to SQ-5)."""
    vocab_size = len(vocab)
    z = _concat(per_season, seasons, "zcode")
    made = _concat(per_season, seasons, "made")
    cont = np.column_stack([_concat(per_season, seasons, c)
                            for c in CONT_FEATURES]).astype(np.float64)
    mean = cont.mean(axis=0)
    std = np.where(cont.std(axis=0) < 1e-12, 1.0, cont.std(axis=0))
    arr = {c: _concat(per_season, seasons, c)
           for c in ("distance", "angle", "period", "is3", "home")}
    X = _build_X(arr, mean, std, include_home)
    clf = fit_logit(X, made.astype(np.int8))
    attempts = np.bincount(z, minlength=vocab_size).astype(np.float64)
    makes = np.bincount(z, weights=made.astype(np.float64), minlength=vocab_size)
    global_rate = float(made.mean())
    zone_rate = np.divide(makes, attempts, out=np.full(vocab_size, global_rate),
                          where=attempts > 0)
    payload = {
        "note": "SQ-4 local artifact; NOT a DB surface (SQ-5 owns model_version + writes).",
        "trained_seasons": list(seasons),
        "features": ["distance", "angle", "period", "is3"] + (["home"] if include_home else []),
        "cont_features": CONT_FEATURES,
        "scaler_mean": mean, "scaler_std": std,
        "logit_coef": clf.coef_, "logit_intercept": clf.intercept_,
        "baseline_zone_rate": zone_rate, "baseline_global_rate": global_rate,
        "zone_vocab": dict(vocab), "zone_labels": list(vocab_labels),
    }
    with open(path, "wb") as f:
        pickle.dump(payload, f)
    logger.info("wrote %s (logit trained on all %d loaded seasons)", path, len(seasons))


def main() -> int:
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    ap = argparse.ArgumentParser(description="SQ-4 Expected Shot Value train + evaluate.")
    ap.add_argument("--max-seasons", type=int, default=None,
                    help="load only the first N seasons (fast smoke run; marks reports PARTIAL)")
    ap.add_argument("--skip-pickle", action="store_true",
                    help="do not write the local full-data logit pickle")
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

    res = run(seasons, per_season, per_season_nvalid, vocab, vocab_labels, gstats,
              include_home, home_rate, partial)

    write_folds_csv(OUT_DIR / "sq4_folds.csv", res["fold_rows"])
    write_calibration_csv(OUT_DIR / "sq4_calibration.csv", res["cal"])
    write_efg_by_zone_csv(OUT_DIR / "sq4_efg_by_zone.csv", vocab_labels,
                          res["zone_n"], res["zone_actual"], res["zone_exp"])
    write_metrics_txt(OUT_DIR / "sq4_metrics.txt", {
        "mode": "PARTIAL" if partial else "FULL",
        "n_seasons": len(seasons), "season_first": seasons[0], "season_last": seasons[-1],
        "n_folds": res["n_folds"], "fold_first": res["fold_first"],
        "fold_last": res["fold_last"], "total_valid": res["total_valid"],
        "vocab_size": res["vocab_size"], "features": res["features"],
        "home_decision": home_decision, "home_rate": home_rate,
        "pooled": res["pooled"], "macro": res["macro"], "dc": res["dc"],
        "checks": res["checks"], "all_pass": res["all_pass"],
    })

    if not args.skip_pickle:
        save_full_model(OUT_DIR / "sq4_logit_full.pkl", seasons, per_season, vocab,
                        vocab_labels, include_home)

    if not res["all_pass"]:
        logger.error("SELF-CHECK FAILURES — see %s", OUT_DIR / "sq4_metrics.txt")
        return 1
    logger.info("SQ-4 complete; all self-checks PASS. Reports in %s", OUT_DIR)
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
