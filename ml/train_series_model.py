"""Playoff Predictor — Phase 3 (T3): series-outcome model TRAINING & EVALUATION.

Predicts, for each resolved playoff series, whether the HOME-COURT (reference) team wins
the series, from the four Phase 2b-ii features. This script READS ONLY (a single SELECT on
``playoff_series``); it writes NOTHING to the database (prediction persistence is a later
phase). All results go to a text report file so digits can be verified by re-reading.

Run from the project root, in the project venv:
    ./venv/bin/python ml/train_series_model.py                         # print + write report
    ./venv/bin/python ml/train_series_model.py --report-file PATH      # choose report path

────────────────────────────────────────────────────────────────────────────────────────
LABEL / FEATURE CONTRACT  (verified against the live DB, STEP 0)
  Trainable set  = 599 rows: series_winner_team_id IS NOT NULL AND all 4 features present.
                   (The 1 excluded row, 1986-87_LAL-OKC, has a NULL winner.)
  Label          y = 1 if series_winner_team_id == home_court_team_id else 0.
  Features (fixed column order, all framed so + = advantage to the home-court team):
                   [seed_diff, win_pct_diff, entry_rest_diff, h2h_diff]
  Base rate      447/599 = 0.7462 of series are won by the home-court team (majority class).

────────────────────────────────────────────────────────────────────────────────────────
VALIDATION = EXPANDING-WINDOW WALK-FORWARD BY SEASON (no random shuffle). See STEP 2 block.

DATABASE_URL resolution mirrors ml/compute_series_features.resolve_database_url
(ml/compute_series_features.py:90). DB connection pattern (psycopg2.connect) mirrors
ml/compute_series_features.py:640.
"""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, brier_score_loss, log_loss
from sklearn.model_selection import GroupKFold, GridSearchCV
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

import psycopg2

REPO_ROOT = Path(__file__).resolve().parent.parent

# Fixed, documented feature column order. Every X matrix in this file uses exactly this.
FEATURES = ["seed_diff", "win_pct_diff", "entry_rest_diff", "h2h_diff"]

# Minimum number of seasons in the FIRST expanding-window training block before we start
# evaluating. Justification (events-per-variable heuristic): with 4 features + intercept we
# want >= ~10 minority-class events per parameter for a stable logistic fit. The minority
# class (opponent wins) is ~25% of ~15 series/season, i.e. ~3.7 events/season, so ~10
# seasons ≈ 37 minority events ≈ the floor for a 5-parameter model. Fewer would give
# unstable early coefficients; the window then expands so later folds train on far more.
MIN_TRAIN_SEASONS = 10

# L2 regularization grid (inverse strength C). Selected INSIDE each training block only.
C_GRID = [0.01, 0.03, 0.1, 0.3, 1.0, 3.0, 10.0]

# Clip probabilities before log-loss so a tree leaf at 0/1 cannot produce +inf.
PROB_EPS = 1e-15


# ─── DB load (read-only) ─────────────────────────────────────────────────────────────────


def resolve_database_url() -> str:
    """Prefer process-env DATABASE_URL; else load .env.local then scripts/.env."""
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if url:
        return url
    from dotenv import load_dotenv

    load_dotenv(REPO_ROOT / ".env.local")
    load_dotenv(REPO_ROOT / "scripts" / ".env")
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url:
        print("ERROR: DATABASE_URL is not set.", file=sys.stderr)
        sys.exit(1)
    return url


@dataclass
class Dataset:
    X: np.ndarray            # (n, 4) float64, column order = FEATURES
    y: np.ndarray            # (n,) int {0,1}
    seasons: np.ndarray      # (n,) str  "YYYY-YY"
    rounds: np.ndarray       # (n,) int
    keys: list[str]          # external_series_key, for spot checks


def load_trainable(conn) -> Dataset:
    """Single read-only SELECT of the 599 trainable rows.

    y is derived in SQL as (winner == home-court) so the label lives with the query and is
    auditable. Numeric features are cast to float8 so psycopg2 yields floats, not Decimals.
    """
    conn.set_session(readonly=True)  # refuse any accidental write at the session level
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT external_series_key,
                   season,
                   round,
                   (series_winner_team_id = home_court_team_id)::int AS y,
                   seed_diff::float8,
                   win_pct_diff::float8,
                   entry_rest_diff::float8,
                   h2h_diff::float8
            FROM playoff_series
            WHERE series_winner_team_id IS NOT NULL
              AND seed_diff        IS NOT NULL
              AND win_pct_diff     IS NOT NULL
              AND entry_rest_diff  IS NOT NULL
              AND h2h_diff         IS NOT NULL
            ORDER BY season, round, external_series_key
            """
        )
        rows = cur.fetchall()

    keys = [r[0] for r in rows]
    seasons = np.array([r[1] for r in rows])
    rounds = np.array([r[2] for r in rows], dtype=int)
    y = np.array([r[3] for r in rows], dtype=int)
    X = np.array([[r[4], r[5], r[6], r[7]] for r in rows], dtype=float)
    return Dataset(X=X, y=y, seasons=seasons, rounds=rounds, keys=keys)


# ─── Metric helpers ──────────────────────────────────────────────────────────────────────


def _clip(p: np.ndarray) -> np.ndarray:
    return np.clip(p, PROB_EPS, 1.0 - PROB_EPS)


def fold_metrics(y_true: np.ndarray, p_hat: np.ndarray) -> tuple[float, float, float]:
    """(accuracy, log_loss, brier) for one fold. labels=[0,1] guards single-class folds."""
    y_pred = (p_hat >= 0.5).astype(int)
    acc = accuracy_score(y_true, y_pred)
    ll = log_loss(y_true, _clip(p_hat), labels=[0, 1])
    brier = brier_score_loss(y_true, p_hat)
    return acc, ll, brier


# ─── STEP 2: expanding-window walk-forward by season ─────────────────────────────────────
#
# WHY NOT KFold/StratifiedKFold(shuffle=True): two independent leakage reasons.
#  (1) Same-season correlation. The 15 series within a season share the same 16-team field,
#      the same standings, and are structurally coupled (a team can only advance if it won
#      the prior round). Shuffling scatters a season's series across train and test folds, so
#      the model effectively sees part of a bracket while predicting the rest — an
#      information leak a real forecaster (who predicts a bracket before it starts) never has.
#  (2) Temporal directionality. A deployed predictor is trained on the PAST and applied to
#      the FUTURE. Random CV lets future seasons inform predictions about past seasons, which
#      inflates the estimate versus the only deployment that matters: forward in time.
#  So we split strictly by season, chronologically, never letting one season straddle a
#  split, and never training on a season later than the one being predicted.


@dataclass
class WalkForwardResult:
    name: str
    per_season: list[dict]          # one dict per eval season
    pooled_y: np.ndarray
    pooled_p: np.ndarray

    def pooled(self) -> tuple[float, float, float]:
        return fold_metrics(self.pooled_y, self.pooled_p)

    def mean_per_season_acc(self) -> tuple[float, float]:
        accs = np.array([d["acc"] for d in self.per_season])
        return float(accs.mean()), float(accs.std(ddof=1))


def ordered_seasons(ds: Dataset) -> list[str]:
    """Distinct seasons sorted chronologically by start year (robust to the 'YYYY-YY' form)."""
    uniq = sorted(set(ds.seasons.tolist()), key=lambda s: int(s[:4]))
    return uniq


def walk_forward(
    ds: Dataset,
    predict_fn,
    name: str,
    min_train: int = MIN_TRAIN_SEASONS,
) -> WalkForwardResult:
    """Run the expanding-window protocol.

    predict_fn(X_train, y_train, seasons_train, X_test) -> p_hat (test-row P(y=1)).
    The scaler/model live INSIDE predict_fn so every fit sees only that fold's training rows.
    """
    seasons = ordered_seasons(ds)
    per_season: list[dict] = []
    pooled_y: list[int] = []
    pooled_p: list[float] = []

    for k in range(min_train, len(seasons)):
        train_seasons = set(seasons[:k])
        test_season = seasons[k]
        tr = np.array([s in train_seasons for s in ds.seasons])
        te = ds.seasons == test_season

        p_hat = predict_fn(ds.X[tr], ds.y[tr], ds.seasons[tr], ds.X[te])
        p_hat = np.asarray(p_hat, dtype=float)
        y_te = ds.y[te]
        acc, ll, brier = fold_metrics(y_te, p_hat)
        per_season.append(
            {
                "season": test_season,
                "n": int(te.sum()),
                "n_train": int(tr.sum()),
                "acc": acc,
                "log_loss": ll,
                "brier": brier,
            }
        )
        pooled_y.extend(y_te.tolist())
        pooled_p.extend(p_hat.tolist())

    return WalkForwardResult(
        name=name,
        per_season=per_season,
        pooled_y=np.array(pooled_y, dtype=int),
        pooled_p=np.array(pooled_p, dtype=float),
    )


# ─── Model / baseline predict_fns ────────────────────────────────────────────────────────


def predict_prior(X_tr, y_tr, s_tr, X_te):
    """Baseline A — majority-class / base rate. Predict p = training home-win rate for every
    test row (a calibrated constant). Its argmax is always y=1 (rate > 0.5), so its accuracy
    equals the majority-class classifier's while its log-loss/Brier are proper (finite)."""
    rate = float(y_tr.mean())
    return np.full(X_te.shape[0], rate)


def _sign_rule(col: int):
    """Baseline B — parameter-free sign rule on one feature. Predict home-court (p≈1) when
    that feature >= 0 (home-court is the better seed / better record), else opponent (p≈0).
    Probabilities are hard 0/1 by construction; we report ACCURACY for these (a sign rule has
    no calibrated probability, so its log-loss/Brier are not meaningful and are omitted)."""

    def fn(X_tr, y_tr, s_tr, X_te):
        return (X_te[:, col] >= 0).astype(float)

    return fn


def predict_logistic_unreg(X_tr, y_tr, s_tr, X_te):
    """Model 2 — unregularized logistic on standardized features (scaler fit on train only)."""
    # Unregularized ⇔ C=inf (sklearn 1.8+ replaces penalty=None with C=np.inf).
    pipe = Pipeline(
        [
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(C=np.inf, max_iter=5000)),
        ]
    )
    pipe.fit(X_tr, y_tr)
    return pipe.predict_proba(X_te)[:, 1]


# Records the C chosen in each fold so the report can show the regularization path.
_L2_CHOSEN_C: list[float] = []


def predict_logistic_l2(X_tr, y_tr, s_tr, X_te):
    """Model 3 — L2 logistic; C tuned INSIDE the training block via season-grouped inner CV
    (GroupKFold on season), scored by neg-log-loss. No eval-season rows ever enter tuning."""
    n_groups = len(set(s_tr.tolist()))
    n_splits = min(5, n_groups)
    inner = GroupKFold(n_splits=n_splits)
    # L2 is the lbfgs default penalty; tune only C (inverse strength) in the inner CV.
    pipe = Pipeline(
        [
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(solver="lbfgs", max_iter=5000)),
        ]
    )
    grid = GridSearchCV(
        pipe,
        {"clf__C": C_GRID},
        scoring="neg_log_loss",
        cv=inner,
        n_jobs=1,
    )
    grid.fit(X_tr, y_tr, groups=s_tr)
    _L2_CHOSEN_C.append(float(grid.best_params_["clf__C"]))
    return grid.predict_proba(X_te)[:, 1]


def make_tree_predictor(max_depth: int):
    """Model 4 — shallow decision tree (scale-invariant; no standardization)."""

    def fn(X_tr, y_tr, s_tr, X_te):
        clf = DecisionTreeClassifier(max_depth=max_depth, random_state=0)
        clf.fit(X_tr, y_tr)
        return clf.predict_proba(X_te)[:, 1]

    return fn


# ─── Full-data interpretation fits (STEP 4; in-sample, clearly labeled) ───────────────────


def interpret_logistic(ds: Dataset) -> dict:
    """Standardized L2-logistic coefficients on ALL 599 rows (interpretation only, not eval).
    Because features are standardized, coefficient magnitudes are directly comparable."""
    pipe = Pipeline(
        [("scaler", StandardScaler()), ("clf", LogisticRegression(C=1.0, max_iter=5000))]
    )
    pipe.fit(ds.X, ds.y)
    coefs = pipe.named_steps["clf"].coef_[0]
    intercept = float(pipe.named_steps["clf"].intercept_[0])
    return {"coefs": dict(zip(FEATURES, coefs.tolist())), "intercept": intercept}


def interpret_tree(ds: Dataset, max_depth: int = 3) -> dict:
    clf = DecisionTreeClassifier(max_depth=max_depth, random_state=0)
    clf.fit(ds.X, ds.y)
    return {"importances": dict(zip(FEATURES, clf.feature_importances_.tolist()))}


# ─── Report ──────────────────────────────────────────────────────────────────────────────


def wilson_or_normal_ci(p: float, n: int) -> tuple[float, float]:
    """95% normal-approx CI for a pooled proportion (accuracy)."""
    if n == 0:
        return (float("nan"), float("nan"))
    se = (p * (1 - p) / n) ** 0.5
    return (p - 1.96 * se, p + 1.96 * se)


def build_report(ds: Dataset, results: list[WalkForwardResult]) -> str:
    L: list[str] = []

    def w(s: str = "") -> None:
        L.append(s)

    seasons = ordered_seasons(ds)
    n_total = len(ds.y)
    base_rate = float(ds.y.mean())
    eval_seasons = seasons[MIN_TRAIN_SEASONS:]

    w("══════════════════════════════════════════════════════════════════════════════")
    w(" Playoff Predictor — Phase 3 (T3) — model training & evaluation report")
    w("══════════════════════════════════════════════════════════════════════════════")
    w("")
    w("── Data contract ──")
    w(f"  trainable rows            : {n_total}")
    w(f"  features (fixed order)    : {FEATURES}")
    w(f"  label                     : y = 1 if series_winner == home_court_team, else 0")
    w(f"  base rate (P(y=1))        : {base_rate:.6f}   ({int(ds.y.sum())}/{n_total})")
    w(f"  total seasons             : {len(seasons)}   ({seasons[0]} … {seasons[-1]})")
    w("")
    w("── Walk-forward protocol ──")
    w(f"  expanding window, min train span = {MIN_TRAIN_SEASONS} seasons")
    w(f"  eval seasons (folds)      : {len(eval_seasons)}   ({eval_seasons[0]} … {eval_seasons[-1]})")
    w(f"  pooled eval predictions   : {len(results[0].pooled_y)}")
    w("  NO random shuffle: no season straddles a split; never train on a future season.")
    w("")

    # ── Ladder summary table ──
    w("── Model ladder (walk-forward, pooled over all eval seasons) ──")
    w(f"  {'model':<34} {'pooled_acc':>10} {'mean_szn_acc':>13} {'log_loss':>10} {'brier':>9}")
    w("  " + "-" * 80)
    for r in results:
        pa, pll, pbr = r.pooled()
        macc, msd = r.mean_per_season_acc()
        # sign-rule baselines have degenerate (hard 0/1) probabilities → hide prob metrics
        is_sign = r.name.startswith("baseline:sign")
        ll_s = "   n/a" if is_sign else f"{pll:>10.4f}"
        br_s = "   n/a" if is_sign else f"{pbr:>9.4f}"
        w(f"  {r.name:<34} {pa:>10.4f} {macc:>7.4f}±{msd:<4.3f} {ll_s} {br_s}")
    w("")

    # ── Pooled accuracy with uncertainty + comparison to majority ──
    prior = next(r for r in results if r.name == "baseline:prior(majority)")
    prior_acc = prior.pooled()[0]
    n_pool = len(prior.pooled_y)
    w("── Pooled accuracy vs the 74.6% majority baseline (uncertainty) ──")
    w(f"  pooled n = {n_pool};  majority(prior) pooled acc = {prior_acc:.4f}")
    for r in results:
        if r.name.startswith("baseline"):
            continue
        pa = r.pooled()[0]
        lo, hi = wilson_or_normal_ci(pa, n_pool)
        # paired per-season delta vs majority (same eval seasons, aligned by index)
        deltas = np.array(
            [rs["acc"] for rs in r.per_season]
        ) - np.array([ps["acc"] for ps in prior.per_season])
        dmean = float(deltas.mean())
        dse = float(deltas.std(ddof=1) / (len(deltas) ** 0.5))
        wins = int((deltas > 0).sum())
        ties = int((deltas == 0).sum())
        losses = int((deltas < 0).sum())
        w(
            f"  {r.name:<34} acc={pa:.4f}  95%CI[{lo:.4f},{hi:.4f}]  "
            f"Δvs-majority(per-season)={dmean:+.4f}±{dse:.4f}  W/T/L={wins}/{ties}/{losses}"
        )
    w("")

    # ── L2 regularization path ──
    if _L2_CHOSEN_C:
        from collections import Counter

        c = Counter(_L2_CHOSEN_C)
        w("── L2 logistic: C chosen per fold (inner season-grouped CV, neg-log-loss) ──")
        w("  " + "  ".join(f"C={k}:{v}x" for k, v in sorted(c.items())))
        w(f"  (grid = {C_GRID}; small C = stronger regularization)")
        w("")

    # ── Interpretation (full-data, in-sample) ──
    logi = interpret_logistic(ds)
    tree3 = interpret_tree(ds, max_depth=3)
    w("── Interpretation: standardized L2-logistic coefficients (ALL 599 rows, in-sample) ──")
    w(f"  intercept = {logi['intercept']:+.4f}")
    for f in FEATURES:
        w(f"    {f:<16} coef = {logi['coefs'][f]:+.4f}")
    w("  (standardized ⇒ magnitudes comparable; sign = direction of home-court win odds)")
    w("")
    w("── Interpretation: decision-tree (depth 3) feature importances (ALL 599 rows) ──")
    for f in FEATURES:
        w(f"    {f:<16} importance = {tree3['importances'][f]:.4f}")
    w("")

    # ── Per-season detail for the two key models + majority ──
    key_models = [
        "baseline:prior(majority)",
        "logistic:unreg",
        "logistic:l2",
        "tree:depth3",
    ]
    picked = [r for r in results if r.name in key_models]
    w("── Per-season accuracy (key rows) ──")
    header = f"  {'season':<9}" + "".join(f"{r.name.split(':')[0][:9]:>11}" for r in picked)
    w(header)
    for i, szn in enumerate(eval_seasons):
        row = f"  {szn:<9}"
        for r in picked:
            row += f"{r.per_season[i]['acc']:>11.3f}"
        w(row)
    w("")

    return "\n".join(L) + "\n"


# ─── Main ────────────────────────────────────────────────────────────────────────────────


def main() -> None:
    ap = argparse.ArgumentParser(description="Phase 3 series-model training & evaluation.")
    ap.add_argument(
        "--report-file",
        default=str(REPO_ROOT / "ml" / "phase3_results.txt"),
        help="Path to write the full text report.",
    )
    args = ap.parse_args()

    conn = psycopg2.connect(resolve_database_url())
    try:
        ds = load_trainable(conn)
    finally:
        conn.close()

    print(f"Loaded {len(ds.y)} trainable rows across {len(ordered_seasons(ds))} seasons.")

    # Run the full ladder under the identical walk-forward protocol.
    results: list[WalkForwardResult] = [
        walk_forward(ds, predict_prior, "baseline:prior(majority)"),
        walk_forward(ds, _sign_rule(FEATURES.index("seed_diff")), "baseline:sign(seed_diff)"),
        walk_forward(ds, _sign_rule(FEATURES.index("win_pct_diff")), "baseline:sign(win_pct_diff)"),
        walk_forward(ds, predict_logistic_unreg, "logistic:unreg"),
        walk_forward(ds, predict_logistic_l2, "logistic:l2"),
        walk_forward(ds, make_tree_predictor(2), "tree:depth2"),
        walk_forward(ds, make_tree_predictor(3), "tree:depth3"),
    ]

    report = build_report(ds, results)
    out = Path(args.report_file)
    out.write_text(report)
    print(report)
    print(f"(report written to {out})")


if __name__ == "__main__":
    main()
