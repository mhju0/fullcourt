"""Independent calendar/geodesic oracle; reads captured public data, never connects to DB."""
import csv,json,math,re,collections,datetime,pathlib,os
from zoneinfo import ZoneInfo
P=pathlib.Path(__file__).resolve().parent
R=pathlib.Path(os.environ.get('SCHEDULE_AUDIT_RAW_DIR',P.parents[1]/'audit/2026-10-20-full-season-audit'))
load=lambda n:json.loads(((P/n) if (P/n).exists() else (R/n)).read_text())
def save(n,v):(P/n).write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n')
def csvout(n,rows,fields=None):
 fields=fields or (list(rows[0]) if rows else ['none'])
 with (P/n).open('w') as f:
  w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rows)
def day(s):return datetime.date.fromisoformat(s[:10])
def bearing(a,b):
 p,q=map(math.radians,[a[0],b[0]]);dl=math.radians(b[1]-a[1]);return math.atan2(math.sin(dl)*math.cos(q),math.cos(p)*math.sin(q)-math.sin(p)*math.cos(q)*math.cos(dl))
def route_proximity(a,b,h):
 length=distance(a,b);ah=distance(a,h)
 if length<0.001:return distance(a,h),0.0
 delta=ah/3958.8;theta=bearing(a,h)-bearing(a,b);cross=math.asin(max(-1,min(1,math.sin(delta)*math.sin(theta))));along=math.atan2(math.sin(delta)*math.cos(theta),math.cos(delta))*3958.8
 proximity=abs(cross)*3958.8 if 0<=along<=length else min(distance(a,h),distance(b,h))
 return proximity,along
def gap_tags(a,b):
 return {'cup_tbd_window_overlap':a<='2026-12-10' and b>='2026-12-04','all_star_break_overlap':a<='2027-02-24' and b>='2027-02-19','christmas_gap_overlap':a<'2026-12-25' and b>'2026-12-25','thanksgiving_overlap':a<='2026-11-26' and b>='2026-11-26','mlk_day_overlap':a<'2027-01-18' and b>'2027-01-18','presidents_day_overlap':a<'2027-02-15' and b>'2027-02-15'}
def distance(a,b):
 p,q=map(math.radians,[a[0],b[0]]);dl=math.radians(b[0]-a[0]);dn=math.radians(b[1]-a[1]);h=math.sin(dl/2)**2+math.cos(p)*math.cos(q)*math.sin(dn/2)**2
 return 3958.8*2*math.atan2(math.sqrt(h),math.sqrt(1-h))
teams=load('teams.json');td={t['id']:t for t in teams};abbr=lambda i:td[i]['abbreviation'];coord=lambda i:(float(td[i]['latitude']),float(td[i]['longitude']))
games=load('games.json');scores={(s['game_id'],s['team_id']):s for s in load('scores.json')};active=[g for g in games if g['status'] in ['scheduled','live','final']];target=lambda g:'2026-10-01'<=g['date'][:10]<='2027-04-30'
neutral={'Mexico City':(19.4028,-99.1889),'Paris':(48.8386,2.3784),'Manchester':(53.4839,-2.1953),'London':(51.503,0.0032),'Las Vegas':(36.1028,-115.1783),'Berlin':(52.5075,13.4432)}
def venue(g):return neutral.get(g['neutral_venue_city'],coord(g['home_team_id'])) if g['neutral_site'] else coord(g['home_team_id'])
# Parse every fixture row, rejecting any unparsed row rather than silently sampling.
city='Boston:BOS,Brooklyn:BKN,New York:NYK,Philadelphia:PHI,Toronto:TOR,Chicago:CHI,Cleveland:CLE,Detroit:DET,Indiana:IND,Milwaukee:MIL,Atlanta:ATL,Charlotte:CHA,Miami:MIA,Orlando:ORL,Washington:WAS,Denver:DEN,Minnesota:MIN,Oklahoma City:OKC,Portland:POR,Utah:UTA,Golden State:GSW,LA Clippers:LAC,LA Lakers:LAL,Phoenix:PHX,Sacramento:SAC,Dallas:DAL,Houston:HOU,Memphis:MEM,New Orleans:NOP,San Antonio:SAS'
cm=dict(x.split(':') for x in city.split(','));pdf=[];rejected=[]
for line in (R/'nba-by-date.txt').read_text().splitlines():
 m=re.match(r'\s*(\d+)\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\.\s+(\d+/\d+/\d+)\s+(.+?)\s+(?:at|vs)\s+(.+?)\s+(\d+:\d+\s*[AP]M)\s+(\d+:\d+\s*[AP]M)(.*)',line)
 if not m:
  if re.match(r'\s*\d+\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\.',line):rejected.append(line)
  continue
 n,date,away,home,local,et,notes=m.groups();d=datetime.datetime.strptime(date,'%m/%d/%y').date();clock=datetime.datetime.strptime(et.replace(' ',''),'%I:%M%p').time();tip=datetime.datetime.combine(d,clock,ZoneInfo('America/New_York')).astimezone(datetime.timezone.utc).isoformat()
 pdf.append({'number':int(n),'date':d.isoformat(),'away':cm[away.strip()],'home':cm[home.strip()],'tip_utc':tip,'notes':notes.strip()})
(R/'nba-pdf-fixtures.json').write_text(json.dumps(pdf,indent=2)+'\n');(R/'nba-pdf-unparsed.json').write_text(json.dumps(rejected,indent=2)+'\n')
key=lambda g:(g['date'][:10],abbr(g['away_team_id']),abbr(g['home_team_id']))
pkey=lambda g:(g['date'],g['away'],g['home']);pmap={pkey(g):g for g in pdf};dbmap={key(g):g for g in games};schedule_diff=[];tip_diff=[]
for k,g in dbmap.items():
 if k not in pmap:schedule_diff.append({'kind':'db_only_vs_aug13_pdf','date':k[0],'away':k[1],'home':k[2]});continue
 a=datetime.datetime.fromisoformat(g['tip_off_utc'].replace('Z','+00:00'));b=datetime.datetime.fromisoformat(pmap[k]['tip_utc']);delta=(a-b).total_seconds()/60
 if delta:tip_diff.append({'date':k[0],'away':k[1],'home':k[2],'stored_tip_utc':g['tip_off_utc'],'official_aug13_tip_utc':pmap[k]['tip_utc'],'difference_minutes':delta})
for k in pmap.keys()-dbmap.keys():schedule_diff.append({'kind':'pdf_only_vs_db','date':k[0],'away':k[1],'home':k[2]})
csvout('schedule-differences.csv',schedule_diff,['kind','date','away','home']);csvout('tip-differences.csv',tip_diff,['date','away','home','stored_tip_utc','official_aug13_tip_utc','difference_minutes'])
checks=[];mismatches=[];legs=[];candidates=[];teammonth=[];allgaps=[];awaypairs=[]
for t in teams:
 tid=t['id'];chain=sorted([g for g in active if tid in [g['home_team_id'],g['away_team_id']]],key=lambda g:(g['date'],g['id']));prev=None;road=0;inbound=[]
 for i,g in enumerate(chain):
  d=day(g['date']);recent=[x for x in chain[:i] if 0<(d-day(x['date'])).days<=30];since=(d-day(recent[-1]['date'])).days if recent else None;home=g['home_team_id']==tid and not g['neutral_site'];v=venue(g);origin=venue(prev) if prev else coord(tid);miles=distance(origin,v)
  if miles<1 or (prev and prev['home_team_id']==tid and not prev['neutral_site'] and home) or (not prev and home):miles=0
  road=0 if home else road+1
  leg={'game_id':g['id'],'date':g['date'][:10],'team':abbr(tid),'opponent':abbr(g['away_team_id'] if g['home_team_id']==tid else g['home_team_id']),'nominal_home':g['home_team_id']==tid,'neutral':g['neutral_site'],'neutral_city':g['neutral_venue_city'],'prior_date':prev['date'][:10] if prev else '', 'origin':prev['neutral_venue_city'] if prev and prev['neutral_site'] else abbr(prev['home_team_id']) if prev else abbr(tid),'destination':g['neutral_venue_city'] if g['neutral_site'] else abbr(g['home_team_id']),'origin_lat':origin[0],'origin_lon':origin[1],'destination_lat':v[0],'destination_lon':v[1],'leg_miles':round(miles,6),'gap_days':(d-day(prev['date'])).days if prev else None,'is_target':target(g)}
  legs.append(leg);inbound.append(miles)
  # Rolling means legs arriving at prior games dated D-7..D-1, plus tonight's leg.
  roll=miles+sum(inbound[j] for j,x in enumerate(chain[:i]) if 0<(d-day(x['date'])).days<=7)
  expected={'is_back_to_back':since==1,'is_three_in_four':1+sum(0<(d-day(x['date'])).days<4 for x in recent)>=3,'is_four_in_six':1+sum(0<(d-day(x['date'])).days<6 for x in recent)>=4,'days_since_last_game':since,'games_in_last_7_days':sum(0<(d-day(x['date'])).days<=7 for x in recent),'games_in_last_30_days':len(recent),'road_trip_consecutive_away':road,'travel_distance_miles':math.floor(roll+0.5)}
  if prev and (d-day(prev['date'])).days>=3:allgaps.append({**leg,**gap_tags(prev['date'][:10],g['date'][:10])})
  if prev and not home and not (prev['home_team_id']==tid and not prev['neutral_site']):
   via=distance(origin,coord(tid))+distance(coord(tid),v);prox,along=route_proximity(origin,v,coord(tid))
   awaypairs.append({**leg,'via_home_miles':round(via,6),'extra_via_home_miles':round(via-miles,6),'home_to_origin_miles':round(distance(origin,coord(tid)),6),'home_to_destination_miles':round(distance(coord(tid),v),6),'home_to_direct_route_miles':round(prox,6),'home_projected_along_route_miles':round(along,6),'via_home_to_direct_ratio':round(via/miles,6) if miles else None,'research_queue_gap_ge2_detour_le150':(d-day(prev['date'])).days>=2 and via-miles<=150,**gap_tags(prev['date'][:10],g['date'][:10])})
  if target(g):
   row={'game_id':g['id'],'date':g['date'][:10],'team':abbr(tid),**expected,'leg_miles':round(miles,6)};checks.append(row);stored=scores.get((g['id'],tid))
   if stored is None:mismatches.append({'game_id':g['id'],'date':g['date'][:10],'team':abbr(tid),'field':'missing_score','expected':True,'stored':None})
   else:
    for f,vv in expected.items():
     actual=float(stored[f]) if f=='travel_distance_miles' else stored[f]
     if actual!=vv:mismatches.append({'game_id':g['id'],'date':g['date'][:10],'team':abbr(tid),'field':f,'expected':vv,'stored':actual})
   if prev and not home and not (prev['home_team_id']==tid and not prev['neutral_site']) and (d-day(prev['date'])).days>=3:
    via=distance(origin,coord(tid))+distance(coord(tid),v);prox,along=route_proximity(origin,v,coord(tid));candidates.append({**leg,'kind':'away_away_gap_ge3','via_home_miles':round(via,6),'extra_via_home_miles':round(via-miles,6),'home_to_origin_miles':round(distance(origin,coord(tid)),6),'home_to_destination_miles':round(distance(coord(tid),v),6),'home_to_direct_route_miles':round(prox,6),'home_projected_along_route_miles':round(along,6),'via_home_to_direct_ratio':round(via/miles,6) if miles else None,**gap_tags(prev['date'][:10],g['date'][:10])})
   if prev and miles<100 and origin!=v:candidates.append({**leg,'kind':'local_leg_lt100','via_home_miles':'','extra_via_home_miles':'','home_to_origin_miles':'','home_to_destination_miles':'','home_to_direct_route_miles':'','home_projected_along_route_miles':'','via_home_to_direct_ratio':'',**gap_tags(prev['date'][:10],g['date'][:10])})
  prev=g
 for month in ['2026-10','2026-11','2026-12','2027-01','2027-02','2027-03','2027-04']:
  rows=[r for r in checks if r['team']==abbr(tid) and r['date'].startswith(month)];teammonth.append({'team':abbr(tid),'month':month,'games':len(rows),'b2b':sum(r['is_back_to_back'] for r in rows),'three_in_four':sum(r['is_three_in_four'] for r in rows),'four_in_six':sum(r['is_four_in_six'] for r in rows),'leg_miles':round(sum(r['leg_miles'] for r in rows),3),'rolling7_sum_NOT_season_miles':sum(r['travel_distance_miles'] for r in rows),'max_road_streak':max([r['road_trip_consecutive_away'] for r in rows],default=0)})
csvout('all-consecutive-away-pairs.csv',awaypairs);csvout('geography-research-queue.csv',[r for r in awaypairs if r['research_queue_gap_ge2_detour_le150']]);csvout('all-long-gaps.csv',allgaps);csvout('calendar-oracle.csv',checks);csvout('stored-mismatches.csv',mismatches,['game_id','date','team','field','expected','stored']);csvout('per-leg.csv',legs);csvout('travel-candidates.csv',candidates);csvout('team-month.csv',teammonth)
# Compare public actual date APIs against independent expected rows; preserve all differences.
bykey={(r['game_id'],r['team']):r for r in checks};api_diffs=[];api_counts=collections.Counter();api_errors=[]
for f in sorted((R/'api').glob('????-??-??.json')):
 try:data=json.loads(f.read_text())
 except Exception:api_errors.append(f.name);continue
 if isinstance(data,dict) and 'data' in data:data=data['data']
 if not isinstance(data,list):api_errors.append({'file':f.name,'body':str(data)[:200]});continue
 for g in data:
  for side in ['home','away']:
   team=g[side+'Team']['abbreviation'];expected=bykey.get((g['id'],team));fat=g[side+'Fatigue']
   if not expected:api_diffs.append({'date':f.stem,'game_id':g['id'],'team':team,'field':'unexpected_game','expected':'absent','actual':'present'});continue
   api_counts[team]+=1
   mapping={'isBackToBack':'is_back_to_back','is3In4':'is_three_in_four','is4In6':'is_four_in_six','travelDistanceMiles':'travel_distance_miles','gamesInLast7Days':'games_in_last_7_days','gamesInLast30Days':'games_in_last_30_days','roadTripConsecutiveAway':'road_trip_consecutive_away'}
   for field,oracle in mapping.items():
    if fat is None or fat[field]!=expected[oracle]:api_diffs.append({'date':f.stem,'game_id':g['id'],'team':team,'field':field,'expected':expected[oracle],'actual':fat[field] if fat else None})
   days=None if expected['days_since_last_game'] is None else max(0,expected['days_since_last_game']-1)
   if fat is not None and fat['daysRest']!=days:api_diffs.append({'date':f.stem,'game_id':g['id'],'team':team,'field':'daysRest','expected':days,'actual':fat['daysRest']})
csvout('api-mismatches.csv',api_diffs,['date','game_id','team','field','expected','actual'])
# ESPN is a second current feed, not independent NBA authority. Full date coverage includes preseason/Jan context.
espn={};missingdays=[];et=ZoneInfo('America/New_York')
for date in [datetime.date(2026,9,1)+datetime.timedelta(days=i) for i in range(242)]:
 f=R/'espn'/f'{date.isoformat()}.json'
 if not f.exists():missingdays.append(str(date));continue
 try:data=json.loads(f.read_text())
 except Exception:missingdays.append(str(date));continue
 if 'events' not in data:missingdays.append(str(date));continue
 for ev in data['events']:
  if ev.get('season',{}).get('type')!=2 or ev.get('season',{}).get('year')!=2027:continue
  c=ev['competitions'][0];comp={x['homeAway']:x for x in c['competitors']}
  norm=lambda a:{'GS':'GSW','NY':'NYK','NO':'NOP','SA':'SAS','UTAH':'UTA','WSH':'WAS'}.get(a,a)
  h=norm(comp.get('home',{}).get('team',{}).get('abbreviation','TBD'));a=norm(comp.get('away',{}).get('team',{}).get('abbreviation','TBD'))
  tip=c['date'];d=datetime.datetime.fromisoformat(tip.replace('Z','+00:00')).astimezone(et).date().isoformat()
  espn[(d,a,h)]={'id':ev['id'],'date':d,'away':a,'home':h,'tip':tip,'neutral':c.get('neutralSite'),'venue':c.get('venue',{}),'status':c.get('status',{}),'placeholder':'TBD' in [a,h]}
venue_rows=[];espn_diff=[]
venue_majority={}
for tid in td:
 ids=[e['venue'].get('id') for k,e in espn.items() if k in dbmap and dbmap[k]['home_team_id']==tid and not dbmap[k]['neutral_site'] and e['venue'].get('id')]
 if ids:venue_majority[tid]=collections.Counter(ids).most_common(1)[0][0]
for k,g in dbmap.items():
 if not '2026-10-01'<=k[0]<='2027-04-30':continue
 if k not in espn:espn_diff.append({'date':k[0],'away':k[1],'home':k[2],'field':'missing_espn_fixture','stored':g['external_id'],'provider':None});continue
 e=espn[k]
 venue_rows.append({'date':k[0],'game_id':g['id'],'away':k[1],'home':k[2],'venue_id':e['venue'].get('id'),'venue_name':e['venue'].get('fullName'),'venue_city':e['venue'].get('address',{}).get('city'),'provider_neutral':e['neutral'],'stored_neutral':g['neutral_site'],'stored_neutral_city':g['neutral_venue_city'],'minority_home_venue':e['venue'].get('id')!=venue_majority.get(g['home_team_id']),'status':e['status'].get('type',{}).get('name')})
 if g['external_id']!='espn-'+e['id']:espn_diff.append({'date':k[0],'away':k[1],'home':k[2],'field':'external_id','stored':g['external_id'],'provider':'espn-'+e['id']})
 for field,a,b in [('neutral_site',g['neutral_site'],e['neutral']),('tip_off_utc',datetime.datetime.fromisoformat(g['tip_off_utc'].replace('Z','+00:00')),datetime.datetime.fromisoformat(e['tip'].replace('Z','+00:00')))]:
  if a!=b:espn_diff.append({'date':k[0],'away':k[1],'home':k[2],'field':field,'stored':str(a),'provider':str(b)})
for k,e in espn.items():
 if k not in dbmap and not e['placeholder']:espn_diff.append({'date':k[0],'away':k[1],'home':k[2],'field':'espn_only_fixture','stored':None,'provider':e['id']})
csvout('current-provider-venues.csv',venue_rows);csvout('espn-differences.csv',espn_diff,['date','away','home','field','stored','provider']);(R/'espn-normalized.json').write_text(json.dumps(list(espn.values()),indent=2)+'\n')
teamseason=[]
impact=load('score-diagnostic.json')['impact'] if (P/'score-diagnostic.json').exists() else []
homefeatures=load('home-stand-feature-mismatches.json') if (P/'home-stand-feature-mismatches.json').exists() else []
for t in teams:
 ab=t['abbreviation'];rr=[r for r in checks if r['team']==ab];ll=[r for r in legs if r['team']==ab];pairs=[r for r in awaypairs if r['team']==ab]
 teamseason.append({'team':ab,'assigned_games':len(rr),'b2b':sum(r['is_back_to_back']for r in rr),'three_in_four':sum(r['is_three_in_four']for r in rr),'four_in_six':sum(r['is_four_in_six']for r in rr),'mileage_once_counted_arena_legs':round(sum(r['leg_miles']for r in rr),3),'rolling7_sum_NOT_season_mileage':sum(r['travel_distance_miles']for r in rr),'maximum_inbound_leg_miles':max(r['leg_miles']for r in rr),'maximum_rolling7_miles':max(r['travel_distance_miles']for r in rr),'zero_legs':sum(r['leg_miles']==0 for r in rr),'local_nonzero_legs_lt100':sum(0<r['leg_miles']<100 for r in rr),'max_current_away_streak':max(r['road_trip_consecutive_away']for r in rr),'stored_homecoming_streak_mismatches':sum(r['team']==ab and r['field']=='road_trip_consecutive_away'for r in mismatches),'homecoming_positive_road_load_games':sum(r['team']==ab for r in impact),'homestand_feature_mismatches':sum(r['team']==ab for r in homefeatures),'long_away_gaps_ge3':sum(r['gap_days']>=3 for r in pairs),'all_consecutive_away_pairs':len(pairs),'geography_research_queue_gap_ge2_detour_le150':sum(r['research_queue_gap_ge2_detour_le150']for r in pairs)})
csvout('team-season.csv',teamseason)
summary={'snapshot':load('capture-metadata.json'),'scope':{'all_season_games':len(games),'assigned_season_games':sum(target(g) for g in games),'assigned_season_team_games':len(checks),'assigned_season_dates':len(set(r['date'] for r in checks)),'held':len([g for g in games if g['status'] in ['postponed','cancelled']]),'neutral':len([g for g in games if g['neutral_site']]),'statuses':dict(collections.Counter(g['status'] for g in games)),'external_id_duplicate_count':len(games)-len(set(g['external_id'] for g in games)),'team_date_double_bookings':sum(v>1 for v in collections.Counter((g['date'],tid) for g in games for tid in [g['home_team_id'],g['away_team_id']]).values()),'team_game_count_distribution':dict(collections.Counter(collections.Counter(tid for g in games for tid in [g['home_team_id'],g['away_team_id']]).values())),'context_game_types':dict(collections.Counter(g['game_type'] for g in load('context.json'))),'context_date_min':min(g['date'] for g in load('context.json'))},'pdf':{'parsed':len(pdf),'unparsed':rejected,'fixture_differences':len(schedule_diff),'tip_differences':len(tip_diff),'tip_differences_assigned_season':sum('2026-10-01'<=r['date']<='2027-04-30' for r in tip_diff)},'calendar_stored':{'field_comparisons':len(checks)*8,'differences':len(mismatches),'by_field':dict(collections.Counter(r['field'] for r in mismatches))},'totals':{f:sum(r[f] for r in checks) for f in ['is_back_to_back','is_three_in_four','is_four_in_six','leg_miles']},'month':{m:{'games':sum(r['games'] for r in teammonth if r['month']==m)//2,'b2b':sum(r['b2b'] for r in teammonth if r['month']==m),'three_in_four':sum(r['three_in_four'] for r in teammonth if r['month']==m),'four_in_six':sum(r['four_in_six'] for r in teammonth if r['month']==m),'leg_miles':round(sum(r['leg_miles'] for r in checks if r['date'].startswith(m)),6)}for m in ['2026-10','2026-11','2026-12','2027-01','2027-02','2027-03','2027-04']},'legs':{'count':len(legs),'all_consecutive_away_pairs':len(awaypairs),'geography_research_queue_gap_ge2_detour_le150':sum(r['research_queue_gap_ge2_detour_le150']for r in awaypairs),'long_team_gaps_ge3':len(allgaps),'long_away_gaps_all_star_overlap':sum(r['gap_days']>=3 and r['all_star_break_overlap'] for r in awaypairs),'max_target':max([r for r in legs if r['is_target']],key=lambda r:r['leg_miles']),'target_zero':sum(r['is_target'] and r['leg_miles']==0 for r in legs),'away_gap_candidates':sum(r['kind']=='away_away_gap_ge3' for r in candidates),'local_candidates':sum(r['kind']=='local_leg_lt100' for r in candidates),'away_gap_candidates_cup_tbd_overlap':sum(r['kind']=='away_away_gap_ge3' and r['cup_tbd_window_overlap'] for r in candidates)},'api':{'team_games_compared':sum(api_counts.values()),'by_team':dict(api_counts),'differences':len(api_diffs),'errors':api_errors},'espn':{'regular_fixtures_in_context':sum(not e['placeholder'] for e in espn.values()),'placeholders':sum(e['placeholder'] for e in espn.values()),'missing_dates':missingdays,'differences':len(espn_diff),'venue_rows':len(venue_rows),'venue_missing':sum(not r['venue_id'] for r in venue_rows),'distinct_venue_ids':len(set(r['venue_id']for r in venue_rows)),'minority_home_venue_rows':sum(r['minority_home_venue']for r in venue_rows)}}
save('numeric-summary.json',summary);print(json.dumps(summary,indent=2))
