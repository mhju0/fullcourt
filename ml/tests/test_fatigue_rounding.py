"""Offline reconstruction must follow the shipped JavaScript rounding rule."""

import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fatigue_rounding import require_score_fidelity, round_score


class FatigueRoundingTests(unittest.TestCase):
    def test_half_cent_scores_round_toward_positive_infinity(self):
        self.assertEqual(round_score(2.625), 2.63)
        self.assertEqual(round_score(0.125), 0.13)
        self.assertEqual(round_score(1.005), 1.0)

    def test_fidelity_refuses_one_cent_drift(self):
        require_score_fidelity([2.63, 0.0], [2.63, 0.0])
        with self.assertRaisesRegex(ValueError, "report not written"):
            require_score_fidelity([2.62, 0.0], [2.63, 0.0])

    def test_missing_or_invalid_scores_fail_closed(self):
        with self.assertRaises(ValueError):
            require_score_fidelity([0.0], [])
        for value in [math.nan, math.inf, -math.inf]:
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    require_score_fidelity([value], [0.0])
                with self.assertRaises(ValueError):
                    require_score_fidelity([0.0], [value])


if __name__ == "__main__":
    unittest.main()
