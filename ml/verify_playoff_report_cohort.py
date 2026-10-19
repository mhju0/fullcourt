"""Exercise playoff publication and physical prior-rest semantics in temporary PostgreSQL tables."""
from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path
from urllib.parse import urlparse

import psycopg2

from compute_series_features import resolve_database_url
from playoff_rest_report import equal_rest, load

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report-file", required=True)
    args = parser.parse_args()
    url = resolve_database_url()
    target = urlparse(url)
    if target.scheme not in {"postgres", "postgresql"} or (target.hostname, target.port, target.path) != ("127.0.0.1", 55434, "/fullcourt_recalculation") or target.query:
        raise ValueError("Temporary-table verification requires the explicit local recalculation database")
    connection = psycopg2.connect(url)
    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                CREATE TEMP TABLE playoff_series (
                  season text, round int, home_court_team_id int, opponent_team_id int,
                  series_winner_team_id int, home_court_wins int, opponent_wins int, is_best_of_7 boolean,
                  win_pct_diff numeric, entry_rest_diff numeric, prior_grind_diff numeric, id serial);
                CREATE TEMP TABLE games (
                  id int, season text, date date, home_team_id int, away_team_id int,
                  game_type text, status text);
                INSERT INTO playoff_series VALUES ('2023-24',1,1,2,1,4,0,true,0.05,0,0,default);
                INSERT INTO games VALUES
                  (1,'2023-24','2024-01-01',1,3,'regular','final'),
                  (2,'2023-24','2024-01-01',2,4,'regular','final'),
                  (3,'2023-24','2024-01-02',1,2,'cup_final','final'),
                  (4,'2023-24','2024-01-03',1,2,'play_in','final'),
                  (5,'2023-24','2024-01-05',1,2,'playoffs','final'),
                  (6,'2023-24','2024-01-07',2,1,'playoffs','final');
            """)
        _, games = load(connection)
        if len(games) != 2 or [row[1].isoformat() for row in games] != ["2024-01-05", "2024-01-07"]:
            raise ValueError("Cup/play-in matching the series pair leaked into the playoff cohort")
        if games[0][4:] != (2, 2):
            raise ValueError("The excluded play-in was lost from physical prior-rest context")
        result = {"publishedGames": len(games), "firstGamePriorDays": list(games[0][4:]),
                  "equalRest": equal_rest(games), "publicTableWrites": 0, "temporaryTablesRolledBack": True}
        connection.rollback()
        Path(args.report_file).write_text(json.dumps(result, indent=2) + "\n")
        log.info("Cup/play-in cohort exclusion and physical prior-rest context verified")
    finally:
        connection.rollback()
        connection.close()


if __name__ == "__main__":
    main()
