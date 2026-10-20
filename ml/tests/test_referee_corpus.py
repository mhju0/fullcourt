import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml"))
from extract_referee_corpus import DATE_CORRECTIONS, extract_game


class RefereeCorpusDatesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.summaries = json.loads(
            (ROOT / "src/lib/__tests__/fixtures/referee-generator.json").read_text()
        )["summaries"]

    def extract(self, event_id, payload):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / f"ev-{event_id}.json"
            path.write_text(json.dumps(payload))
            return extract_game(path)

    def test_all_four_retained_provider_payloads_get_only_the_approved_date(self):
        expected = {"401161490": "2020-02-23", "401161528": "2020-02-28",
                    "401161530": "2020-02-29", "401161536": "2020-02-29"}
        self.assertEqual(set(DATE_CORRECTIONS), set(expected))
        for event_id, canonical in expected.items():
            with self.subTest(event_id=event_id):
                provider = DATE_CORRECTIONS[event_id][0]
                payload = copy.deepcopy(self.summaries[event_id])
                result = self.extract(event_id, payload)
                self.assertEqual(result[0]["date_et"], canonical)
                uncorrected = copy.deepcopy(payload)
                uncorrected["header"]["id"] = "unmapped"
                baseline = self.extract("unmapped", uncorrected)
                self.assertEqual(baseline[0]["date_et"], provider)
                baseline[0].update(event_id=event_id, date_et=canonical)
                for rows in baseline[1:]:
                    for row in rows:
                        row["event_id"] = event_id
                self.assertEqual(result, baseline)

    def test_correction_refuses_identity_drift_instead_of_guessing(self):
        for field in ("header_id", "wrong_header_id", "competition_id", "year", "type", "date", "home", "away", "home_score", "away_score"):
            payload = copy.deepcopy(self.summaries["401161490"])
            h = payload["header"]
            comp = h["competitions"][0]
            home = next(c for c in comp["competitors"] if c["homeAway"] == "home")
            away = next(c for c in comp["competitors"] if c["homeAway"] == "away")
            if field == "header_id":
                h["id"] = ""
            elif field == "wrong_header_id":
                h["id"] = "other"
            elif field == "competition_id":
                comp["id"] = "other"
            elif field in ("year", "type"):
                h["season"][field] = 2019 if field == "year" else 3
            elif field == "date":
                comp["date"] = "2020-02-25T12:00Z"
            elif field in ("home", "away"):
                (home if field == "home" else away)["team"]["abbreviation"] = "BOS"
            else:
                (home if field == "home_score" else away)["score"] = "99"
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "identity differs"):
                self.extract("401161490", payload)

    def test_provider_repair_is_idempotent_and_unlisted_games_keep_eastern_date(self):
        payload = copy.deepcopy(self.summaries["401161490"])
        payload["header"]["competitions"][0]["date"] = "2020-02-24T02:00Z"
        self.assertEqual(self.extract("401161490", payload)[0]["date_et"], "2020-02-23")
        payload["header"]["id"] = "401161999"
        payload["header"]["competitions"][0]["date"] = "2020-03-02T02:00Z"
        self.assertEqual(self.extract("401161999", payload)[0]["date_et"], "2020-03-01")


if __name__ == "__main__":
    unittest.main()
