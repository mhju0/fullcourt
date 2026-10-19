"""Current player exports must not leak unpublished results into career estimates."""

from datetime import datetime, timezone
from pathlib import Path
import re
import sys
import unittest
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from season_publication import (  # noqa: E402
    CURRENT_TEAM_ABBREVIATIONS,
    SeasonPublicationHeld,
    require_player_season_publication,
)


class SeasonPublicationTests(unittest.TestCase):
    now = datetime(2026, 10, 19, tzinfo=timezone.utc)

    def connection(self, counts):
        connection = MagicMock()
        connection.cursor.return_value.__enter__.return_value.fetchall.return_value = list(counts.items())
        return connection

    def test_previous_exports_keep_their_reproducibility_without_a_readiness_query(self):
        connection = self.connection({})
        require_player_season_publication(connection, [1996, 2025], self.now)
        connection.cursor.assert_not_called()

    def test_current_export_requires_every_expected_franchise_including_zero_game_teams(self):
        counts = {team: 10 for team in CURRENT_TEAM_ABBREVIATIONS}
        require_player_season_publication(self.connection(counts), [2025, 2026], self.now)
        counts["BOS"] = 9
        with self.assertRaises(SeasonPublicationHeld):
            require_player_season_publication(self.connection(counts), [2026], self.now)
        del counts["BOS"]
        with self.assertRaises(SeasonPublicationHeld):
            require_player_season_publication(self.connection(counts), [2026], self.now)

    def test_read_counts_distinct_scored_regular_finals_independently_of_fatigue(self):
        connection = self.connection({team: 10 for team in CURRENT_TEAM_ABBREVIATIONS})
        require_player_season_publication(connection, [2026, 2026], self.now)
        execute = connection.cursor.return_value.__enter__.return_value.execute
        execute.assert_called_once()
        query, params = execute.call_args.args
        self.assertEqual(params, ("2026-27",))
        for clause in ["count(DISTINCT g.id)", "g.game_type = 'regular'", "g.status = 'final'", "g.home_score IS NOT NULL", "g.away_score IS NOT NULL", "g.home_team_id = t.id OR g.away_team_id = t.id"]:
            self.assertIn(clause, query)
        self.assertNotIn("fatigue", query)

    def test_eastern_calendar_not_server_utc_decides_the_current_season(self):
        connection = self.connection({team: 10 for team in CURRENT_TEAM_ABBREVIATIONS})
        require_player_season_publication(connection, [2025], datetime(2026, 10, 1, 2, tzinfo=timezone.utc))
        self.assertEqual(connection.cursor.return_value.__enter__.return_value.execute.call_args.args[1], ("2025-26",))
        connection = self.connection({})
        require_player_season_publication(connection, [2025], datetime(2026, 10, 1, 5, tzinfo=timezone.utc))
        connection.cursor.assert_not_called()

    def test_expected_franchises_match_the_app_directory(self):
        source = (Path(__file__).resolve().parents[2] / "src/lib/team-history.ts").read_text()
        defaults = source.split("const CURRENT_TEAM_DEFAULTS", 1)[1].split("export const CURRENT_TEAM_ABBREVIATIONS", 1)[0]
        self.assertEqual(CURRENT_TEAM_ABBREVIATIONS, set(re.findall(r'^  ([A-Z]{3}):', defaults, re.MULTILINE)))

    def test_export_guards_before_any_artifact_write(self):
        source = (Path(__file__).resolve().parents[1] / "export_player_rest.py").read_text()
        self.assertLess(source.index('require_player_season_publication(conn,'), source.index('DEST.write_text('))
        self.assertIn('conn.set_session(readonly=True, autocommit=True)', source)


if __name__ == "__main__":
    unittest.main()
