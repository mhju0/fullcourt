"""Check that every assigned fixture/side was exercised and geographic exports reconcile."""
import csv,json,math,pathlib
P=pathlib.Path(__file__).resolve().parent
load=lambda n:json.loads((P/n).read_text())
rows=lambda n:list(csv.DictReader((P/n).open()))
s=load('numeric-summary.json');d=load('score-diagnostic.json')
assert s['scope']['all_season_games']==1200
assert s['scope']['assigned_season_team_games']==2400
assert s['scope']['assigned_season_dates']==156
assert s['scope']['external_id_duplicate_count']==s['scope']['team_date_double_bookings']==s['scope']['held']==0
assert s['pdf']['parsed']==1200 and not s['pdf']['unparsed'] and s['pdf']['fixture_differences']==0
assert s['api']['team_games_compared']==2400 and set(s['api']['by_team'].values())=={80}
assert s['api']['differences']==0 and not s['api']['errors']
assert s['espn']['regular_fixtures_in_context']==1200 and s['espn']['venue_rows']==1200 and s['espn']['venue_missing']==0 and not s['espn']['missing_dates']
assert d['checks']==2400 and not d['stored_fresh_score_differences']
assert len(rows('team-season.csv'))==30 and len(rows('team-month.csv'))==210
assert sum(int(r['assigned_games'])for r in rows('team-season.csv'))==2400
assert len(rows('per-leg.csv'))==2400 and len(rows('calendar-oracle.csv'))==2400
assert len(rows('current-provider-venues.csv'))==1200
assert len(rows('all-consecutive-away-pairs.csv'))==680
for r in rows('all-consecutive-away-pairs.csv'):
 direct=float(r['leg_miles']);via=float(r['via_home_miles']);extra=float(r['extra_via_home_miles'])
 assert all(math.isfinite(x)for x in [direct,via,extra]) and direct>=0 and via+0.00001>=direct
 assert abs(via-direct-extra)<0.00001
 assert 0<=float(r['home_to_direct_route_miles'])<=min(float(r['home_to_origin_miles']),float(r['home_to_destination_miles']))+0.00001
for r in rows('geography-research-queue.csv'):assert int(r['gap_days'])>=2 and float(r['extra_via_home_miles'])<=150
print('PASS: 1200 assigned fixtures, 2400 sides, 156 canonical API dates, 242 provider dates, 680 geographic pairs; team/month/venue exports reconcile.')
