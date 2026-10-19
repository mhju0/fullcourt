"""Inventory every frozen game and provider venue; never infer that a provider match proves travel."""
import collections as C, csv, gzip, json, math, re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from bs4 import BeautifulSoup
OUT=Path(__file__).parent; RAW=Path('docs/audit/2026-10-20-historical-audit/venues'); SNAP=RAW.parent/'snapshot'
def rows(name):return list(map(json.loads,gzip.open(SNAP/f'{name}.jsonl.gz','rt')))
G=rows('games');T={t['id']:t for t in rows('teams')};AB={t['id']:t['abbreviation']for t in T.values()}
IDS={1:'ATL',2:'BOS',3:'NOP',4:'CHI',5:'CLE',6:'DAL',7:'DEN',8:'DET',9:'GSW',10:'HOU',11:'IND',12:'LAC',13:'LAL',14:'MIA',15:'MIL',16:'MIN',17:'BKN',18:'NYK',19:'ORL',20:'PHI',21:'PHX',22:'POR',23:'SAC',24:'SAS',25:'OKC',26:'UTA',27:'WAS',28:'TOR',29:'MEM',30:'CHA'}
def ab(i,date):return 'CHA'if int(i)==3 and date<'2002-07-01'else IDS[int(i)]
def key(g):return (g['date'],AB[g['home_team_id']],AB[g['away_team_id']])
def dump(name,rs):
 if not rs:return
 with ((RAW if name in ('all-game-venue-inventory.csv','all-consecutive-away-pairs.csv')else OUT)/name).open('w',newline='')as f:w=csv.DictWriter(f,fieldnames=list(rs[0]));w.writeheader();w.writerows(rs)
provider=C.defaultdict(list);request_issues=[]
for p in sorted(RAW.glob('espn-*.json.gz')):
 d=json.loads(gzip.decompress(p.read_bytes())); req=int(p.name.split('-')[-1].split('.')[0]);actual=d.get('requestedSeason',{}).get('year')
 if actual!=req:request_issues.append({'file':p.name,'requested_year':req,'provider_requestedSeason_year':actual,'events':len(d.get('events',[]))})
 # Reject returned-season mismatch even when an event happens to overlap.
 if actual!=req:continue
 for e in d.get('events',[]):
  date=datetime.fromisoformat(e['date'].replace('Z','+00:00')).astimezone(ZoneInfo('America/New_York')).date().isoformat();co=e['competitions'][0]
  if not co.get('competitors'):continue
  ho=next(x for x in co['competitors']if x['homeAway']=='home');aw=next(x for x in co['competitors']if x['homeAway']=='away');v=co.get('venue')or{}
  if int(ho['team']['id'])not in IDS or int(aw['team']['id'])not in IDS:continue
  provider[(date,ab(ho['team']['id'],date),ab(aw['team']['id'],date))].append({'id':e['id'],'venue':v.get('fullName','').strip(),'city':(v.get('address')or{}).get('city',''),'neutral':co.get('neutralSite'),'source':p.name})
dump('provider-season-request-anomalies.csv',request_issues)
# BRef is a secondary source: arena inventory and candidate discovery, never sole primary confirmation.
bref=C.defaultdict(list)
for p in sorted((RAW.parent/'sources').glob('bref-NBA_*html')):
 s=BeautifulSoup(p.read_text(),'lxml')
 for tr in s.select('#schedule tbody tr'):
  vals={c.get('data-stat'):c for c in tr.find_all(['th','td'])}
  if 'arena_name'not in vals or not vals.get('date_game'):continue
  date=vals['date_game'].get('csk');date=datetime.strptime(date[:8],'%Y%m%d').date().isoformat()if date else None
  if not date:
   try:date=datetime.strptime(vals['date_game'].get_text(),'%a, %b %d, %Y').date().isoformat()
   except ValueError:continue
  def ba(k):
   a=vals[k].find('a');v=a['href'].split('/')[2]if a else '';return {'SEA':'OKC','VAN':'MEM','NJN':'BKN','NOH':'NOP','NOK':'NOP','CHH':'CHA','WSB':'WAS','PHO':'PHX'}.get(v,v)
  bref[(date,ba('home_team_name'),ba('visitor_team_name'))].append({'arena':vals['arena_name'].get_text(),'remarks':vals.get('game_remarks').get_text()if vals.get('game_remarks')else'','source':p.name})
NEUTRAL={'Mexico City','London','Las Vegas','Paris','Berlin','Manchester'}
def modelcity(g):
 if g['neutral_site']and g['neutral_venue_city']in NEUTRAL:return g['neutral_venue_city']
 h=AB[g['home_team_id']];d=g['date']
 if h=='OKC'and d<'2008-07-01':return 'Seattle'
 if h=='MEM'and d<'2001-07-01':return 'Vancouver'
 if h=='NOP'and '2005-07-01'<=d<'2007-07-01':return 'Oklahoma City'
 return T[g['home_team_id']]['city']
allrows=[];candidates=[];arena_groups=C.defaultdict(list)
for g in G:
 ps=provider.get(key(g),[]);bs=bref.get(key(g),[]);vs=sorted({(p['venue'],p['city'])for p in ps if p['city']});bvs=sorted({b['arena']for b in bs if b['arena']});mc=modelcity(g)
 row={'game_id':g['id'],'date':g['date'],'season':g['season'],'game_type':g['game_type'],'home':AB[g['home_team_id']],'away':AB[g['away_team_id']],'neutral_site':g['neutral_site'],'neutral_venue_city':g['neutral_venue_city'],'model_city':mc,'espn_events_matched':len({p['id']for p in ps}),'espn_venues':json.dumps(vs,ensure_ascii=False),'espn_source_files':';'.join(sorted({p['source']for p in ps})),'bref_arenas':';'.join(bvs),'bref_remarks':';'.join(sorted({b['remarks']for b in bs if b['remarks']})),'bref_source_files':';'.join(sorted({b['source']for b in bs}))}
 allrows.append(row)
 for v,c in vs:arena_groups[(row['home'],v,c)].append(row)
 if any(c!=mc for v,c in vs):candidates.append(row)
dump('all-game-venue-inventory.csv',allrows);dump('provider-city-candidates.csv',candidates)
dump('provider-arena-era-inventory.csv',[{'home':h,'provider_arena_name_RETROACTIVE':v,'provider_city_UNVERIFIED':c,'first_date':min(r['date']for r in rs),'last_date':max(r['date']for r in rs),'matched_game_count':len(rs),'seasons':';'.join(sorted({r['season']for r in rs}))}for(h,v,c),rs in sorted(arena_groups.items())])
coverage=[]
for season in sorted({g['season']for g in G}):
 rr=[r for r in allrows if r['season']==season];gg=[g for g in G if g['season']==season]
 coverage.append({'season':season,'db_games':len(rr),'regular_games':sum(r['game_type']=='regular'for r in rr),'playoff_games':sum(r['game_type']=='playoffs'for r in rr),'espn_fixture_matched':sum(r['espn_events_matched']>0 for r in rr),'espn_nonempty_venue_city':sum(r['espn_venues']!='[]'for r in rr),'bref_nonempty_arena':sum(bool(r['bref_arenas'])for r in rr),'provider_city_candidates_unverified':sum(any(c!=r['model_city']for v,c in json.loads(r['espn_venues']))for r in rr),'stored_neutral':sum(g['neutral_site']for g in gg),'stored_neutral_unresolved_city':sum(g['neutral_site']and g['neutral_venue_city']not in NEUTRAL for g in gg),'bubble_excluded_regular':sum(g['game_type']=='regular'and '2020-07-30'<=g['date']<='2020-10-11'for g in gg),'risk':'Historical alternate arenas/global games and actual itinerary remain partially unverified; provider coverage is not venue validation.'})
dump('season-venue-coverage.csv',coverage)
# Endpoint and consecutive-away inventory. No gap threshold is an asserted home return.
chains=C.defaultdict(list)
for g in G:
 for tid in(g['home_team_id'],g['away_team_id']):chains[(g['season'],tid)].append(g)
endpoints=[];awaypairs=[]
for(season,tid),rr in sorted(chains.items()):
 rr.sort(key=lambda g:(g['date'],g['id']));team=AB[tid]
 for pos,g in [('first',rr[0]),('last',rr[-1])]:endpoints.append({'season':season,'team':team,'endpoint':pos,'game_id':g['id'],'date':g['date'],'listed_home':g['home_team_id']==tid,'model_venue_city':modelcity(g),'assumption':'First scheduled away starts from era home arena; season-last return is not counted'if pos=='first'else'No return-home leg after last included fixture; playoffs included in this all-game chain'})
 for a,b in zip(rr,rr[1:]):
  ah=a['home_team_id']==tid and not a['neutral_site'];bh=b['home_team_id']==tid and not b['neutral_site']
  if not ah and not bh:
   gap=(datetime.fromisoformat(b['date'])-datetime.fromisoformat(a['date'])).days
   awaypairs.append({'season':season,'team':team,'from_game_id':a['id'],'from_date':a['date'],'from_city':modelcity(a),'to_game_id':b['id'],'to_date':b['date'],'to_city':modelcity(b),'calendar_gap_days':gap,'actual_home_stop':'unknown','actual_airports':'unknown','transport_mode':'unknown','all_star_or_other_break':'not inferred from gap; player/team obligations differ'})
dump('season-allgame-endpoints.csv',endpoints);dump('all-consecutive-away-pairs.csv',awaypairs)
summary={'games':len(G),'seasons':len(coverage),'provider_city_candidates':len(candidates),'arena_groups':len(arena_groups),'espn_matched':sum(r['espn_events_matched']>0 for r in allrows),'espn_nonempty_city':sum(r['espn_venues']!='[]'for r in allrows),'bref_nonempty_arena':sum(bool(r['bref_arenas'])for r in allrows),'request_season_anomalies':len(request_issues),'consecutive_away_pairs':len(awaypairs),'away_gaps_ge3_research_only':sum(r['calendar_gap_days']>=3 for r in awaypairs)}
(OUT/'inventory-summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(summary)
