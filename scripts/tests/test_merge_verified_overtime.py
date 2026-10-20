import copy
import unittest

from scripts.merge_verified_overtime import merge


class CumulativeOvertimeRegistryTests(unittest.TestCase):
    def setUp(self):
        self.registry = {
            "version": 1,
            "addedFixtures": [{"externalId": "0062300001"}],
            "fixtures": [{"date": "1989-11-09", "homeAbbr": "MIL", "awayAbbr": "OKC",
                          "auditGameId": 31264,
                          "fields": {"gameType": {"before": "playoffs", "after": "regular"},
                                     "neutralSite": {"before": True, "after": False}},
                          "sources": ["retained-earlier-evidence"]}],
        }
        self.observation = {"date": "1989-11-09", "homeAbbr": "MIL", "awayAbbr": "OKC",
                            "gameId": 31264, "externalId": "0028900045", "decision": "verified",
                            "beforeOvertimePeriods": 0, "overtimePeriods": 5}

    def test_five_overtime_periods_preserve_all_earlier_corrections(self):
        original = copy.deepcopy(self.registry)
        result = merge(self.registry, [self.observation], "reviewed.json")
        self.assertEqual(self.registry, original)
        self.assertEqual(result["addedFixtures"], original["addedFixtures"])
        row = result["fixtures"][0]
        self.assertEqual(row["fields"]["overtimePeriods"], {"before": 0, "after": 5})
        for field, values in original["fixtures"][0]["fields"].items():
            self.assertEqual(row["fields"][field], values)
        self.assertEqual(row["sources"], ["retained-earlier-evidence", "reviewed.json#0028900045"])

    def test_reproduction_is_idempotent(self):
        once = merge(self.registry, [self.observation], "reviewed.json")
        self.assertEqual(merge(once, [self.observation], "reviewed.json"), once)

    def test_unknown_or_verified_regulation_does_not_invent_a_patch(self):
        observations = [dict(self.observation, decision="unknown", overtimePeriods=None),
                        dict(self.observation, overtimePeriods=0)]
        self.assertEqual(merge(self.registry, observations, "reviewed.json"), self.registry)

    def test_reviewed_supplement_keeps_raw_rejection_and_applies_only_positive_ot(self):
        observation = dict(self.observation, decision="unknown", overtimePeriods=None,
                           effectiveDecision="verified-supplemental", effectiveOvertimePeriods=1)
        original = copy.deepcopy(observation)
        result = merge(self.registry, [observation], "reviewed.json")
        self.assertEqual(observation, original)
        self.assertEqual(result["fixtures"][0]["fields"]["overtimePeriods"], {"before": 0, "after": 1})
        self.assertEqual(merge(self.registry, [dict(observation, effectiveOvertimePeriods=0)], "reviewed.json"),
                         self.registry)

    def test_conflicting_prior_fact_and_duplicate_new_identity_are_rejected(self):
        first = merge(self.registry, [self.observation], "reviewed.json")
        with self.assertRaises(ValueError):
            merge(first, [dict(self.observation, overtimePeriods=1)], "different.json")
        with self.assertRaises(ValueError):
            merge(self.registry, [self.observation, self.observation], "reviewed.json")


if __name__ == "__main__":
    unittest.main()
