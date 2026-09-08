import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from collect_l2m_archive import ArchiveLinks
from collect_l2m_season import validate_report
from normalize_l2m_archive import parse_events, parse_legacy_layout, pdf_identity, align_grade_lines


class ArchiveTests(unittest.TestCase):
    def test_regular_season_links_exclude_playoffs_and_footer(self):
        parser = ArchiveLinks()
        parser.feed('''<div class="entry-content">
        <h2>2015-16 NBA Regular Season</h2><a href="https://ak-static.cms.nba.com/report.pdf">Report</a>
        <h2>2015-16 NBA Playoffs</h2><a href="https://ak-static.cms.nba.com/playoff.pdf">Playoff</a>
        <h2>2022-23 NBA Regular Season</h2><a href="/l2m/L2MReport.html?gameId=0022200009%0d">Report</a>
        </div><a href="https://ak-static.cms.nba.com/rules.pdf">Rules</a>''')
        self.assertEqual({s: len(links) for s, links in parser.links.items()}, {"2015-16": 1, "2022-23": 1})
        self.assertTrue(next(iter(parser.links["2022-23"])).endswith("%0d"))

    def test_overtime_and_clock_punctuation_do_not_drop_plays(self):
        events = parse_events('''Q4  .00:08.7  Instant Replay: Support Ruling  CC  Video
Comment: [VERDICT ONE]

Q5  01:20.0  Foul: Shooting  [PLAYER]  INC*  Video
Comment: [VERDICT TWO]
''')
        self.assertEqual([e["CallRatingName"] for e in events], ["CC", "INC"])
        self.assertEqual(events[0]["PCTime"], "00:08.7")
        self.assertEqual(events[1]["PeriodName"], "Q5")

    def test_split_rows_and_verdicts_stay_attached_across_pages(self):
        events = parse_legacy_layout('''HEADER
Q4  CNC  Video
  01:20.0  Foul: Shooting  [PLAYER]
  [VERDICT BEFORE LABEL]
Comment:
Common Play Abbreviations: footer
\fHEADER
Q5  00:10.0  Foul: Personal  [PLAYER]  IC  Video
Comment: [VERDICT AFTER LABEL]
Common Play Abbreviations: footer
''')
        self.assertEqual(len(events), 2)
        self.assertEqual(events[0]["Comment"], "[VERDICT BEFORE LABEL]")
        self.assertEqual(events[1]["Comment"], "[VERDICT AFTER LABEL]")

    def test_missing_pdf_category_and_empty_verdict_remain_missing(self):
        events = parse_legacy_layout('''Q4  00:14.7
Comment: [CLOCK EXPLANATION]
Q4  00:12.0  Foul: Personal  CNC
Comment:
Common Play Abbreviations: footer
''')
        self.assertEqual(events[0]["CallType"], "")
        self.assertEqual(events[1]["Comment"], "")

    def test_detached_grades_are_not_mistaken_for_ungraded_plays(self):
        text = """Q4  00:23.2  Turnover: Traveling  [PLAYER]
           IC  Video
Comment: [FIRST VERDICT]
           INC  Video
Q5  00:35.2  Turnover: Traveling  [PLAYER]
Comment: [SECOND VERDICT]
"""
        self.assertEqual([e["CallRatingName"] for e in parse_events(align_grade_lines(text))], ["IC", "INC"])

    def test_missing_row_cannot_be_silently_skipped(self):
        with self.assertRaises(ValueError):
            parse_events("Q4  01:00.0  Foul: Shooting  CC\nComment: [ONE]\nComment: [TWO]")

    def test_pdf_identity_uses_both_teams_and_game_date(self):
        games = [{"id": "0021700001", "date": "2017-10-17", "home_name": "Cavaliers", "away_name": "Celtics"}]
        self.assertEqual(pdf_identity("Celtics (99) @ Cavaliers (102) October 17, 2017", games), games[0])
        with self.assertRaises(ValueError):
            pdf_identity("Celtics @ Cavaliers October 18, 2017", games)

    def test_historical_source_grades_are_preserved_not_guessed(self):
        for grade in [" ", "Undetectable", "NCI", "NCC"]:
            report = {"game": [{"GameId": "0021801088"}], "l2m": [{"PeriodName": "Q4", "CallType": "Foul: Personal", "CallRatingName": grade}]}
            validate_report(report, "0021801088")
            self.assertEqual(report["l2m"][0]["CallRatingName"], grade)
        report["l2m"][0]["CallRatingName"] = "UNKNOWN FUTURE CODE"
        with self.assertRaises(ValueError):
            validate_report(report, "0021801088")


if __name__ == "__main__":
    unittest.main()
