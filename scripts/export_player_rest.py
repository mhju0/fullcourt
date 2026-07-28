"""[Shooting by Rest] Build the player database payload served by /shooting.

Reads the cached hoopR box scores plus game dates from the database, derives each
player's OWN rest situation, and writes one compact JSON file:

    public/data/player-rest.json

Why a static file rather than a table plus an API route, which is how every other
surface on the site is fed: this export changes once a season, not once a night.
The live surfaces read `games`, `fatigue_scores` and `predictions` because those
move daily. Nothing here does, so a CDN-cacheable asset is both simpler and
faster than a round trip to Postgres for numbers that cannot have changed.

Rest is the player's own, counted from the games he actually played, so a night
off for load management is never credited to him as rest. 2019-20 is absent
because `games` excludes the Orlando bubble league-wide (see
scripts/fetch_schedule.py) -- no normal travel, so no rest to measure.

Shape (columnar arrays; ~4x smaller than a list of objects):

    names    ["LeBron James", ...]                 index = player id used below
    teams    ["ATL", "ATL/BOS", ...]               index = team label used below
    seasons  [[p, startYear, t, age, g, fga, efg, b2bFga, b2bEfg, restFga, restEfg], ...]
    shrunk   [[p, restDelta, restSe, restShrunk], ...]   career only, see below

Every count and rate in a career row reconciles exactly with the seasons listed
under it, so the page sums its own totals and this file ships only the three
career numbers that cannot be re-derived: the empirical-Bayes shrunk delta needs
the whole league pool, and its inputs are carried with it.

Usage:
    DATABASE_URL=... python scripts/export_player_rest.py
"""

from __future__ import annotations

import json
import math
import os
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

import psycopg2

sys.path.insert(0, str(Path(__file__).resolve().parent))
from analyze_player_shooting import (  # noqa: E402
    annotate,
    efg,
    efg_se,
    load_birthdays,
    load_game_dates,
    load_player_games,
)

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "public" / "data" / "player-rest.json"

# A career arm below this is too thin to carry a career estimate at all. Seasons are
# NOT gated: a total printed under a column has to equal that column, so every season
# the player appeared in is listed. The page filters by volume on its own.
CAREER_MIN_ARM = 150

b2b = lambda r: r["rest"] == 1                                        # noqa: E731
rested = lambda r: r["rest"] is not None and r["rest"] >= 3           # noqa: E731


def arm(games: list[dict]) -> tuple[int, int, int]:
    return (
        sum(g["fgm"] for g in games),
        sum(g["fga"] for g in games),
        sum(g["fg3m"] for g in games),
    )


def pct(a: tuple[int, int, int]) -> float | None:
    return round(efg(*a) * 100, 2) if a[1] else None


def main() -> int:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("DATABASE_URL not set", file=sys.stderr)
        return 1

    rows = load_player_games()
    birth = load_birthdays()
    conn = psycopg2.connect(dsn)
    conn.set_session(readonly=True, autocommit=True)
    try:
        gdate = load_game_dates(conn)
    finally:
        conn.close()
    rows = annotate(rows, gdate, birth)
    print(f"{len(rows):,} player-games with personal rest and age")

    names: list[str] = []
    nix: dict[str, int] = {}
    teams: list[str] = []
    tix: dict[str, int] = {}

    def name_idx(pid: str, name: str) -> int:
        if pid not in nix:
            nix[pid] = len(names)
            names.append(name)
        return nix[pid]

    def team_idx(label: str) -> int:
        if label not in tix:
            tix[label] = len(teams)
            teams.append(label)
        return tix[label]

    by_ps: dict[tuple[str, str], list[dict]] = defaultdict(list)
    by_pid: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_ps[(r["pid"], r["season"])].append(r)
        by_pid[r["pid"]].append(r)

    seasons: list[list] = []
    for (pid, season), games in by_ps.items():
        p = name_idx(pid, games[0]["name"])
        whole = arm(games)
        ages = [g["age"] for g in games if g["age"] is not None]
        # Traded mid-season: list the two he played most, then a marker.
        order = sorted({g["team"] for g in games if g["team"]},
                       key=lambda t: -sum(1 for g in games if g["team"] == t))
        label = "/".join(order[:2]) + ("+" if len(order) > 2 else "")
        t = arm([g for g in games if b2b(g)])
        c = arm([g for g in games if rested(g)])
        seasons.append([
            p, int(season), team_idx(label), max(ages) if ages else 0,
            len(games), whole[1], pct(whole) or 0,
            t[1], pct(t) or 0, c[1], pct(c) or 0,
        ])
    seasons.sort(key=lambda r: (r[0], r[1]))

    # ── career deltas, then empirical-Bayes shrinkage over the whole pool ──────
    # A player with 250 attempts per arm carries a standard error near 4pp, so the
    # extremes of a raw ranking are noise rather than talent. Weighting by
    # tau^2/(tau^2+se^2) leaves well-measured players almost untouched and pulls
    # the thin ones back toward the league.
    raw: list[tuple[int, float, float]] = []
    for pid, games in by_pid.items():
        if pid not in nix:
            continue
        t, c = arm([g for g in games if b2b(g)]), arm([g for g in games if rested(g)])
        if t[1] < CAREER_MIN_ARM or c[1] < CAREER_MIN_ARM:
            continue
        d = (efg(*c) - efg(*t)) * 100          # fresher minus busier: + means rest helps
        se = math.sqrt(efg_se(*t) ** 2 + efg_se(*c) ** 2)
        raw.append((nix[pid], d, se))

    mean = sum(d for _, d, _ in raw) / len(raw)
    var_obs = sum((d - mean) ** 2 for _, d, _ in raw) / (len(raw) - 1)
    tau2 = max(var_obs - sum(s * s for _, _, s in raw) / len(raw), 0.0)
    shrunk = []
    for p, d, se in raw:
        w = tau2 / (tau2 + se * se) if (tau2 + se * se) > 0 else 0.0
        shrunk.append([p, round(d, 2), round(se, 2), round(mean + w * (d - mean), 2)])
    shrunk.sort()

    payload = {
        "generated": date.today().isoformat(),
        "names": names,
        "teams": teams,
        "seasons": seasons,
        "shrunk": shrunk,
    }
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")

    yrs = sorted({r[1] for r in seasons})
    print(f"{len(names):,} players · {len(seasons):,} player-seasons · "
          f"{len(shrunk):,} with a career estimate")
    print(f"seasons {yrs[0]}-{yrs[-1]}, {len(yrs)} of them "
          f"({'2019-20 absent' if 2019 not in yrs else 'WARNING: 2019-20 present'})")
    print(f"league mean rest effect {mean:+.3f} pp, tau {math.sqrt(tau2):.2f}")
    print(f"-> {DEST.relative_to(ROOT)}  {DEST.stat().st_size / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
