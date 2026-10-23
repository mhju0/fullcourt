"""Early publication validates observations without a league-wide sample floor."""
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from season_publication import require_player_season_publication, SeasonPublicationHeld

class SeasonPublicationTests(unittest.TestCase):
    def test_one_valid_game_can_publish_without_a_franchise_count(self):
        conn = MagicMock()
        conn.cursor.return_value.__enter__.return_value.fetchall.return_value = []
        require_player_season_publication(conn, [2026])
        query, params = conn.cursor.return_value.__enter__.return_value.execute.call_args.args
        self.assertEqual(params, (["2026-27"],))
        self.assertNotIn("count(", query)
        self.assertIn("g.home_score = g.away_score", query)
        self.assertIn("g.home_score IS NULL", query)

    def test_invalid_final_holds_last_good_publication(self):
        conn = MagicMock()
        conn.cursor.return_value.__enter__.return_value.fetchall.return_value = [("invalid-game",)]
        with self.assertRaises(SeasonPublicationHeld):
            require_player_season_publication(conn, [2026])

    def test_empty_export_does_not_query(self):
        conn = MagicMock()
        require_player_season_publication(conn, [])
        conn.cursor.assert_not_called()

if __name__ == "__main__":
    unittest.main()
