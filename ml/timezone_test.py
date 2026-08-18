"""Does a long eastward flight on short rest cost anything?

The pre-registered test in ``ml/timezone_preregistration.md``. Read that first: the population,
the terms, the protocol and what would count as a finding were all fixed before any figure here
was seen, and the result is published either way.

The short version of why this is not already answered. ADR 0006 measured jet lag and body-clock
tip time as **main effects across all games** and found both to be nothing. It did not test the
narrower claim — that the cost is concentrated where the traveller has no time to re-entrain, a
long **eastward** shift arriving on **short rest**. Direction was not even separable from the
exported columns until ``zone_shift_hours`` was added on 2026-08-18: ``zones_crossed`` is the
absolute value and ``jetlag_units`` folds direction together with the re-entrainment fraction.

Protocol is ADR 0006's, so these numbers sit beside the ones already published there: walk-forward
by season, train on everything before the held-out season and never look ahead, sign-clamped L2
logistic, and the team-strength control in — without it any schedule term partly proxies for who
is good.

Usage:
    ml/.venv/bin/python ml/timezone_test.py
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
FEATURES_CSV = DATA / "fatigue_features.csv"
TABLE_CSV = DATA / "fatigue_model_table.csv"
REPORT = DATA / "timezone_report.txt"

# Both from ADR 0006, so the folds are the same ones its table was built on.
TRAIN_FLOOR = 2002
FIRST_TEST_SEASON = 2010
L2 = 1.0

# The model ADR 0006 landed on. The candidates are measured on top of this, not against nothing.
BASELINE = ["d_is_b2b", "d_alt_visit", "d_prior_ot", "d_density_points"]
STRENGTH = "d_strength"

# Pre-registered. `d_east3_short` is primary; the other three are its controls — if east and west
# move together the finding is about short rest, not about direction.
CANDIDATES = ["d_east3_short", "d_west3_short", "d_east3", "d_west3"]

#: Hours of clock shift that counts as "long". Pre-registered at 3 — the question was asked about
#: 3+ zone movement, and it is the point past which a single night cannot re-entrain.
LONG_SHIFT_HOURS = 3.0
#: Days of rest that counts as "short". 1 or fewer: tonight is a back-to-back or one day after.
SHORT_REST_DAYS = 1.0


def fit_clamped(x: np.ndarray, y: np.ndarray, clamp: list[bool]) -> tuple[np.ndarray, float]:
    """Sign-clamped L2 logistic, lifted from `ml/four_term_model.py` so the protocol is identical.

    `clamp[i]` forces weight i to be non-negative. Fatigue terms are clamped — a factor that
    tires a team cannot physically make it play better — while the strength control is free,
    since it is not a fatigue term and its sign is not a physical claim.
    """
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
        bounds=[(None, None)] + [(0.0, None) if c else (None, None) for c in clamp],
    )
    return res.x[1:], float(res.x[0])


def log_loss(y: np.ndarray, p: np.ndarray) -> float:
    p = np.clip(p, 1e-12, 1 - 1e-12)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def build_terms() -> pd.DataFrame:
    """Per-game `d_` columns for the four candidates, from the per-side feature export.

    A home team crosses zero zones, so its value on every one of these is 0 and the difference
    `away − home` is just the away team's value. Computed as a difference anyway, because that
    is the convention every other column in the model table follows and a hand-rolled exception
    is how a sign error gets in.
    """
    log.info("reading %s", FEATURES_CSV)
    df = pd.read_csv(
        FEATURES_CSV,
        low_memory=False,
        usecols=["game_id", "is_home", "zone_shift_hours", "rest_days"],
    )

    shift = df["zone_shift_hours"].fillna(0.0)
    # NaN rest is a season opener — a long break, so not short rest. Filled rather than dropped:
    # dropping would silently remove every opener from the population.
    short = df["rest_days"].fillna(99.0) <= SHORT_REST_DAYS

    df["east3"] = (shift >= LONG_SHIFT_HOURS).astype(float)
    df["west3"] = (shift <= -LONG_SHIFT_HOURS).astype(float)
    df["east3_short"] = (df["east3"].astype(bool) & short).astype(float)
    df["west3_short"] = (df["west3"].astype(bool) & short).astype(float)

    cols = ["east3", "west3", "east3_short", "west3_short"]
    home = df[df["is_home"] == 1].set_index("game_id")
    away = df[df["is_home"] == 0].set_index("game_id")
    common = home.index.intersection(away.index)

    out = pd.DataFrame(index=common)
    for c in cols:
        out[f"d_{c}"] = away.loc[common, c].to_numpy() - home.loc[common, c].to_numpy()
    return out.reset_index()


def describe(df: pd.DataFrame, lines: list[str]) -> None:
    """The raw split, with denominators.

    Pre-registered as reported regardless of the fit: a null over 40 games is a different
    statement from a null over 3,000, and the published figure has to say which it is.
    """
    a = lines.append
    a("## The raw split — home win rate by what the visitor did to get there")
    a("")
    a("No controls at all. Read it for the denominators, not for the effect.")
    a("")
    a("| visitor's trip | games | home win % |")
    a("|---|---:|---:|")

    y = df["home_won"].to_numpy(int)
    rows = [
        ("all games in the era", np.ones(len(df), bool)),
        ("east ≥ 3h", df["d_east3"].to_numpy() > 0),
        ("east ≥ 3h, short rest", df["d_east3_short"].to_numpy() > 0),
        ("west ≥ 3h", df["d_west3"].to_numpy() > 0),
        ("west ≥ 3h, short rest", df["d_west3_short"].to_numpy() > 0),
        (
            "no long shift either way",
            (df["d_east3"].to_numpy() == 0) & (df["d_west3"].to_numpy() == 0),
        ),
    ]
    for label, mask in rows:
        n = int(mask.sum())
        pct = 100.0 * y[mask].mean() if n else float("nan")
        a(f"| {label} | {n:,} | {pct:.2f} |")
    a("")


def main() -> None:
    terms = build_terms()

    log.info("reading %s", TABLE_CSV)
    table = pd.read_csv(TABLE_CSV, low_memory=False)
    df = table.merge(terms, on="game_id", how="inner")
    df = df[df["season_start"] >= TRAIN_FLOOR].copy()
    df[BASELINE + CANDIDATES + [STRENGTH]] = df[
        BASELINE + CANDIDATES + [STRENGTH]
    ].fillna(0.0)
    log.info("games after merge: %d", len(df))

    seasons = sorted(s for s in df["season_start"].unique() if s >= FIRST_TEST_SEASON)

    models = {
        "strength only": [STRENGTH],
        "four-term + strength (the baseline)": BASELINE + [STRENGTH],
        "+ east/west × short rest": BASELINE + [STRENGTH] + CANDIDATES,
    }

    results: dict[str, dict] = {}
    fold_weights: dict[str, list[dict]] = {name: [] for name in models}

    for name, feats in models.items():
        clamp = [f != STRENGTH for f in feats]
        preds, actuals = [], []
        for season in seasons:
            train = df[df["season_start"] < season]
            test = df[df["season_start"] == season]
            w, b0 = fit_clamped(
                train[feats].to_numpy(float), train["home_won"].to_numpy(int), clamp
            )
            eta = b0 + test[feats].to_numpy(float) @ w
            preds.append(1.0 / (1.0 + np.exp(-eta)))
            actuals.append(test["home_won"].to_numpy(int))
            fold_weights[name].append(
                {"season": season, **{f: float(v) for f, v in zip(feats, w)}}
            )
        p = np.concatenate(preds)
        y = np.concatenate(actuals)
        results[name] = {"log_loss": log_loss(y, p), "n": len(y)}

    # ── Why a stable weight can still be worth nothing ────────────────────────────────────
    # ADR 0006 had to correct itself for reading a fitted weight as if it measured what a term
    # contributes. A term can hold a stable non-zero weight and add no predictive value at all
    # when it restates something the model already has — so the overlap is measured, and each
    # candidate is also added on its own, rather than inferred.
    overlap_rows = []
    for term in CANDIDATES:
        mask = df[term].to_numpy() > 0
        n = int(mask.sum())
        if n == 0:
            overlap_rows.append((term, 0, float("nan"), float("nan")))
            continue
        alt = 100.0 * (df.loc[mask, "d_alt_visit"].to_numpy() > 0).mean()
        b2b = 100.0 * (df.loc[mask, "d_is_b2b"].to_numpy() > 0).mean()
        overlap_rows.append((term, n, alt, b2b))

    solo: dict[str, float] = {}
    for term in CANDIDATES:
        feats = BASELINE + [STRENGTH, term]
        clamp = [f != STRENGTH for f in feats]
        preds, actuals = [], []
        for season in seasons:
            train = df[df["season_start"] < season]
            test = df[df["season_start"] == season]
            w, b0 = fit_clamped(
                train[feats].to_numpy(float), train["home_won"].to_numpy(int), clamp
            )
            eta = b0 + test[feats].to_numpy(float) @ w
            preds.append(1.0 / (1.0 + np.exp(-eta)))
            actuals.append(test["home_won"].to_numpy(int))
        solo[term] = log_loss(np.concatenate(actuals), np.concatenate(preds))

    lines: list[str] = []
    a = lines.append
    a("# Does a long eastward flight on short rest cost anything?")
    a("")
    a("Pre-registered in `ml/timezone_preregistration.md` before any figure below was seen.")
    a(f"Walk-forward, {len(seasons)} blind seasons, {results['strength only']['n']:,} held-out games.")
    a("Log loss, lower is better. Protocol identical to ADR 0006.")
    a("")

    describe(df, lines)

    a("## Held-out log loss")
    a("")
    a("| model | log loss | vs the layer above |")
    a("|---|---:|---:|")
    prev = None
    for name in models:
        ll = results[name]["log_loss"]
        delta = "—" if prev is None else f"{prev - ll:+.5f}"
        a(f"| {name} | {ll:.5f} | {delta} |")
        prev = ll
    a("")

    base = results["four-term + strength (the baseline)"]["log_loss"]
    full = results["+ east/west × short rest"]["log_loss"]
    a(f"The four candidate terms together are worth **{base - full:+.5f}** log loss.")
    a("")
    a("For scale, from ADR 0006: every fatigue factor in the model combined is worth +0.00245,")
    a("and team strength alone is worth +0.060 — about twenty-five times as much.")
    a("")

    a("## The candidate weights, across folds")
    a("")
    a("Sign-clamped, so a term the data wants to push negative is pinned at 0 and reported as")
    a("such. `cv` is the coefficient of variation across folds; ADR 0006 called cv > 1 unstable.")
    a("")
    a("| term | mean weight | cv | folds non-zero | verdict |")
    a("|---|---:|---:|---:|---|")
    fw = pd.DataFrame(fold_weights["+ east/west × short rest"])
    for term in CANDIDATES:
        vals = fw[term].to_numpy(float)
        mean = vals.mean()
        cv = float(vals.std() / abs(mean)) if abs(mean) > 1e-12 else float("inf")
        nonzero = int((vals > 1e-9).sum())
        if mean < 1e-6:
            verdict = "pinned at zero by the clamp — nothing"
        elif cv > 1.0:
            verdict = "unstable"
        else:
            verdict = "stable"
        cv_s = "—" if not np.isfinite(cv) else f"{cv:.2f}"
        a(f"| `{term}` | {mean:.4f} | {cv_s} | {nonzero}/{len(vals)} | {verdict} |")
    a("")

    a("## Does any candidate earn its place on its own?")
    a("")
    a("Each added to the baseline alone, so a term is not hidden by the other three.")
    a("A stable weight is not evidence of value — ADR 0006 corrected exactly that reading.")
    a("")
    a("| term | log loss added alone | vs baseline |")
    a("|---|---:|---:|")
    for term in CANDIDATES:
        a(f"| `{term}` | {solo[term]:.5f} | {base - solo[term]:+.5f} |")
    a("")

    a("## Why the raw split looks like an effect")
    a("")
    a("`d_strength` reads home − away, so a positive mean means the home team was the better")
    a("side in that cell. Geography decides who flies which way: a ≥3h westward trip is an")
    a("Eastern team visiting the Pacific coast, and a ≥3h eastward trip is the reverse.")
    a("")
    a("| visitor's trip | games | mean strength edge to home | home win % |")
    a("|---|---:|---:|---:|")
    y_all = df["home_won"].to_numpy(int)
    for label, mask in [
        ("east ≥ 3h", df["d_east3"].to_numpy() > 0),
        ("west ≥ 3h", df["d_west3"].to_numpy() > 0),
        ("no long shift", (df["d_east3"].to_numpy() == 0) & (df["d_west3"].to_numpy() == 0)),
    ]:
        n = int(mask.sum())
        a(
            f"| {label} | {n:,} | {df.loc[mask, STRENGTH].mean():+.4f} | "
            f"{100.0 * y_all[mask].mean():.2f} |"
        )
    a("")

    a("## What the candidates overlap with")
    a("")
    a("The baseline already carries visiting altitude and back-to-back. Denver and Utah are")
    a("both western and both high, so a westward term partly restates the altitude term.")
    a("")
    a("| term | games | also visiting altitude | also back-to-back |")
    a("|---|---:|---:|---:|")
    for term, n, alt, b2b in overlap_rows:
        alt_s = "—" if n == 0 else f"{alt:.1f}%"
        b2b_s = "—" if n == 0 else f"{b2b:.1f}%"
        a(f"| `{term}` | {n:,} | {alt_s} | {b2b_s} |")
    a("")

    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    log.info("wrote %s", REPORT)
    print("\n".join(lines))


if __name__ == "__main__":
    main()
