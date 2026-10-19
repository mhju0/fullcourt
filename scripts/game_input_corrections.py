"""Accepted fixture facts override normalized provider fields, independently of provider IDs."""
import json
from pathlib import Path

_DATA = json.loads((Path(__file__).resolve().parents[1] / 'src/data/game-input-corrections.json').read_text())
_PATCHES = {}
for _fixture in _DATA['fixtures']:
    _key = (_fixture['date'], _fixture['homeAbbr'], _fixture['awayAbbr'])
    if _key in _PATCHES:
        raise ValueError(f'Duplicate accepted fixture identity: {_key}')
    _PATCHES[_key] = _fixture['fields']

for _fixture in _DATA.get('addedFixtures', []):
    _key = (_fixture['date'], _fixture['homeAbbr'], _fixture['awayAbbr'])
    if _key in _PATCHES:
        raise ValueError(f'Duplicate accepted fixture identity: {_key}')
    _PATCHES[_key] = {field: {'after': _fixture[field]} for field in
        ('gameType', 'overtimePeriods', 'tipOffUtc', 'neutralSite', 'neutralVenueCity')}


def apply_game_input_correction(date, home_abbr, away_abbr, normalized):
    result = dict(normalized)
    for field, values in _PATCHES.get((str(date)[:10], home_abbr, away_abbr), {}).items():
        if field in result:
            result[field] = values['after']
    return result
