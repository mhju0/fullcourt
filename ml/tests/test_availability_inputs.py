"""Availability fixture reconciliation and prior-only uncertainty contracts."""
from __future__ import annotations
import copy
import sys
import unittest
from collections import deque
from pathlib import Path
import numpy as np
import pandas as pd

ML = Path(__file__).resolve().parents[1]
if str(ML) not in sys.path:
    sys.path.insert(0, str(ML))
from availability_inputs import join_regular_inputs, apply_team_identity_overrides, rotation_window_uncertain, available_now, attach_prior_quality


def inputs():
    box, features = [], []
    for game in range(1, 4):
        gid = f"00224000{game:02d}"
        for side, team, internal, abbr in [("home", 101, 1, "HOM"), ("away", 202, 2, "AWY")]:
            features.append(dict(game_id=game, external_id=gid, date=f"2024-11-0{game}", season="2024-25", team_id=internal, team_abbr=abbr, is_home=int(side == "home"), status="final", game_type="regular", team_score=10))
            for number in range(5):
                box.append(dict(game_id=gid, season="2024", team_id=str(team), side=side, person_id=str(internal * 10 + number), minutes="20:00", comment="", field_goals_made=1, field_goals_attempted=2, three_pointers_made=0, three_pointers_attempted=0, free_throws_made=0, free_throws_attempted=0, points=2))
    box, features = pd.DataFrame(box), pd.DataFrame(features)
    features.loc[features.game_id == 2, "external_id"] = "bref-reviewed"
    alias = dict(gameId="0022400002", canonicalId="bref-reviewed", date="2024-11-02", homeAbbr="HOM", awayAbbr="AWY", homeTeamId=101, awayTeamId=202, homePlayerIds=[str(x) for x in range(10, 15)], awayPlayerIds=[str(x) for x in range(20, 25)])
    context = dict(dataVersion="1.0.4", historyAliases=[alias], resolutions=[])
    return box, features, context


class CanonicalJoinTests(unittest.TestCase):
    def test_alias_recovers_exact_fixture_without_changing_ids_or_regular_cohort(self):
        box, features, context = inputs()
        play, sides, coverage = join_regular_inputs(box, features, context)
        self.assertEqual(len(play), 30)
        self.assertTrue(pd.api.types.is_integer_dtype(play.person_id))
        self.assertEqual(len(sides), 6)
        self.assertEqual(coverage["missingCanonicalSides"], 0)
        self.assertEqual(set(play[play.game_id == 2].external_id), {"bref-reviewed"})
        self.assertEqual(set(play[play.game_id == 2].date), {"2024-11-02"})

    def test_missing_fixture_fails_before_rotation_or_quality_can_compress(self):
        box, features, context = inputs()
        with self.assertRaisesRegex(ValueError, "Missing canonical regular fixtures"):
            join_regular_inputs(box[box.game_id != "0022400001"], features, context)

    def test_alias_rejects_date_team_roster_shot_and_bijection_drift(self):
        for change in ["date", "team", "roster", "shot", "bijection"]:
            box, features, context = inputs()
            if change == "date": context["historyAliases"][0]["date"] = "2024-11-01"
            if change == "team": box.loc[(box.game_id == "0022400002") & (box.side == "home"), "team_id"] = "202"
            if change == "roster": context["historyAliases"][0]["homePlayerIds"] = ["unexpected"]
            if change == "shot": box.loc[box.game_id == "0022400002", "field_goals_made"] = 3
            if change == "bijection": context["historyAliases"].append(copy.deepcopy(context["historyAliases"][0]))
            with self.subTest(change=change), self.assertRaises(ValueError):
                join_regular_inputs(box, features, context)

    def test_duplicate_person_game_is_rejected_instead_of_multiplying_join(self):
        box, features, context = inputs()
        with self.assertRaisesRegex(ValueError, "Duplicate Availability player/game"):
            join_regular_inputs(pd.concat([box, box.iloc[[0]]], ignore_index=True), features, context)

    def test_source_confirmed_appearance_keeps_unknown_duration_separate(self):
        box, features, context = inputs()
        box.loc[0, "minutes"] = "0:00"
        context["resolutions"] = [dict(pid=box.loc[0, "person_id"], gid=box.loc[0, "game_id"], state="played", minutes=None, rawMinutes="0:00", rawComment="")]
        play, _, _ = join_regular_inputs(box, features, context)
        row = play[(play.game_id == 1) & (play.person_id == int(box.loc[0, "person_id"]))].iloc[0]
        self.assertEqual(row.participation, "played")
        self.assertTrue(pd.isna(row["min"]))
        self.assertEqual(row.qualifying_min, 0)
        context["resolutions"][0]["rawMinutes"] = "changed"
        with self.assertRaisesRegex(ValueError, "raw cache drift"):
            join_regular_inputs(box, features, context)

    def test_nonregular_rows_do_not_enter_regular_rotation_or_quality_history(self):
        box, features, context = inputs()
        features.loc[features.game_id == 3, "game_type"] = "cup_final"
        play, _, coverage = join_regular_inputs(box, features, context)
        self.assertEqual(set(play.game_id), {1, 2})
        self.assertEqual(coverage["canonicalRegularSides"], 4)


class ReviewedIdentityTests(unittest.TestCase):
    def fixture(self):
        stats = dict(minutes="29:38", points=7, field_goals_made=3, field_goals_attempted=9,
                     three_pointers_made=1, three_pointers_attempted=3, free_throws_made=0, free_throws_attempted=0)
        rows = []
        for i in range(9):
            gid = "0029600070" if i == 0 else f"00296001{i:02d}"
            rows += [dict(person_id="home-peer", game_id=gid, team_id="1610612739", team_tricode="CLE", side="home", points=101),
                     dict(person_id="away-peer", game_id=gid, team_id="1610612743", team_tricode="DEN", side="away", points=79 if i == 0 else 86)]
            rows.append(dict(person_id="36", game_id=gid, team_id="1610612739" if i == 0 else "1610612743", team_tricode="CLE" if i == 0 else "DEN", side="home" if i == 0 else "away", **stats))
        box = pd.DataFrame(rows)
        sides = pd.DataFrame([dict(external_id="0029600070", date="1996-11-10", side="home", team_abbr="CLE", team_score=101), dict(external_id="0029600070", date="1996-11-10", side="away", team_abbr="DEN", team_score=86)])
        override = dict(personId="36", gameId="0029600070", date="1996-11-10", before=dict(team_id="1610612739", team_tricode="CLE", side="home"), after=dict(team_id="1610612743", team_tricode="DEN", side="away"), expectedStats={k: str(v) for k, v in stats.items()})
        return box, sides, override

    def test_one_row_reassignment_preserves_stats_and_only_affects_current_and_next_five_windows(self):
        box, sides, override = self.fixture()
        corrected = apply_team_identity_overrides(box, sides, [override])
        self.assertEqual(len(corrected), len(box))
        pd.testing.assert_frame_equal(box.drop(columns=["team_id", "team_tricode", "side"]), corrected.drop(columns=["team_id", "team_tricode", "side"]))
        games = list(dict.fromkeys(box.game_id))
        def windows(frame, side, i):
            return [tuple(frame[(frame.game_id == gid) & (frame.side == side)].person_id) for gid in games[max(0, i - 5):i + 1]]
        for side in ["home", "away"]:
            changed = [i for i in range(len(games)) if windows(box, side, i) != windows(corrected, side, i)]
            self.assertEqual(changed, list(range(6)))
        self.assertEqual(corrected[(corrected.game_id == games[0]) & (corrected.side == "home")].points.sum(), 101)
        self.assertEqual(corrected[(corrected.game_id == games[0]) & (corrected.side == "away")].points.sum(), 86)

    def test_identity_only_correction_does_not_change_personal_quality_order_or_values(self):
        box, sides, override = self.fixture()
        corrected = apply_team_identity_overrides(box, sides, [override])
        def quality(frame):
            own = frame[frame.person_id == "36"].copy().reset_index(drop=True)
            own["date"] = [f"1996-11-{10+i:02d}" for i in range(len(own))]
            own["min"] = 29 + 38 / 60
            own["participation"] = "played"
            own["game_score"] = np.arange(len(own), dtype=float)
            return attach_prior_quality(own, {"game_score": "q"}, 20, 5)[["game_id", "q", "q_uncertain"]]
        pd.testing.assert_frame_equal(quality(box), quality(corrected))

    def test_identity_cas_rejects_duplicates_wrong_old_side_changed_stats_and_scoring_drift(self):
        for kind in ["duplicate", "side", "stats", "score"]:
            box, sides, override = self.fixture()
            if kind == "duplicate": box = pd.concat([box, box.iloc[[2]]], ignore_index=True)
            if kind == "side": box.loc[2, "side"] = "away"
            if kind == "stats": box.loc[2, "field_goals_attempted"] = 8
            if kind == "score": sides.loc[0, "team_score"] = 108
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                apply_team_identity_overrides(box, sides, [override])


class WindowTests(unittest.TestCase):
    def test_unknown_can_hold_rotation_only_when_two_appearances_are_possible(self):
        unknown = {"p": {"min": np.nan, "participation": "unknown"}}
        known = {"p": {"min": 30, "participation": "played"}}
        self.assertFalse(rotation_window_uncertain(deque([unknown]), 2))
        self.assertTrue(rotation_window_uncertain(deque([unknown, known]), 2))
        self.assertFalse(rotation_window_uncertain(deque([known, known]), 2))

    def test_recorded_zero_cannot_create_a_positive_minute_rotation_appearance(self):
        unknown_zero = {"p": {"min": 0, "participation": "unknown", "qualifying_min": 0}}
        known = {"p": {"min": 30, "participation": "played", "qualifying_min": 30}}
        self.assertFalse(rotation_window_uncertain(deque([unknown_zero, known]), 2))
        confirmed_zero_quantity_unknown = {"p": {"min": np.nan, "participation": "played", "qualifying_min": 0}}
        self.assertFalse(rotation_window_uncertain(deque([confirmed_zero_quantity_unknown, known]), 2))

    def test_known_small_clock_bounds_cannot_create_a_fifteen_minute_rotation_member(self):
        bounded = {"p": {"min": 0.5, "participation": "unknown"}}
        one_minute = {"p": {"min": 1.0, "participation": "played"}}
        thirty = {"p": {"min": 30.0, "participation": "played"}}
        self.assertFalse(rotation_window_uncertain(deque([bounded, one_minute]), 2))
        self.assertTrue(rotation_window_uncertain(deque([bounded, thirty]), 2))

    def test_present_unknown_minutes_never_becomes_missing_zero(self):
        current = {"p": {"min": np.nan, "participation": "played"}, "u": {"min": np.nan, "participation": "unknown"}, "d": {"min": 0, "participation": "did_not_play"}}
        self.assertTrue(available_now(current, "p"))
        self.assertIsNone(available_now(current, "u"))
        self.assertFalse(available_now(current, "d"))
        self.assertFalse(available_now(current, "not-listed"))

    def test_quality_is_prior_only_and_preserves_cross_summer_own_appearance_history(self):
        rows = [dict(person_id="p", date=f"2024-04-{i:02d}", game_id=i, participation="played", min=20, game_score=float(i)) for i in range(1, 7)]
        rows[-1]["date"] = "2024-10-23"
        result = attach_prior_quality(pd.DataFrame(rows), {"game_score": "q"}, 20, 5)
        self.assertEqual(result.iloc[-1].q, 3)
        rows[-1]["game_score"] = 999
        changed = attach_prior_quality(pd.DataFrame(rows), {"game_score": "q"}, 20, 5)
        self.assertEqual(changed.iloc[-1].q, 3)
        self.assertTrue(pd.isna(result.iloc[4].q))

    def test_unknown_cannot_supply_quality_when_even_all_possible_appearances_miss_warmup(self):
        rows = [dict(person_id="p", date="2024-01-01", game_id=0, participation="unknown", min=np.nan, game_score=0)]
        rows += [dict(person_id="p", date=f"2024-01-{i+1:02d}", game_id=i, participation="played", min=20, game_score=float(i)) for i in range(1, 7)]
        result = attach_prior_quality(pd.DataFrame(rows), {"game_score": "q"}, 20, 5)
        self.assertFalse(result.iloc[3].q_uncertain)
        self.assertTrue(result.iloc[5].q_uncertain)
        self.assertTrue(pd.isna(result.iloc[5].q))

    def test_unknown_quality_history_is_held_until_twenty_confirmed_appearances_replace_it(self):
        rows = [dict(person_id="p", date="2024-01-01", game_id=0, participation="unknown", min=np.nan, game_score=0)]
        rows += [dict(person_id="p", date=f"2024-01-{i+1:02d}", game_id=i, participation="played", min=20, game_score=float(i)) for i in range(1, 22)]
        result = attach_prior_quality(pd.DataFrame(rows), {"game_score": "q"}, 20, 5)
        self.assertTrue(result.iloc[20].q_uncertain)
        self.assertFalse(result.iloc[21].q_uncertain)
        self.assertEqual(result.iloc[21].q, 10.5)


if __name__ == "__main__":
    unittest.main()
