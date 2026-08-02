"""Every figure the availability page publishes, as a machine-readable artifact.

Writes ``ml/availability_facts.json``, which ``src/lib/availability-facts.ts`` mirrors and
``src/lib/__tests__/availability-facts.test.ts`` pins. A number edited in a component and
nowhere else fails the suite — the same arrangement the Playoff Rest page uses, and for the
same reason: its figures were once retyped into three places and drifted.

The measurement itself is explained in ``ml/availability_cost.py`` and
``ml/availability_quality.py``. This file re-runs the parts that get published, at one
specification, and records the sample it came from.

**Everything here is retrospective.** Who sat is known only because the game was played, so
none of it forecasts anything, and the page has to say so.
"""

from __future__ import annotations

import json
import logging
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
JSON_PATH = ROOT / "ml" / "availability_facts.json"

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
    sigma2 = float(resid @ resid) / (len(y) - z.shape[1])
    se = np.sqrt(np.diag(sigma2 * np.linalg.pinv(z.T @ z)))
    frame = pd.DataFrame(
        {"feature": ["intercept", *names], "beta": beta, "se": se, "t": beta / se}
    ).set_index("feature")
    return frame, float(np.sqrt(np.mean(resid**2)))


def build_team_games() -> pd.DataFrame:
    box = pd.concat(
        [pd.read_csv(p, low_memory=False) for p in sorted(SHOOTING.glob("player_boxscores_*.csv"))],
        ignore_index=True,
    )
    box["min"] = box["minutes"].map(parse_minutes)
    box["external_id"] = box["game_id"].astype("int64").astype(str).str.zfill(10)

    z = box.fillna(
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
        z["points"]
        + 0.4 * z["field_goals_made"]
        - 0.7 * z["field_goals_attempted"]
        - 0.4 * (z["free_throws_attempted"] - z["free_throws_made"])
        + 0.7 * z["rebounds_offensive"]
        + 0.3 * z["rebounds_defensive"]
        + z["steals"]
        + 0.7 * z["assists"]
        + 0.7 * z["blocks"]
        - 0.4 * z["fouls_personal"]
        - z["turnovers"]
    )

    sides = pd.read_csv(
        FEATURES,
        usecols=["game_id", "external_id", "date", "season", "team_id", "is_home", "status", "game_type"],
        low_memory=False,
    )
    sides = sides[(sides["status"] == "final") & (sides["game_type"] == "regular")].copy()
    sides["external_id"] = sides["external_id"].astype(str).str.zfill(10)
    sides["side"] = np.where(sides["is_home"] == 1, "home", "away")

    # hoopR carries its own team_id, game_id and season, all of which collide with ours and
    # would silently become _x / _y. The join key is (external_id, side); none are needed.
    play = box.drop(columns=["team_id", "game_id", "season"]).merge(
        sides[["game_id", "external_id", "date", "season", "team_id", "side"]],
        on=["external_id", "side"],
        how="inner",
    )

    appeared = play[play["min"] > 0].sort_values(["person_id", "date"]).copy()
    appeared["q_gs"] = appeared.groupby("person_id")["game_score"].transform(
        lambda s: s.shift(1).rolling(QUALITY_GAMES, min_periods=QUALITY_MIN_GAMES).mean()
    )
    play = play.merge(
        appeared[["game_id", "person_id", "q_gs"]], on=["game_id", "person_id"], how="left"
    ).sort_values(["team_id", "date", "person_id"])

    history: dict[int, deque] = defaultdict(lambda: deque(maxlen=WINDOW))
    rows = []
    for (team_id, game_id), grp in play.groupby(["team_id", "game_id"], sort=False):
        window = history[team_id]
        played_now = dict(zip(grp["person_id"], grp["min"]))

        mins: dict[int, list] = defaultdict(list)
        qual: dict[int, float] = {}
        for past in window:
            for pid, rec in past.items():
                if rec["min"] > 0:
                    mins[pid].append(rec["min"])
                    if not np.isnan(rec["q_gs"]):
                        qual[pid] = rec["q_gs"]

        rotation = {
            pid: float(np.mean(v))
            for pid, v in mins.items()
            if len(v) >= MIN_APPEARANCES and float(np.mean(v)) >= ROTATION_MINUTES
        }

        if len(window) == WINDOW and rotation:
            known = [qual[p] for p in rotation if p in qual]
            replacement = float(np.median(known)) if known else 0.0
            best = max(rotation, key=lambda p: qual.get(p, -np.inf)) if known else None

            miss_value = 0.0
            miss_count = 0
            best_out = 0
            for pid, _avg in rotation.items():
                if played_now.get(pid, 0.0) > 0.0:
                    continue
                miss_count += 1
                if pid in qual:
                    miss_value += max(0.0, qual[pid] - replacement)
                    if pid == best:
                        best_out = 1
            rows.append(
                {
                    "game_id": game_id,
                    "team_id": team_id,
                    "season": grp["season"].iloc[0],
                    "miss_value": miss_value,
                    "miss_count": miss_count,
                    "best_out": best_out,
                    "rotation_size": len(rotation),
                }
            )

        window.append(
            {
                pid: {"min": m, "q_gs": q}
                for pid, m, q in zip(grp["person_id"], grp["min"], grp["q_gs"])
            }
        )

    return pd.DataFrame(rows)


def main() -> None:
    log.info("building team-game availability")
    av = build_team_games()
    log.info("team-games measured: %d", len(av))

    sides = pd.read_csv(FEATURES, usecols=["game_id", "team_id", "is_home", "team_score", "opp_score", "status", "game_type"], low_memory=False)
    sides = sides[(sides["status"] == "final") & (sides["game_type"] == "regular")]

    merged = av.merge(sides[["game_id", "team_id", "is_home"]], on=["game_id", "team_id"])
    home = merged[merged["is_home"] == 1].set_index("game_id")
    away = merged[merged["is_home"] == 0].set_index("game_id")
    both = home.index.intersection(away.index)

    game = pd.DataFrame(index=both)
    game["d_miss_value"] = away.loc[both, "miss_value"].to_numpy() - home.loc[both, "miss_value"].to_numpy()
    game["d_best_out"] = away.loc[both, "best_out"].to_numpy() - home.loc[both, "best_out"].to_numpy()

    tab = pd.read_csv(TABLE, low_memory=False).set_index("game_id")
    h = sides[sides["is_home"] == 1].set_index("game_id")
    tab["home_margin"] = (h["team_score"] - h["opp_score"]).reindex(tab.index)

    df = tab.join(game, how="inner").dropna(subset=["home_margin"])
    for c in SCHEDULE + CONTROLS:
        df[c] = df[c].fillna(0.0)
    y = df["home_margin"].to_numpy(float)

    base, rmse_base = ols(df[CONTROLS + SCHEDULE].to_numpy(float), y, CONTROLS + SCHEDULE)
    ctl_only, _ = ols(df[CONTROLS].to_numpy(float), y, CONTROLS)

    # Published effects: each measured in its OWN specification, because the absence
    # measures are collinear with one another and split unstably when entered together.
    names_v = CONTROLS + SCHEDULE + ["d_miss_value"]
    fit_v, rmse_v = ols(df[names_v].to_numpy(float), y, names_v)
    names_b = CONTROLS + SCHEDULE + ["d_best_out"]
    fit_b, _ = ols(df[names_b].to_numpy(float), y, names_b)

    def cell(frame: pd.DataFrame, key: str) -> dict:
        return {
            "points": round(float(frame.loc[key, "beta"]), 3),
            "t": round(float(frame.loc[key, "t"]), 1),
        }

    facts = {
        "generatedFrom": "hoopR player box scores + games (final regular season only)",
        "sample": {
            "games": int(len(df)),
            "teamGames": int(len(av)),
            "firstSeason": str(df["season"].min()),
            "lastSeason": str(df["season"].max()),
        },
        "definition": {
            "rotationWindowGames": WINDOW,
            "rotationMinutes": ROTATION_MINUTES,
            "minAppearances": MIN_APPEARANCES,
            "qualityGames": QUALITY_GAMES,
        },
        # The headline scale: everything the site measures, in one unit.
        "effectsInPoints": {
            "bestPlayerOut": cell(fit_b, "d_best_out"),
            "homeCourt": {"points": round(float(ctl_only.loc["intercept", "beta"]), 3), "t": round(float(ctl_only.loc["intercept", "t"]), 1)},
            "backToBack": cell(base, "d_is_b2b"),
            "visitingAltitude": cell(base, "d_alt_visit"),
            "priorOvertime": cell(base, "d_prior_ot"),
            "missValuePerPoint": cell(fit_v, "d_miss_value"),
        },
        "frequency": {
            "teamGamesMissingBestPlayer": round(float(av["best_out"].mean()), 4),
            "teamGamesMissingNobody": round(float((av["miss_count"] == 0).mean()), 4),
            "gamesEitherSideMissingBest": round(float((game["d_best_out"].abs() > 0).mean()), 4),
            "meanRotationSize": round(float(av["rotation_size"].mean()), 2),
        },
        # How much of the schedule effect is really just stars sitting. Small, which is the
        # point: it is what stops "your back-to-back result is load management" being true.
        "scheduleHoldsUp": {
            {
                "d_is_b2b": "backToBack",
                "d_alt_visit": "visitingAltitude",
                "d_prior_ot": "priorOvertime",
                "d_density_points": "scheduleDensity",
            }[term]: {
                "scheduleOnly": round(float(base.loc[term, "beta"]), 3),
                "absenceControlled": round(float(fit_v.loc[term, "beta"]), 3),
                "shiftPct": round(
                    100.0 * (float(base.loc[term, "beta"]) - float(fit_v.loc[term, "beta"]))
                    / float(base.loc[term, "beta"]),
                    1,
                ),
            }
            for term in SCHEDULE
        },
        # Published so the page cannot imply it explains games. It does not.
        "noise": {
            "marginStdDev": round(float(np.std(y)), 2),
            "rmseScheduleOnly": round(rmse_base, 3),
            "rmseWithAbsence": round(rmse_v, 3),
        },
        "seasonBestOutRate": [
            {"season": str(s), "rate": round(float(g["best_out"].mean()), 4), "teamGames": int(len(g))}
            for s, g in av.groupby("season", sort=True)
        ],
    }

    JSON_PATH.write_text(json.dumps(facts, indent=2) + "\n")
    log.info("wrote %s", JSON_PATH)


if __name__ == "__main__":
    main()
