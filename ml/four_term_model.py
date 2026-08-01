"""The four-term model, tuned, at every operating point.

ADR 0006 found four fatigue factors that survive: back-to-back, visiting altitude, prior-game
overtime and schedule density. This builds the score those four imply and asks what the product
looks like on top of it.

Weights come from the same walk-forward protocol — fit on 2002-03 up to the season before,
predict the season blind, never look ahead. The score is fatigue only: no home court and no team
strength, because the published metric is meant to be a statement about rest, not a win
probability. Home court then appears only in the prediction rule, where it can be seen.

The interesting property of a four-term score is that it is *lumpy*. Three of the four terms are
near-binary, so most games score a flat zero difference and the model simply has nothing to say
about them. That is a feature: coverage falls a long way, and what remains is games where a real
effect is actually present.
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import minimize

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "ml" / "data"
TABLE = DATA / "fatigue_model_table.csv"
REPORT = DATA / "four_term_report.txt"

TRAIN_FLOOR = 2002
FIRST_TEST_SEASON = 2010
TERMS = ["d_is_b2b", "d_alt_visit", "d_prior_ot", "d_density_points"]
L2 = 1.0


def fit_clamped(x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, float]:
    """Sign-clamped L2 logistic on raw (unstandardised) columns, so weights are directly
    interpretable as fatigue points once a scale is chosen."""
    n, k = x.shape

    def obj(theta):
        b0, w = theta[0], theta[1:]
        eta = b0 + x @ w
        ll = np.sum(np.logaddexp(0.0, eta) - y * eta) + 0.5 * L2 * np.dot(w, w)
        p = 1.0 / (1.0 + np.exp(-eta))
        r = p - y
        g = np.concatenate(([r.sum()], x.T @ r))
        g[1:] += L2 * w
        return ll / n, g / n

    res = minimize(
        obj,
        np.zeros(k + 1),
        jac=True,
        method="L-BFGS-B",
        bounds=[(None, None)] + [(0.0, None)] * k,
    )
    return res.x[1:], float(res.x[0])


def main() -> None:
    df = pd.read_csv(TABLE, low_memory=False)
    df = df[df["season_start"] >= TRAIN_FLOOR].copy()
    df[TERMS] = df[TERMS].fillna(0.0)

    seasons = sorted(s for s in df["season_start"].unique() if s >= FIRST_TEST_SEASON)

    pieces, weight_rows = [], []
    for season in seasons:
        train = df[df["season_start"] < season]
        test = df[df["season_start"] == season].copy()
        w, b0 = fit_clamped(
            train[TERMS].to_numpy(float), train["home_won"].to_numpy(int)
        )
        # Scale so the new score's spread matches today's published rest advantage. Ratio from
        # the data, scale by convention — the tiers keep meaning roughly what they mean now.
        raw_train = train[TERMS].to_numpy(float) @ w
        spread = raw_train.std()
        s = float(train["rest_advantage"].std() / spread) if spread > 1e-9 else 0.0
        test["ra4"] = (test[TERMS].to_numpy(float) @ w) * s
        test["home_court_pts"] = b0 * s
        pieces.append(test)
        weight_rows.append(
            {
                "season": season,
                **{t: float(v) for t, v in zip(TERMS, w)},
                "intercept": b0,
                "scale": s,
                **{f"pts_{t}": float(v * s) for t, v in zip(TERMS, w)},
                "home_court_pts": b0 * s,
            }
        )

    out = pd.concat(pieces, ignore_index=True)
    wts = pd.DataFrame(weight_rows)
    y = out["home_won"].to_numpy(int)

    lines: list[str] = []
    a = lines.append
    a("# The four-term model, tuned")
    a("")
    a(f"blind seasons {len(seasons)}   held-out games {len(out)}")
    a("")
    a("## Weights, in fatigue points (mean across folds)")
    a("")
    for t in TERMS:
        a(f"  {t:<22} {wts[f'pts_{t}'].mean():>8.3f}  points")
    a(f"  {'home court':<22} {wts['home_court_pts'].mean():>8.3f}  points  (for reference)")
    a("")
    a("  Scale is chosen so the new score's spread matches today's rest advantage, so these")
    a("  numbers are directly comparable to the RA tiers already published.")
    a("")

    a("## Coverage: how often the four terms have anything to say")
    a("")
    nonzero = (out["ra4"].abs() > 1e-9).mean()
    a(f"  games with a non-zero differential   {nonzero:.4f}")
    a(f"  games where the four terms tie       {1 - nonzero:.4f}")
    a("")
    a("  Three of the four terms are near-binary, so when neither side is on a back-to-back,")
    a("  visiting altitude or coming off overtime, the model correctly has no opinion.")
    a("")

    a("## Operating points — pick the lower-score team when |RA| >= threshold")
    a("")
    a(f"  {'thresh':>7} {'calls':>7} {'cover':>7} {'hit':>7}   {'home n':>7} {'home hit':>9}   {'away n':>7} {'away hit':>9}")
    for thr in [0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0]:
        ra = out["ra4"].to_numpy()
        called = np.abs(ra) >= thr
        if called.sum() == 0:
            continue
        pick_home = ra > 0
        ok = np.where(pick_home, y == 1, y == 0)
        ch, ca = called & pick_home, called & ~pick_home
        a(
            f"  {thr:>7.2f} {int(called.sum()):>7} {called.mean():>7.3f} {ok[called].mean():>7.4f}   "
            f"{int(ch.sum()):>7} {ok[ch].mean() if ch.sum() else float('nan'):>9.4f}   "
            f"{int(ca.sum()):>7} {ok[ca].mean() if ca.sum() else float('nan'):>9.4f}"
        )
    a("")

    a("## The same, with home court in the rule (the visitor must out-rest it)")
    a("")
    a(f"  {'thresh':>7} {'calls':>7} {'cover':>7} {'hit':>7}   {'home n':>7} {'home hit':>9}   {'away n':>7} {'away hit':>9}")
    for thr in [0.25, 0.5, 1.0, 1.5, 2.0, 3.0]:
        m = out["ra4"].to_numpy() + out["home_court_pts"].to_numpy()
        called = np.abs(m) >= thr
        if called.sum() == 0:
            continue
        pick_home = m > 0
        ok = np.where(pick_home, y == 1, y == 0)
        ch, ca = called & pick_home, called & ~pick_home
        a(
            f"  {thr:>7.2f} {int(called.sum()):>7} {called.mean():>7.3f} {ok[called].mean():>7.4f}   "
            f"{int(ch.sum()):>7} {ok[ch].mean() if ch.sum() else float('nan'):>9.4f}   "
            f"{int(ca.sum()):>7} {ok[ca].mean() if ca.sum() else float('nan'):>9.4f}"
        )
    a("")

    a("## Today's shipped model on the identical held-out games, for comparison")
    a("")
    a(f"  {'thresh':>7} {'calls':>7} {'cover':>7} {'hit':>7}   {'home n':>7} {'home hit':>9}   {'away n':>7} {'away hit':>9}")
    for thr in [0.5, 2.0, 3.0, 5.0, 7.0]:
        ra = out["rest_advantage"].to_numpy()
        called = np.abs(ra) >= thr
        pick_home = ra > 0
        ok = np.where(pick_home, y == 1, y == 0)
        ch, ca = called & pick_home, called & ~pick_home
        a(
            f"  {thr:>7.2f} {int(called.sum()):>7} {called.mean():>7.3f} {ok[called].mean():>7.4f}   "
            f"{int(ch.sum()):>7} {ok[ch].mean() if ch.sum() else float('nan'):>9.4f}   "
            f"{int(ca.sum()):>7} {ok[ca].mean() if ca.sum() else float('nan'):>9.4f}"
        )
    a("")
    a("## What the four terms look like as a matchup")
    a("")
    for label, mask in [
        ("away on a back-to-back, home not", out["d_is_b2b"] == 1),
        ("home on a back-to-back, away not", out["d_is_b2b"] == -1),
        ("away visiting altitude", out["d_alt_visit"] == 1),
        ("away off an overtime, home not", out["d_prior_ot"] >= 1),
        ("all four terms tied", out["ra4"].abs() <= 1e-9),
    ]:
        m = mask.to_numpy()
        if m.sum() == 0:
            continue
        a(f"  {label:<36} n {int(m.sum()):>6}   home win rate {y[m].mean():.4f}")

    REPORT.write_text("\n".join(lines) + "\n")
    log.info("wrote %s", REPORT)


if __name__ == "__main__":
    main()
