"""What does a missing rotation player cost, in the same points the schedule terms are in?

ADR 0006 measured the schedule: a back-to-back is worth about 3.2 fatigue points, altitude 5.8.
This asks the neighbouring question in the same unit, so the two answers can be read in one
sentence rather than compared across scales.

**This measures cost, it does not forecast.** Who sat is known only because the game was played,
so nothing here is a prediction feature. The lineup-timing problem — that a scratch can land
thirty minutes before tip — does not apply to a retrospective question, which is exactly why
this is the version worth building first.

Who counts as missing is defined from PRIOR participation, never from tonight's sheet: a player
on a long-term injury may not be listed at all, so absence has to be inferred from the rotation
the team has actually been using. For each team-game, the expected rotation is everyone who
averaged at least `ROTATION_MINUTES` across that team's previous `WINDOW` games; a member who
records no minutes tonight is missing, weighted by the minutes they had been playing.

The second question is the interesting one. Load management means some of what a back-to-back
costs may not be fatigue at all — it may be that the stars simply do not play. Putting absence
and the schedule terms in the same regression shows how much of the back-to-back effect survives
once that is accounted for.
"""

from __future__ import annotations

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
REPORT = DATA / "availability_report.txt"
OUT = DATA / "availability_by_game.csv"

WINDOW = 5           # team-games of history that define the current rotation
ROTATION_MINUTES = 15.0
STAR_MINUTES = 30.0
MIN_APPEARANCES = 2  # inside the window, before a player counts as established


def parse_minutes(value: object) -> float:
    if not isinstance(value, str) or ":" not in value:
        return 0.0
    mm, _, ss = value.partition(":")
    try:
        return int(mm) + int(ss) / 60.0
    except ValueError:
        return 0.0


def ols_with_t(x: np.ndarray, y: np.ndarray, names: list[str]) -> pd.DataFrame:
    z = np.column_stack([np.ones(len(x)), x])
    beta, *_ = np.linalg.lstsq(z, y, rcond=None)
    resid = y - z @ beta
    sigma2 = float(resid @ resid) / (len(y) - z.shape[1])
    se = np.sqrt(np.diag(sigma2 * np.linalg.pinv(z.T @ z)))
    return pd.DataFrame(
        {"feature": ["intercept", *names], "beta": beta, "se": se, "t": beta / se}
    )


def main() -> None:
    log.info("loading player box scores")
    frames = [pd.read_csv(p, low_memory=False) for p in sorted(SHOOTING.glob("player_boxscores_*.csv"))]
    box = pd.concat(frames, ignore_index=True)
    box["min"] = box["minutes"].map(parse_minutes)
    box["external_id"] = box["game_id"].astype("int64").astype(str).str.zfill(10)

    sides = pd.read_csv(
        FEATURES,
        usecols=["game_id", "external_id", "date", "season", "team_id", "is_home", "status", "game_type"],
        low_memory=False,
    )
    sides = sides[(sides["status"] == "final") & (sides["game_type"] == "regular")].copy()
    sides["external_id"] = sides["external_id"].astype(str).str.zfill(10)
    sides["side"] = np.where(sides["is_home"] == 1, "home", "away")

    # hoopR carries its own `team_id` and `game_id` (the NBA's), which would collide with ours
    # and silently become _x / _y. The join key is (external_id, side); theirs are not needed,
    # and `external_id` was derived from hoopR's `game_id` above.
    play = box.drop(columns=["team_id", "game_id"]).merge(
        sides[["game_id", "external_id", "date", "team_id", "side"]],
        on=["external_id", "side"],
        how="inner",
    )
    log.info("player-games joined: %d", len(play))

    play = play.sort_values(["team_id", "date", "person_id"])

    # ── walk each team's games in order, carrying a window of recent rosters ───
    history: dict[int, deque] = defaultdict(lambda: deque(maxlen=WINDOW))
    records = []
    for (team_id, game_id), grp in play.groupby(["team_id", "game_id"], sort=False):
        window = history[team_id]
        played_now = dict(zip(grp["person_id"], grp["min"]))

        totals: dict[int, float] = defaultdict(float)
        appearances: dict[int, int] = defaultdict(int)
        for past in window:
            for pid, mins in past.items():
                if mins > 0:
                    totals[pid] += mins
                    appearances[pid] += 1

        missing_minutes = 0.0
        missing_count = 0
        top_missing = 0.0
        rotation_size = 0
        for pid, appear in appearances.items():
            if appear < MIN_APPEARANCES:
                continue
            avg = totals[pid] / appear
            if avg < ROTATION_MINUTES:
                continue
            rotation_size += 1
            if played_now.get(pid, 0.0) <= 0.0:
                missing_minutes += avg
                missing_count += 1
                top_missing = max(top_missing, avg)

        if len(window) == WINDOW:
            records.append(
                {
                    "game_id": game_id,
                    "team_id": team_id,
                    "missing_minutes": missing_minutes,
                    "missing_count": missing_count,
                    "top_missing": top_missing,
                    "star_out": 1 if top_missing >= STAR_MINUTES else 0,
                    "rotation_size": rotation_size,
                }
            )
        window.append(played_now)

    av = pd.DataFrame(records)
    log.info("team-games with a full rotation window: %d", len(av))
    av.to_csv(OUT, index=False)

    # ── to game level, differenced away − home like every other feature ────────
    merged = av.merge(sides[["game_id", "team_id", "is_home"]], on=["game_id", "team_id"])
    home = merged[merged["is_home"] == 1].set_index("game_id")
    away = merged[merged["is_home"] == 0].set_index("game_id")
    both = home.index.intersection(away.index)

    game = pd.DataFrame(index=both)
    for col in ["missing_minutes", "missing_count", "top_missing", "star_out"]:
        game[f"d_{col}"] = away.loc[both, col].to_numpy() - home.loc[both, col].to_numpy()
    game["home_missing_minutes"] = home.loc[both, "missing_minutes"].to_numpy()
    game["away_missing_minutes"] = away.loc[both, "missing_minutes"].to_numpy()

    tab = pd.read_csv(TABLE, low_memory=False).set_index("game_id")
    feats = pd.read_csv(FEATURES, usecols=["game_id", "is_home", "team_score", "opp_score"], low_memory=False)
    h = feats[feats["is_home"] == 1].set_index("game_id")
    tab["home_margin"] = (h["team_score"] - h["opp_score"]).reindex(tab.index)

    df = tab.join(game, how="inner").dropna(subset=["home_margin"])
    log.info("games in the analysis: %d", len(df))

    SCHEDULE = ["d_is_b2b", "d_alt_visit", "d_prior_ot", "d_density_points"]
    CONTROLS = ["d_strength", "d_season_day"]
    for c in SCHEDULE + CONTROLS:
        df[c] = df[c].fillna(0.0)

    lines: list[str] = []
    a = lines.append
    a("# What a missing rotation player costs")
    a("")
    a(f"games analysed        {len(df)}")
    a(f"seasons               {df['season'].min()} .. {df['season'].max()}")
    a("")
    a("  Rotation = averaged >= 15 minutes across the team's previous 5 games, with at")
    a("  least 2 appearances in that window. Missing = zero minutes tonight. Absence is")
    a("  weighted by the minutes the player had been playing.")
    a("")
    a("  RETROSPECTIVE. Who sat is known only because the game was played. This measures")
    a("  what an absence costs; it is not a forecasting feature.")
    a("")
    a("## How often does it happen")
    a("")
    a(f"  mean rotation minutes missing, per team-game   {av['missing_minutes'].mean():.2f}")
    a(f"  team-games with nobody missing                 {(av['missing_count'] == 0).mean():.4f}")
    a(f"  team-games missing a 30+ minute player         {av['star_out'].mean():.4f}")
    a(f"  mean rotation size                             {av['rotation_size'].mean():.2f}")
    a("")

    a("## Cost in points of margin")
    a("")
    for label, names in [
        ("schedule only", CONTROLS + SCHEDULE),
        ("availability only", CONTROLS + ["d_missing_minutes"]),
        ("both together", CONTROLS + SCHEDULE + ["d_missing_minutes"]),
        ("both, star flag instead", CONTROLS + SCHEDULE + ["d_star_out"]),
    ]:
        fit = ols_with_t(df[names].to_numpy(float), df["home_margin"].to_numpy(float), names)
        a(f"  ### {label}")
        for _, r in fit.iterrows():
            if r["feature"] == "intercept":
                continue
            mark = "" if abs(r["t"]) >= 2 else "   (not distinguishable from zero)"
            a(f"    {r['feature']:<22} {r['beta']:>9.4f} points   t {r['t']:>7.2f}{mark}")
        a("")

    # ── does load management explain the back-to-back effect? ──────────────────
    f_sched = ols_with_t(
        df[CONTROLS + SCHEDULE].to_numpy(float), df["home_margin"].to_numpy(float), CONTROLS + SCHEDULE
    ).set_index("feature")
    f_both = ols_with_t(
        df[CONTROLS + SCHEDULE + ["d_missing_minutes"]].to_numpy(float),
        df["home_margin"].to_numpy(float),
        CONTROLS + SCHEDULE + ["d_missing_minutes"],
    ).set_index("feature")

    a("## Is a back-to-back really fatigue, or is it just that the stars sit?")
    a("")
    b_before = float(f_sched.loc["d_is_b2b", "beta"])
    b_after = float(f_both.loc["d_is_b2b", "beta"])
    a(f"  back-to-back, schedule only          {b_before:.4f} points")
    a(f"  back-to-back, absence controlled     {b_after:.4f} points")
    a(f"  share explained by who did not play  {100 * (b_before - b_after) / b_before:.1f}%")
    a("")
    for side in ["home", "away"]:
        col = f"{side}_missing_minutes"
        b2b = df["d_is_b2b"] == (1 if side == "away" else -1)
        a(f"  mean rotation minutes missing, {side} team on a back-to-back   "
          f"{df.loc[b2b, col].mean():.2f}   (otherwise {df.loc[~b2b, col].mean():.2f})")
    a("")

    a("## Scale check — the two questions in one unit")
    a("")
    per_min = float(f_both.loc["d_missing_minutes", "beta"])
    a(f"  one rotation minute missing        {per_min:.4f} points")
    a(f"  a 30-minute starter missing        {30 * per_min:.3f} points")
    a(f"  a back-to-back                     {b_after:.3f} points")
    a(f"  visiting altitude                  {float(f_both.loc['d_alt_visit', 'beta']):.3f} points")
    a(f"  home court (margin intercept)      {float(ols_with_t(df[CONTROLS].to_numpy(float), df['home_margin'].to_numpy(float), CONTROLS).iloc[0]['beta']):.3f} points")

    REPORT.write_text("\n".join(lines) + "\n")
    log.info("wrote %s", REPORT)


if __name__ == "__main__":
    main()
