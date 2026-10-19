"""Compare immutable DB capture with independently retained or freshly fetched sources."""
import collections as C
import csv
import datetime as dt
import gzip
import hashlib
import io
import json
import pathlib
from zoneinfo import ZoneInfo
from bs4 import BeautifulSoup

ROOT=pathlib.Path(__file__).resolve().parents[4]
OUT=pathlib.Path(__file__).resolve().parent
RAW=ROOT/'docs/audit/2026-10-20-historical-audit/sources'
SNAP=RAW.parent/'snapshot'
ET=ZoneInfo('America/New_York')
ALIASES={'GS':'GSW','NO':'NOP','NY':'NYK','SA':'SAS','UTAH':'UTA','WSH':'WAS','SEA':'OKC','NJ':'BKN','NJN':'BKN','NOH':'NOP','NOK':'NOP','CHH':'CHA','CHO':'CHA','VAN':'MEM','PHO':'PHX','WSB':'WAS','BRK':'BKN'}
def ab(s): return ALIASES.get(s,s)
def load(name): return [json.loads(x) for x in gzip.open(SNAP/(name+'.jsonl.gz'),'rt')]
games=load('games'); teams={t['id']:t['abbreviation'] for t in load('teams')}
for g in games:g.update(home=teams[g['home_team_id']],away=teams[g['away_team_id']])
def key(g):return g['date'],g['away'],g['home']
def outcsv(name,rows,fields=None):
 rows=list(rows); fields=fields or list(dict.fromkeys(k for r in rows for k in r)) or ['none']
 with (OUT/name).open('w') as f:
  w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rows)
manifest=[]; sources=[]
def retain(p,url,kind):
 b=p.read_bytes();manifest.append({'path':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'origin_url':url,'provenance':kind})

for p in sorted(RAW.glob('nba_schedule_*.csv.gz')):
 retain(p,'https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nba_stats_schedules/'+p.name,'fresh NBA Stats archive')
 for r in csv.DictReader(io.StringIO(gzip.decompress(p.read_bytes()).decode())):
  if r['season_type'] not in ('regular-season','playoffs','play-in'):continue
  y=int(r['season'])-1
  sources.append({'source':'nba_archive','season':f'{y}-{str(y+1)[-2:]}','external_id':r['game_id'],'date':r['game_date'][:10],'home':ab(r['home_team_abbreviation']),'away':ab(r['away_team_abbreviation']),'home_score':int(float(r['home_pts'])) if r['home_pts'] else None,'away_score':int(float(r['away_pts'])) if r['away_pts'] else None,'game_type':{'regular-season':'regular','play-in':'play_in','playoffs':'playoffs'}[r['season_type']],'source_file':str(p.relative_to(ROOT))})
print('NBA rows',len(sources),flush=True)
for p in sorted(RAW.glob('bref-NBA_*_games-*.html')):
 retain(p,'https://www.basketball-reference.com/leagues/'+p.name.removeprefix('bref-'),'fresh Basketball Reference archive')
 y=int(p.name.split('_')[1])-1
 soup=BeautifulSoup(p.read_bytes(),'html.parser'); stage='regular'
 for tr in soup.select('#schedule tbody tr'):
  if 'Playoffs' in tr.get_text():stage='playoffs';continue
  cols={x.get('data-stat'):x for x in tr.select('[data-stat]')}
  if not cols.get('visitor_pts') or not cols['visitor_pts'].text.strip():continue
  datekey=cols['date_game'].get('csk','')[:8]
  if len(datekey)!=8:continue
  def team(side):
   return ab(cols[side+'_team_name'].find('a')['href'].split('/')[2])
  ot=cols.get('overtimes');ot=ot.text.strip() if ot else ''
  sources.append({'source':'bref_archive','season':f'{y}-{str(y+1)[-2:]}','date':dt.datetime.strptime(datekey,'%Y%m%d').date().isoformat(),'home':team('home'),'away':team('visitor'),'home_score':int(cols['home_pts'].text),'away_score':int(cols['visitor_pts'].text),'overtime_periods':int(ot.replace('OT','') or 1) if ot else 0,'arena':cols.get('arena_name').text if cols.get('arena_name') else None,'remarks':cols.get('game_remarks').text if cols.get('game_remarks') else None,'source_file':str(p.relative_to(ROOT))})
print('with BRef',len(sources),flush=True)
for p in sorted((ROOT/'ml/data/shooting').glob('team_boxscores_*.csv')):
 retain(p,'https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nba_stats_team_boxscores/'+p.name,'retained NBA Stats archive; file mtime is not original fetch proof')
 paired=C.defaultdict(dict)
 for r in csv.DictReader(p.open()): paired[r['game_id']][r['side']]=r
 for gid,s in paired.items():
  if not {'home','away'} <= s.keys() or gid[:3] not in ('002','004','005'):continue
  h,a=s['home'],s['away'];y=int(p.stem.split('_')[-1]);mins=[]
  if not h['points'] or not a['points']:continue
  for r in [h,a]:
   try:mins.append(float(r['minutes'].split(':')[0])+float(r['minutes'].split(':')[1])/60)
   except (ValueError,IndexError):pass
  ots=[(m-240)/25 for m in mins]
  ot=int(round(ots[0])) if len(ots)==2 and all(abs(x-round(x))<.01 and x>=0 for x in ots) and ots[0]==ots[1] else None
  sources.append({'source':'nba_team_box','season':f'{y}-{str(y+1)[-2:]}','external_id':gid,'home':ab(h['team_tricode']),'away':ab(a['team_tricode']),'home_score':int(float(h['points'])),'away_score':int(float(a['points'])),'game_type':{'002':'regular','004':'playoffs','005':'play_in'}[gid[:3]],'overtime_periods':ot,'source_file':str(p.relative_to(ROOT))})
print('with boxes',len(sources),flush=True)
# Cache files were fetched by the app from ESPN's own scoreboard API; preserve every read hash.
def parse_espn(ev, source, p):
 for c in ev.get('competitions',[])[:1]:
  h=next((x for x in c.get('competitors',[]) if x.get('homeAway')=='home'),None);a=next((x for x in c.get('competitors',[]) if x.get('homeAway')=='away'),None)
  if not h or not a or not h.get('team',{}).get('abbreviation') or not a.get('team',{}).get('abbreviation'):return None
  try:instant=dt.datetime.fromisoformat(c['date'].replace('Z','+00:00'));date=instant.astimezone(ET).date().isoformat()
  except (KeyError,ValueError):return None
  ey=ev.get('season',{}).get('year');year=int(ey)-1 if ey else int(date[:4])-(int(date[5:7])<9)
  if not (dt.date(year,9,1)<=dt.date.fromisoformat(date)<=dt.date(year+1,10,31)):return None
  hp=h.get('score');ap=a.get('score');status=c.get('status',ev.get('status',{})).get('type',{})
  def score(v):
   if isinstance(v,dict):v=v.get('value')
   return int(float(v)) if v is not None and status.get('completed') else None
  periods=max(len(h.get('linescores',[])),len(a.get('linescores',[])))
  # Team schedule status.period is recorded separately; without period lines, do not assume 4 is evidence of no OT.
  return {'source':source,'season':f'{year}-{str(year+1)[-2:]}','date':date,'home':ab(h['team']['abbreviation']),'away':ab(a['team']['abbreviation']),'home_score':score(hp),'away_score':score(ap),'overtime_periods':periods-4 if periods>=4 else None,'status_period':c.get('status',{}).get('period'),'tip_off_utc':instant.isoformat(),'tip_placeholder':instant.hour==0 and instant.minute==0,'neutral_site':c.get('neutralSite'),'neutral_venue_city':c.get('venue',{}).get('address',{}).get('city'),'espn_id':ev['id'],'source_file':str(p.relative_to(ROOT)), 'source_segment':('regular' if ev.get('seasonType',{}).get('type')==2 or ev.get('season',{}).get('type')==2 else None)}
for source, paths in [('espn_cache',sorted((ROOT/'ml/data/officials').glob('sb-*.json'))),('espn_team',sorted((RAW.parent/'venues').glob('espn-*.json.gz')))]:
 seen={}
 for p in paths:
  if source=='espn_cache':
   retain(p,'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates='+p.stem[3:],'retained first-party ESPN response; file mtime is not original fetch proof')
   try:d=json.loads(p.read_bytes())
   except Exception:continue
  else:
   retain(p,'See venues/espn-manifest.json for exact team URL','fresh first-party ESPN team schedule; regular-season request')
   try:d=json.load(gzip.open(p,'rt'))
   except Exception:continue
  for ev in d.get('events',[]):
   r=parse_espn(ev,source,p)
   if r:seen[ev['id']]=r
 sources.extend(seen.values())
 print(source,len(seen),flush=True)
print('all sources',len(sources),flush=True)
with gzip.open(RAW/'normalized-sources.jsonl.gz','wt') as f:
 for s in sources:f.write(json.dumps(s)+'\n')
(RAW/'cache-manifest.json').write_text(json.dumps(manifest,indent=2))

by_source=C.defaultdict(list)
for s in sources:by_source[s['source']].append(s)
by_season=C.defaultdict(list)
for g in games:by_season[g['season']].append(g)
coverage=[];diffs=[];missing=[];unmatched=[];ot_missing=[];matched_keys={};type_ambiguity=[]
union=C.defaultdict(lambda:C.defaultdict(set))
for source,ss in by_source.items():
 sid=C.defaultdict(list); sk=C.defaultdict(list); sr=C.defaultdict(list)
 for s in ss:
  if s.get('external_id'):sid[s['external_id']].append(s)
  if s.get('date'):sk[key(s)].append(s)
  sr[(s['season'],s['away'],s['home'],s.get('away_score'),s.get('home_score'))].append(s)
 for season,gs in sorted(by_season.items()):
  counts=C.Counter(); mk=set();sp=[s for s in ss if s['season']==season]
  for g in gs:
   candidates=sid.get(g['external_id'],[]) or sk.get(key(g),[])
   if not candidates and g['status']=='final':candidates=[s for s in sr.get((season,g['away'],g['home'],g['away_score'],g['home_score']),[]) if not (s.get('source_segment')=='regular' and g['game_type']!='regular')]
   if len(candidates)!=1:
    if sp:unmatched.append({'source':source,'season':season,'game_id':g['id'],'date':g['date'],'away':g['away'],'home':g['home'],'reason':'ambiguous' if candidates else 'absent'})
    continue
   s=candidates[0];counts['matched_rows']+=1;mk.add(id(s));union[season]['identity'].add(g['id'])
   for field in ['date','home','away','home_score','away_score','game_type','overtime_periods','neutral_site','tip_off_utc']:
    if field not in s or s[field] is None:continue
    if field=='tip_off_utc' and s.get('tip_placeholder'):
     counts['tip_placeholder_rows']+=1;continue
    counts[field+'_checked']+=1;union[season][field].add(g['id'])
    old,new=g.get(field),s[field]
    if field=='game_type' and old=='finals' and new=='playoffs':continue
    if field=='tip_off_utc' and old:
     old=dt.datetime.fromisoformat(old.replace('Z','+00:00')).isoformat()
    if old!=new:
     counts[field+'_differences']+=1
     diffs.append({'source':source,'season':season,'game_id':g['id'],'external_id':g['external_id'],'date':g['date'],'away':g['away'],'home':g['home'],'field':field,'stored':old,'source_value':new,'source_file':s['source_file']})
     if field=='overtime_periods' and old==0 and new>0:ot_missing.append({'source':source,'season':season,'game_id':g['id'],'date':g['date'],'away':g['away'],'home':g['home'],'stored_ot':old,'source_ot':new})
   if s.get('date'):counts['date_identity_checked']+=1
  for s in sp:
   if id(s) not in mk and source in ['nba_archive','bref_archive']:
    missing.append({k:v for k,v in s.items() if k not in ('source_file',)}|{'source_file':s['source_file']})
  coverage.append({'source':source,'season':season,'stored_rows':len(gs),'source_rows':len(sp),**dict(counts),'unmatched_stored_rows':len(gs)-counts['matched_rows'],'unmatched_source_rows':sum(id(s) not in mk for s in sp)})
outcsv('season-field-coverage.csv',[{'season':season,'stored_rows':len(gs),**{f+'_source_checked_rows':len(union[season][f]) for f in ['identity','date','home_score','away_score','game_type','overtime_periods','tip_off_utc','neutral_site']},'ot_unverified_rows':len(gs)-len(union[season]['overtime_periods'])} for season,gs in sorted(by_season.items())]);outcsv('coverage.csv',coverage);outcsv('field-differences.csv',diffs);outcsv('source-only-games.csv',missing);outcsv('unmatched-stored.csv',unmatched);outcsv('known-overtime-defaults.csv',ot_missing)
summary={'stored_games':len(games),'seasons':len(by_season),'source_rows':dict(C.Counter(s['source'] for s in sources)),'differences_by_source_field':dict(C.Counter(s['source']+':'+s['field'] for s in diffs)),'source_only_by_source_season':dict(C.Counter(s['source']+':'+s['season'] for s in missing)),'known_ot_default_distinct_games':len({s['game_id'] for s in ot_missing}),'raw_manifest_files':len(manifest)}
(OUT/'summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary,indent=2),flush=True)
