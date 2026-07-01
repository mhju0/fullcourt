"""Playoff Predictor — Phase 4 (T4): compute series-winner PROBABILITIES (dry-run by default).

Reuses the Phase 3 UNREGULARIZED logistic (``ml.train_series_model.predict_logistic_unreg``) with
the IDENTICAL feature order, label, standardization, and expanding-window-by-season protocol. It
computes, for every trainable playoff series, the predicted probability that the HOME-COURT
(reference) team wins the series, under BOTH methods:

  • full_insample    — one logistic fit on all trainable rows, each row predicted in-sample.
  • walk_forward_oos — Phase 3's expanding window: each season's series are predicted by a model
                       trained only on strictly-earlier seasons (>= MIN_TRAIN_SEASONS of history).
                       Seasons below the minimum-train threshold get NO probability (skipped).

ORIENTATION (matches the Phase 3 label, train_series_model.py:16,108,116):
  probability = P(series_winner == home_court_team) = P(y=1).
  predicted winner = the series' home-court team when prob >= 0.5, else its opponent.

By DEFAULT this writes NOTHING to the database — it emits a human-readable dry-run report to
ml/predict_series_dryrun.txt so every number can be verified by re-reading the file.

The DB insert is GATED behind --write (OFF by default) and additionally REFUSES to run unless the
``playoff_series_predictions`` table already exists (apply drizzle/0007 in Supabase first).

Run (dry-run, no DB write — what you run now):
    ./ml/.venv/bin/python ml/predict_series.py
Run (GATED write, ONLY after drizzle/0007 is applied):
    ./ml/.venv/bin/python ml/predict_series.py --write

DATABASE_URL resolution + read-only session pattern mirror ml/train_series_model.py.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import psycopg2

# Import the Phase 3 model + shared config so the sign convention stays byte-for-byte identical.
# (Script lives in ml/; ensure its own dir is importable regardless of the CWD it's launched from.)
sys.path.insert(0, str(Path(__file__).resolve().parent))
from train_series_model import (  # noqa: E402
    FEATURES,
    MIN_TRAIN_SEASONS,
    predict_logistic_unreg,
    resolve_database_url,
)

REPO_ROOT = Path(__file__).resolve().parent.parent

# Persisted labels for the (later) DB write — kept as constants so both methods and the model
# version can be stored without another migration.
MODEL_VERSION = "logistic_unreg_v1"
METHOD_INSAMPLE = "full_insample"
METHOD_OOS = "walk_forward_oos"

TABLE = "playoff_series_predictions"


# ─── DB load (read-only) ─────────────────────────────────────────────────────────────────


@dataclass
class SeriesRow:
    series_id: int
    key: str
    season: str
    round: int
    home_court_team_id: int
    opponent_team_id: int
    winner_team_id: int
    y: int
    home_abbr: str
    opp_abbr: str
    winner_abbr: str


@dataclass
class Loaded:
    rows: list[SeriesRow]
    X: np.ndarray        # (n, 4) float64, column order = FEATURES
    y: np.ndarray        # (n,) int {0,1}
    seasons: np.ndarray  # (n,) str "YYYY-YY"


def load_trainable(conn) -> Loaded:
    """Single SELECT of the trainable rows — SAME WHERE clause as train_series_model.load_trainable
    (winner present AND all 4 features present), enriched with series id + team abbreviations for the
    dry-run table. y is derived in SQL as (winner == home-court) so the label lives with the query.
    Rows are ordered season, round, key — identical to Phase 3 — so array indices are stable.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT ps.id,
                   ps.external_series_key,
                   ps.season,
                   ps.round,
                   ps.home_court_team_id,
                   ps.opponent_team_id,
                   ps.series_winner_team_id,
                   (ps.series_winner_team_id = ps.home_court_team_id)::int AS y,
                   ps.seed_diff::float8,
                   ps.win_pct_diff::float8,
                   ps.entry_rest_diff::float8,
                   ps.h2h_diff::float8,
                   hc.abbreviation  AS home_abbr,
                   opp.abbreviation AS opp_abbr,
                   win.abbreviation AS winner_abbr
            FROM playoff_series ps
            JOIN teams hc  ON hc.id  = ps.home_court_team_id
            JOIN teams opp ON opp.id = ps.opponent_team_id
            LEFT JOIN teams win ON win.id = ps.series_winner_team_id
            WHERE ps.series_winner_team_id IS NOT NULL
              AND ps.seed_diff        IS NOT NULL
              AND ps.win_pct_diff     IS NOT NULL
              AND ps.entry_rest_diff  IS NOT NULL
              AND ps.h2h_diff         IS NOT NULL
            ORDER BY ps.season, ps.round, ps.external_series_key
            """
        )
        raw = cur.fetchall()

    rows: list[SeriesRow] = []
    X_list: list[list[float]] = []
    y_list: list[int] = []
    seasons_list: list[str] = []
    for r in raw:
        rows.append(
            SeriesRow(
                series_id=int(r[0]),
                key=r[1],
                season=r[2],
                round=int(r[3]),
                home_court_team_id=int(r[4]),
                opponent_team_id=int(r[5]),
                winner_team_id=int(r[6]),
                y=int(r[7]),
                home_abbr=r[12],
                opp_abbr=r[13],
                winner_abbr=r[14],
            )
        )
        X_list.append([float(r[8]), float(r[9]), float(r[10]), float(r[11])])
        y_list.append(int(r[7]))
        seasons_list.append(r[2])

    return Loaded(
        rows=rows,
        X=np.array(X_list, dtype=float),
        y=np.array(y_list, dtype=int),
        seasons=np.array(seasons_list),
    )


# ─── Prediction (identical model + protocol as Phase 3) ──────────────────────────────────


def ordered_seasons(seasons: np.ndarray) -> list[str]:
    """Distinct seasons sorted chronologically by start year — matches
    train_series_model.ordered_seasons (robust to the 'YYYY-YY' form)."""
    return sorted(set(seasons.tolist()), key=lambda s: int(s[:4]))


def predict_full_insample(data: Loaded) -> np.ndarray:
    """Fit ONE unregularized logistic on all trainable rows; predict every row in-sample.
    Reuses predict_logistic_unreg so the pipeline (StandardScaler + LogisticRegression(C=inf)) and
    thus the sign convention are byte-for-byte identical to Phase 3."""
    return predict_logistic_unreg(data.X, data.y, data.seasons, data.X)


def predict_walk_forward_oos(data: Loaded) -> np.ndarray:
    """Expanding window by season (Phase 3 protocol). Returns a (n,) array of P(y=1); rows whose
    season is among the first MIN_TRAIN_SEASONS seasons are left as NaN (skipped, not fabricated).
    Each season is predicted by a model trained only on strictly-earlier seasons.
    """
    order = ordered_seasons(data.seasons)
    p_out = np.full(len(data.y), np.nan, dtype=float)
    for k in range(MIN_TRAIN_SEASONS, len(order)):
        train_seasons = set(order[:k])
        test_season = order[k]
        tr = np.array([s in train_seasons for s in data.seasons])
        te = data.seasons == test_season
        p_hat = predict_logistic_unreg(data.X[tr], data.y[tr], data.seasons[tr], data.X[te])
        p_out[te] = np.asarray(p_hat, dtype=float)
    return p_out


def predicted_winner_id(row: SeriesRow, prob: float) -> int:
    """Home-court team when prob >= 0.5, else the opponent (matches the orientation contract)."""
    return row.home_court_team_id if prob >= 0.5 else row.opponent_team_id


# ─── Dry-run report ──────────────────────────────────────────────────────────────────────


def _method_stats(data: Loaded, probs: np.ndarray) -> dict:
    """min/mean/max over scored (non-NaN) rows, skip count, and the positive-precision sanity check:
    among scored rows with prob >= 0.5, the fraction that actually had winner == home-court (y==1).
    This tracks the model's accuracy on its home-court calls (~0.74), NOT overall accuracy."""
    scored = ~np.isnan(probs)
    n_scored = int(scored.sum())
    n_skipped = int((~scored).sum())
    p = probs[scored]
    y = data.y[scored]
    pos = p >= 0.5
    n_pos = int(pos.sum())
    precision_pos = float(y[pos].mean()) if n_pos else float("nan")
    return {
        "n_scored": n_scored,
        "n_skipped": n_skipped,
        "min": float(p.min()) if n_scored else float("nan"),
        "mean": float(p.mean()) if n_scored else float("nan"),
        "max": float(p.max()) if n_scored else float("nan"),
        "n_pos": n_pos,
        "precision_pos": precision_pos,
    }


def _recent_sample_indices(data: Loaded, oos: np.ndarray, limit: int = 10) -> list[int]:
    """Indices of the most recent scored (OOS-available) series, newest first — later seasons and
    later rounds (Finals first)."""
    idx = [i for i in range(len(data.rows)) if not np.isnan(oos[i])]
    idx.sort(
        key=lambda i: (int(data.rows[i].season[:4]), data.rows[i].round, data.rows[i].key),
        reverse=True,
    )
    return idx[:limit]


def build_dryrun_report(data: Loaded, insample: np.ndarray, oos: np.ndarray) -> str:
    L: list[str] = []

    def w(s: str = "") -> None:
        L.append(s)

    seasons = ordered_seasons(data.seasons)
    eval_seasons = seasons[MIN_TRAIN_SEASONS:]
    base_rate = float(data.y.mean())

    w("══════════════════════════════════════════════════════════════════════════════")
    w(" Playoff Predictor — Phase 4 (T4) — predict_series.py DRY RUN (no DB writes)")
    w("══════════════════════════════════════════════════════════════════════════════")
    w("")
    w("── Contract ──")
    w(f"  model_version             : {MODEL_VERSION}  (Phase 3 unregularized logistic)")
    w(f"  features (fixed order)    : {FEATURES}")
    w("  probability               : P(series_winner == home_court_team) = P(y=1)")
    w("  predicted winner          : home-court team when prob >= 0.5, else opponent")
    w(f"  trainable rows            : {len(data.y)}")
    w(f"  base rate P(y=1)          : {base_rate:.6f}   ({int(data.y.sum())}/{len(data.y)})")
    w(f"  total seasons             : {len(seasons)}   ({seasons[0]} … {seasons[-1]})")
    w(f"  OOS min-train seasons     : {MIN_TRAIN_SEASONS}  "
      f"(eval seasons: {len(eval_seasons)} → {eval_seasons[0]} … {eval_seasons[-1]})")
    w("")

    w("── Per-method summary ──")
    for method, probs in ((METHOD_INSAMPLE, insample), (METHOD_OOS, oos)):
        s = _method_stats(data, probs)
        w(f"  [{method}]")
        w(f"     scored / skipped       : {s['n_scored']} / {s['n_skipped']}")
        w(f"     prob min / mean / max  : {s['min']:.4f} / {s['mean']:.4f} / {s['max']:.4f}")
        w(f"     rows with prob >= 0.5  : {s['n_pos']}")
        w(f"     sanity: P(y=1 | prob>=0.5) = {s['precision_pos']:.4f}  "
          f"(precision of home-court calls; should track ~0.74)")
        w("")

    w("── Sample: most recent scored series (newest first) ──")
    w(f"  {'season':<9}{'rnd':>4}  {'home_court':>10} {'opponent':>9}"
      f"{'p_insmpl':>10}{'p_oos':>8}  {'pred(oos)':>10} {'actual':>7}  {'oos✓':>5}")
    w("  " + "-" * 84)
    for i in _recent_sample_indices(data, oos):
        r = data.rows[i]
        p_in = insample[i]
        p_oos = oos[i]
        pred_id = predicted_winner_id(r, p_oos)
        pred_abbr = r.home_abbr if pred_id == r.home_court_team_id else r.opp_abbr
        correct = "yes" if pred_id == r.winner_team_id else "no"
        w(f"  {r.season:<9}{r.round:>4}  {r.home_abbr:>10} {r.opp_abbr:>9}"
          f"{p_in:>10.4f}{p_oos:>8.4f}  {pred_abbr:>10} {r.winner_abbr:>7}  {correct:>5}")
    w("")
    w("  (home_court = reference team; pred(oos) = walk-forward out-of-sample pick;")
    w("   actual = series_winner; oos✓ = did the OOS pick match the actual winner.)")
    w("")
    w("NOTE: DRY RUN — nothing was written to the database. To persist, apply")
    w("      drizzle/0007_playoff_series_predictions.sql in Supabase, then run with --write.")
    w("")
    return "\n".join(L) + "\n"


# ─── Gated DB write (NOT run in the T4 session) ──────────────────────────────────────────


def _table_exists(conn) -> bool:
    with conn.cursor() as cur:
        cur.execute("SELECT to_regclass(%s)", (f"public.{TABLE}",))
        return cur.fetchone()[0] is not None


def write_predictions(conn, data: Loaded, insample: np.ndarray, oos: np.ndarray) -> None:
    """GATED: persist both methods' predictions. Aborts if the table is absent. Idempotent via
    ON CONFLICT on the UNIQUE(series_id, prediction_method, model_version) from drizzle/0007, so a
    re-run cleanly refreshes rows instead of duplicating them. Only run AFTER applying the migration.
    """
    if not _table_exists(conn):
        print(
            f"ABORT: table public.{TABLE} does not exist. Apply "
            f"drizzle/0007_playoff_series_predictions.sql in the Supabase SQL editor first, "
            f"then re-run with --write.",
            file=sys.stderr,
        )
        sys.exit(2)

    insert = f"""
        INSERT INTO {TABLE}
            (series_id, external_series_key, predicted_home_court_win_prob,
             predicted_winner_team_id, prediction_method, model_version)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (series_id, prediction_method, model_version) DO UPDATE SET
            external_series_key           = EXCLUDED.external_series_key,
            predicted_home_court_win_prob = EXCLUDED.predicted_home_court_win_prob,
            predicted_winner_team_id      = EXCLUDED.predicted_winner_team_id,
            created_at                    = now()
    """

    written = {METHOD_INSAMPLE: 0, METHOD_OOS: 0}
    with conn.cursor() as cur:
        for method, probs in ((METHOD_INSAMPLE, insample), (METHOD_OOS, oos)):
            for i, row in enumerate(data.rows):
                p = probs[i]
                if np.isnan(p):
                    continue  # OOS-skipped season → no prediction to persist
                cur.execute(
                    insert,
                    (
                        row.series_id,
                        row.key,
                        float(p),
                        predicted_winner_id(row, float(p)),
                        method,
                        MODEL_VERSION,
                    ),
                )
                written[method] += 1
    conn.commit()
    print(
        f"WROTE predictions ({MODEL_VERSION}): "
        f"{METHOD_INSAMPLE}={written[METHOD_INSAMPLE]}, {METHOD_OOS}={written[METHOD_OOS]} rows."
    )


# ─── Main ────────────────────────────────────────────────────────────────────────────────


def main() -> None:
    ap = argparse.ArgumentParser(description="Phase 4 series-winner prediction (dry-run by default).")
    ap.add_argument(
        "--write",
        action="store_true",
        help="Persist predictions to the DB. OFF by default; requires drizzle/0007 applied first.",
    )
    ap.add_argument(
        "--report-file",
        default=str(REPO_ROOT / "ml" / "predict_series_dryrun.txt"),
        help="Path for the dry-run report (ignored when --write is set).",
    )
    args = ap.parse_args()

    conn = psycopg2.connect(resolve_database_url())
    try:
        if not args.write:
            # Refuse any accidental write at the session level for the dry-run path.
            conn.set_session(readonly=True)
        data = load_trainable(conn)
        insample = predict_full_insample(data)
        oos = predict_walk_forward_oos(data)

        if args.write:
            write_predictions(conn, data, insample, oos)
        else:
            report = build_dryrun_report(data, insample, oos)
            out = Path(args.report_file)
            out.write_text(report)
            print(report)
            print(f"(dry-run report written to {out}; nothing written to the database)")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
