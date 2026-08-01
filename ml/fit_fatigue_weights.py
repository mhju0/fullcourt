"""Fits fatigue factor weights out-of-sample, and grades them against the shipped model.

Protocol, decided before any of this was run:

* **Walk-forward.** For each test season from 2010-11 on, fit on every season from 2002-03 up
  to the one before it and predict the test season blind. Pooled over 16 seasons. 2002 is the
  floor because overtime, tip-off times and neutral-site flags only exist from then (ADR 0003).
* **Net of venue.** Every model carries a home-court intercept, so the fatigue weights measure
  what rest adds on top of knowing who is at home rather than quietly absorbing it.
* **Sign-clamped.** Physically, carrying a fatigue factor cannot make a team play better. Terms
  are oriented so every fatigue weight should be non-negative and are then fitted under that
  bound. An unconstrained pass runs alongside purely to report which terms wanted to go
  backwards — that is diagnostic information about confounding, not a model we would ship.
* **Controls are unbounded.** Team strength and schedule position are confounders, not fatigue,
  so they are free to take whatever sign the data wants.
* **Nothing about the test season informs the fit** — not the decay rate, not the workload
  variant, not the no-call band. Those come from an inner split inside the training window.
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from sklearn.metrics import log_loss

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "ml" / "data"
TABLE = DATA / "fatigue_model_table.csv"
REPORT = DATA / "fatigue_fit_report.txt"
WEIGHTS_CSV = DATA / "fatigue_fitted_weights.csv"

TRAIN_FLOOR = 2002
FIRST_TEST_SEASON = 2010
DECAY_RATES = [0.25, 0.3, 0.35, 0.4, 0.45, 0.52, 0.6, 0.7, 0.8]
WORKLOAD_VARIANTS = ["decay", "min", "poss"]
L2 = 1.0

# Fatigue terms, oriented so that "more of this" always means "more tired". Features are
# differenced away − home, so a non-negative weight means the factor helps the home team when
# the visitor carries it — the only physically coherent direction.
#
# Recovery terms are negated at load time (`NEGATE`) so they obey the same bound instead of
# needing a second, opposite rule.
FATIGUE_TERMS = [
    "d_workload",
    "d_travel_u_7",
    "d_road_over2",
    "d_jetlag_units",
    "d_is_b2b",
    "d_b2b_deficit",
    "d_rest_recovery",
    "d_home_stand_over2",
    "d_alt_visit",
    "d_alt_carry",
    "d_prior_ot",
    "d_density_points",
    "d_body_clock_off",
]
NEGATE = {"d_rest_recovery", "d_home_stand_over2"}

# The subset that survived the first pass: stable across folds, non-trivial, and in the
# physically possible direction. Everything else was pinned at zero by the clamp or drifted.
SURVIVING_TERMS = ["d_is_b2b", "d_alt_visit", "d_prior_ot", "d_density_points"]

# Not fatigue. Present so the fatigue weights cannot quietly absorb them.
CONTROLS = ["d_strength", "d_season_day"]

# Dropped from the earlier specification as collinear restatements of a term already present:
# travel over 30 days duplicates travel over 7, and 3-in-4 / 4-in-6 duplicate density points.
# Leaving them in was what drove several stable-but-backwards weights.
DROPPED_AS_COLLINEAR = ["d_travel_u_30", "d_is_3in4", "d_is_4in6", "d_season_game_no"]


def workload_column(variant: str, rate: float) -> str:
    tag = str(rate).replace(".", "")
    return {"decay": f"d_decay_u_{tag}", "min": f"d_min_u_{tag}", "poss": f"d_poss_u_{tag}"}[
        variant
    ]


def design(frame: pd.DataFrame, workload: str, features: list[str]) -> np.ndarray:
    cols = []
    for name in features:
        src = workload if name == "d_workload" else name
        v = frame[src].to_numpy(dtype=float)
        cols.append(-v if name in NEGATE else v)
    return np.column_stack(cols)


def fit_logistic(
    x: np.ndarray, y: np.ndarray, bounds: list[tuple | None] | None
) -> tuple[np.ndarray, float, np.ndarray, np.ndarray]:
    """L2 logistic MLE on standardised columns, optionally with box constraints.

    scikit-learn cannot express per-coefficient bounds, and the sign clamp is the whole point
    of the constrained pass, so the likelihood is optimised directly.
    """
    mu, sd = x.mean(axis=0), x.std(axis=0)
    sd = np.where(sd < 1e-12, 1.0, sd)
    z = (x - mu) / sd
    n, k = z.shape

    def objective(theta: np.ndarray) -> tuple[float, np.ndarray]:
        b0, w = theta[0], theta[1:]
        eta = b0 + z @ w
        # log(1 + exp(eta)) computed stably.
        ll = np.sum(np.logaddexp(0.0, eta) - y * eta)
        p = 1.0 / (1.0 + np.exp(-eta))
        resid = p - y
        grad = np.concatenate(([resid.sum()], z.T @ resid))
        ll += 0.5 * L2 * np.dot(w, w)
        grad[1:] += L2 * w
        return ll / n, grad / n

    theta0 = np.zeros(k + 1)
    box = [(None, None)] + (bounds if bounds is not None else [(None, None)] * k)
    res = minimize(objective, theta0, jac=True, method="L-BFGS-B", bounds=box)
    theta = res.x
    return theta[1:], float(theta[0]), mu, sd


def predict_proba(
    w: np.ndarray, b0: float, x: np.ndarray, mu: np.ndarray, sd: np.ndarray
) -> np.ndarray:
    eta = b0 + ((x - mu) / sd) @ w
    return 1.0 / (1.0 + np.exp(-eta))


def margin(w: np.ndarray, b0: float, x: np.ndarray, mu: np.ndarray, sd: np.ndarray) -> np.ndarray:
    return b0 + ((x - mu) / sd) @ w


def main() -> None:
    df = pd.read_csv(TABLE, low_memory=False)
    df = df[df["season_start"] >= TRAIN_FLOOR].copy()

    needed = set(FATIGUE_TERMS) - {"d_workload"} | set(CONTROLS) | {
        workload_column(v, r) for v in WORKLOAD_VARIANTS for r in DECAY_RATES
    }
    df[list(needed)] = df[list(needed)].fillna(0.0)

    test_seasons = sorted(s for s in df["season_start"].unique() if s >= FIRST_TEST_SEASON)
    log.info("games %d, test seasons %d", len(df), len(test_seasons))

    rows: list[dict] = []
    weight_rows: list[dict] = []
    chosen: list[dict] = []

    full_features = FATIGUE_TERMS + CONTROLS
    fatigue_bounds = [(0.0, None)] * len(FATIGUE_TERMS) + [(None, None)] * len(CONTROLS)

    for season in test_seasons:
        train = df[df["season_start"] < season]
        test = df[df["season_start"] == season]
        if len(train) < 2000 or len(test) == 0:
            continue

        inner_cut = sorted(train["season_start"].unique())[-1]
        inner_train = train[train["season_start"] < inner_cut]
        inner_val = train[train["season_start"] == inner_cut]
        y_inner_tr = inner_train["home_won"].to_numpy(dtype=int)
        y_inner_va = inner_val["home_won"].to_numpy(dtype=int)

        best = None
        for variant in WORKLOAD_VARIANTS:
            for rate in DECAY_RATES:
                col = workload_column(variant, rate)
                xtr = design(inner_train, col, full_features)
                xva = design(inner_val, col, full_features)
                w, b0, mu, sd = fit_logistic(xtr, y_inner_tr, fatigue_bounds)
                ll = log_loss(y_inner_va, predict_proba(w, b0, xva, mu, sd))
                if best is None or ll < best[0]:
                    best = (ll, variant, rate)
        _, variant, rate = best
        wl = workload_column(variant, rate)
        chosen.append({"season": season, "variant": variant, "rate": rate})

        y_tr = train["home_won"].to_numpy(dtype=int)
        y = test["home_won"].to_numpy(dtype=int)

        # ── models, all graded on identical held-out games ─────────────────────
        p_base = np.full(len(test), train["home_won"].mean())

        x_inc_tr = train[["rest_advantage"]].to_numpy(dtype=float)
        x_inc_te = test[["rest_advantage"]].to_numpy(dtype=float)
        w_i, b_i, mu_i, sd_i = fit_logistic(x_inc_tr, y_tr, None)
        p_inc = predict_proba(w_i, b_i, x_inc_te, mu_i, sd_i)

        # Fatigue only (plus home court), sign-clamped — the shippable model.
        f_only = FATIGUE_TERMS
        xf_tr, xf_te = design(train, wl, f_only), design(test, wl, f_only)
        w_f, b_f, mu_f, sd_f = fit_logistic(xf_tr, y_tr, [(0.0, None)] * len(f_only))
        p_fit = predict_proba(w_f, b_f, xf_te, mu_f, sd_f)

        # Fatigue + controls — the specification the weights are TAKEN from (Q6).
        xc_tr, xc_te = design(train, wl, full_features), design(test, wl, full_features)
        w_c, b_c, mu_c, sd_c = fit_logistic(xc_tr, y_tr, fatigue_bounds)
        p_ctl = predict_proba(w_c, b_c, xc_te, mu_c, sd_c)

        # Controls WITHOUT any fatigue term, to isolate what fatigue actually adds.
        xn_tr, xn_te = design(train, wl, CONTROLS), design(test, wl, CONTROLS)
        w_n, b_n, mu_n, sd_n = fit_logistic(xn_tr, y_tr, None)
        p_nofat = predict_proba(w_n, b_n, xn_te, mu_n, sd_n)

        # Q7's drop rule, applied: only the terms whose weight was stable and non-zero in
        # the physically possible direction, plus the same controls. If this matches the
        # full model, the nine terms it omits are decoration.
        parsim = SURVIVING_TERMS + CONTROLS
        xp_tr, xp_te = design(train, wl, parsim), design(test, wl, parsim)
        w_p, b_p, mu_p, sd_p = fit_logistic(
            xp_tr, y_tr, [(0.0, None)] * len(SURVIVING_TERMS) + [(None, None)] * len(CONTROLS)
        )
        p_parsim = predict_proba(w_p, b_p, xp_te, mu_p, sd_p)

        # Unconstrained, for the confounding diagnostic only.
        w_u, b_u, mu_u, sd_u = fit_logistic(xc_tr, y_tr, None)

        # ── product rule ──────────────────────────────────────────────────────
        ra = test["rest_advantage"].to_numpy()
        inc_called = np.abs(ra) >= 0.5
        inc_home = ra > 0
        inc_correct = np.where(inc_home, y == 1, y == 0)

        m_tr = margin(w_f, b_f, xf_tr, mu_f, sd_f)
        target_cov = float((np.abs(train["rest_advantage"].to_numpy()) >= 0.5).mean())
        band = float(np.quantile(np.abs(m_tr), 1.0 - target_cov))
        m_te = margin(w_f, b_f, xf_te, mu_f, sd_f)
        fit_home, fit_away = m_te > band, m_te < -band
        fit_correct = np.where(m_te > 0, y == 1, y == 0)

        rows.append(
            {
                "season": season,
                "n_test": len(test),
                "variant": variant,
                "rate": rate,
                "ll_base": log_loss(y, p_base),
                "ll_incumbent": log_loss(y, p_inc),
                "ll_fitted": log_loss(y, p_fit),
                "ll_controls_only": log_loss(y, p_nofat),
                "ll_fitted_controls": log_loss(y, p_ctl),
                "ll_parsimonious": log_loss(y, p_parsim),
                "acc_incumbent": float(((p_inc > 0.5).astype(int) == y).mean()),
                "acc_fitted": float(((p_fit > 0.5).astype(int) == y).mean()),
                # counts, so pooling never divides by an empty fold
                "inc_n": int(inc_called.sum()),
                "inc_ok": int(inc_correct[inc_called].sum()),
                "inc_n_home": int((inc_called & inc_home).sum()),
                "inc_ok_home": int(inc_correct[inc_called & inc_home].sum()),
                "inc_n_away": int((inc_called & ~inc_home).sum()),
                "inc_ok_away": int(inc_correct[inc_called & ~inc_home].sum()),
                "fit_n": int((fit_home | fit_away).sum()),
                "fit_ok": int(fit_correct[fit_home | fit_away].sum()),
                "fit_n_home": int(fit_home.sum()),
                "fit_ok_home": int(fit_correct[fit_home].sum()),
                "fit_n_away": int(fit_away.sum()),
                "fit_ok_away": int(fit_correct[fit_away].sum()),
            }
        )

        for label, w_, b_, sd_ in [
            ("clamped", w_c, b_c, sd_c),
            ("unconstrained", w_u, b_u, sd_u),
        ]:
            for name, coef, s in zip(full_features, w_, sd_):
                weight_rows.append(
                    {
                        "season": season,
                        "model": label,
                        "feature": name,
                        "weight": float(coef / s),
                    }
                )
            weight_rows.append(
                {"season": season, "model": label, "feature": "intercept", "weight": float(b_)}
            )

    res = pd.DataFrame(rows)
    wts = pd.DataFrame(weight_rows)
    wts.to_csv(WEIGHTS_CSV, index=False)

    def pooled(col: str) -> float:
        return float(np.average(res[col], weights=res["n_test"]))

    def rate_of(ok: str, n: str) -> tuple[int, float]:
        total_n = int(res[n].sum())
        total_ok = int(res[ok].sum())
        return total_n, (total_ok / total_n if total_n else float("nan"))

    modern = res[res["season"] >= 2016]
    lines: list[str] = []
    a = lines.append

    a("# Fatigue weight fit — walk-forward, out-of-sample")
    a("")
    a(f"train floor      {TRAIN_FLOOR}-03")
    a(f"test seasons     {len(res)}  ({int(res['season'].min())}..{int(res['season'].max())})")
    a(f"held-out games   {int(res['n_test'].sum())}")
    a("")
    a("## What each layer adds, out-of-sample (log loss, lower is better)")
    a("")
    a(f"  home court only              {pooled('ll_base'):.5f}")
    a(f"  + shipped rest advantage     {pooled('ll_incumbent'):.5f}   ({pooled('ll_base') - pooled('ll_incumbent'):+.5f})")
    a(f"  + fitted fatigue factors     {pooled('ll_fitted'):.5f}   ({pooled('ll_base') - pooled('ll_fitted'):+.5f})")
    a("")
    a(f"  controls only (no fatigue)   {pooled('ll_controls_only'):.5f}")
    a(f"  controls + fatigue (13)      {pooled('ll_fitted_controls'):.5f}   ({pooled('ll_controls_only') - pooled('ll_fitted_controls'):+.5f})")
    a(f"  controls + fatigue (4 only)  {pooled('ll_parsimonious'):.5f}   ({pooled('ll_controls_only') - pooled('ll_parsimonious'):+.5f})")
    a("")
    a(f"  the 9 dropped terms are worth {pooled('ll_parsimonious') - pooled('ll_fitted_controls'):+.5f} log loss between them")
    a("")
    a(f"  FITTED vs SHIPPED            {pooled('ll_incumbent') - pooled('ll_fitted'):+.5f} log loss")
    a(f"  modern only (2016+)          {np.average(modern['ll_incumbent'], weights=modern['n_test']) - np.average(modern['ll_fitted'], weights=modern['n_test']):+.5f}")
    a("")
    a("  The second block is the honest one: it asks what fatigue adds once team strength")
    a("  and schedule position are already known. The first block lets fatigue keep whatever")
    a("  it can absorb of them.")
    a("")
    a("## The product rule, coverage-matched on the training window")
    a("")
    for label, prefix in [
        ("shipped  — pick lower fatigue when |RA| >= 0.5", "inc"),
        ("fitted   — pick when the margin clears the band", "fit"),
    ]:
        n, acc = rate_of(f"{prefix}_ok", f"{prefix}_n")
        nh, ah = rate_of(f"{prefix}_ok_home", f"{prefix}_n_home")
        na, aa = rate_of(f"{prefix}_ok_away", f"{prefix}_n_away")
        a(f"  {label}")
        a(f"     calls      {n:>6}   hit rate {acc:.4f}")
        a(f"     picks home {nh:>6}   hit rate {ah:.4f}")
        a(f"     picks away {na:>6}   hit rate {aa:.4f}")
        a("")
    a("## Chosen on inner validation (never the test season)")
    ch = pd.DataFrame(chosen)
    a(f"  workload variant  {ch['variant'].value_counts().to_dict()}")
    a(f"  decay rate        {ch['rate'].value_counts().to_dict()}")
    a("")
    a("## Weights — mean across folds, raw feature units, WITH controls")
    a("")
    a("  feature                    clamped     unconstrained   same-sign   stability")
    for feat in FATIGUE_TERMS + CONTROLS + ["intercept"]:
        c = wts[(wts["model"] == "clamped") & (wts["feature"] == feat)]["weight"]
        u = wts[(wts["model"] == "unconstrained") & (wts["feature"] == feat)]["weight"]
        if len(c) == 0:
            continue
        same = float((np.sign(u) == np.sign(u.mean())).mean()) if len(u) else float("nan")
        cv = c.std() / abs(c.mean()) if abs(c.mean()) > 1e-12 else float("inf")
        note = ""
        if feat in FATIGUE_TERMS:
            if abs(c.mean()) < 1e-6:
                note = "  <-- pinned at zero by the clamp"
            elif u.mean() < 0:
                note = "  <-- wanted to go backwards"
        a(f"  {feat:<26} {c.mean():>10.5f}   {u.mean():>12.5f}     {same:>5.2f}    cv {cv:>6.2f}{note}")
    a("")
    a("  A term pinned at zero is one the data declines to support in the physically")
    a("  possible direction. A term that 'wanted to go backwards' is picking up something")
    a("  that is not fatigue.")
    a("")
    a("## Per season")
    a("")
    a("  season  n_test  variant  rate   ll_inc    ll_fit    inc_calls inc_acc   fit_calls fit_acc")
    for _, r in res.iterrows():
        a(
            f"  {int(r['season'])}   {int(r['n_test']):>5}  {r['variant']:>7}  {r['rate']:.2f}  "
            f"{r['ll_incumbent']:.5f}  {r['ll_fitted']:.5f}   {int(r['inc_n']):>6}  "
            f"{r['inc_ok'] / max(1, r['inc_n']):.4f}    {int(r['fit_n']):>6}  "
            f"{r['fit_ok'] / max(1, r['fit_n']):.4f}"
        )

    REPORT.write_text("\n".join(lines) + "\n")
    log.info("wrote %s", REPORT)


if __name__ == "__main__":
    main()
