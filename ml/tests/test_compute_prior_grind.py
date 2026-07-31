"""Unit tests for the format-aware prior-round grind computation."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

from compute_prior_grind import (  # noqa: E402
    SeriesRow,
    build_prior_grind,
    grind_beyond_sweep,
    prior_grind_diff,
)


def series(key, season, rnd, hc, opp, hw, ow, bo7=True):
    return SeriesRow(
        key=key, season=season, round=rnd,
        home_court_team_id=hc, opponent_team_id=opp,
        home_court_wins=hw, opponent_wins=ow, is_best_of_7=bo7,
    )


class GrindBeyondSweepTests(unittest.TestCase):
    def test_best_of_7_sweep_is_zero(self) -> None:
        self.assertEqual(grind_beyond_sweep(4, True), 0)

    def test_best_of_7_full_distance_is_three(self) -> None:
        self.assertEqual(grind_beyond_sweep(7, True), 3)

    def test_best_of_5_sweep_is_zero(self) -> None:
        self.assertEqual(grind_beyond_sweep(3, False), 0)

    def test_best_of_5_full_distance_is_two(self) -> None:
        self.assertEqual(grind_beyond_sweep(5, False), 2)

    def test_five_games_means_opposite_things_by_format(self) -> None:
        """The whole reason this function exists: same games played, opposite grind."""
        self.assertEqual(grind_beyond_sweep(5, False), 2)  # went the full distance
        self.assertEqual(grind_beyond_sweep(5, True), 1)   # closed early
        self.assertNotEqual(grind_beyond_sweep(5, False), grind_beyond_sweep(5, True))


class PriorGrindDiffTests(unittest.TestCase):
    def test_round_one_is_zero_not_null(self) -> None:
        self.assertEqual(prior_grind_diff(None, None, 1), 0)

    def test_positive_favors_home_court(self) -> None:
        """Opponent ground down more (3) than home court (0) -> positive."""
        self.assertEqual(prior_grind_diff(0, 3, 2), 3)

    def test_negative_when_home_court_ground_down_more(self) -> None:
        self.assertEqual(prior_grind_diff(3, 0, 2), -3)

    def test_unresolved_prior_series_is_none_not_zero(self) -> None:
        self.assertIsNone(prior_grind_diff(None, 2, 2))
        self.assertIsNone(prior_grind_diff(2, None, 2))


class BuildPriorGrindTests(unittest.TestCase):
    def test_resolves_prior_round_for_both_teams(self) -> None:
        rows = [
            # Round 1: team 10 sweeps team 11 (bo7, 4 games -> grind 0)
            series("s_10_11", "2024-25", 1, 10, 11, 4, 0),
            # Round 1: team 20 survives team 21 in seven (bo7, 7 games -> grind 3)
            series("s_20_21", "2024-25", 1, 20, 21, 4, 3),
            # Round 2: 10 (home court) vs 20
            series("s_10_20", "2024-25", 2, 10, 20, None, None),
        ]
        out = build_prior_grind(rows)
        self.assertEqual(out["s_10_11"], 0)   # round 1
        self.assertEqual(out["s_20_21"], 0)   # round 1
        # opponent grind 3 - home-court grind 0 = +3, favoring the home-court team
        self.assertEqual(out["s_10_20"], 3)

    def test_losing_team_prior_round_still_resolves(self) -> None:
        """A team's prior series is found whether it was that series' home-court side or not."""
        rows = [
            series("s_30_31", "2024-25", 1, 30, 31, 4, 2),   # 6 games -> grind 2 for BOTH
            series("s_40_41", "2024-25", 1, 40, 41, 4, 0),   # 4 games -> grind 0 for BOTH
            series("s_31_41", "2024-25", 2, 31, 41, None, None),
        ]
        out = build_prior_grind(rows)
        # home court = 31 (grind 2), opponent = 41 (grind 0) -> 0 - 2 = -2
        self.assertEqual(out["s_31_41"], -2)

    def test_best_of_five_prior_round_uses_its_own_format(self) -> None:
        rows = [
            series("s_50_51", "1995-96", 1, 50, 51, 3, 2, bo7=False),  # 5 of a bo5 -> grind 2
            series("s_60_61", "1995-96", 1, 60, 61, 3, 0, bo7=False),  # 3 of a bo5 -> grind 0
            series("s_50_60", "1995-96", 2, 50, 60, None, None),
        ]
        out = build_prior_grind(rows)
        # home court 50 grind 2, opponent 60 grind 0 -> 0 - 2 = -2
        self.assertEqual(out["s_50_60"], -2)

    def test_unresolvable_prior_series_yields_none(self) -> None:
        rows = [series("s_70_80", "2024-25", 2, 70, 80, None, None)]  # no round 1 rows at all
        self.assertIsNone(build_prior_grind(rows)["s_70_80"])

    def test_prior_series_with_null_wins_is_unresolvable(self) -> None:
        rows = [
            series("s_90_91", "2024-25", 1, 90, 91, None, None),
            series("s_92_93", "2024-25", 1, 92, 93, 4, 1),
            series("s_90_92", "2024-25", 2, 90, 92, None, None),
        ]
        self.assertIsNone(build_prior_grind(rows)["s_90_92"])


if __name__ == "__main__":
    unittest.main()
