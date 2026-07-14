"""Characterization tests for the two intentional schedule upsert policies."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from schedule_upsert_contract import (  # noqa: E402
    CDN_SCHEDULE_UPSERT_POLICY,
    STATS_SCHEDULE_UPSERT_POLICY,
    build_schedule_upsert_sql,
)


class ScheduleUpsertContractTests(unittest.TestCase):
    def test_cdn_schedule_is_date_authoritative_but_preserves_final_scores(self) -> None:
        policy = CDN_SCHEDULE_UPSERT_POLICY
        sql = build_schedule_upsert_sql(policy)

        self.assertTrue(policy.update_date)
        self.assertTrue(policy.preserve_final_status)
        self.assertTrue(policy.preserve_existing_scores_when_missing)
        self.assertFalse(policy.update_overtime_periods)
        self.assertFalse(policy.update_game_type)
        self.assertIn("date = EXCLUDED.date", sql)
        self.assertIn("COALESCE(EXCLUDED.home_score, games.home_score)", sql)
        self.assertIn("CASE WHEN games.status = 'final'", sql)

    def test_stats_results_refresh_outcomes_without_reassigning_game_dates(self) -> None:
        policy = STATS_SCHEDULE_UPSERT_POLICY
        sql = build_schedule_upsert_sql(policy)

        self.assertFalse(policy.update_date)
        self.assertFalse(policy.preserve_final_status)
        self.assertFalse(policy.preserve_existing_scores_when_missing)
        self.assertTrue(policy.update_overtime_periods)
        self.assertTrue(policy.update_game_type)
        self.assertNotIn("date = EXCLUDED.date", sql)
        self.assertIn("home_score = EXCLUDED.home_score", sql)
        self.assertIn("overtime_periods = EXCLUDED.overtime_periods", sql)
        self.assertIn("game_type = EXCLUDED.game_type", sql)


if __name__ == "__main__":
    unittest.main()
