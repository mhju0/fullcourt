"""Is axis F's alternation a make-up call, or just possession changing hands?

Axis F measured that consecutive fouls switch teams about two points more often than a shuffle of
the same game's foul order produces (t = 27). That null holds each team's foul total fixed but
destroys the possession structure, and **basketball alternates possessions**, so a mechanical
explanation survives it untouched: defensive fouls follow the ball, and the ball changes hands.

This script runs the test that separates the two, using a case where the mechanical story and the
compensation story predict **opposite signs**:

* A **defensive** foul (shooting, most personals) is committed by the team without the ball. The
  possession then ends, the other team takes over, and the next defensive foul falls on *them* --
  so mechanics alone predicts alternation. Compensation predicts the same. Uninformative.
* An **offensive** foul is committed by the team *with* the ball, and it is a turnover. The
  fouling team goes immediately onto defense, so the next defensive foul falls on *them again* --
  mechanics predicts alternation **below** chance. Compensation still predicts alternation above
  chance. The two hypotheses part company here, and the sign settles it.

A secondary read: how the excess decays with the gap between the two calls.

Usage:
    ml/.venv/bin/python ml/referee_makeup_diagnostic.py
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np
import pandas as pd

DATA_DIR = Path("ml/data/referee")
RESULTS_PATH = DATA_DIR / "makeup_diagnostic.json"
SEED = 20260821
N_SHUFFLES = 40

DEFENSIVE = {"Shooting Foul", "Personal Foul", "Loose Ball Foul", "Inbound Foul"}
OFFENSIVE = {"Offensive Foul"}
GAP_BINS = [(0, 15), (15, 30), (30, 60), (60, 120), (120, 300), (300, 10_000)]

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def main() -> None:
    rng = np.random.default_rng(SEED)
    games = pd.read_csv(DATA_DIR / "games.csv")
    games = games[(games.season_type == 2) & (games.n_officials >= 3) & (games.n_plays > 0)]
    fouls = pd.read_csv(DATA_DIR / "fouls.csv")
    fouls = fouls[fouls.event_id.isin(set(games.event_id))]
    fouls = fouls.dropna(subset=["committing_is_home", "elapsed_sec"]).copy()
    fouls["committing_is_home"] = fouls.committing_is_home.astype(int)
    fouls = fouls.sort_values(["event_id", "elapsed_sec"])

    first_kind: list[str] = []
    switches: list[int] = []
    gaps: list[float] = []
    null_switch_sum = np.zeros(0)
    obs_rows, null_rows = [], []

    for _, sub in fouls.groupby("event_id", sort=False):
        side = sub.committing_is_home.to_numpy()
        t = sub.elapsed_sec.to_numpy(dtype=float)
        kinds = sub.foul_type.to_numpy()
        if len(side) < 4:
            continue
        sw = (side[1:] != side[:-1]).astype(int)
        obs_rows.append(np.column_stack([sw, t[1:] - t[:-1]]))
        first_kind.extend(kinds[:-1])
        # Null: same totals, random order. Kinds stay pinned to positions.
        acc = np.zeros(len(sw))
        for _ in range(N_SHUFFLES):
            shuffled = rng.permutation(side)
            acc += (shuffled[1:] != shuffled[:-1]).astype(float)
        null_rows.append(acc / N_SHUFFLES)

    obs = np.vstack(obs_rows)
    df = pd.DataFrame({
        "switch": obs[:, 0], "gap": obs[:, 1],
        "null": np.concatenate(null_rows), "first_kind": first_kind,
    })
    df["group"] = np.where(df.first_kind.isin(OFFENSIVE), "offensive",
                           np.where(df.first_kind.isin(DEFENSIVE), "defensive", "other"))
    log.info("consecutive foul pairs: %d", len(df))

    def block(sub: pd.DataFrame) -> dict:
        n = len(sub)
        if n < 30:
            return {"n": n}
        excess = sub.switch - sub.null
        se = float(excess.std(ddof=1) / np.sqrt(n))
        return {
            "n": int(n),
            "observed_switch": float(sub.switch.mean()),
            "null_switch": float(sub.null.mean()),
            "excess": float(excess.mean()),
            "se": se,
            "t": float(excess.mean() / se) if se else None,
        }

    results = {
        "n_pairs": int(len(df)),
        "overall": block(df),
        "by_first_foul": {g: block(sub) for g, sub in df.groupby("group")},
        "by_gap": {},
        "offensive_by_gap": {},
    }
    for lo, hi in GAP_BINS:
        label = f"{lo}-{hi}s"
        results["by_gap"][label] = block(df[(df.gap >= lo) & (df.gap < hi)])
        sub = df[(df.group == "offensive") & (df.gap >= lo) & (df.gap < hi)]
        results["offensive_by_gap"][label] = block(sub)

    # The same split for shooting fouls alone, the cleanest defensive case.
    results["shooting_only"] = block(df[df.first_kind == "Shooting Foul"])
    results["offensive_quick"] = block(df[(df.group == "offensive") & (df.gap <= 120)])

    RESULTS_PATH.write_text(json.dumps(results, indent=1))
    log.info("wrote %s", RESULTS_PATH)


if __name__ == "__main__":
    main()
