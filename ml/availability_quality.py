"""Does weighting an absence by player QUALITY beat weighting it by minutes?

`availability_cost.py` weighted a missing player by the minutes they had been playing, and
found a generic missing starter worth about 1.8 points. That pools losing a team's best player
with losing its fifth-best, so it should understate what losing a genuine star costs.

This tests five ways of valuing an absence, all built from prior games only:

  minutes            what the first pass used
  points             crude, but it is what a casual reader thinks a star is
  game score         Hollinger's single-number box line, computed from the components
  game score above   the same, minus the team's own replacement level, since the cost of
    replacement      losing a player is the gap to whoever takes the minutes
  best player out    binary: the highest-game-score member of the rotation did not play

Quality is measured over a longer history than rotation membership — a player's value is
stable, their presence in the rotation is not. A missing player has no row tonight, so their
value is carried forward from the last game they did play.
"""

from __future__ import annotations

import logging

from availability_inputs import load_regular_inputs, roster_records, rotation_window_uncertain, available_now, attach_prior_quality, write_coverage
from collections import defaultdict, deque
from pathlib import Path

import numpy as np
import pandas as pd

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "ml" / "data"
SHOOTING = DATA / "shooting"
FEATURES = DATA / "fatigue_features.csv"
TABLE = DATA / "fatigue_model_table.csv"
REPORT = DATA / "availability_quality_report.txt"

WINDOW = 5
ROTATION_MINUTES = 15.0
MIN_APPEARANCES = 2
QUALITY_GAMES = 20
QUALITY_MIN_GAMES = 5

SCHEDULE = ["d_is_b2b", "d_alt_visit", "d_prior_ot", "d_density_points"]
CONTROLS = ["d_strength", "d_season_day"]


def parse_minutes(value: object) -> float:
    if not isinstance(value, str) or ":" not in value:
        return 0.0
    mm, _, ss = value.partition(":")
    try:
        return int(mm) + int(ss) / 60.0
    except ValueError:
        return 0.0


def ols(x: np.ndarray, y: np.ndarray, names: list[str]) -> tuple[pd.DataFrame, float]:
    z = np.column_stack([np.ones(len(x)), x])
    beta, *_ = np.linalg.lstsq(z, y, rcond=None)
    resid = y - z @ beta
    dof = len(y) - z.shape[1]
    sigma2 = float(resid @ resid) / dof
    se = np.sqrt(np.diag(sigma2 * np.linalg.pinv(z.T @ z)))
    frame = pd.DataFrame(
        {"feature": ["intercept", *names], "beta": beta, "se": se, "t": beta / se}
    ).set_index("feature")
    return frame, float(np.sqrt(np.mean(resid**2)))


def main() -> None:
    log.info("loading player box scores")
    play, sides, coverage = load_regular_inputs(SHOOTING, FEATURES)
    box = play

    b = box.fillna(
        {
            c: 0
            for c in [
                "points", "field_goals_made", "field_goals_attempted", "free_throws_made",
                "free_throws_attempted", "rebounds_offensive", "rebounds_defensive",
                "steals", "assists", "blocks", "fouls_personal", "turnovers",
            ]
        }
    )
    box["game_score"] = (
        b["points"]
        + 0.4 * b["field_goals_made"]
        - 0.7 * b["field_goals_attempted"]
        - 0.4 * (b["free_throws_attempted"] - b["free_throws_made"])
        + 0.7 * b["rebounds_offensive"]
        + 0.3 * b["rebounds_defensive"]
        + b["steals"]
        + 0.7 * b["assists"]
        + 0.7 * b["blocks"]
        - 0.4 * b["fouls_personal"]
        - b["turnovers"]
    )

    play = attach_prior_quality(play, {"game_score": "q_gs", "points": "q_pts", "min": "q_min"}, QUALITY_GAMES, QUALITY_MIN_GAMES)
    play = play.sort_values(["team_id", "date", "person_id"])

    # One window per team-season. A window carried across the summer counted players who had
    # left as missing in the opener; a team is measured once it has WINDOW games this season.
    history: dict[tuple[int, str], deque] = defaultdict(lambda: deque(maxlen=WINDOW))
    records = []
    for (team_id, game_id), grp in play.groupby(["team_id", "game_id"], sort=False):
        window = history[(team_id, grp["season"].iloc[0])]
        played_now = roster_records(grp, ["q_gs", "q_pts", "q_uncertain"])
        if len(window) == WINDOW and rotation_window_uncertain(window, MIN_APPEARANCES, ROTATION_MINUTES):
            coverage["rotationWindowHoldouts"] += 1
            window.append(played_now)
            continue

        mins: dict[int, list] = defaultdict(list)
        qual: dict[int, dict] = {}
        quality_uncertain = {}
        for past in window:
            for pid, rec in past.items():
                if rec["participation"] == "played" and pd.notna(rec["min"]) and rec["min"] > 0:
                    quality_uncertain[pid] = rec["q_uncertain"]
                    mins[pid].append(rec["min"])
                    # Most recent known quality wins; the walk is chronological.
                    if not np.isnan(rec["q_gs"]):
                        qual[pid] = rec

        rotation = {
            pid: float(np.mean(v))
            for pid, v in mins.items()
            if len(v) >= MIN_APPEARANCES and float(np.mean(v)) >= ROTATION_MINUTES
        }

        current_uncertain = any(available_now(played_now, pid) is None for pid in rotation)
        prior_quality_uncertain = any(quality_uncertain.get(pid, False) for pid in rotation)
        if len(window) == WINDOW and rotation:
            coverage["currentRotationHoldouts"] += int(current_uncertain)
            coverage["qualityWindowHoldouts"] += int(prior_quality_uncertain and not current_uncertain)
        if len(window) == WINDOW and rotation and not current_uncertain and not prior_quality_uncertain:
            gs_of = {pid: (qual[pid]["q_gs"] if pid in qual else np.nan) for pid in rotation}
            known = [v for v in gs_of.values() if not np.isnan(v)]
            replacement = float(np.median(known)) if known else 0.0
            best_pid = max(gs_of, key=lambda p: (-np.inf if np.isnan(gs_of[p]) else gs_of[p]))

            rec = {
                "game_id": game_id,
                "team_id": team_id,
                "miss_min": 0.0,
                "miss_pts": 0.0,
                "miss_gs": 0.0,
                "miss_gs_ar": 0.0,
                "best_out": 0,
            }
            for pid, avg_min in rotation.items():
                if available_now(played_now, pid) is not False:
                    continue
                gs = gs_of[pid]
                rec["miss_min"] += avg_min
                rec["miss_pts"] += 0.0 if pid not in qual else float(qual[pid]["q_pts"])
                rec["miss_gs"] += 0.0 if np.isnan(gs) else max(0.0, gs)
                rec["miss_gs_ar"] += 0.0 if np.isnan(gs) else max(0.0, gs - replacement)
                if pid == best_pid and not np.isnan(gs):
                    rec["best_out"] = 1
            records.append(rec)

        window.append(played_now)

    av = pd.DataFrame(records)
    log.info("team-games measured: %d", len(av))

    merged = av.merge(sides[["game_id", "team_id", "is_home"]], on=["game_id", "team_id"])
    home = merged[merged["is_home"] == 1].set_index("game_id")
    away = merged[merged["is_home"] == 0].set_index("game_id")
    both = home.index.intersection(away.index)

    game = pd.DataFrame(index=both)
    METRICS = ["miss_min", "miss_pts", "miss_gs", "miss_gs_ar", "best_out"]
    for col in METRICS:
        game[f"d_{col}"] = away.loc[both, col].to_numpy() - home.loc[both, col].to_numpy()

    tab = pd.read_csv(TABLE, low_memory=False).set_index("game_id")
    feats = pd.read_csv(
        FEATURES, usecols=["game_id", "is_home", "team_score", "opp_score"], low_memory=False
    )
    h = feats[feats["is_home"] == 1].set_index("game_id")
    tab["home_margin"] = (h["team_score"] - h["opp_score"]).reindex(tab.index)

    df = tab.join(game, how="inner").dropna(subset=["home_margin"])
    for c in SCHEDULE + CONTROLS:
        df[c] = df[c].fillna(0.0)
    y = df["home_margin"].to_numpy(float)
    log.info("games analysed: %d", len(df))

    base, rmse_base = ols(df[CONTROLS + SCHEDULE].to_numpy(float), y, CONTROLS + SCHEDULE)

    public_coverage = write_coverage(DATA / "availability_quality_coverage.json", coverage, Path(__file__).resolve(), TABLE, len(av), df.index)
    log.info("source coverage: %s", public_coverage)

    lines: list[str] = []
    a = lines.append
    a("# Weighting an absence by quality instead of minutes")
    a("")
    a(f"games analysed   {len(df)}")
    a(f"seasons          {df['season'].min()} .. {df['season'].max()}")
    a("")
    a(f"  Source-uncertain team rows withheld: rotation={coverage['rotationWindowHoldouts']}, current={coverage['currentRotationHoldouts']}, quality={coverage['qualityWindowHoldouts']}")
    a("")
    a(f"  schedule-only baseline RMSE   {rmse_base:.5f} points")
    a("")
    a("## Each weighting, added to controls + the four schedule terms")
    a("")
    a(f"  {'weighting':<26} {'beta':>10} {'t':>8} {'RMSE gain':>11}   effect of a typical absence")
    typical = {
        "d_miss_min": (30.0, "a 30-minute starter"),
        "d_miss_pts": (18.0, "an 18-point scorer"),
        "d_miss_gs": (14.0, "a 14 game-score player"),
        "d_miss_gs_ar": (6.0, "6 game score above replacement"),
        "d_best_out": (1.0, "the team's best player out"),
    }
    results = {}
    for m in METRICS:
        col = f"d_{m}"
        names = CONTROLS + SCHEDULE + [col]
        fit, rmse = ols(df[names].to_numpy(float), y, names)
        beta, t = float(fit.loc[col, "beta"]), float(fit.loc[col, "t"])
        unit, label = typical[col]
        results[col] = (beta, t, rmse_base - rmse, beta * unit, label)
        a(
            f"  {col:<26} {beta:>10.4f} {t:>8.2f} {rmse_base - rmse:>11.5f}   "
            f"{label}: {beta * unit:.3f} points"
        )
    a("")

    best = max(results, key=lambda k: results[k][2])
    a(f"  best by RMSE: {best}  ({results[best][2]:+.5f} points of RMSE)")
    a("")

    a("## All weightings together — which survives when they compete")
    a("")
    names = CONTROLS + SCHEDULE + [f"d_{m}" for m in METRICS]
    fit, rmse = ols(df[names].to_numpy(float), y, names)
    for n in names:
        mark = "" if abs(float(fit.loc[n, "t"])) >= 2 else "   (not distinguishable from zero)"
        a(f"  {n:<26} {float(fit.loc[n, 'beta']):>10.4f} points   t {float(fit.loc[n, 't']):>7.2f}{mark}")
    a("")

    a("## The schedule terms, before and after the best absence measure")
    a("")
    names_b = CONTROLS + SCHEDULE + [best]
    fit_b, _ = ols(df[names_b].to_numpy(float), y, names_b)
    a(f"  {'term':<22} {'schedule only':>14} {'absence controlled':>20} {'shift':>9}")
    for term in SCHEDULE:
        b0, b1 = float(base.loc[term, "beta"]), float(fit_b.loc[term, "beta"])
        a(f"  {term:<22} {b0:>14.4f} {b1:>20.4f} {100 * (b0 - b1) / b0:>8.1f}%")
    a("")

    a("## How often, and how big")
    a("")
    for m in METRICS:
        col = f"d_{m}"
        nz = (df[col].abs() > 1e-9).mean()
        a(f"  {col:<26} non-zero in {nz:.4f} of games   sd {df[col].std():.3f}")
    a("")
    a(f"  best player out, either side   {(df['d_best_out'].abs() > 0).mean():.4f} of games")

    REPORT.write_text("\n".join(lines) + "\n")
    log.info("wrote %s", REPORT)


if __name__ == "__main__":
    main()
