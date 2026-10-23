import copy
from datetime import datetime, timedelta, timezone
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
spec = importlib.util.spec_from_file_location("publish_current_shot_grid", SCRIPTS / "publish_current_shot_grid.py")
shots = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shots)
FIXTURE = json.loads((Path(__file__).parent / "fixtures/shot-chart-detail-cache-sample.json").read_text())


class CurrentShotGridTests(unittest.TestCase):
    def build(self, payload=None):
        return shots.build_snapshot(copy.deepcopy(payload or FIXTURE), "2025-26", "2026-10-01T12:00:00+00:00")

    def test_real_cache_shape_atomic_counts_and_null_models(self):
        snapshot = self.build()
        self.assertEqual(snapshot["source"]["shotCount"], 4)
        self.assertEqual(sum(c["fga"] for c in snapshot["cells"]), 4)
        self.assertTrue(all(c["gbm"] is None and c["baseline"] is None for c in snapshot["cells"]))
        self.assertTrue(all(c["fgm"] <= c["fga"] and c["fg3m"] <= c["fg3a"] for c in snapshot["cells"]))

    def test_empty_is_unpublished_not_zero_grid(self):
        payload = copy.deepcopy(FIXTURE)
        payload["resultSets"][0]["rowSet"] = []
        self.assertIsNone(self.build(payload))

    def test_invalid_flags_duplicate_events_and_wrong_season_fail(self):
        for field, value in [("SHOT_MADE_FLAG", 2), ("GAME_ID", "0022600001"), ("LOC_X", 9999)]:
            payload = copy.deepcopy(FIXTURE)
            index = payload["resultSets"][0]["headers"].index(field)
            payload["resultSets"][0]["rowSet"][0][index] = value
            with self.assertRaises(ValueError):
                self.build(payload)
        payload = copy.deepcopy(FIXTURE)
        payload["resultSets"][0]["rowSet"].append(payload["resultSets"][0]["rowSet"][0])
        with self.assertRaises(ValueError):
            self.build(payload)

    def test_future_game_dates_invalid_dates_timestamp_order_and_clock_fail(self):
        for game_date, fetched_at in [("20260601", "2025-10-23T12:00:00Z"), ("20260230", "2026-10-01T12:00:00Z"), ("20251023", "2025-10-23T02:00:00Z")]:
            payload = copy.deepcopy(FIXTURE)
            index = payload["resultSets"][0]["headers"].index("GAME_DATE")
            for row in payload["resultSets"][0]["rowSet"]:
                row[index] = game_date
            with self.assertRaises(ValueError):
                shots.build_snapshot(payload, "2025-26", fetched_at)
        with self.assertRaises(ValueError):
            shots.build_snapshot(FIXTURE, "2025-26", "2026-10-01T12:00:00Z", "2026-10-01T11:59:00Z")
        future = (datetime.now(timezone.utc) + timedelta(minutes=6)).isoformat()
        with self.assertRaises(ValueError):
            shots.build_snapshot(FIXTURE, "2025-26", future, future)
        snapshot = self.build()
        self.assertGreaterEqual(datetime.fromisoformat(snapshot["generatedAt"]), datetime.fromisoformat(snapshot["source"]["fetchedAt"]))

    def test_atomic_publication_preserves_old_bytes_on_regression_and_unchanged_run(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "snapshot.json"
            snapshot = self.build()
            self.assertTrue(shots.publish(snapshot, output))
            original = output.read_bytes()
            self.assertFalse(shots.publish(snapshot, output))
            self.assertEqual(output.read_bytes(), original)
            with self.assertRaises(ValueError):
                shots.publish(snapshot, output, ["0022509999"])
            regressed = copy.deepcopy(snapshot)
            regressed["source"]["shotCount"] -= 1
            with self.assertRaises(ValueError):
                shots.publish(regressed, output)
            self.assertEqual(output.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
