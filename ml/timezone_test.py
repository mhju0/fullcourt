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

import hashlib
import json
import logging
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from fatigue_artifacts import require_model_table
from scipy.optimize import minimize

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "ml" / "data"
FEATURES_CSV = DATA / "fatigue_features.csv"
TABLE_CSV = DATA / "fatigue_model_table.csv"
FIT_METRICS_JSON = ROOT / "ml" / "fatigue_fit_metrics.json"
REPORT = DATA / "timezone_report.txt"
#: The committed snapshot the method page reads. Written here, never by hand.
PUBLISHED_JSON = ROOT / "src" / "data" / "timezone-null.json"

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
#: "Short rest", pre-registered as "≤ 1 day of rest". `rest_days` counts days since the previous
#: game, so 1 is a back-to-back and this is the visitor playing on consecutive nights.
SHORT_REST_DAYS = 1.0
#: The wider reading of the same words, "≤ 1 day off" (days since ≤ 2). Run as a sensitivity
#: check and published beside the result; it does not replace the pre-registered definition.
SENSITIVITY_SHORT_REST_DAYS = 2.0


def fitted_comparison() -> dict[str, float]:
    metrics = json.loads(FIT_METRICS_JSON.read_text())
    digest = hashlib.sha256(TABLE_CSV.read_bytes()).hexdigest()
    if metrics["modelTableSha256"] != digest:
        raise ValueError("Fatigue fit metrics are stale; run export → prepare → fit first")
    loss = metrics["pooledLogLoss"]
    return {
        "everyFatigueFactorCombined": round(loss["ll_controls_only"] - loss["ll_fitted_controls"], 5),
        "strengthAlone": round(loss["ll_base"] - loss["ll_controls_only"], 5),
    }


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


def build_terms(short_rest_days: float) -> pd.DataFrame:
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
    short = df["rest_days"].fillna(99.0) <= short_rest_days
    df["b2b"] = (df["rest_days"] == 1).astype(float)

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
    # Not a model term: whether the visitor itself played the night before, for the overlap table.
    out["away_b2b"] = away.loc[common, "b2b"].to_numpy()
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


def measure(short_rest_days: float) -> dict:
    """Every figure the test produces under one definition of short rest."""
    terms = build_terms(short_rest_days)

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
            overlap_rows.append((term, 0, float("nan"), float("nan"), float("nan")))
            continue
        alt = 100.0 * (df.loc[mask, "d_alt_visit"].to_numpy() > 0).mean()
        b2b = 100.0 * (df.loc[mask, "d_is_b2b"].to_numpy() > 0).mean()
        visitor_b2b = 100.0 * (df.loc[mask, "away_b2b"].to_numpy() > 0).mean()
        overlap_rows.append((term, n, alt, b2b, visitor_b2b))

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

    fw = pd.DataFrame(fold_weights["+ east/west × short rest"])
    weights = {}
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
        weights[term] = {"mean": mean, "cv": cv, "nonzero": nonzero, "folds": len(vals), "verdict": verdict}

    return {
        "df": df,
        "seasons": seasons,
        "models": models,
        "results": results,
        "weights": weights,
        "overlap": overlap_rows,
        "solo": solo,
    }


def report_lines(m: dict) -> list[str]:
    df, seasons, models, results, solo = m["df"], m["seasons"], m["models"], m["results"], m["solo"]

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
    for term in CANDIDATES:
        w = m["weights"][term]
        cv_s = "—" if not np.isfinite(w["cv"]) else f"{w['cv']:.2f}"
        a(f"| `{term}` | {w['mean']:.4f} | {cv_s} | {w['nonzero']}/{w['folds']} | {w['verdict']} |")
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
    a("`d_is_b2b` is a difference: it is non-zero when the visitor is on a back-to-back and the")
    a("home team is not. Where both are, the term is zero, so the two columns differ.")
    a("")
    a("| term | games | also visiting altitude | back-to-back term non-zero | visitor on a back-to-back |")
    a("|---|---:|---:|---:|---:|")
    for term, n, alt, b2b, visitor_b2b in m["overlap"]:
        alt_s = "—" if n == 0 else f"{alt:.1f}%"
        b2b_s = "—" if n == 0 else f"{b2b:.1f}%"
        v_s = "—" if n == 0 else f"{visitor_b2b:.1f}%"
        a(f"| `{term}` | {n:,} | {alt_s} | {b2b_s} | {v_s} |")
    a("")

    return lines


def raw_split(df: pd.DataFrame) -> list[dict]:
    y = df["home_won"].to_numpy(int)
    east, west = df["d_east3"].to_numpy() > 0, df["d_west3"].to_numpy() > 0
    neither = ~east & ~west
    cells = [
        ("all games in the era", np.ones(len(df), bool), False),
        ("east ≥ 3h", east, True),
        ("east ≥ 3h, short rest", df["d_east3_short"].to_numpy() > 0, False),
        ("west ≥ 3h", west, True),
        ("west ≥ 3h, short rest", df["d_west3_short"].to_numpy() > 0, False),
        ("no long shift either way", neither, True),
    ]
    return [
        {
            "trip": label,
            "games": int(mask.sum()),
            "homeWinPct": round(100.0 * y[mask].mean(), 2),
            "strengthEdgeToHome": round(float(df.loc[mask, STRENGTH].mean()), 4) if edge else None,
        }
        for label, mask, edge in cells
    ]


def published(m: dict, sens: dict) -> dict:
    """The snapshot `src/data/timezone-null.json`, from the pre-registered run plus the check."""
    df, results = m["df"], m["results"]
    strength = results["strength only"]["log_loss"]
    base = results["four-term + strength (the baseline)"]["log_loss"]
    full = results["+ east/west × short rest"]["log_loss"]
    overlap = {row[0]: row for row in m["overlap"]}

    def term_row(term: str) -> dict:
        w, (_, n, alt, b2b, visitor_b2b) = m["weights"][term], overlap[term]
        return {
            "term": term,
            "meanWeight": round(w["mean"], 4),
            "cv": round(w["cv"], 2) if np.isfinite(w["cv"]) else None,
            "foldsNonZero": w["nonzero"],
            "verdict": w["verdict"],
            "aloneVsBaseline": round(base - m["solo"][term], 5) + 0.0,
            "games": n,
            "alsoAltitudePct": round(alt, 1),
            "backToBackTermPct": round(b2b, 1),
            "visitorBackToBackPct": round(visitor_b2b, 1),
        }

    s_results = sens["results"]
    s_base = s_results["four-term + strength (the baseline)"]["log_loss"]
    s_full = s_results["+ east/west × short rest"]["log_loss"]
    s_east = sens["weights"]["d_east3_short"]
    s_split = {r["trip"]: r for r in raw_split(sens["df"])}
    return {
        "generatedBy": "ml/timezone_test.py",
        "preRegistration": "ml/timezone_preregistration.md",
        "report": str(REPORT.relative_to(ROOT)),
        "historicalReport": "ml/TIMEZONE_REPORT.md",
        "adr": "docs/adr/0006-fatigue-weights-were-fitted-and-the-model-was-not-changed.md",
        "measuredOn": date.today().isoformat(),
        "protocol": {
            "folds": len(m["seasons"]),
            "heldOutGames": results["strength only"]["n"],
            "gamesInEra": len(df),
            "baselineHomeWinPct": round(100.0 * df["home_won"].mean(), 2),
            "thresholdHours": int(LONG_SHIFT_HOURS),
            "shortRest": "visitor played the previous night (days since its last game ≤ 1)",
        },
        "rawSplit": raw_split(df),
        "logLoss": {
            "strengthOnly": round(strength, 5),
            "baseline": round(base, 5),
            "withCandidates": round(full, 5),
            "baselineWorth": round(strength - base, 5),
            "candidatesWorth": round(base - full, 5),
            **fitted_comparison(),
        },
        "terms": [term_row(t) for t in CANDIDATES],
        "primaryTerm": "d_east3_short",
        "sensitivity": {
            "shortRest": "visitor on at most one day off (days since its last game ≤ 2)",
            "eastShortGames": s_split["east ≥ 3h, short rest"]["games"],
            "westShortGames": s_split["west ≥ 3h, short rest"]["games"],
            "candidatesWorth": round(s_base - s_full, 5),
            "primaryFoldsNonZero": s_east["nonzero"],
        },
    }


def main() -> None:
    require_model_table(ROOT)
    fitted_comparison()
    primary = measure(SHORT_REST_DAYS)
    sens = measure(SENSITIVITY_SHORT_REST_DAYS)

    lines = report_lines(primary)
    snapshot = published(primary, sens)
    s = snapshot["sensitivity"]
    lines += [
        "## Sensitivity: short rest read as at most one day off",
        "",
        "Not the pre-registered definition. The same words can be read as days off rather than",
        "days since, which also admits a visitor with one night between games. Reported beside",
        "the result, never in place of it.",
        "",
        f"- short-rest games: east {s['eastShortGames']:,}, west {s['westShortGames']:,}",
        f"- the four candidates are worth {s['candidatesWorth']:+.5f} log loss",
        f"- `d_east3_short` non-zero in {s['primaryFoldsNonZero']}/{snapshot['protocol']['folds']} folds",
        "",
    ]

    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    log.info("wrote %s", REPORT)
    PUBLISHED_JSON.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    log.info("wrote %s", PUBLISHED_JSON)
    print("\n".join(lines))


if __name__ == "__main__":
    main()
