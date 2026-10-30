"""The score writer's degraded status must survive successful downstream work."""

import sys
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import daily_update


class DailyUpdateStatusTests(unittest.TestCase):
    def test_scoreboard_handoff_is_shared_within_one_run_and_fresh_on_retry(self):
        with tempfile.TemporaryDirectory() as directory, \
             patch.dict(os.environ, {"DAILY_SUMMARY_PATH": str(Path(directory) / "summary.json")}), \
             patch.object(daily_update, "is_in_season", return_value=True), \
             patch.object(daily_update, "resolve_database_url", return_value="test-only"), \
             patch.object(daily_update.subprocess, "run", return_value=SimpleNamespace(returncode=0)) as run:
            daily_update.main()
            first = [call.kwargs['env'] for call in run.call_args_list]
            self.assertEqual(len(first), 4)
            token = first[0]['DAILY_SCOREBOARD_RUN_ID']
            self.assertTrue(token)
            self.assertTrue(all(env['DAILY_SCOREBOARD_RUN_ID'] == token for env in first))
            self.assertTrue(all(env['DAILY_STAGE_SUMMARY_DIR'] == first[0]['DAILY_STAGE_SUMMARY_DIR'] for env in first))
            self.assertIn('--refresh', run.call_args_list[1].args[0])
            run.reset_mock()
            daily_update.main()
            second = run.call_args_list[0].kwargs['env']
            self.assertNotEqual(second['DAILY_SCOREBOARD_RUN_ID'], token)
            self.assertNotEqual(second['DAILY_STAGE_SUMMARY_DIR'], first[0]['DAILY_STAGE_SUMMARY_DIR'])

    def run_pipeline(self, codes):
        with tempfile.TemporaryDirectory() as directory, \
             patch.dict(os.environ, {"DAILY_SUMMARY_PATH": str(Path(directory) / "summary.json")}), \
             patch.object(daily_update, "is_in_season", return_value=True), \
             patch.object(daily_update, "resolve_database_url", return_value="test-only"), \
             patch.object(daily_update.subprocess, "run", side_effect=[
                 SimpleNamespace(returncode=code) for code in codes
             ]) as run:
            try:
                daily_update.main()
            except SystemExit as error:
                return error.code, run.call_count
            return 0, run.call_count

    def test_degraded_score_sync_continues_but_final_status_stays_failed(self):
        self.assertEqual(self.run_pipeline([2, 0, 0, 0]), (2, 4))

    def test_fatal_score_sync_stops_before_downstream(self):
        self.assertEqual(self.run_pipeline([1]), (1, 1))

    def test_successful_pipeline_stays_successful(self):
        self.assertEqual(self.run_pipeline([0, 0, 0, 0]), (0, 4))

    def test_later_fatal_failure_is_not_hidden_by_degraded_score_sync(self):
        self.assertEqual(self.run_pipeline([2, 0, 0, 1]), (1, 4))

    def test_fatal_context_overrides_degraded_scores_without_losing_downstream(self):
        self.assertEqual(self.run_pipeline([2, 1, 1, 0]), (1, 4))


if __name__ == "__main__":
    unittest.main()
