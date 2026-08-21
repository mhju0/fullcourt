"""Is the Foster / Chris Paul playoff record an official effect, or the opponent?

`ml/referee_playoff_claims.py` measured Chris Paul's teams at 1-10 in playoff games with Scott
Foster on the crew, against an expectation built from Paul's own playoff games that season at the
same venue. That expectation controls for *how good his team was* and for home court. It does not
control for **who he was playing**, and the game log is conspicuous: the Warriors twice, the Bucks
in the Finals, the Rockets-Warriors conference final.

That matters because playoff assignment is not random. Senior officials are given the biggest
games, and the biggest games are late rounds against the strongest opponents -- where any team's
win probability is lowest. An official who works more Game 6s against 60-win teams will accumulate
a losing record with every star he sees, without a single questionable whistle.

This script tests the confound instead of assuming it away:

    1. a win model fitted on all 913 playoff games -- own vs opponent regular-season strength and
       home court -- giving each game an opponent-aware expected win probability
    2. every claim re-scored against that expectation
    3. the assignment check: do the officials in question actually draw later rounds and stronger
       opponents than their peers?

Usage:
    PYTHONPATH=ml ml/.venv/bin/python ml/referee_playoff_confound.py
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import minimize

from referee_axes import official_game_map
from referee_player_axes import FAMOUS_CLAIMS

DATA_DIR = Path("ml/data/referee")
RESULTS_PATH = DATA_DIR / "playoff_confound.json"
N_BOOT = 20000
SEED = 20260821

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def main() -> None:
    rng = np.random.default_rng(SEED)
    games = pd.read_csv(DATA_DIR / "games.csv")
    games = games[(games.n_officials >= 3) & (games.n_plays > 0) & (games.n_player_rows > 0)].copy()

    # --- regular-season strength, per team per season, from the corpus itself
    reg = games[games.season_type == 2]
    home = reg[["season", "home_abbr", "home_score", "away_score"]].rename(
        columns={"home_abbr": "team"})
    home["won"] = (home.home_score > home.away_score).astype(int)
    away = reg[["season", "away_abbr", "home_score", "away_score"]].rename(
        columns={"away_abbr": "team"})
    away["won"] = (away.away_score > away.home_score).astype(int)
    strength = (pd.concat([home[["season", "team", "won"]], away[["season", "team", "won"]]])
                .groupby(["season", "team"]).won.mean().rename("rs_win_pct").reset_index())
    log.info("team-seasons of regular-season strength: %d", len(strength))

    # --- playoff games, one row per side
    po = games[games.season_type == 3].copy()
    rows = []
    for _, g in po.iterrows():
        for side, team, opp, score, oscore in (
            ("H", g.home_abbr, g.away_abbr, g.home_score, g.away_score),
            ("A", g.away_abbr, g.home_abbr, g.away_score, g.home_score),
        ):
            rows.append({"event_id": g.event_id, "season": g.season, "team": team,
                         "opp": opp, "is_home": int(side == "H"),
                         "won": int(score > oscore)})
    sides = pd.DataFrame(rows)
    sides = sides.merge(strength, on=["season", "team"], how="left")
    sides = sides.merge(strength.rename(columns={"team": "opp", "rs_win_pct": "opp_win_pct"}),
                        on=["season", "opp"], how="left")
    sides = sides.dropna(subset=["rs_win_pct", "opp_win_pct"])
    log.info("playoff team-games with both strengths: %d", len(sides))

    # --- fit: won ~ b0 + b1*(own - opp strength) + b2*home
    X = np.column_stack([np.ones(len(sides)),
                         sides.rs_win_pct - sides.opp_win_pct,
                         sides.is_home])
    y = sides.won.to_numpy(float)

    def nll(beta):
        z = np.clip(X @ beta, -30, 30)
        p = 1 / (1 + np.exp(-z))
        return -np.sum(y * np.log(p + 1e-12) + (1 - y) * np.log(1 - p + 1e-12))

    fit = minimize(nll, np.zeros(3), method="BFGS")
    beta = fit.x
    sides["p_win"] = 1 / (1 + np.exp(-np.clip(X @ beta, -30, 30)))
    log.info("win model: intercept %.3f, strength %.3f, home %.3f", *beta)
    log.info("  in-sample accuracy %.4f, mean predicted %.4f, actual %.4f",
             ((sides.p_win > 0.5).astype(int) == sides.won).mean(),
             sides.p_win.mean(), sides.won.mean())

    # --- attach officials and players
    long = official_game_map(po)[["event_id", "official"]]
    players = pd.read_csv(DATA_DIR / "players.csv")
    players = players[players.event_id.isin(set(po.event_id))].copy()
    players = players[players.minutes.notna() & (players.minutes > 0)]
    pmap = po.set_index("event_id")[["home_abbr", "away_abbr"]]
    players = players.join(pmap, on="event_id")
    players["team"] = np.where(players.is_home == 1, players.home_abbr, players.away_abbr)
    pg = players[["event_id", "athlete_name", "team"]].merge(
        sides[["event_id", "team", "won", "p_win", "is_home", "opp", "opp_win_pct"]],
        on=["event_id", "team"])
    pg = pg.merge(long, on="event_id")

    results = {"model": {"intercept": beta[0], "strength": beta[1], "home": beta[2],
                         "n_team_games": int(len(sides))}, "claims": []}

    for official, player in FAMOUS_CLAIMS:
        sub = pg[(pg.official == official) & (pg.athlete_name == player)].drop_duplicates("event_id")
        if sub.empty:
            continue
        exp = float(sub.p_win.sum())
        wins = int(sub.won.sum())
        n = len(sub)
        # Exact-ish p from the Poisson-binomial: simulate the same games' independent outcomes.
        sims = (rng.random((N_BOOT, n)) < sub.p_win.to_numpy()).sum(axis=1)
        p_low = float((sims <= wins).mean())
        rest = pg[(pg.athlete_name == player) & (pg.official != official)].drop_duplicates("event_id")
        entry = {
            "official": official, "player": player, "games": n,
            "wins": wins, "losses": n - wins,
            "expected_wins_opponent_aware": round(exp, 2),
            "wins_above_expected": round(wins - exp, 2),
            "p_at_or_below": round(p_low, 4),
            "mean_opponent_strength_with": round(float(sub.opp_win_pct.mean()), 4),
            "mean_opponent_strength_without": round(float(rest.opp_win_pct.mean()), 4) if len(rest) else None,
            "mean_p_win_with": round(float(sub.p_win.mean()), 4),
            "mean_p_win_without": round(float(rest.p_win.mean()), 4) if len(rest) else None,
        }
        results["claims"].append(entry)
        log.info("  %s x %s: %d-%d, expected %.2f (opponent-aware), p=%.4f",
                 official, player, wins, n - wins, exp, p_low)

    # --- the same opponent-aware test applied to EVERY playoff pair, so the named claim can be
    # ranked against the field rather than against an intuition about what is unusual.
    pairs = pg.drop_duplicates(["event_id", "official", "athlete_name"])
    counts = pairs.groupby(["official", "athlete_name"]).size()
    keep = counts[counts >= 10]
    log.info("playoff pairs with >= 10 shared games: %d", len(keep))
    sweep_rows = []
    for (official, player), n in keep.items():
        sub = pairs[(pairs.official == official) & (pairs.athlete_name == player)]
        exp = float(sub.p_win.sum())
        wins = int(sub.won.sum())
        sims = (rng.random((N_BOOT, len(sub))) < sub.p_win.to_numpy()).sum(axis=1)
        # Two-sided: how extreme is this record in either direction?
        p_low = (sims <= wins).mean()
        p_high = (sims >= wins).mean()
        sweep_rows.append({"official": official, "player": player, "games": int(n),
                           "wins": wins, "expected": round(exp, 2),
                           "diff": round(wins - exp, 2),
                           "p_two_sided": float(min(1.0, 2 * min(p_low, p_high)))})
    sweep = pd.DataFrame(sweep_rows).sort_values("p_two_sided")
    n_pairs = len(sweep)
    results["sweep_opponent_aware"] = {
        "n_pairs": int(n_pairs),
        "min_games": 10,
        "expected_min_p": round(1.0 / n_pairs, 5),
        "n_p_under_01": int((sweep.p_two_sided < 0.01).sum()),
        "expected_under_01": round(0.01 * n_pairs, 1),
        "n_p_under_05": int((sweep.p_two_sided < 0.05).sum()),
        "expected_under_05": round(0.05 * n_pairs, 1),
        "ranked": sweep.head(12).to_dict("records"),
        "foster_paul_rank": int(
            sweep.reset_index(drop=True)
            .query("official == 'Scott Foster' and player == 'Chris Paul'").index[0] + 1)
        if ((sweep.official == "Scott Foster") & (sweep.player == "Chris Paul")).any() else None,
    }
    log.info("  sweep: %d pairs, %d under p<0.01 (%.1f expected); Foster/Paul rank %s",
             n_pairs, results["sweep_opponent_aware"]["n_p_under_01"],
             results["sweep_opponent_aware"]["expected_under_01"],
             results["sweep_opponent_aware"]["foster_paul_rank"])

    # --- assignment check: which officials draw the hardest playoff games?
    per_off = pg.drop_duplicates(["event_id", "official"]).groupby("official").agg(
        games=("event_id", "nunique"), mean_opp=("opp_win_pct", "mean"),
        mean_p_win=("p_win", "mean")).reset_index()
    per_off = per_off[per_off.games >= 30].sort_values("mean_opp", ascending=False)
    results["assignment"] = {
        "n_officials": int(len(per_off)),
        "league_mean_opp_strength": round(float(pg.opp_win_pct.mean()), 4),
        "top": per_off.head(10).to_dict("records"),
        "bottom": per_off.tail(5).to_dict("records"),
    }
    RESULTS_PATH.write_text(json.dumps(results, indent=1, default=str))
    log.info("wrote %s", RESULTS_PATH)


if __name__ == "__main__":
    main()
