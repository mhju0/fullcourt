"""The daily season gate opens on ESPN's regular-season dates and falls back to the calendar."""

import json
import sys
import unittest
import urllib.error
from datetime import date
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import season_window

# Shapes and values as served by sports.core.api.espn.com on 2026-10-21 (fields the gate reads).
SEASON_2027 = {"id": "2", "type": 2, "name": "Regular Season",
               "startDate": "2026-10-20T07:00Z", "endDate": "2027-04-12T06:59Z"}
# 2020-21 started in December (EST, so 08:00Z) and ran into May.
SEASON_2021 = {"id": "2", "type": 2, "name": "Regular Season",
               "startDate": "2020-12-22T08:00Z", "endDate": "2021-05-17T06:59Z"}


class FakeResponse:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self):
        return self.body


def serve(payload):
    body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
    return patch.object(season_window.urllib.request, "urlopen", return_value=FakeResponse(body))


class EspnDayTests(unittest.TestCase):
    def test_espn_day_starts_at_three_in_the_morning_eastern(self):
        self.assertEqual(season_window._espn_day("2026-10-20T07:00Z"), date(2026, 10, 20))
        self.assertEqual(season_window._espn_day("2027-04-12T06:59Z"), date(2027, 4, 11))
        self.assertEqual(season_window._espn_day("2020-12-22T08:00Z"), date(2020, 12, 22))


class EspnWindowTests(unittest.TestCase):
    def gate(self, today, payload=SEASON_2027):
        with serve(payload) as urlopen:
            result = season_window.is_in_season(today)
        return result, urlopen.call_args.args[0]

    def test_opens_three_days_before_opening_night(self):
        self.assertFalse(self.gate(date(2026, 10, 16))[0])
        self.assertTrue(self.gate(date(2026, 10, 17))[0])
        self.assertTrue(self.gate(date(2026, 10, 20))[0])

    def test_stays_open_three_days_after_the_last_regular_season_night(self):
        self.assertTrue(self.gate(date(2027, 4, 14))[0])
        self.assertFalse(self.gate(date(2027, 4, 15))[0])

    def test_early_october_asks_for_the_season_about_to_start(self):
        in_season, request = self.gate(date(2026, 10, 5))
        self.assertFalse(in_season)
        self.assertTrue(request.full_url.endswith("/seasons/2027/types/2"))

    def test_summer_asks_for_the_season_that_just_ended(self):
        in_season, request = self.gate(date(2027, 7, 1))
        self.assertFalse(in_season)
        self.assertTrue(request.full_url.endswith("/seasons/2027/types/2"))

    def test_follows_a_season_that_runs_into_may(self):
        self.assertTrue(self.gate(date(2021, 5, 16), SEASON_2021)[0])
        self.assertTrue(self.gate(date(2020, 12, 19), SEASON_2021)[0])
        self.assertFalse(self.gate(date(2021, 5, 20), SEASON_2021)[0])

    def test_sends_a_non_browser_user_agent(self):
        _, request = self.gate(date(2026, 11, 1))
        self.assertNotIn("Mozilla", request.get_header("User-agent"))


class FallbackTests(unittest.TestCase):
    def assert_calendar(self, **patch_kwargs):
        with patch.object(season_window.urllib.request, "urlopen", **patch_kwargs):
            self.assertTrue(season_window.is_in_season(date(2026, 10, 5)))
            self.assertFalse(season_window.is_in_season(date(2026, 6, 1)))

    def test_network_error_uses_the_calendar(self):
        self.assert_calendar(side_effect=urllib.error.URLError("unreachable"))

    def test_unreadable_body_uses_the_calendar(self):
        self.assert_calendar(return_value=FakeResponse(b"<html>blocked</html>"))

    def test_missing_dates_use_the_calendar(self):
        self.assert_calendar(return_value=FakeResponse(json.dumps({"id": "2", "type": 2}).encode()))

    def test_a_non_regular_season_type_uses_the_calendar(self):
        preseason = {**SEASON_2027, "id": "1", "type": 1}
        self.assert_calendar(return_value=FakeResponse(json.dumps(preseason).encode()))

    def test_reversed_dates_use_the_calendar(self):
        reversed_dates = {**SEASON_2027, "startDate": SEASON_2027["endDate"], "endDate": SEASON_2027["startDate"]}
        self.assert_calendar(return_value=FakeResponse(json.dumps(reversed_dates).encode()))


if __name__ == "__main__":
    unittest.main()
