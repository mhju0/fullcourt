"""Validate precise Finals labels from NBA's official historical finalist pairs."""
import collections
import csv
import gzip
import hashlib
import json
import pathlib
import re
from bs4 import BeautifulSoup
ROOT=pathlib.Path(__file__).resolve().parents[4]
OUT=pathlib.Path(__file__).resolve().parent
RAW=ROOT/'docs/audit/2026-10-20-historical-audit/sources'
G=[json.loads(x) for x in gzip.open(RAW.parent/'snapshot/games.jsonl.gz','rt')]
T=[json.loads(x) for x in gzip.open(RAW.parent/'snapshot/teams.jsonl.gz','rt')]
team={t['id']:t['abbreviation'] for t in T}
names={t['city']+' '+t['name']:t['abbreviation'] for t in T}
names.update({'Seattle SuperSonics':'OKC','New Jersey Nets':'BKN','Golden State Warriors':'GSW','Indiana Pacers':'IND','Utah Jazz':'UTA'})
pairs={}
for el in BeautifulSoup((RAW/'nba-champions.html').read_bytes(),'html.parser').select('li,p'):
 text=' '.join(el.get_text(' ',strip=True).split())
 m=re.fullmatch(r'(\d{4}-\d{2})\s*[—–-]\s*(.*?)\s+def\.\s+(.*?),?\s+(4)-(\d)',text)
 if not m:continue
 season,winner,loser,_,loss=m.groups();loser=loser.rstrip(',')
 if winner in names and loser in names:pairs[season]={'pair':{names[winner],names[loser]},'expected_games':4+int(loss)}
rows=[];coverage=[]
for season in sorted({g['season'] for g in G}):
 gs=[g for g in G if g['season']==season and g['game_type'] in ('playoffs','finals')]
 if season not in pairs:
  coverage.append({'season':season,'postseason_rows':len(gs),'status':'No completed Finals expected' if not gs else 'No official pair parsed'});continue
 p=pairs[season];actual=[g for g in gs if {team[g['home_team_id']],team[g['away_team_id']]}==p['pair']]
 for g in gs:
  correct='finals' if g in actual else 'playoffs'
  if correct!=g['game_type']:rows.append({'season':season,'game_id':g['id'],'external_id':g['external_id'],'date':g['date'],'away':team[g['away_team_id']],'home':team[g['home_team_id']],'stored_type':g['game_type'],'verified_type':correct,'authority':'https://www.nba.com/news/history-nba-champions'})
 coverage.append({'season':season,'postseason_rows':len(gs),'finals_rows_found':len(actual),'official_expected_finals_games':p['expected_games'],'type_mismatches':sum(r['season']==season for r in rows),'status':'complete' if len(actual)==p['expected_games'] else 'incomplete'})
for name,data in [('finals-type-mismatches.csv',rows),('finals-type-coverage.csv',coverage)]:
 fields=list(dict.fromkeys(k for r in data for k in r))
 with (OUT/name).open('w') as f:w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(data)
summary={'authority':'https://www.nba.com/news/history-nba-champions','authority_sha256':hashlib.sha256((RAW/'nba-champions.html').read_bytes()).hexdigest(),'parsed_finalist_pairs':len(pairs),'all_stored_postseason_rows':sum(x['postseason_rows'] for x in coverage),'mismatches':len(rows),'by_season':dict(collections.Counter(x['season'] for x in rows)),'coverage_statuses':dict(collections.Counter(x['status'] for x in coverage))}
(OUT/'finals-summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary,indent=2))
