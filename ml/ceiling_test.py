"""How much signal is in the fatigue features at all, regardless of formula?

ADR 0006 concluded that only four fatigue terms carry signal. That conclusion came from a
LINEAR model, so using it to dismiss non-linear formulas would be circular. This asks the
question the other way round: give a flexible learner every feature at once, on the same blind
seasons, and see whether it finds anything the four-term linear model misses.

If a gradient-boosted model with 25 features, free to discover any interaction and any curve,
cannot beat four hand-picked terms, then the limit is the information in the data rather than
the shape of the equation — and no amount of extra formula complexity will help.

Two extra probes:

* **Explicit interactions.** The physically obvious ones (a back-to-back that also involves a
  flight, or altitude on no rest) entered as products, in case the tree model is simply
  under-powered at this sample size.
* **Point margin instead of win/loss.** A binary outcome throws away most of what a game
  tells you. Regressing the margin gives far tighter error bars on each factor, so it is a
  much stronger test of the terms ADR 0006 declared dead than the win/loss fit was.
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import brier_score_loss, log_loss

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "ml" / "data"
TABLE = DATA / "fatigue_model_table.csv"
FEATURES = DATA / "fatigue_features.csv"
REPORT = DATA / "fatigue_ceiling_report.txt"

TRAIN_FLOOR = 2002
FIRST_TEST_SEASON = 2010
RATE = "025"  # the rate the folds most often chose

SURVIVORS = ["d_is_b2b", "d_alt_visit", "d_prior_ot", "d_density_points"]
CONTROLS = ["d_strength", "d_season_day"]

ALL_FATIGUE = [
    f"d_decay_u_{RATE}",
    f"d_min_u_{RATE}",
    f"d_poss_u_{RATE}",
    "d_travel_u_7",
    "d_travel_u_14",
    "d_travel_u_30",
    "d_road_over2",
    "d_home_stand_over2",
    "d_jetlag_units",
    "d_is_b2b",
    "d_b2b_deficit",
    "d_rest_recovery",
    "d_alt_visit",
    "d_alt_carry",
    "d_prior_ot",
    "d_density_points",
    "d_is_3in4",
    "d_is_4in6",
    "d_body_clock_off",
    "d_season_game_no",
]


def ridge_logistic(xtr, ytr, xte, lam: float = 1.0):
    """Plain L2 logistic via Newton steps — small and dependency-light."""
    mu, sd = xtr.mean(axis=0), xtr.std(axis=0)
    sd = np.where(sd < 1e-12, 1.0, sd)
    ztr = np.column_stack([np.ones(len(xtr)), (xtr - mu) / sd])
    zte = np.column_stack([np.ones(len(xte)), (xte - mu) / sd])
    w = np.zeros(ztr.shape[1])
    pen = np.full(ztr.shape[1], lam)
    pen[0] = 0.0
    for _ in range(60):
        eta = ztr @ w
        p = 1.0 / (1.0 + np.exp(-eta))
        g = ztr.T @ (p - ytr) + pen * w
        s = np.clip(p * (1 - p), 1e-9, None)
        h = ztr.T @ (ztr * s[:, None]) + np.diag(pen)
        step = np.linalg.solve(h, g)
        w -= step
        if np.max(np.abs(step)) < 1e-9:
            break
    return 1.0 / (1.0 + np.exp(-(zte @ w)))


def ols_with_t(x: np.ndarray, y: np.ndarray, names: list[str]) -> pd.DataFrame:
    """Least squares plus t-statistics, for the margin probe."""
    z = np.column_stack([np.ones(len(x)), x])
    beta, *_ = np.linalg.lstsq(z, y, rcond=None)
    resid = y - z @ beta
    dof = len(y) - z.shape[1]
    sigma2 = float(resid @ resid) / dof
    xtx_inv = np.linalg.pinv(z.T @ z)
    se = np.sqrt(np.diag(sigma2 * xtx_inv))
    return pd.DataFrame(
        {
            "feature": ["intercept", *names],
            "beta": beta,
            "se": se,
            "t": beta / se,
        }
    )


def main() -> None:
    df = pd.read_csv(TABLE, low_memory=False)
    df = df[df["season_start"] >= TRAIN_FLOOR].copy()

    cols = sorted(set(ALL_FATIGUE) | set(CONTROLS))
    df[cols] = df[cols].fillna(0.0)

    # Point margin, joined from the export (the modelling table only carries win/loss).
    feats = pd.read_csv(
        FEATURES, usecols=["game_id", "is_home", "team_score", "opp_score"], low_memory=False
    )
    home = feats[feats["is_home"] == 1].set_index("game_id")
    df = df.merge(
        (home["team_score"] - home["opp_score"]).rename("home_margin"),
        left_on="game_id",
        right_index=True,
        how="left",
    )
    df = df[df["home_margin"].notna()].copy()

    test_seasons = sorted(s for s in df["season_start"].unique() if s >= FIRST_TEST_SEASON)

    # Physically motivated interactions: a back-to-back that also involved a flight, a
    # back-to-back into altitude, and a long trip with a circadian shift.
    df["x_b2b_travel"] = df["d_is_b2b"] * df["d_travel_u_7"]
    df["x_b2b_alt"] = df["d_is_b2b"] * df["d_alt_visit"]
    df["x_travel_jetlag"] = df["d_travel_u_7"] * df["d_jetlag_units"]
    df["x_b2b_workload"] = df["d_is_b2b"] * df[f"d_poss_u_{RATE}"]
    INTERACTIONS = ["x_b2b_travel", "x_b2b_alt", "x_travel_jetlag", "x_b2b_workload"]

    specs = {
        "controls only": CONTROLS,
        "controls + 4 survivors (ADR 0006)": CONTROLS + SURVIVORS,
        "controls + all 20 fatigue features": CONTROLS + ALL_FATIGUE,
        "controls + survivors + interactions": CONTROLS + SURVIVORS + INTERACTIONS,
    }

    rows: list[dict] = []
    for season in test_seasons:
        train = df[df["season_start"] < season]
        test = df[df["season_start"] == season]
        ytr = train["home_won"].to_numpy(dtype=int)
        yte = test["home_won"].to_numpy(dtype=int)
        rec: dict = {"season": season, "n": len(test)}

        for label, feat in specs.items():
            p = ridge_logistic(
                train[feat].to_numpy(float), ytr, test[feat].to_numpy(float)
            )
            rec[f"ll::{label}"] = log_loss(yte, p)
            rec[f"br::{label}"] = brier_score_loss(yte, p)

        # Flexible learner: every feature, free to find any curve or interaction.
        gbm = HistGradientBoostingClassifier(
            max_iter=400,
            learning_rate=0.05,
            max_leaf_nodes=15,
            l2_regularization=1.0,
            early_stopping=True,
            validation_fraction=0.15,
            random_state=0,
        )
        feat = CONTROLS + ALL_FATIGUE
        gbm.fit(train[feat].to_numpy(float), ytr)
        p = gbm.predict_proba(test[feat].to_numpy(float))[:, 1]
        rec["ll::GBM, everything"] = log_loss(yte, p)
        rec["br::GBM, everything"] = brier_score_loss(yte, p)

        # GBM on fatigue alone, so a weak result cannot be blamed on the controls.
        gbm2 = HistGradientBoostingClassifier(
            max_iter=400,
            learning_rate=0.05,
            max_leaf_nodes=15,
            l2_regularization=1.0,
            early_stopping=True,
            validation_fraction=0.15,
            random_state=0,
        )
        gbm2.fit(train[ALL_FATIGUE].to_numpy(float), ytr)
        p2 = gbm2.predict_proba(test[ALL_FATIGUE].to_numpy(float))[:, 1]
        rec["ll::GBM, fatigue only"] = log_loss(yte, p2)
        rec["br::GBM, fatigue only"] = brier_score_loss(yte, p2)

        rows.append(rec)

    res = pd.DataFrame(rows)

    def pooled(col: str) -> float:
        return float(np.average(res[col], weights=res["n"]))

    labels = [*specs.keys(), "GBM, everything", "GBM, fatigue only"]

    lines: list[str] = []
    a = lines.append
    a("# Ceiling test — does a more complex formula find anything?")
    a("")
    a(f"blind seasons {len(res)}   held-out games {int(res['n'].sum())}")
    a("")
    a("## Out-of-sample, same games for every model")
    a("")
    a(f"  {'model':<40} {'log loss':>10} {'Brier':>10}")
    for label in labels:
        a(f"  {label:<40} {pooled(f'll::{label}'):>10.5f} {pooled(f'br::{label}'):>10.5f}")
    a("")
    base = pooled("ll::controls only")
    gains = {l: base - pooled(f"ll::{l}") for l in labels if l != "controls only"}
    best = max(gains, key=gains.get)
    a(f"  best model:  {best}  ({gains[best]:+.5f} log loss vs controls only)")
    for label, gain in gains.items():
        a(f"    {label:<40} {gain:+.5f}")
    a("")

    # ── margin probe: same questions, far more statistical power ───────────────
    a("## Point-margin regression (all seasons 2002+, in-sample, for power not prediction)")
    a("")
    a("  A win/loss outcome discards the size of the result. Margin keeps it, so each")
    a("  coefficient gets a much tighter error bar. |t| < 2 means the factor is not")
    a("  distinguishable from no effect at all.")
    a("")
    names = CONTROLS + ALL_FATIGUE
    fit = ols_with_t(
        df[names].to_numpy(float), df["home_margin"].to_numpy(float), names
    )
    a(f"  {'feature':<26} {'points':>9} {'se':>8} {'t':>8}   reading")
    for _, r in fit.iterrows():
        if r["feature"] == "intercept":
            continue
        verdict = "real" if abs(r["t"]) >= 2 else "not distinguishable from zero"
        if r["feature"] in CONTROLS:
            verdict = "control, not fatigue"
        a(
            f"  {r['feature']:<26} {r['beta']:>9.4f} {r['se']:>8.4f} {r['t']:>8.2f}   {verdict}"
        )
    a("")
    resid_sd = float(np.std(df["home_margin"]))
    a(f"  home margin sd = {resid_sd:.2f} points — the scale everything above competes with")
    a("")
    a("## Per season (log loss)")
    a("")
    a(f"  season      {'4 survivors':>12} {'all 20':>10} {'GBM all':>10}")
    for _, r in res.iterrows():
        a(
            f"  {int(r['season'])}      {r['ll::controls + 4 survivors (ADR 0006)']:>12.5f} "
            f"{r['ll::controls + all 20 fatigue features']:>10.5f} {r['ll::GBM, everything']:>10.5f}"
        )

    REPORT.write_text("\n".join(lines) + "\n")
    log.info("wrote %s", REPORT)


if __name__ == "__main__":
    main()
