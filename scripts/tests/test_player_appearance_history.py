"""Physical history must not inherit shooting-outcome eligibility filters."""
import csv
import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build_player_appearance_context import normalize_game
from player_appearance_history import annotate_outcomes, load_history, minutes_value, participation, prove_history_windows


def event(gid, day, state="played", minutes=10, pid="1629731"):
    return {"pid": pid, "gid": gid, "date": date.fromisoformat(day), "state": state, "min": minutes}


def outcome(gid, day, pid="1629731"):
    return {"pid": pid, "gid": gid, "date": date.fromisoformat(day), "fga": 2, "team": "CLE"}


class AppearanceTests(unittest.TestCase):
    def test_zero_attempt_wade_appearance_changes_the_next_shooting_game(self):
        history = [event("0022300820", "2024-02-25", minutes=7 + 53 / 60),
                   event("0022300832", "2024-02-27", minutes=9.25)]
        rows, audit = annotate_outcomes([outcome("0022300846", "2024-02-28")], history, {})
        self.assertEqual(rows[0]["rest"], 1)
        self.assertEqual(rows[0]["load7"], 2)
        self.assertAlmostEqual(rows[0]["min7"], 17 + 8 / 60)
        self.assertEqual(audit["counts"]["restUncertain"], 0)

    def test_nonregular_and_bubble_history_do_not_become_outcomes(self):
        targets = [outcome("002next", "2023-12-11")]
        rows, _ = annotate_outcomes(targets, [event("0062300001", "2023-12-09")], {})
        self.assertEqual([(r["pid"], r["gid"]) for r in rows], [("1629731", "002next")])
        self.assertEqual(rows[0]["rest"], 2)
        bubble_target = outcome("002after", "2020-12-22")
        rows, _ = annotate_outcomes([bubble_target], [event("004bubble", "2020-10-11")], {})
        self.assertEqual(rows[0]["rest"], 72)

    def test_identity_survives_trades_and_long_offseason_stays_out_of_rest_arm(self):
        row = outcome("002newteam", "2024-02-28")
        row["team"] = "NEW"
        rows, _ = annotate_outcomes([row], [event("002oldteam", "2024-02-27")], {})
        self.assertEqual(rows[0]["rest"], 1)
        rows, _ = annotate_outcomes([outcome("002opener", "2024-10-22")], [event("004final", "2024-06-17")], {})
        self.assertGreater(rows[0]["rest"], 30)

    def test_unknown_between_appearances_does_not_become_known_rest(self):
        history = [event("old", "2024-01-01"), event("ambiguous", "2024-01-05", "unknown", None)]
        rows, audit = annotate_outcomes([outcome("next", "2024-01-06")], history, {})
        self.assertIsNone(rows[0]["rest"])
        self.assertIsNone(rows[0]["load7"])
        self.assertEqual(audit["counts"]["restUncertain"], 1)

    def test_confirmed_successor_resolves_rest_but_not_seven_day_load(self):
        history = [event("uncertain", "2024-01-02", "unknown", None), event("known", "2024-01-05")]
        rows, _ = annotate_outcomes([outcome("next", "2024-01-06")], history, {})
        self.assertEqual(rows[0]["rest"], 1)
        self.assertIsNone(rows[0]["load7"])

    def test_unknown_that_cannot_change_the_arm_preserves_classification(self):
        history = [event("known", "2024-01-01"), event("uncertain", "2024-01-02", "unknown", None)]
        rows, _ = annotate_outcomes([outcome("next", "2024-01-06")], history, {})
        self.assertFalse(rows[0]["restUncertain"])
        self.assertFalse(rows[0]["restDaysExact"])
        self.assertTrue(3 <= rows[0]["rest"] <= 30)

    def test_confirmed_appearance_does_not_invent_minutes(self):
        rows, _ = annotate_outcomes([outcome("next", "2024-01-06")], [event("pbp", "2024-01-05", minutes=None)], {})
        self.assertEqual(rows[0]["rest"], 1)
        self.assertEqual(rows[0]["load7"], 1)
        self.assertIsNone(rows[0]["min7"])

    def test_minutes_carry_is_elapsed_time_not_missing_or_zero(self):
        self.assertEqual(minutes_value("0:60"), 1)
        self.assertEqual(minutes_value("3:60"), 4)
        self.assertEqual(minutes_value("0:00"), 0)
        for bad in ("", "NaN", "Infinity", "-1:00", "0:61", "1:bad", "1.5:20"):
            self.assertIsNone(minutes_value(bad), bad)

    def test_participation_and_duration_are_separate_source_facts(self):
        self.assertEqual(participation({"minutes": "9:15", "field_goals_attempted": 0})[0], "played")
        self.assertEqual(participation({"minutes": "", "comment": "DNP - Coach's Decision"})[0], "did_not_play")
        for comment in ("NWT_LEAGUE_SUSPENSION", "DND_HEALTH_AND_SAFETY_PROTOCOLS", "DNP_LEAGUE_SUSPENSION",
                        "Not With Team", '"DND - Surgery, right quadriceps."'):
            self.assertEqual(participation({"minutes": "", "comment": comment})[0], "did_not_play", comment)
            self.assertEqual(participation({"minutes": "1:00", "comment": comment})[0], "unknown", comment)
        self.assertEqual(participation({"minutes": "0:00", "comment": ""})[0], "unknown")
        self.assertEqual(participation({"minutes": "", "comment": "no memo for staff"})[0], "unknown")
        self.assertEqual(participation({"minutes": "9:15", "comment": "DNP - Coach's Decision"})[0], "unknown")
        self.assertEqual(participation({"minutes": "", "field_goals_attempted": 2}), ("played", None))

    def test_duplicate_game_identity_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            annotate_outcomes([outcome("next", "2024-01-06")], [event("same", "2024-01-05"), event("same", "2024-01-05")], {})

    def test_omission_proof_is_global_and_covers_both_lookbacks(self):
        rows = [outcome("regular", "2020-12-22")]
        proof = prove_history_windows(rows, {"0051900111": date(2020, 8, 15)}, set())
        self.assertEqual(proof["playInNonintersection"][0]["daysToNextTarget"], 129)
        with self.assertRaisesRegex(ValueError, "Unobserved"):
            prove_history_windows(rows, {"006missing": date(2020, 12, 20)}, set())

    def test_official_identity_and_eastern_date_are_preserved(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "official.json"
            player = {"personId": 2544, "firstName": "LeBron", "familyName": "James", "comment": "",
                      "statistics": {"minutes": "34:51", "fieldGoalsAttempted": 21}}
            game = {"gameId": "0062300001", "gameStatus": 3, "gameTimeUTC": "2023-12-10T01:30:00Z",
                    "awayTeam": {"teamTricode": "IND", "players": []}, "homeTeam": {"teamTricode": "LAL", "players": [player]}}
            path.write_text(json.dumps({"props": {"pageProps": {"game": game}}}))
            normalized, _ = normalize_game(path)
            self.assertEqual(normalized["date"], "2023-12-09")
            self.assertEqual(normalized["players"][0]["personId"], "2544")

    def test_history_alias_uses_both_nba_team_identity_and_canonical_date(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path = root / "player_boxscores_2024.csv"
            fields = ["game_id", "person_id", "minutes", "comment", "field_goals_attempted", "side", "team_id"]
            raw = {"game_id": "0022400147", "person_id": "1", "minutes": "9:15", "comment": "", "field_goals_attempted": "0", "side": "home", "team_id": "1610612764"}
            def write_rows(rows):
                with path.open("w", newline="") as stream:
                    writer = csv.DictWriter(stream, fieldnames=fields)
                    writer.writeheader()
                    writer.writerows(rows)
            write_rows([raw])
            manifest = root / "context.json"
            payload = {"dataVersion": "1.0.4", "games": [], "sources": [], "historyAliases": [
                {"gameId": "0022400147", "canonicalId": "bref-test", "date": "2024-11-02", "homeTeamId": 1610612764, "awayTeamId": 1610612748}]}
            manifest.write_text(json.dumps(payload))
            history, coverage = load_history(root, {"bref-test": date(2024, 11, 2)}, manifest)
            self.assertEqual(history[0]["gid"], "0022400147")
            self.assertEqual(history[0]["date"], date(2024, 11, 2))
            self.assertIn("bref-test", coverage["coveredGameIds"])
            raw["team_id"] = "999"
            write_rows([raw])
            with self.assertRaisesRegex(ValueError, "team ID"):
                load_history(root, {"bref-test": date(2024, 11, 2)}, manifest)
            raw["team_id"] = "1610612764"
            write_rows([raw, raw])
            with self.assertRaisesRegex(ValueError, "Duplicate"):
                load_history(root, {"bref-test": date(2024, 11, 2)}, manifest)

    def test_pbp_override_preserves_unknown_duration_and_checks_raw_input(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            raw = {"game_id": "002known", "person_id": "1", "minutes": "0:00", "comment": "", "field_goals_attempted": "0"}
            with (root / "player_boxscores_2024.csv").open("w", newline="") as stream:
                writer = csv.DictWriter(stream, fieldnames=list(raw))
                writer.writeheader()
                writer.writerow(raw)
            payload = {"dataVersion": "1.0.4", "games": [], "sources": [], "resolutions": [
                {"pid": "1", "gid": "002known", "state": "played", "minutes": None, "rawMinutes": "0:00", "rawComment": ""}]}
            manifest = root / "context.json"
            manifest.write_text(json.dumps(payload))
            history, _ = load_history(root, {"002known": date(2024, 1, 5)}, manifest)
            self.assertEqual(history[0]["state"], "played")
            self.assertIsNone(history[0]["min"])
            payload["resolutions"][0]["rawMinutes"] = "0:01"
            manifest.write_text(json.dumps(payload))
            with self.assertRaisesRegex(ValueError, "input changed"):
                load_history(root, {"002known": date(2024, 1, 5)}, manifest)


if __name__ == "__main__":
    unittest.main()
