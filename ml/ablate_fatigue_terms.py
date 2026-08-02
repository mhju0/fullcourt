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


def called_rate(home: pd.DataFrame, away: pd.DataFrame, col: str) -> tuple[int, float]:
    """Apply the shipped rule: call only when the home side is the fresher one."""
    edge = away[col].to_numpy() - home[col].to_numpy()
    called = edge >= NEUTRAL_THRESHOLD
    n = int(called.sum())
    if n == 0:
        return 0, 0.0
    wins = int(home["won"].to_numpy()[called].sum())
    return n, round(wins / n * 100, 2)


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
    base_n, base_rate = called_rate(home, away, "full")

    lines = [
        "# Single-term fatigue ablations, re-measured",
        "",
        f"score reconstruction mismatches   {bad}",
        f"games after publishable filter    {len(paired)}",
        f"full model — called               {base_n}",
        f"full model — win rate             {base_rate}",
        "",
        "Each row neutralises one term and re-derives the call under the shipped rule.",
        "delta_pp is the movement in the published win rate; n is the games still called.",
        "",
        f"{'term':<26}{'rate':>8}{'delta_pp':>11}{'n':>9}{'n_delta':>9}",
    ]

    for label, col, neutral in TERMS:
        h = home.assign(abl=assemble(home, col, neutral))
        a = away.assign(abl=assemble(away, col, neutral))
        n, rate = called_rate(h, a, "abl")
        lines.append(
            f"{label:<26}{rate:>8.2f}{rate - base_rate:>11.2f}{n:>9}{n - base_n:>9}"
        )

    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    log.info("report written to %s", REPORT)


if __name__ == "__main__":
    main()
