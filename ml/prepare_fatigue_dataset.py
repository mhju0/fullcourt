"""Builds the modelling table for the fatigue weight fit.

Inputs
  ml/data/fatigue_features.csv      one row per (game, team), from
                                    scripts/export_fatigue_features.ts
  ml/data/shooting/*.csv            hoopR player and team box scores, 1996-2025

Output
  ml/data/fatigue_model_table.csv   one row per GAME, target + differenced features

Two things this file is careful about.

**Differences, not levels.** The rest-advantage metric is a difference between two teams, so
every feature enters as ``away - home`` — the same sign convention as ``calculateRestAdvantage``,
where a positive value means the home team is the fresher one. A factor that is symmetric
between the two sides cancels and correctly contributes nothing.

**Unknown is not zero.** hoopR starts in 1996 and the database starts in 1985-86. A missing
workload or pace value is filled with that season's league mean, so the ratio is 1.0 and the
term contributes exactly nothing to the difference. Filling with 0 would instead assert that
the team did no work, which is how the overtime term spent years silently charging pre-2002
games as if no overtime had ever happened (ADR 0003).
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import pandas as pd

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "ml" / "data"
SHOOTING = DATA / "shooting"

FEATURES_CSV = DATA / "fatigue_features.csv"
OUT_CSV = DATA / "fatigue_model_table.csv"

# Must match DECAY_RATE_GRID in src/lib/fatigue.ts, in order.
DECAY_RATES = [0.25, 0.3, 0.35, 0.4, 0.45, 0.52, 0.6, 0.7, 0.8]
DECAY_COLS = [f"decay_u_{str(r).replace('.', '')}" for r in DECAY_RATES]
RATIFIED_RATE = 0.52

LOOKBACK_DAYS = 30
FRESHNESS_PLATEAU = 3.0

# Shrinkage for the team-strength control: an 8-game pseudo-count at .500, so a team's
# record in October is not read as though it were established.
STRENGTH_PRIOR_GAMES = 8.0


def parse_minutes(value: object) -> float:
    """hoopR writes 'MM:SS'; a DNP is blank. Returns minutes as a float."""
    if not isinstance(value, str) or ":" not in value:
        return 0.0
    mm, _, ss = value.partition(":")
    try:
        return int(mm) + int(ss) / 60.0
    except ValueError:
        return 0.0


def load_box_scores() -> pd.DataFrame:
    """Per (external_id, side) workload and pace, from the local hoopR cache."""
    player_frames, team_frames = [], []
    for path in sorted(SHOOTING.glob("player_boxscores_*.csv")):
        player_frames.append(pd.read_csv(path, low_memory=False))
    for path in sorted(SHOOTING.glob("team_boxscores_*.csv")):
        team_frames.append(pd.read_csv(path, low_memory=False))
    if not player_frames:
        raise SystemExit(f"no hoopR player box scores under {SHOOTING}")

    players = pd.concat(player_frames, ignore_index=True)
    players["min"] = players["minutes"].map(parse_minutes)
    players["external_id"] = players["game_id"].astype("int64").astype(str).str.zfill(10)

    grouped = players.groupby(["external_id", "side"], sort=False)["min"]
    workload = pd.DataFrame(
        {
            # Total team minutes are mechanically 240 (+25 per overtime), so the signal is
            # concentration: how much of the night the core carried.
            "top5_min": grouped.apply(lambda s: s.nlargest(5).sum()),
            "top8_min": grouped.apply(lambda s: s.nlargest(8).sum()),
            "max_min": grouped.max(),
            "players_used": grouped.apply(lambda s: (s > 0).sum()),
        }
    ).reset_index()

    teams = pd.concat(team_frames, ignore_index=True)
    teams["external_id"] = teams["game_id"].astype("int64").astype(str).str.zfill(10)
    teams["possessions"] = (
        teams["field_goals_attempted"]
        + 0.44 * teams["free_throws_attempted"]
        - teams["rebounds_offensive"]
        + teams["turnovers"]
    )
    pace = teams[["external_id", "side", "possessions"]]

    box = workload.merge(pace, on=["external_id", "side"], how="outer")
    log.info("hoopR box scores: %d (game, side) rows", len(box))
    return box


def decayed_prior_sum(
    frame: pd.DataFrame, value_col: str, rate: float, out_col: str
) -> pd.Series:
    """Σ value × exp(−rate × daysAgo) over each team's PRIOR games inside the lookback.

    Written as an explicit walk rather than a rolling window because the window is measured
    in calendar days while the rows are games, and because only strictly-prior games may
    contribute — including tonight would leak the result of the game being predicted.
    """
    out = np.zeros(len(frame), dtype=float)
    for _, idx in frame.groupby("team_id", sort=False).indices.items():
        idx = np.asarray(idx)
        days = frame["day_number"].to_numpy()[idx]
        vals = frame[value_col].to_numpy()[idx]
        order = np.argsort(days, kind="stable")
        idx, days, vals = idx[order], days[order], vals[order]
        start = 0
        for i in range(len(idx)):
            while days[i] - days[start] > LOOKBACK_DAYS:
                start += 1
            prior = slice(start, i)
            ago = days[i] - days[prior]
            # ago == 0 would be tonight; the slice already excludes it.
            out[idx[i]] = float(np.sum(vals[prior] * np.exp(-rate * ago)))
    return pd.Series(out, index=frame.index, name=out_col)


def add_season_relative(frame: pd.DataFrame, col: str) -> pd.Series:
    """Express a per-game quantity as a ratio to its season's league mean.

    Makes the term era-proof (pace drifted enormously) and gives a missing value an exact
    neutral: fill with the mean, get 1.0, contribute nothing to the difference.
    """
    season_mean = frame.groupby("season")[col].transform("mean")
    ratio = frame[col] / season_mean
    return ratio.fillna(1.0)


def main() -> None:
    log.info("reading %s", FEATURES_CSV)
    df = pd.read_csv(FEATURES_CSV, low_memory=False)

    df = df[(df["status"] == "final") & (df["game_type"] == "regular")].copy()
    df = df[df["won"].notna()].copy()
    log.info("final regular-season game-sides: %d", len(df))

    df["date"] = pd.to_datetime(df["date"])
    df["day_number"] = (df["date"] - df["date"].min()).dt.days
    df["side"] = np.where(df["is_home"] == 1, "home", "away")

    # ── join workload and pace ────────────────────────────────────────────────
    box = load_box_scores()
    df["external_id"] = df["external_id"].astype(str).str.zfill(10)
    df = df.merge(box, on=["external_id", "side"], how="left")
    matched = df["top8_min"].notna().sum()
    log.info(
        "workload matched on %d of %d sides (%.1f%%)",
        matched,
        len(df),
        100.0 * matched / len(df),
    )

    df = df.sort_values(["date", "game_id"]).reset_index(drop=True)
    df["top8_rel"] = add_season_relative(df, "top8_min")
    df["top5_rel"] = add_season_relative(df, "top5_min")
    df["poss_rel"] = add_season_relative(df, "possessions")

    # ── recent-window workload, at the ratified rate and across the grid ───────
    for rate in DECAY_RATES:
        tag = str(rate).replace(".", "")
        df[f"min_u_{tag}"] = decayed_prior_sum(df, "top8_rel", rate, f"min_u_{tag}")
        df[f"poss_u_{tag}"] = decayed_prior_sum(df, "poss_rel", rate, f"poss_u_{tag}")

    # ── season-to-date load, and the team-strength control ────────────────────
    df["season_game_no"] = df.groupby(["team_id", "season"]).cumcount()
    df["season_day"] = df["day_number"] - df.groupby(["team_id", "season"])[
        "day_number"
    ].transform("min")

    df["prior_wins"] = df.groupby(["team_id", "season"])["won"].cumsum() - df["won"]
    df["strength"] = (df["prior_wins"] + STRENGTH_PRIOR_GAMES * 0.5) / (
        df["season_game_no"] + STRENGTH_PRIOR_GAMES
    )

    # ── per-side derived terms ────────────────────────────────────────────────
    df["travel_u_7"] = np.log1p(df["travel_miles_7"] / 1000.0)
    df["travel_u_14"] = np.log1p(df["travel_miles_14"] / 1000.0)
    df["travel_u_30"] = np.log1p(df["travel_miles_30"] / 1000.0)
    df["road_over2"] = np.maximum(0.0, df["road_streak"] - 2.0)
    df["home_stand_over2"] = np.maximum(0.0, df["home_stand"] - 2.0)
    rest = df["rest_days"]
    df["rest_recovery"] = np.where(
        rest >= FRESHNESS_PLATEAU,
        1.0 - np.exp(-(rest - FRESHNESS_PLATEAU) / FRESHNESS_PLATEAU),
        0.0,
    )
    df["rest_recovery"] = df["rest_recovery"].fillna(0.0)
    df["alt_visit"] = (df["alt_mult"] > 1.10).astype(float)
    df["alt_carry"] = ((df["alt_mult"] > 1.0) & (df["alt_mult"] <= 1.10)).astype(float)
    # Only meaningful on a back-to-back, and only where both tips are known; elsewhere the
    # deficit is zero, which is exactly the flat-1.38 fallback the model already uses.
    df["b2b_deficit"] = np.where(
        (df["is_b2b"] == 1) & df["turnaround_hours"].notna(),
        np.maximum(0.0, 24.0 - df["turnaround_hours"].fillna(24.0)),
        0.0,
    )
    # Distance from a 7:30pm body-clock tip, so both a 10pm and a noon start count as off.
    df["body_clock_off"] = (df["body_clock_hour"] - 19.5).abs().fillna(0.0)

    PER_SIDE = [
        *DECAY_COLS,
        *[f"min_u_{str(r).replace('.', '')}" for r in DECAY_RATES],
        *[f"poss_u_{str(r).replace('.', '')}" for r in DECAY_RATES],
        "travel_u_7",
        "travel_u_14",
        "travel_u_30",
        "road_over2",
        "home_stand_over2",
        "jetlag_units",
        "is_b2b",
        "b2b_deficit",
        "rest_recovery",
        "alt_visit",
        "alt_carry",
        "prior_ot",
        "density_points",
        "is_3in4",
        "is_4in6",
        "body_clock_off",
        "season_game_no",
        "season_day",
        "strength",
        "score",
    ]

    home = df[df["is_home"] == 1].set_index("game_id")
    away = df[df["is_home"] == 0].set_index("game_id")
    common = home.index.intersection(away.index)
    home, away = home.loc[common], away.loc[common]
    log.info("games with both sides: %d", len(common))

    out = pd.DataFrame(index=common)
    out["date"] = home["date"]
    out["season"] = home["season"]
    out["season_start"] = home["season"].str.slice(0, 4).astype(int)
    out["home_won"] = home["won"].astype(int)
    out["home_team_id"] = home["team_id"]
    out["away_team_id"] = away["team_id"]

    # away − home, matching calculateRestAdvantage: positive favours the home team.
    for col in PER_SIDE:
        out[f"d_{col}"] = away[col].to_numpy() - home[col].to_numpy()
    # Strength is not a fatigue term; it reads home − away so that positive favours home too.
    out["d_strength"] = home["strength"].to_numpy() - away["strength"].to_numpy()
    # The shipped metric, for the incumbent baseline.
    out["rest_advantage"] = away["score"].to_numpy() - home["score"].to_numpy()
    out["workload_known"] = (
        home["top8_min"].notna() & away["top8_min"].notna()
    ).to_numpy()

    out = out.sort_values("date").reset_index()
    out.to_csv(OUT_CSV, index=False)
    log.info("wrote %s (%d games, %d columns)", OUT_CSV, len(out), out.shape[1])


if __name__ == "__main__":
    main()
