"""Playoff Rest — emit every figure the /playoffs page publishes.

READ-ONLY. Writes two files and nothing to the database:
    ml/playoff_rest_facts.json   machine-readable, pinned by a vitest test
    ml/PLAYOFF_REST_REPORT.md    human-readable, committed

Run from the project root:
    ./ml/.venv/bin/python ml/playoff_rest_report.py

PLAY-IN GAMES ARE EXCLUDED. `games.game_type <> 'regular'` includes play-in games, which are
single games that inflate the Game-1 bucket. The published equal-rest figure must count
playoff games only, so games are restricted to pairs of teams that actually meet in a
`playoff_series` row for that season.
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

import psycopg2

ML_DIR = Path(__file__).resolve().parent
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

from compute_series_features import resolve_database_url  # noqa: E402

REPO_ROOT = ML_DIR.parent
JSON_PATH = ML_DIR / "playoff_rest_facts.json"
MD_PATH = ML_DIR / "PLAYOFF_REST_REPORT.md"

# Grind buckets. "low" = closed early (0-1 games beyond a sweep), "high" = went long (2-3).
LOW, HIGH = (0, 1), (2, 3)
CLOSE_MATCHUP = 0.08  # |win_pct_diff| ceiling for the strength-controlled cut


def pct(hits: int, n: int) -> float:
    return round(100.0 * hits / n, 1) if n else 0.0


def load(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT season, round, home_court_team_id, opponent_team_id,
                   series_winner_team_id, home_court_wins, opponent_wins, is_best_of_7,
                   win_pct_diff::float8, entry_rest_diff::float8, prior_grind_diff::float8
            FROM playoff_series
            ORDER BY season, round, id
            """
        )
        series = cur.fetchall()

        # Only games between two teams that meet in a playoff_series row that season.
        # This is what excludes play-in games from the equal-rest figure.
        cur.execute(
            """
            WITH pairs AS (
              SELECT season,
                     least(home_court_team_id, opponent_team_id)    AS lo,
                     greatest(home_court_team_id, opponent_team_id) AS hi
              FROM playoff_series
            ),
            pg AS (
              SELECT g.id, g.season, g.date, g.home_team_id AS h, g.away_team_id AS a
              FROM games g
              JOIN pairs p
                ON p.season = g.season
               AND p.lo = least(g.home_team_id, g.away_team_id)
               AND p.hi = greatest(g.home_team_id, g.away_team_id)
              WHERE g.game_type <> 'regular' AND g.status = 'final'
            )
            SELECT pg.season, pg.date, pg.h, pg.a,
              pg.date - (SELECT max(x.date) FROM games x
                          WHERE x.status = 'final' AND x.season = pg.season
                            AND (x.home_team_id = pg.h OR x.away_team_id = pg.h)
                            AND x.date < pg.date) AS h_off,
              pg.date - (SELECT max(x.date) FROM games x
                          WHERE x.status = 'final' AND x.season = pg.season
                            AND (x.home_team_id = pg.a OR x.away_team_id = pg.a)
                            AND x.date < pg.date) AS a_off
            FROM pg
            ORDER BY pg.season, pg.date
            """
        )
        games = cur.fetchall()
    return series, games


def equal_rest(games) -> dict:
    """Game 1 vs Game 2+ equal-rest counts, play-in excluded."""
    seq: dict[tuple, int] = defaultdict(int)
    g1 = g1eq = later = latereq = 0
    for season, _date, h, a, h_off, a_off in games:
        key = (season, min(h, a), max(h, a))
        seq[key] += 1
        if h_off is None or a_off is None:
            continue
        is_first = seq[key] == 1
        same = h_off == a_off
        if is_first:
            g1 += 1
            g1eq += same
        else:
            later += 1
            latereq += same
    return {"game1Games": g1, "game1Equal": g1eq, "laterGames": later, "laterEqual": latereq}


def _grind_of(series, season, rnd, team):
    for s in series:
        if s[0] != season or s[1] != rnd:
            continue
        if team not in (s[2], s[3]):
            continue
        if s[5] is None or s[6] is None:
            return None
        return (s[5] + s[6]) - (4 if s[7] else 3)
    return None


def rounds2plus(series):
    """(y, own_grind, opp_grind, win_pct_diff) for resolved rounds-2+ series."""
    out = []
    for s in series:
        season, rnd, hc, opp, winner, _hw, _ow, _bo7, wpd, _rest, _pgd = s
        if rnd < 2 or winner is None or wpd is None:
            continue
        own = _grind_of(series, season, rnd - 1, hc)
        oth = _grind_of(series, season, rnd - 1, opp)
        if own is None or oth is None:
            continue
        out.append((int(winner == hc), own, oth, wpd))
    return out


def grind_matrix(rows) -> dict:
    def cell(own_bucket, opp_bucket):
        m = [r for r in rows if own_bucket[0] <= r[1] <= own_bucket[1]
             and opp_bucket[0] <= r[2] <= opp_bucket[1]]
        return {"winPct": pct(sum(r[0] for r in m), len(m)), "n": len(m)}

    return {
        "ownLowOppLow": cell(LOW, LOW),
        "ownLowOppHigh": cell(LOW, HIGH),
        "ownHighOppLow": cell(HIGH, LOW),
        "ownHighOppHigh": cell(HIGH, HIGH),
    }


def exogenous(rows) -> dict:
    own_low = [r for r in rows if LOW[0] <= r[1] <= LOW[1]]
    early = [r for r in own_low if r[2] <= LOW[1]]
    longg = [r for r in own_low if r[2] >= HIGH[0]]

    def blk(m):
        return {
            "winPct": pct(sum(r[0] for r in m), len(m)),
            "n": len(m),
            "meanWinPctDiff": round(sum(r[3] for r in m) / len(m), 4) if m else 0.0,
        }

    close = [r for r in rows if abs(r[3]) <= CLOSE_MATCHUP]
    c_early = [r for r in close if r[2] <= LOW[1]]
    c_long = [r for r in close if r[2] >= HIGH[0]]

    own_high = [r for r in rows if r[1] >= HIGH[0]]
    mh_early = [r for r in own_high if r[2] <= LOW[1]]
    mh_long = [r for r in own_high if r[2] >= HIGH[0]]

    return {
        "oppClosedEarly": blk(early),
        "oppWentLong": blk(longg),
        "closeMatchupOppClosedEarly": {"winPct": pct(sum(r[0] for r in c_early), len(c_early)), "n": len(c_early)},
        "closeMatchupOppWentLong": {"winPct": pct(sum(r[0] for r in c_long), len(c_long)), "n": len(c_long)},
        "mirrorDeltaPts": round(
            pct(sum(r[0] for r in mh_long), len(mh_long)) - pct(sum(r[0] for r in mh_early), len(mh_early)), 1
        ),
    }


def entry_rest_buckets(series) -> list[dict]:
    defs = [
        ("2 or more days short", lambda v: v <= -2),
        ("within a day either way", lambda v: -2 < v < 2),
        ("2 or more days rested", lambda v: v >= 2),
    ]
    out = []
    for label, keep in defs:
        m = [s for s in series if s[1] >= 2 and s[4] is not None and s[9] is not None and keep(s[9])]
        out.append({"label": label, "n": len(m), "winPct": pct(sum(1 for s in m if s[4] == s[2]), len(m))})
    return out


def main() -> None:
    conn = psycopg2.connect(resolve_database_url())
    try:
        series, games = load(conn)
    finally:
        conn.close()

    rows = rounds2plus(series)
    facts = {
        "generatedFrom": "playoff_series + games (play-in excluded)",
        "equalRest": equal_rest(games),
        "grindMatrix": grind_matrix(rows),
        "exogenous": exogenous(rows),
        "entryRestBuckets": entry_rest_buckets(series),
        "bestOfFiveRound1Series": sum(1 for s in series if s[1] == 1 and not s[7]),
        "round1TotalSeries": sum(1 for s in series if s[1] == 1),
    }
    JSON_PATH.write_text(json.dumps(facts, indent=2) + "\n")

    er = facts["equalRest"]
    gm = facts["grindMatrix"]
    ex = facts["exogenous"]
    md = [
        "# Playoff Rest — published figures",
        "",
        f"Generated by `ml/playoff_rest_report.py`. Rounds-2+ sample: **n = {len(rows)}**.",
        "",
        "## Equal rest (play-in excluded)",
        "",
        "| slot | games | equal rest | % equal |",
        "|---|---:|---:|---:|",
        f"| Game 1 | {er['game1Games']} | {er['game1Equal']} | {pct(er['game1Equal'], er['game1Games'])}% |",
        f"| Game 2+ | {er['laterGames']} | {er['laterEqual']} | {pct(er['laterEqual'], er['laterGames'])}% |",
        "",
        "## The Grind Tax (rounds 2+, grind = games beyond a sweep)",
        "",
        "| own \\ opponent | closed early (0-1) | went long (2-3) |",
        "|---|---:|---:|",
        f"| closed early (0-1) | {gm['ownLowOppLow']['winPct']}% (n={gm['ownLowOppLow']['n']}) "
        f"| {gm['ownLowOppHigh']['winPct']}% (n={gm['ownLowOppHigh']['n']}) |",
        f"| went long (2-3) | {gm['ownHighOppLow']['winPct']}% (n={gm['ownHighOppLow']['n']}) "
        f"| {gm['ownHighOppHigh']['winPct']}% (n={gm['ownHighOppHigh']['n']}) |",
        "",
        "## Confound test (own grind held at 0-1)",
        "",
        "| opponent's prior round | home-court wins | mean win% diff |",
        "|---|---:|---:|",
        f"| closed early | {ex['oppClosedEarly']['winPct']}% (n={ex['oppClosedEarly']['n']}) "
        f"| {ex['oppClosedEarly']['meanWinPctDiff']:+.4f} |",
        f"| went long | {ex['oppWentLong']['winPct']}% (n={ex['oppWentLong']['n']}) "
        f"| {ex['oppWentLong']['meanWinPctDiff']:+.4f} |",
        "",
        f"Close matchups only (|win% diff| <= {CLOSE_MATCHUP}): "
        f"{ex['closeMatchupOppClosedEarly']['winPct']}% (n={ex['closeMatchupOppClosedEarly']['n']}) -> "
        f"{ex['closeMatchupOppWentLong']['winPct']}% (n={ex['closeMatchupOppWentLong']['n']}).",
        "",
        f"Mirror check (own grind held at 2-3, vary the opponent): {ex['mirrorDeltaPts']:+.1f} points.",
        "",
        "## Format context",
        "",
        f"{facts['bestOfFiveRound1Series']} of {facts['round1TotalSeries']} Round 1 series were "
        "best-of-5, which is why grind is measured beyond a sweep rather than as raw games played.",
        "",
    ]
    MD_PATH.write_text("\n".join(md))
    print(json.dumps(facts, indent=2))
    print(f"\nwrote {JSON_PATH.relative_to(REPO_ROOT)} and {MD_PATH.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
