"""The corrected revision keeps both methods and omits unsupported early OOS rows."""
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from playoff_model_revision import MODEL_VERSION
from predict_series import Loaded, SeriesRow, prediction_payload


class PredictionRevisionTests(unittest.TestCase):
    def test_exact_rows_keep_orientation_and_early_oos_missing(self):
        rows = [SeriesRow(1, "1985-86_A-B", "1985-86", 1, 10, 20, 10, 1, "A", "B", "A"),
                SeriesRow(2, "2025-26_A-B", "2025-26", 2, 10, 20, 20, 0, "A", "B", "B")]
        data = Loaded(rows, np.array([[1, .1, 0, 2], [2, .2, 1, 0]]), np.array([1, 0]), np.array([r.season for r in rows]))
        payload = prediction_payload(data, np.array([.8, .4]), np.array([np.nan, .5]))
        self.assertEqual(payload["modelVersion"], MODEL_VERSION)
        self.assertEqual(payload["counts"], {"full_insample": 2, "walk_forward_oos": 1})
        self.assertEqual([r["predicted_winner_team_id"] for r in payload["rows"]], [10, 20, 10])
        self.assertEqual(payload["rows"][-1]["series_id"], 2)
        self.assertEqual(payload["rows"][-1]["predicted_home_court_win_prob"], .5)
        self.assertTrue(all(r["model_version"] == MODEL_VERSION for r in payload["rows"]))
        self.assertEqual(len(payload["modelInputSha256"]), 64)
        with self.assertRaisesRegex(ValueError, "Invalid"):
            prediction_payload(data, np.array([1.1, .4]), np.array([np.nan, .5]))


if __name__ == "__main__":
    unittest.main()
