"""Playoff Rest — compute and persist `playoff_series.prior_grind_diff`.

One team's GRIND in its previous round is the number of games it played beyond a sweep:

    grind = games_played - (4 if that series was best-of-7 else 3)

Range 0..3 for a best-of-7, 0..2 for a best-of-5. The format adjustment is mandatory, not
cosmetic: 136 of 320 Round 1 series (1985-86 .. 2001-02) were best-of-5, where a five-game
series means the team went the FULL DISTANCE, while in a best-of-7 five games means they
closed early. Raw `games_played` gives those opposite situations the same number across
roughly half the historical sample.

    prior_grind_diff = opponent's grind - home-court team's grind

SIGN CONVENTION — deliberately inverted versus the other `*_diff` columns on this table,
which are all (home-court - opponent). Here the subtraction runs the other way so that
POSITIVE STILL FAVORS THE HOME-COURT TEAM: a positive value means the opponent was ground
down more. Consistent *meaning* of the sign beats a consistent subtraction order, because
the model coefficient's sign is what a reader interprets.

NULLABILITY: 0 for every Round 1 row (no prior round exists — a fact, not a fill value);
NULL only where a prior series cannot be resolved at all. A silent 0 there would be
indistinguishable from a real Round 1 value, so unresolved rows are reported by count and
key rather than coerced.

Run from the project root:
    ./ml/.venv/bin/python ml/compute_prior_grind.py --dry-run   # print, write nothing
    ./ml/.venv/bin/python ml/compute_prior_grind.py             # UPDATE the column

The ONLY write is:
    UPDATE playoff_series SET prior_grind_diff = %s WHERE external_series_key = %s
No other table, column, INSERT, DELETE or DDL.
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import psycopg2

ML_DIR = Path(__file__).resolve().parent
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

from compute_series_features import resolve_database_url  # noqa: E402


@dataclass(frozen=True)
class SeriesRow:
    key: str
    season: str
    round: int
    home_court_team_id: int
    opponent_team_id: int
    home_court_wins: int | None
    opponent_wins: int | None
    is_best_of_7: bool


def grind_beyond_sweep(games_played: int, is_best_of_7: bool) -> int:
    """Games played beyond a sweep. Format-aware; see the module docstring."""
    return games_played - (4 if is_best_of_7 else 3)


def prior_grind_diff(
    home_grind: int | None, opp_grind: int | None, round_no: int
) -> int | None:
    """Opponent grind minus home-court grind. 0 in Round 1; None when either side is unresolved."""
    if round_no <= 1:
        return 0
    if home_grind is None or opp_grind is None:
        return None
    return opp_grind - home_grind


def _team_grind_in_round(rows: list[SeriesRow], season: str, round_no: int, team: int) -> int | None:
    """That team's grind in the given round, or None if no resolved series is found."""
    for s in rows:
        if s.season != season or s.round != round_no:
            continue
        if team not in (s.home_court_team_id, s.opponent_team_id):
            continue
        if s.home_court_wins is None or s.opponent_wins is None:
            return None
        return grind_beyond_sweep(s.home_court_wins + s.opponent_wins, s.is_best_of_7)
    return None


def build_prior_grind(rows: list[SeriesRow]) -> dict[str, int | None]:
    """Map external_series_key -> prior_grind_diff for every input row."""
    out: dict[str, int | None] = {}
    for s in rows:
        if s.round <= 1:
            out[s.key] = 0
            continue
        home = _team_grind_in_round(rows, s.season, s.round - 1, s.home_court_team_id)
        opp = _team_grind_in_round(rows, s.season, s.round - 1, s.opponent_team_id)
        out[s.key] = prior_grind_diff(home, opp, s.round)
    return out


def load_series(conn) -> list[SeriesRow]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT external_series_key, season, round, home_court_team_id,
                   opponent_team_id, home_court_wins, opponent_wins, is_best_of_7
            FROM playoff_series
            ORDER BY season, round, id
            """
        )
        return [SeriesRow(*r) for r in cur.fetchall()]


UPDATE_SQL = "UPDATE playoff_series SET prior_grind_diff = %s WHERE external_series_key = %s"


def write_prior_grind(conn, values: dict[str, int | None]) -> int:
    with conn.cursor() as cur:
        for key, v in values.items():
            cur.execute(UPDATE_SQL, (v, key))
    conn.commit()
    return len(values)


def main() -> None:
    ap = argparse.ArgumentParser(description="Compute and persist playoff_series.prior_grind_diff")
    ap.add_argument("--dry-run", action="store_true", help="print the summary, write nothing")
    args = ap.parse_args()

    conn = psycopg2.connect(resolve_database_url())
    try:
        rows = load_series(conn)
        values = build_prior_grind(rows)

        by_round: Counter[int] = Counter()
        nulls: list[str] = []
        dist: Counter[int | None] = Counter()
        round_of = {s.key: s.round for s in rows}
        for key, v in values.items():
            by_round[round_of[key]] += 1
            dist[v] += 1
            if v is None:
                nulls.append(key)

        print(f"series rows            : {len(rows)}")
        print(f"round 1 rows (all 0)   : {by_round[1]}")
        print(f"rounds 2+ rows         : {sum(n for r, n in by_round.items() if r >= 2)}")
        print(f"NULL (unresolved prior): {len(nulls)}")
        for key in nulls:
            print(f"    unresolved: {key}")
        print("value distribution     :")
        for v in sorted(dist, key=lambda x: (x is None, x)):
            print(f"    {str(v):>5}: {dist[v]}")

        r1_bad = [k for k, v in values.items() if round_of[k] == 1 and v != 0]
        if r1_bad:
            raise SystemExit(f"INVARIANT FAILED: {len(r1_bad)} Round 1 rows are not 0: {r1_bad[:5]}")

        if args.dry_run:
            print("\nDRY RUN — nothing written.")
            return
        print(f"\nWROTE prior_grind_diff for {write_prior_grind(conn, values)} rows.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
