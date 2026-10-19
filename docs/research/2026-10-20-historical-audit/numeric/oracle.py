"""Independent date/geodesic audit of the captured rows; never connects to a DB."""
import bisect
import collections
import csv
import datetime as dt
import gzip
import json
import math
from pathlib import Path

P = Path(__file__).resolve().parent
R = P.parents[2] / 'audit/2026-10-20-historical-audit/snapshot'
NEUTRAL = {'Mexico City': (19.4028, -99.1889), 'London': (51.503, .0032),
           'Las Vegas': (36.1028, -115.1783), 'Paris': (48.8386, 2.3784),
           'Berlin': (52.5075, 13.4432), 'Manchester': (53.4839, -2.1953)}

def load(name):
    with gzip.open(R / (name + '.jsonl.gz'), 'rt') as f:
        return [json.loads(s) for s in f if s.strip()]

def rawsave(name, rows):
    with gzip.open(R / (name + '.jsonl.gz'), 'wt') as f:
        for row in rows:
            f.write(json.dumps(row, separators=(',', ':')) + '\n')

def csvout(name, rows):
    fields = list(rows[0]) if rows else ['none']
    with (P / name).open('w') as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)

def distance(a, b):
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(math.radians(b[1]-a[1])/2)**2
    return 7917.6 * math.atan2(math.sqrt(h), math.sqrt(max(0, 1-h)))

def arena(team, date):
    ab = team['abbreviation']
    if ab == 'OKC' and date < '2008-07-01':
        return 47.6221, -122.354
    if ab == 'MEM' and date < '2001-07-01':
        return 49.2778, -123.1089
    if ab == 'NOP' and '2005-07-01' <= date < '2007-07-01':
        return 35.4634, -97.5151
    return float(team['latitude']), float(team['longitude'])

def ishome(g, tid):
    return g['home_team_id'] == tid and not (g['neutral_site'] and g['neutral_venue_city'] in NEUTRAL)

def expected_calendar(prior, current, tid):
    d = dt.date.fromisoformat(current['date'])
    ages = [(d-dt.date.fromisoformat(g['date'])).days for g in prior]
    since = min(ages) if ages else None
    road = 0
    if not ishome(current, tid):
        road = 1
        for g in reversed(prior):
            if ishome(g, tid):
                break
            road += 1
    stand = 0
    if ishome(current, tid):
        stand = 1
        for g in reversed(prior):
            if not ishome(g, tid):
                break
            stand += 1
    return {'games_in_last_7_days': sum(1 <= x <= 7 for x in ages),
            'games_in_last_30_days': len(ages), 'days_since_last_game': since,
            'is_back_to_back': since == 1, 'is_three_in_four': 1+len(set(x for x in ages if 1 <= x <= 3)) >= 3,
            'is_four_in_six': 1+len(set(x for x in ages if 1 <= x <= 5)) >= 4,
            'road_trip_consecutive_away': road, 'home_stand_length': stand}

def selfcheck():
    g = lambda date, home=1, neutral=False, city=None: {'date':date, 'home_team_id':home, 'neutral_site':neutral, 'neutral_venue_city':city}
    assert distance((0, 0), (0, 0)) == 0
    assert 2580 < distance((34.043, -118.267), (42.366, -71.062)) < 2620
    assert expected_calendar([], g('2026-01-01'), 1)['days_since_last_game'] is None
    e = expected_calendar([g('2026-01-01'), g('2026-01-03', 2), g('2026-01-04', 2)], g('2026-01-05'), 1)
    assert e['road_trip_consecutive_away'] == 0 and e['home_stand_length'] == 1
    assert e['is_three_in_four'] and e['is_four_in_six'] and e['is_back_to_back']
    assert expected_calendar([g('2026-01-01', 2)], g('2026-01-02', 2), 1)['home_stand_length'] == 0
    assert not ishome(g('2026-01-01', 1, True, 'Paris'), 1)
    assert ishome(g('2026-01-01', 1, True, 'unknown'), 1)
    assert expected_calendar([g('2025-12-29')], g('2026-01-05'), 1)['games_in_last_7_days'] == 1
    assert not expected_calendar([g('2026-01-01')], g('2026-01-05'), 1)['is_three_in_four']


def main():
    selfcheck()
    teams, games, stored, replay = load('teams'), load('games'), load('scores'), load('replay-sides')
    td = {t['id']: t for t in teams}
    sd = {(s['game_id'], s['team_id']): s for s in stored}
    rd = {(s['game_id'], s['team_id']): s for s in replay}
    chains = collections.defaultdict(list)
    for g in games:
        for tid in (g['home_team_id'], g['away_team_id']):
            chains[tid].append(g)
    dates = {tid: [g['date'] for g in ch] for tid, ch in chains.items()}
    def venue(g):
        return NEUTRAL[g['neutral_venue_city']] if g['neutral_site'] and g['neutral_venue_city'] in NEUTRAL else arena(td[g['home_team_id']], g['date'])
    def leg(previous, current, tid, homecoord):
        if previous is None:
            return 0 if ishome(current, tid) else distance(homecoord, venue(current))
        a, b = venue(previous), venue(current)
        if distance(a, b) < 1 or (ishome(previous, tid) and ishome(current, tid)):
            return 0
        if ishome(previous, tid):
            a = homecoord
        if ishome(current, tid):
            b = homecoord
        return distance(a, b)
    anomalies, rows, seasons = [], [], collections.defaultdict(collections.Counter)
    for tid, chain in chains.items():
        for g in chain:
            date = g['date']
            cutoff = (dt.date.fromisoformat(date)-dt.timedelta(days=30)).isoformat()
            prior = chain[bisect.bisect_left(dates[tid], cutoff):bisect.bisect_left(dates[tid], date)]
            prior = [p for p in prior if p['status'] == 'final' or (g['status'] != 'final' and p['status'] in ('scheduled', 'live'))]
            expected = expected_calendar(prior, g, tid)
            homecoord = arena(td[tid], date)
            all_legs = [leg(prior[i-1] if i else None, p, tid, homecoord) for i, p in enumerate(prior)]
            inbound = leg(prior[-1] if prior else None, g, tid, homecoord)
            rolling = inbound + sum(m for p, m in zip(prior, all_legs) if 1 <= (dt.date.fromisoformat(date)-dt.date.fromisoformat(p['date'])).days <= 7)
            expected['travel_distance_miles'] = math.floor(rolling+.5)
            s, r = sd.get((g['id'], tid)), rd.get((g['id'], tid))
            sc = seasons[g['season']]
            sc['team_games'] += 1
            for field, value in expected.items():
                if field != 'home_stand_length':
                    observed = float(s[field]) if s and field == 'travel_distance_miles' else s.get(field) if s else 'MISSING'
                    sc['stored_field_checks'] += 1
                    if observed != value:
                        anomalies.append({'game_id':g['id'], 'team_id':tid, 'season':g['season'], 'date':date, 'comparison':'stored_vs_oracle', 'field':field, 'actual':observed, 'expected':value})
                        sc['stored_'+field+'_mismatches'] += 1
                mapping = {'games_in_last_7_days':'gamesInLast7Days','games_in_last_30_days':'gamesInLast30Days','days_since_last_game':'daysSinceLastGame','is_back_to_back':'isBackToBack','is_three_in_four':'isThreeInFour','is_four_in_six':'isFourInSix','road_trip_consecutive_away':'roadTripConsecutiveAway','travel_distance_miles':'travelDistanceMiles'}
                observed = r['result']['features']['homeStandLength'] if r and field == 'home_stand_length' else r['result'][mapping[field]] if r else 'MISSING'
                sc['engine_field_checks'] += 1
                if observed != value:
                    anomalies.append({'game_id':g['id'], 'team_id':tid, 'season':g['season'], 'date':date, 'comparison':'engine_vs_oracle', 'field':field, 'actual':observed, 'expected':value})
                    sc['engine_'+field+'_mismatches'] += 1
            sc['zero_current_home_streak_expected'] += ishome(g,tid)
            sc['inbound_leg_miles'] += inbound
            rows.append({'game_id':g['id'], 'team_id':tid, 'season':g['season'], 'date':date, **expected, 'inbound_leg_miles':inbound})
    rawsave('oracle-sides', rows)
    rawsave('oracle-anomalies', anomalies)
    fields = sorted(set(k for c in seasons.values() for k in c))
    csvout('oracle-per-season.csv', [{'season':s, **{k:seasons[s][k] for k in fields}} for s in sorted(seasons)])
    summary = {'games':len(games), 'team_games':len(rows), 'seasons':len(seasons), 'stored_field_checks':sum(c['stored_field_checks'] for c in seasons.values()), 'engine_field_checks':sum(c['engine_field_checks'] for c in seasons.values()), 'anomaly_fields':len(anomalies), 'by_comparison_and_field':dict(collections.Counter(a['comparison']+':'+a['field'] for a in anomalies)), 'oracle_scope':'30-day physical prior window across all game types/seasons; final priors for finals, workload priors for projections; held replay diagnostic; geometry same recorded model assumptions independently implemented; no flight itinerary claim', 'selfcheck':'PASS: distance, inclusive calendar boundary, home reset, away home-stand zero, neutral resolution, opener unknown rest'}
    (P/'oracle-summary.json').write_text(json.dumps(summary, indent=2)+'\n')
    assert len(rows) == 2*len(games) == len(replay) == len(stored)
    print(json.dumps(summary, indent=2))

if __name__ == '__main__':
    main()
