import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('accepted', Path(__file__).resolve().parents[1] / 'game_input_corrections.py')
accepted = importlib.util.module_from_spec(spec)
spec.loader.exec_module(accepted)


class RegistryTests(unittest.TestCase):
    def test_overtime_overrides_provider_default_after_normalization(self):
        got = accepted.apply_game_input_correction('1985-10-25', 'POR', 'PHX', {'overtimePeriods': 0, 'gameType': 'regular', 'externalId': 'new'})
        self.assertEqual(got, {'overtimePeriods': 1, 'gameType': 'regular', 'externalId': 'new'})

    def test_unknown_fixture_and_unknown_fields_remain_unknown(self):
        normalized = {'overtimePeriods': None, 'tipOffUtc': None}
        self.assertEqual(accepted.apply_game_input_correction('1985-10-24', 'POR', 'PHX', normalized), normalized)
        self.assertEqual(accepted.apply_game_input_correction('1985-10-25', 'POR', 'PHX', {'gameType': 'regular'}), {'gameType': 'regular'})


    def test_cup_classification_and_bubble_geometry_survive_normalized_defaults(self):
        cup = accepted.apply_game_input_correction('2024-12-17', 'OKC', 'MIL',
            {'gameType': 'regular', 'overtimePeriods': 3, 'neutralSite': False})
        self.assertEqual(cup, {'gameType': 'cup_final', 'overtimePeriods': 0, 'neutralSite': True})
        bubble = accepted.apply_game_input_correction('2020-08-01', 'LAC', 'NOP',
            {'neutralSite': False, 'neutralVenueCity': None})
        self.assertEqual(bubble, {'neutralSite': True, 'neutralVenueCity': 'Orlando'})


if __name__ == '__main__':
    unittest.main()
