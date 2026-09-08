import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from analyze_l2m_season import abbr, audit_duplicates, exposure, phase_for
from collect_l2m_season import ReportLinks, validate_report


class L2MSeasonTests(unittest.TestCase):
    def test_duplicate_exception_is_bound_to_exact_source_and_rows(self):
        events = [{"grade": "CC"}, {"grade": "CC"}]
        review = {"source_sha256": "hash", "pairs": [[0, 1]], "reason": "Two source rows retained pending identity resolution"}
        with self.assertRaises(ValueError):
            audit_duplicates(events, "game", "hash")
        self.assertEqual(audit_duplicates(events, "game", "hash", review), [[0, 1]])
        self.assertEqual(len(events), 2)
        with self.assertRaises(ValueError):
            audit_duplicates(events, "game", "changed_hash", review)
        with self.assertRaises(ValueError):
            audit_duplicates([{"grade": "CC"}, {"grade": "IC"}], "game", "hash", review)

    def test_duplicate_index_links_do_not_duplicate_games(self):
        parser = ReportLinks()
        parser.feed('<a href="/l2m/L2MReport.html?gameId=0022500001">game</a>'
                    '<a href="https://official.nba.com/l2m/L2MReport.html?gameId=0022500001">again</a>'
                    '<a href="https://example.com/l2m/L2MReport.html?gameId=0022500002">foreign</a>')
        self.assertEqual(list(parser.links), ["0022500001"])

    def test_unknown_grades_and_wrong_games_are_rejected(self):
        data = {"game": [{"GameId": "0022500001"}], "l2m": [
            {"CallRatingName": "INC", "PeriodName": "Q4", "CallType": "Foul: Shooting"}]}
        validate_report(data, "0022500001")
        with self.assertRaises(ValueError):
            validate_report(data, "0022500002")
        wrong = copy.deepcopy(data)
        wrong["l2m"][0]["CallRatingName"] = "NEW_GRADE"
        with self.assertRaises(ValueError):
            validate_report(wrong, "0022500001")
        wrong["l2m"] = []
        with self.assertRaises(ValueError):
            validate_report(wrong, "0022500001")

    def test_zero_error_games_and_overtime_remain_in_denominators(self):
        games = [
            {"events": [{"grade": "CNC"}, {"grade": ""}], "errors": 0, "reviewed_periods": 1},
            {"events": [{"grade": "INC"}, {"grade": "IC"}, {"grade": "CC"}],
             "errors": 2, "reviewed_periods": 2},
        ]
        result = exposure(games)
        self.assertEqual(result["games"], 2)
        self.assertEqual(result["games_with_error"], 1)
        self.assertEqual(result["errors_per_game"], 1)
        self.assertEqual(result["errors_per_reviewed_period"], 0.6667)
        self.assertEqual(result["grades"]["ungraded"], 1)
        self.assertEqual(result["assessments"], 5)

    def test_phase_and_abbreviation_normalization(self):
        self.assertEqual(phase_for("0042500405"), "playoffs")
        self.assertEqual(phase_for("0052500111"), "play_in")
        self.assertEqual(phase_for("0022500001"), "regular_season")
        self.assertEqual(abbr("WSH"), "WAS")
        with self.assertRaises(ValueError):
            phase_for("0012500001")


if __name__ == "__main__":
    unittest.main()
