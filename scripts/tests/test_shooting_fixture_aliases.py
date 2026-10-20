"""Shooting outcomes include every canonical regular fixture in the source cache."""
from __future__ import annotations

import copy
import csv
import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
import analyze_player_shooting as shooting
from player_appearance_history import fixture_aliases


class ShootingFixtureAliasTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        source = json.loads((SCRIPTS / "tests/fixtures/shooting-aliases.json").read_text())
        self.rows = source["rows"]
        self.fixtures = {gid: {**row, "date": date.fromisoformat(row["date"])} for gid, row in source["fixtures"].items()}
        self.context = json.loads((SCRIPTS.parent / "src/data/player-appearance-context.json").read_text())
        self.context_path = self.root / "context.json"
        self.context_path.write_text(json.dumps(self.context))

    def aliases(self):
        return fixture_aliases({gid: (row["date"], row["homeAbbr"], row["awayAbbr"]) for gid, row in self.fixtures.items()}, self.context_path)

    def load(self, rows=None):
        rows = self.rows if rows is None else rows
        with (self.root / "player_boxscores_2024.csv").open("w", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(self.rows[0]))
            writer.writeheader()
            writer.writerows(rows)
        with patch.object(shooting, "CACHE", self.root), patch.object(shooting, "team_identity_overrides", return_value={}):
            return shooting.load_player_games(self.fixtures, self.aliases())

    def test_authentic_five_fixture_projection_restores_all_positive_attempt_rows(self):
        rows = self.load()
        self.assertEqual(len(rows), 108)
        self.assertEqual(len({row["pid"] for row in rows}), 84)
        self.assertEqual(sum(row["fga"] for row in rows), 917)
        self.assertEqual({row["canonicalGid"] for row in rows}, set(self.fixtures))
        self.assertEqual({row["gid"] for row in rows}, set(self.aliases()))
        expected = {(row["person_id"], row["game_id"]): row for row in self.rows if int(row["field_goals_attempted"] or 0) > 0}
        self.assertEqual(len(rows), len(expected))
        for row in rows:
            raw = expected[(row["pid"], row["gid"])]
            self.assertEqual((row["fgm"], row["fga"], row["fg3m"]), tuple(int(raw[key] or 0) for key in ("field_goals_made", "field_goals_attempted", "three_pointers_made")))
        sga = [row for row in rows if row["pid"] == "1628983"]
        wembanyama = [row for row in rows if row["pid"] == "1641705"]
        self.assertEqual(sum(row["fga"] for row in sga), 21)
        self.assertEqual(sum(row["fga"] for row in wembanyama), 37)

    def test_canonical_membership_preserves_other_ids_and_excludes_only_zero_attempt_outcomes(self):
        additional = {**self.rows[0], "game_id": "canonical-other-id", "person_id": "new-shooter", "field_goals_attempted": "1", "field_goals_made": "0", "three_pointers_made": "0", "points": "0"}
        self.fixtures[additional["game_id"]] = {**next(iter(self.fixtures.values())), "date": date(2024, 11, 3)}
        zero = {**additional, "person_id": "zero-attempt", "field_goals_attempted": "0"}
        postseason = {**additional, "game_id": "0042400001", "person_id": "postseason"}
        bubble = {**additional, "game_id": "0021901201", "person_id": "bubble"}
        rows = self.load([*self.rows, additional, zero, postseason, bubble])
        self.assertEqual(len(rows), 109)
        self.assertEqual([row["pid"] for row in rows if row["gid"] == additional["game_id"]], ["new-shooter"])

    def test_alias_date_teams_bijection_and_canonical_collision_fail(self):
        original = copy.deepcopy(self.context)
        for change in ("date", "home", "away", "duplicate-source", "duplicate-target", "canonical-collision"):
            with self.subTest(change=change):
                self.context = copy.deepcopy(original)
                alias = self.context["historyAliases"][0]
                if change == "date": alias["date"] = "2024-11-03"
                if change == "home": alias["homeAbbr"] = "MIA"
                if change == "away": alias["awayAbbr"] = "WAS"
                if change == "duplicate-source": self.context["historyAliases"].append(copy.deepcopy(alias))
                if change == "duplicate-target": self.context["historyAliases"][1]["canonicalId"] = alias["canonicalId"]
                if change == "canonical-collision": self.fixtures[alias["gameId"]] = self.fixtures[alias["canonicalId"]]
                self.context_path.write_text(json.dumps(self.context))
                with self.assertRaises(ValueError):
                    self.aliases()
                self.fixtures.pop(alias["gameId"], None)

    def test_cache_identity_roster_duplicate_and_scoring_drift_fail_before_filtering(self):
        for change in ("team-id", "team-label", "side", "missing-zero-attempt", "duplicate", "points", "impossible-line", "malformed-fga", "negative-fga"):
            with self.subTest(change=change):
                rows = copy.deepcopy(self.rows)
                if change == "team-id": rows[0]["team_id"] = "999"
                if change == "team-label": rows[0]["team_tricode"] = "WRONG"
                if change == "side": rows[0]["side"] = "away"
                if change == "missing-zero-attempt":
                    index = next(i for i, row in enumerate(rows) if int(row["field_goals_attempted"] or 0) == 0)
                    rows.pop(index)
                if change == "duplicate": rows.append(copy.deepcopy(rows[0]))
                if change == "points": rows[0]["points"] = str(int(rows[0]["points"]) + 1)
                if change == "impossible-line": rows[0]["field_goals_made"] = "999"
                if change == "malformed-fga": rows[0]["field_goals_attempted"] = "unknown"
                if change == "negative-fga": rows[0]["field_goals_attempted"] = "-1"
                with self.assertRaises(ValueError):
                    self.load(rows)

    def test_unmapped_canonical_fixture_in_a_covered_season_fails_instead_of_disappearing(self):
        self.fixtures["bref-new-unmapped"] = {**next(iter(self.fixtures.values())), "date": date(2024, 11, 4)}
        with self.assertRaisesRegex(ValueError, "Missing canonical regular Shooting fixtures"):
            self.load()

    def test_missing_entire_completed_season_cache_cannot_shrink_the_published_population(self):
        for year in (1996, 2026):
            with self.subTest(year=year):
                self.fixtures["missing-season-fixture"] = {**next(iter(self.fixtures.values())), "season": f"{year}-{str(year + 1)[-2:]}", "date": date(year, 11, 1)}
                with self.assertRaisesRegex(ValueError, "Missing Shooting player boxscore season caches"):
                    self.load()
        self.fixtures.pop("missing-season-fixture")
        self.assertEqual(len(self.load()), 108)

    def test_empty_cache_or_wrong_cache_season_cannot_bypass_fixture_coverage(self):
        with self.assertRaisesRegex(ValueError, "requires both cached team sides"):
            self.load([])
        rows = copy.deepcopy(self.rows)
        rows[0]["season"] = "2023"
        with self.assertRaisesRegex(ValueError, "season disagrees"):
            self.load(rows)

    def test_outcome_query_has_canonical_regular_final_and_bubble_rules_without_id_gate(self):
        class Cursor:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def execute(self, query): self.query = query
            def fetchall(self): return []
        cursor = Cursor()
        class Connection:
            def cursor(self): return cursor
        shooting.load_outcome_fixtures(Connection())
        self.assertIn("g.game_type='regular'", cursor.query)
        self.assertIn("g.status='final'", cursor.query)
        self.assertIn("2019-20", cursor.query)
        self.assertIn("2020-07-30", cursor.query)
        self.assertNotIn("LIKE", cursor.query)


if __name__ == "__main__":
    unittest.main()
