"""Additive audit of three documented ESPN bulk archives; leave frozen parent outputs untouched."""
import ast
import collections as C
import csv
import datetime as dt
import gzip
import hashlib
import json
import pathlib
import re
from zoneinfo import ZoneInfo
ROOT=pathlib.Path(__file__).resolve().parents[5]
OUT=pathlib.Path(__file__).resolve().parent
RAW=ROOT/'docs/audit/2026-10-20-historical-audit/sources/supplement'
SNAP=RAW.parents[1]/'snapshot'
T={r['id']:r['abbreviation']for r in (json.loads(x)for x in gzip.open(SNAP/'teams.jsonl.gz','rt'))}
G=[json.loads(x)for x in gzip.open(SNAP/'games.jsonl.gz','rt')]
for g in G:g.update(home=T[g['home_team_id']],away=T[g['away_team_id']])
A={'GS':'GSW','NO':'NOP','NY':'NYK','SA':'SAS','UTAH':'UTA','WSH':'WAS','SEA':'OKC','NJ':'BKN','NJN':'BKN','NOH':'NOP','NOK':'NOP','CHH':'CHA','CHO':'CHA','VAN':'MEM'}
def ab(s):return A.get(s,s)
def key(g):return g['date'],g['away'],g['home']
bykey={key(g):g for g in G}
prior=set()
for s in (json.loads(x)for x in gzip.open(RAW.parent/'normalized-sources.jsonl.gz','rt')):
 if s.get('date') and (g:=bykey.get(key(s))):prior.add(g['id'])
rows=[];diffs=[];known_ot=[];coverage=[];source_only=[]
def periods(s):
 try:ps=[ast.literal_eval(x)for x in re.findall(r'\{[^{}]*\}',s)]
 except (ValueError,SyntaxError):return None
 if len(ps)<4:return None
 if [p.get('period')for p in ps]!=list(range(1,len(ps)+1)):return None
 return ps
for y in [1994,1995,1996]:
 season=f'{y-1}-{str(y)[-2:]}';p=RAW/f'nba_schedule_{y}.csv';R=list(csv.DictReader(p.open()));count=C.Counter();matched=set()
 for r in R:
  date=dt.datetime.fromisoformat(r['date'].replace('Z','+00:00')).astimezone(ZoneInfo('America/New_York')).date().isoformat()
  s={'season':season,'date':date,'away':ab(r['away_abbreviation']),'home':ab(r['home_abbreviation']),'home_score':int(float(r['home_score']))if r['home_score']else None,'away_score':int(float(r['away_score']))if r['away_score']else None,'espn_id':r['game_id']}
  if not (g:=bykey.get(key(s))):source_only.append(s);continue
  count['matched_rows']+=1;matched.add(g['id'])
  if g['id']not in prior:count['newly_date_identity_checked_rows']+=1
  hp,ap=periods(r['home_linescores']),periods(r['away_linescores'])
  ot=None;reason='missing or placeholder period labels'
  if hp and ap and len(hp)==len(ap):
   if abs(sum(x['value']for x in hp)-s['home_score'])<.001 and abs(sum(x['value']for x in ap)-s['away_score'])<.001:
    tied_before_final=all(abs(sum(x['value']for x in hp[:n])-sum(x['value']for x in ap[:n]))<.001 for n in range(4,len(hp)))
    if not tied_before_final:reason='not tied after regulation or a non-final extra period'
    elif s['home_score']==s['away_score']:reason='final score tied'
    elif r['status_type_completed']!='true':reason='source game not final'
    else:ot=len(hp)-4;reason='complete numbered periods; sums match final; tied before every OT; non-tied final'
   else:reason='period totals do not sum to final scores'
  count['ot_verified_rows'if ot is not None else'ot_unverified_rows']+=1
  item={'game_id':g['id'],**s,'stored_ot':g['overtime_periods'],'source_ot':ot,'ot_evidence':reason,'new_date_identity_coverage':g['id']not in prior,'source_file':str(p.relative_to(ROOT))};rows.append(item)
  for f in ['home_score','away_score']:
   if s[f]!=g[f]:diffs.append({'game_id':g['id'],'season':season,'date':date,'away':s['away'],'home':s['home'],'field':f,'stored':g[f],'source_value':s[f]});count['score_field_differences']+=1
  if ot is not None and ot!=g['overtime_periods']:
   diffs.append({'game_id':g['id'],'season':season,'date':date,'away':s['away'],'home':s['home'],'field':'overtime_periods','stored':g['overtime_periods'],'source_value':ot});count['ot_differences']+=1
   if g['overtime_periods']==0 and ot>0:known_ot.append(item)
 coverage.append({'season':season,'source_rows':len(R),'stored_rows':sum(g['season']==season for g in G),**count,'unmatched_stored_rows':sum(g['season']==season and g['id']not in matched for g in G)})
def write(name,data):
 fields=list(dict.fromkeys(k for r in data for k in r))or['none']
 with (OUT/name).open('w')as f:w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(data)
write('coverage.csv',coverage);write('matched-games.csv',rows);write('field-differences.csv',diffs);write('known-overtime-defaults.csv',known_ot);write('source-only-games.csv',source_only)
summary={'source':'https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/espn_nba_schedules','coverage':coverage,'matched_rows':len(rows),'new_date_identity_rows':sum(c.get('newly_date_identity_checked_rows',0)for c in coverage),'new_ot_verified_rows':sum(c.get('ot_verified_rows',0)for c in coverage),'additional_known_ot_defaults':len(known_ot),'source_only_rows':len(source_only),'score_disagreement_games':len({d['game_id']for d in diffs if d['field']!='overtime_periods'}),'original_frozen_artifacts_modified':False}
base=list(csv.DictReader((OUT.parent/'season-field-coverage.csv').open()))
for r in base:
 matched={int(x['game_id'])for x in rows if x['season']==r['season']}
 newly={int(x['game_id'])for x in rows if x['season']==r['season'] and x['new_date_identity_coverage']}
 ot={int(x['game_id'])for x in rows if x['season']==r['season'] and x['source_ot'] is not None}
 if matched:
  assert int(r['overtime_periods_source_checked_rows'])==0
  for f in ['identity_source_checked_rows','date_source_checked_rows','home_score_source_checked_rows','away_score_source_checked_rows']:
   r[f]=int(r[f])+len(newly)
  r['overtime_periods_source_checked_rows']=len(ot)
  r['ot_unverified_rows']=int(r['stored_rows'])-len(ot)
write('combined-season-field-coverage.csv',base)
old_diff=list(csv.DictReader((OUT.parent/'field-differences.csv').open()))
score_games={int(x['game_id'])for x in old_diff if x['field']in('home_score','away_score')}|{x['game_id']for x in diffs if x['field']in('home_score','away_score')}
old_ot={int(x['game_id'])for x in csv.DictReader((OUT.parent/'known-overtime-defaults.csv').open())}
all_ot=old_ot|{x['game_id']for x in known_ot}
summary['combined']={'date_identity_source_checked_rows':sum(int(r['date_source_checked_rows'])for r in base),'score_source_checked_rows':sum(int(r['home_score_source_checked_rows'])for r in base),'ot_verified_rows':sum(int(r['overtime_periods_source_checked_rows'])for r in base),'completed_ot_unverified_rows':sum(int(r['ot_unverified_rows'])for r in base)-1200,'known_ot_default_distinct_games':len(all_ot),'score_disagreement_distinct_games':len(score_games)}
(OUT/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary,indent=2))
