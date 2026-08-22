"""The famous referee claims, tested where they are actually told: the playoffs.

`ml/referee_player_preregistration.md` named five official x player claims and then recorded, as a
stated limit, that the cache held **no playoff games** — which is where four of the five legends
live. The five pairs were fixed in that file on 2026-08-21 and committed (91715b8) *before*
`scripts/fetch_playoff_officials.ts` existed, so the claim list could not have been chosen with any
knowledge of the postseason numbers. That ordering is the whole value of the exercise.

This script answers, for each pair and for the postseason at large:

    1. the raw playoff record, which is what the legend actually asserts
    2. that record against an expectation built from the same player's *other* playoff games in the
       same season and the same venue -- so "his team was good that year" and home court are both
       removed before any surplus is attributed to an official
    3. regular season and playoffs combined
    4. a sweep of every playoff pair, to say whether the postseason as a whole carries any
       official x player signal that the regular season did not

Playoff samples are tiny by construction -- a pair shares a handful of games in a lifetime -- so the
reporting rule from the pre-registration stands: the count noise alone produces is printed beside
every count, and a pair under the minimum is called untestable rather than given a verdict.

Usage:
    PYTHONPATH=ml ml/.venv/bin/python ml/referee_playoff_claims.py
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np
import pandas as pd

from referee_player_axes import FAMOUS_CLAIMS, OOS_FIRST_SEASON, stratified_null
from referee_axes import official_game_map

DATA_DIR = Path("ml/data/referee")
RESULTS_PATH = DATA_DIR / "playoff_claims.json"

MIN_PLAYOFF_PAIR_GAMES = 10   # below this a pair is described, never judged
SWEEP_MIN_GAMES = 12

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def build(season_types: tuple[int, ...]) -> tuple[pd.DataFrame, pd.DataFrame]:
    games = pd.read_csv(DATA_DIR / "games.csv")
    players = pd.read_csv(DATA_DIR / "players.csv")
    games = games[
        games.season_type.isin(season_types) & (games.n_officials >= 3)
        & (games.n_plays > 0) & (games.n_player_rows > 0)
    ].copy()
    players = players[players.event_id.isin(set(games.event_id))].copy()
    players["athlete_id"] = players.athlete_id.astype("Int64").astype(str)
    meta = games[["event_id", "season", "season_type", "home_score", "away_score"]]
    played = players[players.minutes.notna() & (players.minutes > 0)].merge(meta, on="event_id")
    played["team_won"] = np.where(
        played.is_home == 1, (played.home_score > played.away_score).astype(int),
        (played.away_score > played.home_score).astype(int))
    played["venue"] = np.where(played.is_home == 1, "H", "A")
    # Leave-one-out within (player, season, venue): the player's other games of the same kind.
    grp = played.groupby(["athlete_id", "season", "venue"]).team_won
    n_grp, sum_grp = grp.transform("size"), grp.transform("sum")
    played["expected_win"] = np.where(n_grp > 1, (sum_grp - played.team_won) / (n_grp - 1), np.nan)
    played = played[played.expected_win.notna()].copy()
    played["win_above_expected"] = played.team_won - played.expected_win
    return games, played


def claim_row(sub: pd.DataFrame, pool: pd.DataFrame, min_games: int) -> dict:
    if len(sub) == 0:
        return {"games": 0, "testable": False}
    wins = int(sub.team_won.sum())
    exp = float(sub.expected_win.sum())
    take = sub.season.value_counts().to_dict()
    mu, sd = stratified_null(
        pool.win_above_expected.to_numpy(float), pool.season.to_numpy(), take)
    obs = float(sub.win_above_expected.mean())
    z = float((obs - mu) / sd) if (sd and np.isfinite(sd) and sd > 0) else None
    return {
        "games": int(len(sub)), "wins": wins, "losses": int(len(sub) - wins),
        "win_pct": round(wins / len(sub), 4),
        "expected_wins": round(exp, 2),
        "wins_above_expected": round(wins - exp, 2),
        "z": round(z, 3) if z is not None else None,
        "testable": bool(len(sub) >= min_games),
    }


def main() -> None:
    po_games, po = build((3,))
    all_games, both = build((2, 3))
    log.info("playoff games usable: %d; playoff player-games: %d", len(po_games), len(po))

    long_po = official_game_map(po_games)[["event_id", "official"]]
    long_all = official_game_map(all_games)[["event_id", "official"]]
    po_m = po.merge(long_po, on="event_id")
    both_m = both.merge(long_all, on="event_id")

    results = {
        "playoff_games": int(len(po_games)),
        "playoff_seasons": sorted(po_games.season.unique().tolist()),
        "min_playoff_pair_games": MIN_PLAYOFF_PAIR_GAMES,
        "claims": [],
    }

    for official, player in FAMOUS_CLAIMS:
        entry = {"official": official, "player": player}
        po_pool = po[po.athlete_name == player]
        both_pool = both[both.athlete_name == player]
        entry["playoffs"] = claim_row(
            po_m[(po_m.official == official) & (po_m.athlete_name == player)],
            po_pool, MIN_PLAYOFF_PAIR_GAMES)
        po_pair = po_m[(po_m.official == official) & (po_m.athlete_name == player)]
        # The claim was in circulation by 2019-20, so later postseasons are its out-of-sample test.
        entry["playoffs_in_sample"] = claim_row(
            po_pair[po_pair.season < OOS_FIRST_SEASON], po_pool, MIN_PLAYOFF_PAIR_GAMES)
        entry["playoffs_out_of_sample"] = claim_row(
            po_pair[po_pair.season >= OOS_FIRST_SEASON], po_pool, MIN_PLAYOFF_PAIR_GAMES)
        entry["playoff_game_log"] = (
            po_pair[["season", "event_id", "team_won", "is_home"]]
            .drop_duplicates("event_id").sort_values("season").to_dict("records"))
        entry["regular_plus_playoffs"] = claim_row(
            both_m[(both_m.official == official) & (both_m.athlete_name == player)],
            both_pool, 30)
        # For scale: the player's overall playoff record in the corpus.
        entry["player_playoff_baseline"] = {
            "games": int(len(po_pool)),
            "wins": int(po_pool.team_won.sum()),
            "win_pct": round(float(po_pool.team_won.mean()), 4) if len(po_pool) else None,
        }
        results["claims"].append(entry)
        log.info("  %s x %s: playoffs %s", official, player, entry["playoffs"])

    # ---- sweep every playoff pair
    counts = po_m.groupby(["official", "athlete_id"]).size()
    pairs = counts[counts >= SWEEP_MIN_GAMES]
    log.info("playoff pairs with >= %d shared games: %d", SWEEP_MIN_GAMES, len(pairs))
    pool_by_player = {pid: sub for pid, sub in po.groupby("athlete_id")}
    by_pair = {k: v for k, v in po_m.groupby(["official", "athlete_id"])}
    rows = []
    for (official, pid), n in pairs.items():
        sub = by_pair[(official, pid)]
        pool = pool_by_player[pid]
        mu, sd = stratified_null(pool.win_above_expected.to_numpy(float),
                                 pool.season.to_numpy(), sub.season.value_counts().to_dict())
        if not np.isfinite(sd) or sd == 0:
            continue
        obs = float(sub.win_above_expected.mean())
        rows.append({"official": official, "player": sub.athlete_name.iloc[0],
                     "games": int(n), "wins": int(sub.team_won.sum()),
                     "z": float((obs - mu) / sd)})
    sweep = pd.DataFrame(rows)
    if not sweep.empty:
        z = sweep.z.to_numpy()
        results["playoff_sweep"] = {
            "n_pairs": len(sweep),
            "min_games": SWEEP_MIN_GAMES,
            "z_sd": float(np.std(z, ddof=1)),
            "n_extreme_z2": int(np.sum(np.abs(z) >= 2)),
            "expected_extreme_z2": round(0.0455 * len(sweep), 1),
            "max_abs_z": float(np.max(np.abs(z))),
            "top": sweep.reindex(sweep.z.abs().sort_values(ascending=False).index)
                        .head(10).to_dict("records"),
        }
        log.info("  sweep: sd(z)=%.4f extreme=%d vs %.1f expected",
                 results["playoff_sweep"]["z_sd"],
                 results["playoff_sweep"]["n_extreme_z2"],
                 results["playoff_sweep"]["expected_extreme_z2"])

    RESULTS_PATH.write_text(json.dumps(results, indent=1, default=str))
    log.info("wrote %s", RESULTS_PATH)


if __name__ == "__main__":
    main()
