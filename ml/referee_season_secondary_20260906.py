"""Run the descriptive protocol in docs/research/2026-09-06-referee-season-secondary.md."""
from __future__ import annotations
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'ml/data/referee'
OUTPUT = ROOT / 'docs/research/2026-09-06-referee-season-secondary.json'


def rows(name):
    with (DATA / f'{name}.csv').open() as f:
        yield from csv.DictReader(f)


def number(value):
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def minutes(value):
    if value and ':' in value:
        a, b = value.split(':')
        return float(a) + float(b) / 60
    return number(value)


def attempts(value):
    try:
        made, attempted = map(int, value.split('-'))
        assert 0 <= made <= attempted
        return attempted
    except (ValueError, AttributeError, AssertionError):
        return None


def run():
    all_games = list(rows('games'))
    games = {g['event_id']: g for g in all_games if g['season_type'] == '2' and int(g['n_officials']) >= 3 and int(g['n_plays']) > 0 and int(g['n_player_rows']) > 0}
    assert len(games) == sum(g['season_type'] == '2' and int(g['n_officials']) >= 3 and int(g['n_plays']) > 0 and int(g['n_player_rows']) > 0 for g in all_games)
    latest = max(g['season'] for g in games.values())
    counts = defaultdict(Counter)
    technical_games = defaultdict(set)
    dates = defaultdict(list)
    drawn = Counter()
    drawn_audit = Counter()
    for g in games.values():
        counts[g['season']]['games'] += 1
        dates[g['season']].append(g['date_et'])
    for f in rows('fouls'):
        g = games.get(f['event_id'])
        if not g or not 1 <= int(f['period']) <= 4:
            continue
        c = counts[g['season']]
        c['regulation_fouls'] += 1
        if f['committing_team_id'] == g['home_team_id']:
            c['home_fouls'] += 1
        elif f['committing_team_id'] == g['away_team_id']:
            c['away_fouls'] += 1
        else:
            c['unidentified_team_fouls'] += 1
        if 'technical' in f['foul_type'].lower():
            c['technicals'] += 1
            technical_games[g['season']].add(f['event_id'])
        if 'shooting' in f['foul_type'].lower():
            c['shooting_fouls'] += 1
            if f['drawer_id']:
                c['shooting_fouls_with_drawer'] += 1
        if not f['drawer_id']:
            c['fouls_without_drawer'] += 1
    # Offensive comparison includes overtime exposure consistently with box-score minutes.
    for f in rows('fouls'):
        g = games.get(f['event_id'])
        if g and g['season'] == latest and 'shooting' in f['foul_type'].lower():
            drawn_audit['shooting_fouls'] += 1
            if f['drawer_id']:
                drawn_audit['with_drawer'] += 1
                drawn[(f['event_id'], f['drawer_id'])] += 1
    summary = []
    for season in sorted(counts):
        c = counts[season]
        assert c['home_fouls'] + c['away_fouls'] + c['unidentified_team_fouls'] == c['regulation_fouls']
        summary.append(dict(season=season, **c, first_date=min(dates[season]), last_date=max(dates[season]), games_with_technical=len(technical_games[season]), fouls_per_game=round(c['regulation_fouls']/c['games'], 4), technicals_per_game=round(c['technicals']/c['games'], 4), away_minus_home_per_game=round((c['away_fouls']-c['home_fouls'])/c['games'], 4)))
    audit = Counter()
    players = defaultdict(Counter)
    seen = set()
    for eid, g in games.items():
        if g['season'] != latest:
            continue
        path = ROOT / f'ml/data/officials/ev-{eid}.json'
        if not path.exists():
            audit['missing_game_payload'] += 1
            continue
        p = json.loads(path.read_text())
        audit['payloads_read'] += 1
        for side in p.get('boxscore', {}).get('players', []):
            for block in side.get('statistics', []):
                names = block.get('names', [])
                for entry in block.get('athletes', []):
                    stats = dict(zip(names, entry.get('stats', [])))
                    m = minutes(stats.get('MIN'))
                    if m is None or m <= 0:
                        continue
                    aid = str(entry['athlete']['id'])
                    assert (eid, aid) not in seen
                    seen.add((eid, aid))
                    audit['positive_minute_player_games'] += 1
                    pts, fga, fta = number(stats.get('PTS')), attempts(stats.get('FG')), attempts(stats.get('FT'))
                    if pts is None or fga is None or fta is None:
                        audit['incomplete_box_fields'] += 1
                        continue
                    audit['complete_player_games'] += 1
                    players[aid].update(games=1, points=pts, minutes=m, fga=fga, fta=fta, shooting_fouls_drawn=drawn[(eid, aid)])
    qualified = {aid: c for aid, c in players.items() if c['games'] >= 40}
    stars = set(sorted(qualified, key=lambda aid: (-qualified[aid]['points']/qualified[aid]['games'], aid))[:30])
    groups = {}
    if audit['complete_player_games']/audit['positive_minute_player_games'] >= .95 and len(stars) == 30:
        for label, ids in [('top_30_ppg', stars), ('other_40_game_players', set(qualified)-stars)]:
            c = Counter()
            for aid in ids:
                c.update(qualified[aid])
            if drawn_audit['with_drawer'] / drawn_audit['shooting_fouls'] < .95:
                del c['shooting_fouls_drawn']
            groups[label] = dict(players=len(ids), **c, fta_per_fga=round(c['fta']/c['fga'], 4), fta_per36=round(36*c['fta']/c['minutes'], 4), shooting_fouls_drawn_per36=round(36*c['shooting_fouls_drawn']/c['minutes'], 4) if 'shooting_fouls_drawn' in c else None)
    result = dict(protocol='docs/research/2026-09-06-referee-season-secondary.md', latest_season=latest, seasons=summary, latest_box_audit=dict(audit), latest_shooting_drawer_audit=dict(drawn_audit), offensive_groups=groups, caution='Descriptive cached sample, not causal referee effects or call accuracy. Regulation-only season counts; full-game offensive exposure. Star status selected from same-season scoring, which itself includes free throws.')
    OUTPUT.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    run()
