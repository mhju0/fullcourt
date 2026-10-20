"""Historical conference labels must not change bracket structure or model features."""
import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build_series_dataset import Series, conference_for_season, finalize_series


class HistoricalConferenceTests(unittest.TestCase):
    def test_new_orleans_realignment_boundary(self):
        for season in ("2002-03", "2003-04"):
            self.assertEqual(conference_for_season("NOP", season, "West"), "East")
        self.assertEqual(conference_for_season("NOP", "2004-05", "West"), "West")
        self.assertEqual(conference_for_season("MIA", "2003-04", "East"), "East")
        self.assertIsNone(conference_for_season("XXX", "2003-04", None))

    def test_two_affected_series_keep_round_winner_and_format(self):
        for season, opponent, wins, losses in (("2002-03", "PHI", 2, 4), ("2003-04", "MIA", 3, 4)):
            series = Series(season, 1, 2, date(int(season[:4]) + 1, 4, 20),
                            f"{season}_NOP-{opponent}", wins, losses, round=1)
            finalize_series(series, {1: "West", 2: "East"}, {1: "NOP", 2: opponent})
            self.assertEqual(series.conference, "East")
            self.assertTrue(series.is_best_of_7)
            self.assertEqual(series.series_winner_team_id, 2)
            self.assertEqual(series.round, 1)
            self.assertEqual(series.warnings, [])

    def test_finals_keep_null_conference(self):
        series = Series("2003-04", 1, 2, date(2004, 6, 6), "final", 4, 1, round=4)
        finalize_series(series, {1: "West", 2: "East"}, {1: "NOP", 2: "MIA"})
        self.assertIsNone(series.conference)


if __name__ == "__main__":
    unittest.main()
