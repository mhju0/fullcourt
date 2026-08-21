"""ADR 0007's pre-registered referee axes, run against the cached corpus.

Read `docs/adr/0007-referee-analysis-axes-are-pre-registered.md` first. It fixed — before any
figure here was seen — which questions may be asked, the |z| >= 2 bar, and the rule that a null
ships the page rather than extending the stub.

    Axis A   foul type x home/away, paired within official, then repeated on shares as a pace control
    Axis C   per-quarter foul rate on the full corpus; the Q4 final-2:00 cut only if that lands
    Axis B   score state -- runs only if A or C lands
    Axis D   player-level -- NOT here. Its own pre-registration: ml/referee_player_preregistration.md

Two tests are reported for every axis, and they answer different questions:

**The global test** asks whether officials differ *at all* on this axis. It compares the observed
spread of per-official means (their standard deviation) against a permutation null in which each
official's games are a random draw from the same seasons. It is immune to multiplicity: one test,
one p-value. This is the question the page would be publishing an answer to.

**The per-official |z| bar** is ADR 0007's, and it is reported with its own expectation attached.
At |z| >= 2, 5% of 126 officials clear the bar by chance, so "10 officials are extreme" is only
a finding if 10 is meaningfully more than ~6. The count is always printed next to what noise alone
produces, because that comparison is the whole content of the number.

The null preserves each official's games-per-season, so a league that called 4 more fouls a game
in 2015-16 than in 2024-25 cannot manufacture a difference between two officials who worked in
different eras.

Usage:
    ml/.venv/bin/python ml/referee_axes.py
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np
import pandas as pd

DATA_DIR = Path("ml/data/referee")
REPORT_PATH = Path("ml/REFEREE_AXES_REPORT.md")
RESULTS_PATH = DATA_DIR / "axes_results.json"

N_PERMUTATIONS = 2000
SEED = 20260821

# Officials below this are carried in the corpus but not tested: a 40-game official's mean is
# noise at any bar, and including them inflates the count of "extreme" names for free.
MIN_GAMES = 200

# The published taxonomy of src/data/referee-foul-style.json, so this analysis and the page
# that may quote it are counting the same things. Anything foul-flagged and unlisted is in
# `total` and in no column, which is what "other" means here.
FOUL_GROUPS = {
    "shooting": ["Shooting Foul"],
    "personal": ["Personal Foul", "Double Personal Foul", "Inbound Foul"],
    "looseBall": ["Loose Ball Foul"],
    "offensive": ["Offensive Foul"],
    "technical": [
        "Technical Foul",
        "Double Technical Foul",
        "Hanging Technical Foul",
        "Taunting Technical Foul",
    ],
}

# The 2019-20 restart: no crowd, and every game on a neutral floor in Orlando. A home/away
# whistle question cannot pool those with games that had a building in them. Excluded from
# axis A, kept everywhere else, and asked on its own terms in ml/referee_crowd_test.py.
BUBBLE_FIRST_DATE = "2020-07-30"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def load() -> tuple[pd.DataFrame, pd.DataFrame]:
    games = pd.read_csv(DATA_DIR / "games.csv")
    fouls = pd.read_csv(DATA_DIR / "fouls.csv")
    games = games[
        (games.season_type == 2)
        & (games.n_officials == 3)
        & (games.n_plays > 0)
        & (games.n_player_rows > 0)
    ].copy()
    fouls = fouls[fouls.event_id.isin(set(games.event_id))].copy()
    log.info("usable games=%d fouls=%d", len(games), len(fouls))
    return games, fouls


def foul_key(series: pd.Series) -> pd.Series:
    lookup = {label: key for key, labels in FOUL_GROUPS.items() for label in labels}
    return series.map(lookup).fillna("other")


def build_game_stats(games: pd.DataFrame, fouls: pd.DataFrame) -> pd.DataFrame:
    """One row per game, carrying every per-game quantity the axes need."""
    fouls = fouls.copy()
    fouls["key"] = foul_key(fouls.foul_type)
    fouls = fouls[fouls.committing_is_home.notna()]
    fouls["committing_is_home"] = fouls.committing_is_home.astype(int)

    stats = games[["event_id", "season", "date_et", "neutral_site"]].set_index("event_id")

    # --- Axis A: counts and shares of fouls committed by each side.
    # A foul committed by the AWAY team benefits the home team, so `away - home` is signed so
    # that positive means home-favouring. This sign is stated once here and used throughout.
    for key in list(FOUL_GROUPS) + ["total"]:
        sub = fouls if key == "total" else fouls[fouls.key == key]
        home = sub[sub.committing_is_home == 1].groupby("event_id").size()
        away = sub[sub.committing_is_home == 0].groupby("event_id").size()
        home = home.reindex(stats.index, fill_value=0)
        away = away.reindex(stats.index, fill_value=0)
        stats[f"A_{key}_diff"] = (away - home).astype(float)
        total = home + away
        with np.errstate(invalid="ignore"):
            stats[f"A_{key}_share"] = np.where(total > 0, away / total, np.nan)
        stats[f"vol_{key}"] = total.astype(float)

    # --- Axis C: where in the game the whistle goes.
    for period in (1, 2, 3, 4):
        n = fouls[fouls.period == period].groupby("event_id").size().reindex(stats.index, fill_value=0)
        stats[f"C_q{period}"] = n.astype(float)
    reg = sum(stats[f"C_q{p}"] for p in (1, 2, 3, 4))
    for period in (1, 2, 3, 4):
        stats[f"C_q{period}_share"] = np.where(reg > 0, stats[f"C_q{period}"] / reg, np.nan)

    # The narrow window ADR 0007 gates behind the coarse one.
    clutch = fouls[(fouls.period == 4) & (fouls.clock_remaining_sec <= 120)]
    stats["C_q4_last2"] = clutch.groupby("event_id").size().reindex(stats.index, fill_value=0).astype(float)

    return stats.reset_index()


def official_game_map(games: pd.DataFrame) -> pd.DataFrame:
    """Long form: one row per (official, game)."""
    frames = []
    for col in ("official_1", "official_2", "official_3"):
        part = games[["event_id", col, "season"]].rename(columns={col: "official"})
        frames.append(part)
    long = pd.concat(frames, ignore_index=True)
    long = long[long.official.notna() & (long.official != "")]
    return long


def permutation_test(
    stats: pd.DataFrame,
    long: pd.DataFrame,
    columns: list[str],
    rng: np.random.Generator,
) -> dict:
    """Per-official means for each column, with a permutation null that holds season mix fixed.

    Returns the global spread test (is there any between-official difference at all?) and the
    per-official z-scores behind ADR 0007's |z| >= 2 bar.
    """
    stats = stats.reset_index(drop=True)
    row_of = {eid: i for i, eid in enumerate(stats.event_id)}
    season_rows = {s: np.array([row_of[e] for e in sub.event_id]) for s, sub in stats.groupby("season")}

    values = {c: stats[c].to_numpy(dtype=float) for c in columns}

    counts = long.groupby("official").size()
    tested = counts[counts >= MIN_GAMES].index.tolist()
    log.info("  officials tested: %d of %d (>= %d games)", len(tested), len(counts), MIN_GAMES)

    per_official_rows = long[long.official.isin(tested)]
    by_official = {
        name: sub for name, sub in per_official_rows.groupby("official")
    }

    results = {c: {"officials": {}, "global": {}} for c in columns}

    # Observed means.
    observed = {c: {} for c in columns}
    season_counts = {}
    for name, sub in by_official.items():
        idx = np.array([row_of[e] for e in sub.event_id])
        season_counts[name] = sub.season.value_counts().to_dict()
        for c in columns:
            v = values[c][idx]
            observed[c][name] = float(np.nanmean(v))

    # Permutation null: resample each official's games from the same seasons, same counts.
    null_means = {c: {name: np.empty(N_PERMUTATIONS) for name in tested} for c in columns}
    for name in tested:
        pools = season_counts[name]
        draws = np.empty((N_PERMUTATIONS, sum(pools.values())), dtype=int)
        for b in range(N_PERMUTATIONS):
            picks = [rng.choice(season_rows[s], size=n, replace=False) for s, n in pools.items()]
            draws[b] = np.concatenate(picks)
        for c in columns:
            null_means[c][name] = np.nanmean(values[c][draws], axis=1)

    for c in columns:
        obs_vec = np.array([observed[c][n] for n in tested])
        null_matrix = np.vstack([null_means[c][n] for n in tested])  # officials x perms
        mu = null_matrix.mean(axis=1)
        sd = null_matrix.std(axis=1, ddof=1)
        sd = np.where(sd > 0, sd, np.nan)
        z = (obs_vec - mu) / sd

        # Global: does the observed spread across officials exceed what the null produces?
        obs_spread = float(np.nanstd(obs_vec, ddof=1))
        null_spread = np.nanstd(null_matrix, axis=0, ddof=1)
        p_global = float((null_spread >= obs_spread).mean())

        n_extreme = int(np.sum(np.abs(z) >= 2))
        results[c]["global"] = {
            "observed_spread_sd": obs_spread,
            "null_spread_sd_mean": float(np.nanmean(null_spread)),
            "spread_ratio": float(obs_spread / np.nanmean(null_spread)),
            "p_value": p_global,
            "n_officials": len(tested),
            "n_extreme_z2": n_extreme,
            "expected_extreme_z2": round(0.0455 * len(tested), 1),
            "league_mean": float(np.nanmean(values[c])),
        }
        order = np.argsort(-np.abs(z))
        results[c]["officials"] = {
            tested[i]: {"mean": float(obs_vec[i]), "z": float(z[i]), "games": int(counts[tested[i]])}
            for i in order
        }
    return results


def main() -> None:
    rng = np.random.default_rng(SEED)
    games, fouls = load()
    stats = build_game_stats(games, fouls)
    long = official_game_map(games)

    # Axis A excludes the bubble; axes C and volume keep every usable game.
    bubble = set(games[(games.season == "2019-20") & (games.date_et >= BUBBLE_FIRST_DATE)].event_id)
    log.info("bubble games excluded from axis A: %d", len(bubble))
    stats_a = stats[~stats.event_id.isin(bubble)]
    long_a = long[~long.event_id.isin(bubble)]

    a_cols = [f"A_{k}_diff" for k in list(FOUL_GROUPS) + ["total"]]
    a_cols += [f"A_{k}_share" for k in list(FOUL_GROUPS) + ["total"]]
    vol_cols = [f"vol_{k}" for k in list(FOUL_GROUPS) + ["total"]]
    c_cols = [f"C_q{p}" for p in (1, 2, 3, 4)] + [f"C_q{p}_share" for p in (1, 2, 3, 4)] + ["C_q4_last2"]

    log.info("axis A (home/away by foul type), bubble excluded")
    res_a = permutation_test(stats_a, long_a, a_cols, rng)
    log.info("whistle volume by foul type (the already-published finding, re-measured)")
    res_v = permutation_test(stats, long, vol_cols, rng)
    log.info("axis C (timing)")
    res_c = permutation_test(stats, long, c_cols, rng)

    out = {
        "n_games": int(len(games)),
        "n_games_axis_a": int(len(stats_a)),
        "n_fouls": int(len(fouls)),
        "seasons": sorted(games.season.unique().tolist()),
        "min_games": MIN_GAMES,
        "n_permutations": N_PERMUTATIONS,
        "axis_a": res_a,
        "volume": res_v,
        "axis_c": res_c,
    }
    RESULTS_PATH.write_text(json.dumps(out, indent=1))
    log.info("wrote %s", RESULTS_PATH)

    lines = ["# Referee axes — ADR 0007, measured", ""]
    lines.append(f"Corpus: **{len(games):,} regular-season games**, {len(fouls):,} foul plays, "
                 f"{games.season.nunique()} seasons ({min(games.season)} … {max(games.season)}).")
    lines.append(f"Officials tested: those with >= {MIN_GAMES} games. "
                 f"Permutations: {N_PERMUTATIONS:,}. Axis A drops {len(bubble)} bubble games.")
    lines.append("")
    lines.append("`spread ratio` is the observed between-official spread divided by what the null "
                 "produces; 1.00 means officials differ no more than random subsets of games do. "
                 "`extreme` counts |z| >= 2 against the count noise alone yields.")
    for title, res, cols in (
        ("Whistle volume (fouls per game)", res_v, vol_cols),
        ("Axis A — home/away tilt by foul type", res_a, a_cols),
        ("Axis C — timing", res_c, c_cols),
    ):
        lines += ["", f"## {title}", "",
                  "| statistic | league mean | spread ratio | p | extreme (\\|z\\|>=2) | expected |",
                  "|---|---|---|---|---|---|"]
        for c in cols:
            g = res[c]["global"]
            lines.append(
                f"| `{c}` | {g['league_mean']:.3f} | {g['spread_ratio']:.2f} | "
                f"{g['p_value']:.4f} | {g['n_extreme_z2']} | {g['expected_extreme_z2']} |"
            )
    REPORT_PATH.write_text("\n".join(lines) + "\n")
    log.info("wrote %s", REPORT_PATH)


if __name__ == "__main__":
    main()
