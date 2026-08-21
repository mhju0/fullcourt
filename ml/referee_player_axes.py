"""Axis D — do officials treat individual players differently?

Read `ml/referee_player_preregistration.md` first. The population, the thresholds, the five famous
claims, the out-of-sample split and the rule that the global test gates every named figure were all
fixed before any number here was computed.

    D1      official x player foul rate, the player as his own control
    D2      official x player team record -- the Scott Foster axis
    D2-OOS  the five named claims, in-sample era vs out-of-sample era
    D3      early foul trouble on stars, split home/road

Two null models are used, and which one applies depends on the grain:

* **Pair grain (D1, D2).** A pair's games are a draw without replacement from that player's own
  games in the same seasons. The null mean and variance of a stratified sample mean are exact, so
  they are computed analytically with the finite-population correction rather than simulated --
  9,500 pairs x 2,000 permutations is avoided for free, and the answer is not approximate.
* **Official grain (D3).** The permutation machinery of `ml/referee_axes.py`, reused unchanged.

Usage:
    PYTHONPATH=ml ml/.venv/bin/python ml/referee_player_axes.py
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np
import pandas as pd

from referee_axes import SEED, official_game_map, permutation_test

DATA_DIR = Path("ml/data/referee")
RESULTS_PATH = DATA_DIR / "player_axes_results.json"

MIN_PAIR_GAMES = 30          # pre-registered
MIN_MINUTES = 10             # a per-36 rate off 4 minutes is not a rate
STAR_TOP_N = 30              # pre-registered: top 30 by ppg
STAR_MIN_GAMES = 40          # pre-registered
OOS_FIRST_SEASON = "2020-21" # pre-registered split
MIN_OOS_GAMES = 15           # below this a claim is reported untestable
BUBBLE_FIRST_DATE = "2020-07-30"

FAMOUS_CLAIMS = [
    ("Scott Foster", "Chris Paul"),
    ("Scott Foster", "James Harden"),
    ("Tony Brothers", "Luka Doncic"),
    ("Tony Brothers", "Kevin Durant"),
    ("Marc Davis", "Russell Westbrook"),
]

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def load():
    games = pd.read_csv(DATA_DIR / "games.csv")
    players = pd.read_csv(DATA_DIR / "players.csv")
    fouls = pd.read_csv(DATA_DIR / "fouls.csv")
    games = games[
        (games.season_type == 2) & (games.n_officials >= 3)
        & (games.n_plays > 0) & (games.n_player_rows > 0)
    ].copy()
    ids = set(games.event_id)
    players = players[players.event_id.isin(ids)].copy()
    fouls = fouls[fouls.event_id.isin(ids)].copy()
    players["athlete_id"] = players.athlete_id.astype("Int64").astype(str)
    fouls["fouler_id"] = pd.to_numeric(fouls.fouler_id, errors="coerce").astype("Int64").astype(str)
    return games, players, fouls


def stratified_null(values: np.ndarray, strata: np.ndarray, take: dict) -> tuple[float, float]:
    """Exact mean and sd of a stratified sample mean drawn without replacement.

    `values`/`strata` describe the player's whole pool; `take` maps stratum -> how many games the
    official actually shared. Returns (null mean, null sd) of the pair's observed mean.
    """
    total = sum(take.values())
    if total == 0:
        return np.nan, np.nan
    mean = 0.0
    var = 0.0
    for stratum, n in take.items():
        pool = values[strata == stratum]
        big_n = len(pool)
        if big_n == 0 or n > big_n:
            return np.nan, np.nan
        mean += n * pool.mean()
        if big_n > 1 and n < big_n:
            fpc = (big_n - n) / (big_n - 1)
            var += (n ** 2) * (pool.var(ddof=1) / n) * fpc
        # n == big_n contributes no variance: the sample IS the stratum
    return mean / total, float(np.sqrt(var) / total)


def pair_axis(long: pd.DataFrame, per_game: pd.DataFrame, value_col: str, label: str) -> dict:
    """D1/D2: every (official, player) pair, each judged against that player's own games."""
    # `long` carries its own season column; the per-game frame is the authority on season here.
    merged = per_game.merge(long[["event_id", "official"]], on="event_id")
    counts = merged.groupby(["official", "athlete_id"]).size()
    pairs = counts[counts >= MIN_PAIR_GAMES]
    log.info("  %s: %d pairs with >= %d shared games", label, len(pairs), MIN_PAIR_GAMES)

    pool_by_player = {pid: sub for pid, sub in per_game.groupby("athlete_id")}
    by_pair = {k: v for k, v in merged.groupby(["official", "athlete_id"])}
    rows = []
    for (official, pid), n in pairs.items():
        sub = by_pair[(official, pid)]
        pool = pool_by_player[pid]
        take = sub.season.value_counts().to_dict()
        mu, sd = stratified_null(pool[value_col].to_numpy(float), pool.season.to_numpy(), take)
        if not np.isfinite(sd) or sd == 0:
            continue
        obs = float(sub[value_col].mean())
        rows.append({
            "official": official, "athlete_id": pid,
            "player": sub.athlete_name.iloc[0], "games": int(n),
            "observed": obs, "expected": float(mu), "z": float((obs - mu) / sd),
        })
    df = pd.DataFrame(rows)
    if df.empty:
        return {"n_pairs": 0}
    z = df.z.to_numpy()
    n_extreme = int(np.sum(np.abs(z) >= 2))
    return {
        "n_pairs": len(df),
        "z_sd": float(np.std(z, ddof=1)),
        "z_mean": float(np.mean(z)),
        "n_extreme_z2": n_extreme,
        "expected_extreme_z2": round(0.0455 * len(df), 1),
        "extreme_ratio": float(n_extreme / (0.0455 * len(df))),
        "max_abs_z": float(np.max(np.abs(z))),
        "top": df.reindex(df.z.abs().sort_values(ascending=False).index).head(12).to_dict("records"),
    }


def main() -> None:
    rng = np.random.default_rng(SEED)
    games, players, fouls = load()
    long = official_game_map(games)
    meta = games[["event_id", "season", "date_et", "home_team_id", "home_score", "away_score"]]

    played = players[players.minutes.notna() & (players.minutes > 0)].merge(meta, on="event_id")
    played["team_won"] = np.where(
        played.is_home == 1,
        (played.home_score > played.away_score).astype(int),
        (played.away_score > played.home_score).astype(int),
    )
    log.info("player-games with minutes: %d", len(played))

    results = {"corpus": {"games": int(len(games)), "player_games": int(len(played)),
                          "seasons": sorted(games.season.unique().tolist())}}

    # ---------------- D1: foul rate, player as his own control ----------------
    d1 = played[(played.minutes >= MIN_MINUTES) & played.personal_fouls.notna()].copy()
    d1["fouls_per36"] = d1.personal_fouls / d1.minutes * 36
    log.info("D1 -- official x player foul rate")
    results["d1"] = pair_axis(
        long, d1[["event_id", "athlete_id", "athlete_name", "season", "fouls_per36"]],
        "fouls_per36", "D1 foul rate")

    # ---------------- D2: team record, venue-split leave-one-out expectation ----------------
    d2 = played.copy()
    d2["venue"] = np.where(d2.is_home == 1, "H", "A")
    grp = d2.groupby(["athlete_id", "season", "venue"]).team_won
    n_grp = grp.transform("size")
    sum_grp = grp.transform("sum")
    # Leave-one-out so a pair is never compared against an expectation it helped set.
    d2["expected_win"] = np.where(n_grp > 1, (sum_grp - d2.team_won) / (n_grp - 1), np.nan)
    d2 = d2[d2.expected_win.notna()].copy()
    d2["win_above_expected"] = d2.team_won - d2.expected_win
    log.info("D2 -- official x player team record")
    results["d2"] = pair_axis(
        long, d2[["event_id", "athlete_id", "athlete_name", "season", "win_above_expected"]],
        "win_above_expected", "D2 record")

    # ---------------- D2-OOS: the five named claims ----------------
    log.info("D2-OOS -- the five pre-registered claims")
    claims = []
    merged2 = d2.merge(long[["event_id", "official"]], on="event_id")
    for official, player in FAMOUS_CLAIMS:
        sub = merged2[(merged2.official == official) & (merged2.athlete_name == player)]
        entry = {"official": official, "player": player}
        pool = d2[d2.athlete_name == player]
        for era, mask in (
            ("in_sample", sub.season < OOS_FIRST_SEASON),
            ("out_of_sample", sub.season >= OOS_FIRST_SEASON),
            ("all", sub.season.notna()),
        ):
            s = sub[mask]
            if len(s) == 0:
                entry[era] = {"games": 0, "testable": False}
                continue
            wins = int(s.team_won.sum())
            exp = float(s.expected_win.sum())
            take = s.season.value_counts().to_dict()
            mu, sd = stratified_null(
                pool.win_above_expected.to_numpy(float), pool.season.to_numpy(), take)
            obs = float(s.win_above_expected.mean())
            entry[era] = {
                "games": int(len(s)), "wins": wins, "losses": int(len(s) - wins),
                "expected_wins": round(exp, 2),
                "wins_above_expected": round(wins - exp, 2),
                "z": round(float((obs - mu) / sd), 3) if (sd and np.isfinite(sd) and sd > 0) else None,
                "testable": bool(len(s) >= MIN_OOS_GAMES),
            }
        claims.append(entry)
    results["d2_oos"] = {"split_season": OOS_FIRST_SEASON, "min_games": MIN_OOS_GAMES, "claims": claims}

    # ---------------- D3: early foul trouble on stars ----------------
    log.info("D3 -- early foul trouble on stars")
    season_agg = played.groupby(["season", "athlete_id"]).agg(
        gp=("points", "size"), pts=("points", "sum")).reset_index()
    season_agg = season_agg[season_agg.gp >= STAR_MIN_GAMES]
    season_agg["ppg"] = season_agg.pts / season_agg.gp
    stars = (season_agg.sort_values(["season", "ppg"], ascending=[True, False])
             .groupby("season").head(STAR_TOP_N))
    star_keys = set(zip(stars.season, stars.athlete_id))
    log.info("  star player-seasons: %d, distinct players: %d", len(stars), stars.athlete_id.nunique())

    q1 = (fouls[fouls.period == 1].groupby(["event_id", "fouler_id"]).size()
          .rename("q1_fouls").reset_index().rename(columns={"fouler_id": "athlete_id"}))
    h1 = (fouls[fouls.period <= 2].groupby(["event_id", "fouler_id"]).size()
          .rename("h1_fouls").reset_index().rename(columns={"fouler_id": "athlete_id"}))

    sg = played[["event_id", "athlete_id", "athlete_name", "season", "is_home", "minutes"]].copy()
    sg["is_star"] = [(s, a) in star_keys for s, a in zip(sg.season, sg.athlete_id)]
    sg = sg[sg.is_star].merge(q1, on=["event_id", "athlete_id"], how="left").merge(
        h1, on=["event_id", "athlete_id"], how="left")
    sg[["q1_fouls", "h1_fouls"]] = sg[["q1_fouls", "h1_fouls"]].fillna(0)
    sg["early2"] = (sg.q1_fouls >= 2).astype(float)
    sg["half3"] = (sg.h1_fouls >= 3).astype(float)
    season_min = sg.groupby(["athlete_id", "season"]).minutes.transform("mean")
    sg["minutes_vs_own"] = sg.minutes - season_min
    log.info("  star-games: %d, early2 base %.4f, half3 base %.4f",
             len(sg), sg.early2.mean(), sg.half3.mean())

    bubble = set(games[(games.season == "2019-20") & (games.date_et >= BUBBLE_FIRST_DATE)].event_id)
    per_game = sg.groupby(["event_id", "season"]).agg(
        star_early2=("early2", "mean"), star_half3=("half3", "mean"),
        star_min_vs_own=("minutes_vs_own", "mean"), n_stars=("early2", "size")).reset_index()
    home_sg = sg[sg.is_home == 1].groupby("event_id").early2.mean().rename("star_early2_home")
    road_sg = sg[sg.is_home == 0].groupby("event_id").early2.mean().rename("star_early2_road")
    per_game = per_game.merge(home_sg, on="event_id", how="left").merge(road_sg, on="event_id", how="left")
    per_game = per_game[~per_game.event_id.isin(bubble)]

    cols = ["star_early2", "star_half3", "star_min_vs_own", "star_early2_home", "star_early2_road"]
    long_d3 = long[long.event_id.isin(set(per_game.event_id))]
    results["d3"] = permutation_test(per_game, long_d3, cols, rng)
    results["d3_base"] = {
        "star_games": int(len(sg)),
        "early2_rate": float(sg.early2.mean()),
        "half3_rate": float(sg.half3.mean()),
        "early2_home": float(sg[sg.is_home == 1].early2.mean()),
        "early2_road": float(sg[sg.is_home == 0].early2.mean()),
        "minutes_when_early2": float(sg[sg.early2 == 1].minutes_vs_own.mean()),
        "minutes_when_not": float(sg[sg.early2 == 0].minutes_vs_own.mean()),
    }

    RESULTS_PATH.write_text(json.dumps(results, indent=1, default=str))
    log.info("wrote %s", RESULTS_PATH)


if __name__ == "__main__":
    main()
