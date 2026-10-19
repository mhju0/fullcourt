"""Published comparison scales must use the same input table as the refreshed fit."""

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import timezone_test


class TimezoneFitMetricsTests(unittest.TestCase):
    def test_refresh_uses_fit_and_refuses_stale_metrics(self):
        with tempfile.TemporaryDirectory() as temporary:
            data = Path(temporary)
            table = data / "fatigue_model_table.csv"
            table.write_text("game_id,home_won\n1,1\n")
            metrics = {
                "modelTableSha256": hashlib.sha256(table.read_bytes()).hexdigest(),
                "pooledLogLoss": {
                    "ll_base": 0.68,
                    "ll_controls_only": 0.62,
                    "ll_fitted_controls": 0.617,
                },
            }
            (data / "fatigue_fit_metrics.json").write_text(json.dumps(metrics))
            with patch.object(timezone_test, "FIT_METRICS_JSON", data / "fatigue_fit_metrics.json"), patch.object(timezone_test, "TABLE_CSV", table):
                self.assertEqual(timezone_test.fitted_comparison(), {
                    "everyFatigueFactorCombined": 0.003,
                    "strengthAlone": 0.06,
                })
                table.write_text("game_id,home_won\n2,0\n")
                with self.assertRaisesRegex(ValueError, "stale"):
                    timezone_test.fitted_comparison()


if __name__ == "__main__":
    unittest.main()
