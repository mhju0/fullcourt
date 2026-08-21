"""Axes B, E and F, and a proper re-test of the D1/D2 gate.

Pre-registered in the 2026-08-21 amendment to `ml/referee_player_preregistration.md`, which was
committed before any figure here was computed.

    B   score state -- does the whistle tilt toward the trailing team, and do officials differ?
    E   does the home whistle need a crowd? 2020-21 with and without an audience
    F   are make-up calls real? consecutive foul pairs against a within-game order shuffle
    D*  the D1/D2 spread of z, re-tested against a full-grid permutation rather than an
        analytic per-pair null, because pairs share players and are not independent

Usage:
    PYTHONPATH=ml ml/.venv/bin/python ml/referee_exploratory_axes.py
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np
import pandas as pd

from referee_axes import SEED, official_game_map, permutation_test

DATA_DIR = Path("ml/data/referee")
RESULTS_PATH = DATA_DIR / "exploratory_results.json"

BUBBLE_FIRST_DATE = "2020-07-30"
MAKEUP_WINDOW_SEC = 120
N_GRID_PERMUTATIONS = 300

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def load():
    games = pd.read_csv(DATA_DIR / "games.csv")
    fouls = pd.read_csv(DATA_DIR / "fouls.csv")
    games = games[
        (games.season_type == 2) & (games.n_officials == 3)
        & (games.n_plays > 0) & (games.n_player_rows > 0)
    ].copy()
    fouls = fouls[fouls.event_id.isin(set(games.event_id))].copy()
    fouls = fouls[fouls.committing_is_home.notna()].copy()
    fouls["committing_is_home"] = fouls.committing_is_home.astype(int)
    return games, fouls


# --------------------------------------------------------------------------- axis B
def axis_b(games, fouls, long, rng) -> dict:
    """Does the whistle tilt toward the team that is behind?"""
    f = fouls.dropna(subset=["home_score_at", "away_score_at"]).copy()
    f["home_margin"] = f.home_score_at - f.away_score_at
    # A foul committed by the LEADING team helps the trailing team. Positive = pro-trailing-team.
    leading_is_home = f.home_margin > 0
    trailing_exists = f.home_margin != 0
    f = f[trailing_exists]
    committed_by_leader = np.where(leading_is_home[trailing_exists], f.committing_is_home == 1,
                                   f.committing_is_home == 0)
    f = f.assign(pro_trailing=committed_by_leader.astype(float))

    league = float(f.pro_trailing.mean())
    log.info("  axis B league mean: %.4f of fouls go against the team that is ahead", league)

    # Split by how big the lead is, to see whether the tilt is a lead-size effect at all.
    buckets = {}
    for lo, hi, name in ((1, 5, "1-5"), (6, 10, "6-10"), (11, 20, "11-20"), (21, 99, "21+")):
        sub = f[f.home_margin.abs().between(lo, hi)]
        buckets[name] = {"n": int(len(sub)), "pro_trailing": float(sub.pro_trailing.mean())}

    per_game = f.groupby(["event_id"]).pro_trailing.mean().rename("B_pro_trailing").reset_index()
    per_game = per_game.merge(games[["event_id", "season"]], on="event_id")
    res = permutation_test(per_game, long[long.event_id.isin(set(per_game.event_id))],
                           ["B_pro_trailing"], rng)
    return {"league_mean": league, "by_lead_size": buckets, "per_official": res["B_pro_trailing"]}


# --------------------------------------------------------------------------- axis E
def axis_e(games, fouls) -> dict:
    """Does the home whistle survive an empty building?"""
    per_game = fouls.groupby("event_id").agg(
        home_f=("committing_is_home", "sum"), n=("committing_is_home", "size")).reset_index()
    per_game["away_f"] = per_game.n - per_game.home_f
    per_game["away_share"] = per_game.away_f / per_game.n
    per_game["diff"] = per_game.away_f - per_game.home_f
    g = games.merge(per_game, on="event_id")

    def summarise(sub, label):
        return {"label": label, "n": int(len(sub)),
                "away_share": float(sub.away_share.mean()),
                "diff": float(sub["diff"].mean()),
                "diff_se": float(sub["diff"].std(ddof=1) / np.sqrt(len(sub))) if len(sub) > 1 else None}

    out = {}

    # (1) Within 2020-21: attendance reported vs not.
    s21 = g[g.season == "2020-21"]
    no_att = s21[s21.attendance.isna()]
    has_att = s21[s21.attendance.notna()]
    out["within_2020_21"] = {
        "no_attendance_reported": summarise(no_att, "no attendance field"),
        "attendance_reported": summarise(has_att, "attendance reported"),
        "small_crowd_under_3000": summarise(has_att[has_att.attendance < 3000], "crowd < 3,000"),
        "crowd_3000_plus": summarise(has_att[has_att.attendance >= 3000], "crowd >= 3,000"),
    }

    # (2) The 2019-20 restart against its own season.
    s1920 = g[g.season == "2019-20"]
    out["restart_2019_20"] = {
        "restart": summarise(s1920[s1920.date_et >= BUBBLE_FIRST_DATE], "restart, no crowd"),
        "same_season_normal": summarise(s1920[s1920.date_et < BUBBLE_FIRST_DATE], "same season, crowds"),
    }

    # (3) Dose-response across every season, season held fixed.
    full = g[g.attendance.notna() & (g.attendance > 0)].copy()
    full["log_att"] = np.log(full.attendance)
    full["season_demeaned_share"] = full.away_share - full.groupby("season").away_share.transform("mean")
    full["season_demeaned_logatt"] = full.log_att - full.groupby("season").log_att.transform("mean")
    x = full.season_demeaned_logatt.to_numpy()
    y = full.season_demeaned_share.to_numpy()
    slope = float(np.sum(x * y) / np.sum(x * x))
    resid = y - slope * x
    se = float(np.sqrt(np.sum(resid ** 2) / (len(x) - 2) / np.sum(x * x)))
    out["dose_response"] = {
        "n": int(len(full)),
        "slope_away_share_per_log_attendance": slope,
        "se": se,
        "t": slope / se if se else None,
        "interpretation_pp_per_doubling": slope * np.log(2) * 100,
    }

    # (4) The league-wide baseline, for scale.
    out["all_games"] = summarise(g, "every game")
    return out


# --------------------------------------------------------------------------- axis F
def axis_f(games, fouls, long, rng) -> dict:
    """Do consecutive fouls switch teams more often than a shuffled order produces?"""
    f = fouls.dropna(subset=["elapsed_sec"]).sort_values(["event_id", "elapsed_sec"])
    obs_switch = []
    null_switch = []
    quick_obs = []
    quick_null = []
    per_game_rows = []
    rs = np.random.default_rng(SEED)

    for eid, sub in f.groupby("event_id", sort=False):
        side = sub.committing_is_home.to_numpy()
        t = sub.elapsed_sec.to_numpy(dtype=float)
        if len(side) < 4:
            continue
        switch = (side[1:] != side[:-1]).astype(float)
        gap = t[1:] - t[:-1]
        # Null: hold each team's foul total fixed, shuffle only the order.
        perms = np.empty(20)
        quick_perms = np.empty(20)
        quick_mask = gap <= MAKEUP_WINDOW_SEC
        for b in range(20):
            shuffled = rs.permutation(side)
            sw = (shuffled[1:] != shuffled[:-1]).astype(float)
            perms[b] = sw.mean()
            quick_perms[b] = sw[quick_mask].mean() if quick_mask.any() else np.nan
        obs_switch.append(switch.mean())
        null_switch.append(perms.mean())
        if quick_mask.any():
            quick_obs.append(switch[quick_mask].mean())
            quick_null.append(np.nanmean(quick_perms))
        per_game_rows.append({
            "event_id": eid,
            "F_switch_excess": switch.mean() - perms.mean(),
            "F_quick_excess": (switch[quick_mask].mean() - np.nanmean(quick_perms))
            if quick_mask.any() else np.nan,
        })

    obs = float(np.mean(obs_switch))
    null = float(np.mean(null_switch))
    n = len(obs_switch)
    excess = np.array(obs_switch) - np.array(null_switch)
    se = float(excess.std(ddof=1) / np.sqrt(n))
    quick_excess = np.array(quick_obs) - np.array(quick_null)
    quick_se = float(np.nanstd(quick_excess, ddof=1) / np.sqrt(np.sum(~np.isnan(quick_excess))))

    per_game = pd.DataFrame(per_game_rows).merge(games[["event_id", "season"]], on="event_id")
    res = permutation_test(per_game, long[long.event_id.isin(set(per_game.event_id))],
                           ["F_switch_excess", "F_quick_excess"], rng)
    return {
        "n_games": n,
        "observed_switch_rate": obs,
        "null_switch_rate": null,
        "excess": obs - null,
        "excess_se": se,
        "excess_t": (obs - null) / se if se else None,
        "quick_window_sec": MAKEUP_WINDOW_SEC,
        "quick_observed": float(np.mean(quick_obs)),
        "quick_null": float(np.mean(quick_null)),
        "quick_excess": float(np.nanmean(quick_excess)),
        "quick_excess_se": quick_se,
        "quick_excess_t": float(np.nanmean(quick_excess) / quick_se) if quick_se else None,
        "per_official": {k: res[k] for k in res},
    }


# --------------------------------------------------------------------------- D gate
def d_gate(games, long, rng) -> dict:
    """Re-test the D1/D2 spread of z against a full-grid permutation.

    The analytic per-pair null treats pairs as independent; one player appears in many pairs, so
    it does not. Here the official column is reassigned across games wholesale and the whole grid
    is recomputed, which preserves that dependence.
    """
    players = pd.read_csv(DATA_DIR / "players.csv")
    players = players[players.event_id.isin(set(games.event_id))].copy()
    players["athlete_id"] = players.athlete_id.astype("Int64").astype(str)
    meta = games[["event_id", "season", "home_score", "away_score"]]
    played = players[players.minutes.notna() & (players.minutes > 0)].merge(meta, on="event_id")
    played["team_won"] = np.where(
        played.is_home == 1, (played.home_score > played.away_score).astype(int),
        (played.away_score > played.home_score).astype(int))

    d1 = played[(played.minutes >= 10) & played.personal_fouls.notna()].copy()
    d1["value"] = d1.personal_fouls / d1.minutes * 36
    d2 = played.copy()
    d2["venue"] = np.where(d2.is_home == 1, "H", "A")
    grp = d2.groupby(["athlete_id", "season", "venue"]).team_won
    n_grp, sum_grp = grp.transform("size"), grp.transform("sum")
    d2["value"] = d2.team_won - np.where(n_grp > 1, (sum_grp - d2.team_won) / (n_grp - 1), np.nan)
    d2 = d2[d2.value.notna()]

    out = {}
    for label, frame in (("d1", d1), ("d2", d2)):
        frame = frame[["event_id", "athlete_id", "season", "value"]]
        pool_stats = frame.groupby(["athlete_id", "season"]).value.agg(["mean", "var", "size"])
        base = long[["event_id", "official"]]

        pool = pool_stats.reset_index().rename(
            columns={"mean": "p_mean", "var": "p_var", "size": "p_size"})

        def grid_z(assignment: pd.DataFrame) -> np.ndarray:
            """Vectorised: every pair's stratified null mean and variance in three groupbys."""
            m = frame.merge(assignment, on="event_id")
            strata = (m.groupby(["official", "athlete_id", "season"], observed=True)
                      .agg(n=("value", "size"), s=("value", "sum")).reset_index())
            strata = strata.merge(pool, on=["athlete_id", "season"], how="left")
            strata = strata[strata.n <= strata.p_size]
            inner = np.where(
                (strata.p_size > 1) & (strata.n < strata.p_size),
                (strata.n ** 2) * (strata.p_var / strata.n)
                * ((strata.p_size - strata.n) / (strata.p_size - 1)),
                0.0)
            strata = strata.assign(mu_part=strata.n * strata.p_mean, var_part=inner)
            pair = strata.groupby(["official", "athlete_id"], observed=True).agg(
                n=("n", "sum"), s=("s", "sum"), mu=("mu_part", "sum"), var=("var_part", "sum"))
            pair = pair[(pair.n >= 30) & (pair["var"] > 0)]
            if pair.empty:
                return np.array([])
            obs = pair.s / pair.n
            mu = pair.mu / pair.n
            sd = np.sqrt(pair["var"]) / pair.n
            return ((obs - mu) / sd).to_numpy()

        observed = grid_z(base)
        obs_sd = float(np.std(observed, ddof=1))
        obs_extreme = int(np.sum(np.abs(observed) >= 2))
        log.info("  %s observed: pairs=%d sd(z)=%.4f extreme=%d", label, len(observed), obs_sd, obs_extreme)

        null_sd, null_extreme = [], []
        eids = games.event_id.to_numpy()
        for b in range(N_GRID_PERMUTATIONS):
            shuffled = base.copy()
            mapping = dict(zip(eids, rng.permutation(eids)))
            shuffled["event_id"] = shuffled.event_id.map(mapping)
            z = grid_z(shuffled)
            if len(z) > 1:
                null_sd.append(np.std(z, ddof=1))
                null_extreme.append(np.sum(np.abs(z) >= 2) / len(z))
            if (b + 1) % 100 == 0:
                log.info("    %s permutation %d/%d", label, b + 1, N_GRID_PERMUTATIONS)
        null_sd = np.array(null_sd)
        out[label] = {
            "n_pairs": int(len(observed)),
            "observed_sd_z": obs_sd,
            "null_sd_z_mean": float(null_sd.mean()),
            "p_value": float((null_sd >= obs_sd).mean()),
            "observed_extreme_share": obs_extreme / len(observed),
            "null_extreme_share_mean": float(np.mean(null_extreme)),
        }
    return out


def main() -> None:
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", choices=["fast", "gate"], default="fast",
                    help="fast = axes B/E/F; gate = the D1/D2 full-grid permutation")
    args = ap.parse_args()
    rng = np.random.default_rng(SEED)
    games, fouls = load()
    long = official_game_map(games)
    bubble = set(games[(games.season == "2019-20") & (games.date_et >= BUBBLE_FIRST_DATE)].event_id)

    if args.stage == "gate":
        existing = json.loads(RESULTS_PATH.read_text()) if RESULTS_PATH.exists() else {}
        log.info("D1/D2 gate -- full-grid permutation")
        existing["d_gate"] = d_gate(games, long, rng)
        RESULTS_PATH.write_text(json.dumps(existing, indent=1, default=str))
        log.info("wrote %s", RESULTS_PATH)
        return

    results = {"n_games": int(len(games)), "n_fouls": int(len(fouls))}

    log.info("axis B -- score state")
    results["axis_b"] = axis_b(games, fouls, long, rng)

    log.info("axis E -- does the home whistle need a crowd?")
    results["axis_e"] = axis_e(games, fouls)

    log.info("axis F -- make-up calls")
    f_no_bubble = fouls[~fouls.event_id.isin(bubble)]
    results["axis_f"] = axis_f(games[~games.event_id.isin(bubble)], f_no_bubble,
                               long[~long.event_id.isin(bubble)], rng)

    RESULTS_PATH.write_text(json.dumps(results, indent=1, default=str))
    log.info("wrote %s", RESULTS_PATH)


if __name__ == "__main__":
    main()
