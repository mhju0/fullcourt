"""Export regular-season identities for matching NBA PDF headers; database read only."""
import argparse
import json
from pathlib import Path

import psycopg2
from psycopg2.extras import RealDictCursor
from compute_series_features import resolve_database_url


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--first", default="2014-15")
    p.add_argument("--last", default="2022-23")
    args = p.parse_args()
    with psycopg2.connect(resolve_database_url()) as conn:
        conn.set_session(readonly=True)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT g.external_id AS id, g.date::text, g.season,
                       h.abbreviation AS home, a.abbreviation AS away,
                       h.name AS home_name, a.name AS away_name
                FROM games g
                JOIN teams h ON h.id = g.home_team_id
                JOIN teams a ON a.id = g.away_team_id
                WHERE g.game_type = 'regular' AND g.season BETWEEN %s AND %s
                ORDER BY g.date, g.external_id
            """, (args.first, args.last))
            rows = cur.fetchall()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(rows, indent=2) + "\n")
    print(f"Exported {len(rows)} game identities")


if __name__ == "__main__":
    main()
