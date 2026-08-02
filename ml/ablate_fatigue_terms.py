"""Single-term ablations of the shipped fatigue model, re-measured offline.

Replaces the 2026-07-30 ablations, which were produced by a database recompute and
predate two changes: `ALTITUDE_MULTIPLIER` 1.15 -> 1.29, and the rule that the model
only calls a game when the fresher team is at home.

WHAT AN ABLATION MEANS NOW, WHICH IS NOT WHAT IT MEANT BEFORE
------------------------------------------------------------
The old table held the sample fixed and asked how much accuracy each term was worth.
Under the current rule that question is empty: a called game is always a pick of the
home team, so on a *fixed* set of called games the win rate is just those games' home
win rate and no fatigue term can move it. Every fixed-sample ablation would return
exactly 0.00.

What the terms actually do now is *select* — they decide which games get called at all.
So each ablation here neutralises one term, re-derives the call under the shipped rule,
and reports the published win rate and sample size that result. `delta_pp` is the
movement in the published headline; `n` is how many games the model would then call.
A term that "earns nothing" is one whose removal leaves the headline where it was.

Reads `ml/data/fatigue_features.csv` (from `scripts/export_fatigue_features.ts`, which
reproduces every stored score exactly). Writes a report file — never stdout — because
this environment has masked numeric digits in Bash output.
"""

from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)

DATA = Path(__file__).resolve().parent / "data"
CSV = DATA / "fatigue_features.csv"
REPORT = DATA / "fatigue_ablations.txt"

# src/lib/rest-advantage-evidence.ts
NEUTRAL_THRESHOLD = 0.5
# src/lib/season-regime.ts — the one abnormal stretch.
BUBBLE = ("2019-20", "2020-07-30", "2020-10-11")

# Neutral value each term takes when removed. Matches the assembly in fatigue.ts:968-974,
# score = max(0, (decay + travel + road) * b2b * alt * density + freshness + overtime).
TERMS = [
    ("Recent workload (decay)", "decay_load", 0.0),
    ("Back-to-back", "b2b_mult", 1.0),
    ("Travel", "travel_load", 0.0),
    ("Road segment", "road_load", 0.0),
    ("Altitude", "alt_mult", 1.0),
    ("Overtime", "ot_bonus", 0.0),
    ("Freshness", "freshness_bonus", 0.0),
    ("Schedule density", "density_mult", 1.0),
]

COMPONENTS = [
    "decay_load",
    "travel_load",
    "road_load",
    "b2b_mult",
    "alt_mult",
    "density_mult",
    "freshness_bonus",
    "ot_bonus",
]


def assemble(df: pd.DataFrame, drop: str | None = None, neutral: float = 0.0) -> pd.Series:
    """Rebuild the fatigue score from its stored components, optionally neutralising one."""
    part = {c: df[c] for c in COMPONENTS}
    if drop is not None:
        part[drop] = pd.Series(neutral, index=df.index)

    base = part["decay_load"] + part["travel_load"] + part["road_load"]
    multiplied = base * part["b2b_mult"] * part["alt_mult"] * part["density_mult"]
    total = multiplied + part["freshness_bonus"] + part["ot_bonus"]
    return (total.clip(lower=0) * 100).round() / 100


def calls(home: pd.DataFrame, away: pd.DataFrame, col: str):
    """Apply the shipped rule: call only when the home side is the fresher one."""
    return (away[col].to_numpy() - home[col].to_numpy()) >= NEUTRAL_THRESHOLD


def rate(mask, won) -> tuple[int, float]:
    n = int(mask.sum())
    if n == 0:
        return 0, 0.0
    return n, round(int(won[mask].sum()) / n * 100, 2)


def above_coin_flip(mask, won) -> int:
    """Correct calls in excess of a coin flip. The measure of a model's total value.

    A win *rate* rewards calling fewer, safer games; this rewards calling more winners.
    They disagree, and the disagreement is the whole story on the travel term.
    """
    n = int(mask.sum())
    return int(won[mask].sum()) - n / 2 if n else 0


def main() -> None:
    usecols = [
        "game_id", "date", "season", "game_type", "status",
        "is_home", "won", "score", *COMPONENTS,
    ]
    df = pd.read_csv(CSV, usecols=usecols)
    log.info("rows read: %d", len(df))

    # publishableGames(): regular season, normally played, plus status='final' at the
    # backtest call site (queries.ts:143,523).
    df = df[df["game_type"] == "regular"]
    df = df[df["status"] == "final"]
    df = df[df["won"].notna()]
    season, lo, hi = BUBBLE
    df = df[~((df["season"] == season) & (df["date"] >= lo) & (df["date"] <= hi))]

    # Fidelity gate: the reconstruction must reproduce the exported score exactly, or the
    # ablations below are measuring an assembly that is not the shipped one.
    rebuilt = assemble(df)
    bad = int((rebuilt - df["score"]).abs().gt(0.005).sum())

    # is_home arrives as 0/1 or true/false depending on the CSV writer; normalise.
    is_home = df["is_home"].astype(str).str.lower().isin({"1", "true"})
    home = df[is_home].set_index("game_id").sort_index()
    away = df[~is_home].set_index("game_id").sort_index()
    paired = home.index.intersection(away.index)
    home, away = home.loc[paired], away.loc[paired]

    home = home.assign(full=assemble(home))
    away = away.assign(full=assemble(away))
    won = home["won"].to_numpy().astype(bool)
    full = calls(home, away, "full")
    base_n, base_rate = rate(full, won)
    base_edge = above_coin_flip(full, won)

    lines = [
        "# Single-term fatigue ablations, re-measured",
        "",
        f"score reconstruction mismatches   {bad}",
        f"games after publishable filter    {len(paired)}",
        f"full model — called               {base_n}",
        f"full model — win rate             {base_rate}",
        f"full model — wins above coin flip {base_edge:+.0f}",
        "",
        "Each row neutralises one term and re-derives the call under the shipped rule.",
        "",
        "  delta_pp   movement in the published win rate",
        "  n          games the ablated model still calls",
        "  uniq_n     games called ONLY when the term is present — what the term finds",
        "  uniq_rate  win rate on those games. Above 50 means the term finds winners.",
        "  edge_lost  correct-calls-above-a-coin-flip given up by removing the term.",
        "",
        "READ uniq_rate AND edge_lost BEFORE delta_pp. A term that finds extra winners at a",
        "rate below the model's own average *lowers* the headline while *raising* the number",
        "of games won — deleting it buys a prettier percentage with real predictions. That is",
        "exactly what travel does, and delta_pp alone reads as the opposite.",
        "",
        f"{'term':<26}{'delta_pp':>10}{'n':>8}{'uniq_n':>8}{'uniq_rate':>11}{'edge_lost':>11}",
    ]

    for label, col, neutral in TERMS:
        h = home.assign(abl=assemble(home, col, neutral))
        a = away.assign(abl=assemble(away, col, neutral))
        abl = calls(h, a, "abl")
        n, r = rate(abl, won)
        uniq_n, uniq_rate = rate(full & ~abl, won)
        edge_lost = base_edge - above_coin_flip(abl, won)
        lines.append(
            f"{label:<26}{r - base_rate:>10.2f}{n:>8}{uniq_n:>8}"
            f"{uniq_rate:>10.2f}%{edge_lost:>+11.0f}"
        )

    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    log.info("report written to %s", REPORT)


if __name__ == "__main__":
    main()
