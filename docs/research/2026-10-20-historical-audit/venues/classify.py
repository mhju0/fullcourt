"""Bounded corroborated case register and affected adjacent team-game contexts."""
exec(open('docs/research/2026-10-20-historical-audit/venues/inventory.py').read().split('provider=C.defaultdict')[0])
INV={int(r['game_id']):r for r in csv.DictReader((RAW/'all-game-venue-inventory.csv').open())}
CASES={}
def add(g,category,city,evidence,confidence='primary actual venue / official whole-season statement'):
 CASES[g['id']]={'game_id':g['id'],'date':g['date'],'season':g['season'],'game_type':g['game_type'],'home':AB[g['home_team_id']],'away':AB[g['away_team_id']],'category':category,'actual_city':city,'current_model_city':INV[g['id']]['model_city'],'stored_neutral_site':g['neutral_site'],'stored_neutral_venue_city':g['neutral_venue_city'],'evidence':evidence,'confidence':confidence,'physical_home_semantics':'home-designated local/temporary home, not automatically neutral'if category in('TAMPA','KATRINA_MINOR','SAN_JOSE','AUSTIN','HARTFORD','BALTIMORE','TACOMA','ANAHEIM')else'genuine neutral event'}
for g in G:
 h=AB[g['home_team_id']];d=g['date'];vs=json.loads(INV[g['id']]['espn_venues'])
 if h=='OKC'and g['season']=='1994-95':add(g,'TACOMA','Tacoma','https://seattle.gov/documents/departments/council/committees/centralstaff/key-arena-report-june-2015.pdf','primary city report confirms temporary season venue; individual fixture inferred from whole-season statement')
 if h=='LAC'and d in('1992-05-03','1997-02-04','1998-03-12','1999-02-25'):add(g,'ANAHEIM','Anaheim','https://www.nba.com/lakers/news/161021-lakers-history-orange-county','primary team history plus frozen game/opponent identity; 1992 playoff and Lakers 1997-99 subset')
 if h=='TOR'and g['season']=='2020-21':add(g,'TAMPA','Tampa','https://www.nba.com/news/raptors-to-finish-2020-21-season-in-tampa')
 if h=='GSW'and g['season']=='1996-97':add(g,'SAN_JOSE','San Jose','https://sfocii.org/sites/default/files/inline-files/Vol%201_GSW_MB_DSEIR.pdf')
 if h=='NOP'and '2005-07-01'<=d<'2007-07-01'and any(c=='New Orleans'for v,c in vs):add(g,'KATRINA_MINOR','New Orleans','https://www.nba.com/pelicans/news/the_hornets__hurricane_katr_2010_08_26.html')
 if h=='NOP'and d=='2005-12-16':add(g,'KATRINA_MINOR','Baton Rouge','https://www.nba.com/game/phx-vs-nok-0020500329/box-score')
 if h=='NOP'and d=='2006-01-13':add(g,'KATRINA_MINOR','Norman','https://www.nba.com/game/sac-vs-nok-0020500518')
 if h=='SAS'and any(c=='Austin'for v,c in vs):add(g,'AUSTIN','Austin','https://www.nba.com/spurs/schedule','official current schedule + ESPN; older eight partly corroborated by team 2023 and league 2025 announcements; exact primary per-date revisit pending')
 if g['id']==11144:add(g,'MISSED_NEUTRAL','Mexico City','https://pr.nba.com/nba-mexico-city-game-to-return-with-regular-season-matchup-featuring-san-antonio-spurs-and-miami-heat-on-dec-17/')
 if g['id']in(923,924):add(g,'MISSED_NEUTRAL','Las Vegas','https://statsdmz.nba.com/pdfs/20231207/20231207_'+('INDMIL'if g['id']==923 else'NOPLAL')+'_book.pdf')
 if h=='BOS'and d in('1986-12-02','1995-02-23'):add(g,'HARTFORD','Hartford','https://www.nba.com/news/history-this-date-in-nba-dec'if d=='1986-12-02'else'https://www.nba.com/game/orl-vs-bos-0029400699')
 if h=='WAS'and d=='1997-02-14':add(g,'BALTIMORE','Baltimore','https://www.nba.com/game/njn-vs-was-0029600707/box-score')
 # Actual event pair and venue are corroborated by league/team history, not the ESPN flag.
 pairs=[(('PHX','UTA'),('1990-11-02','1990-11-03'),'Tokyo'),(('HOU','OKC'),('1992-11-06','1992-11-07'),'Yokohama'),(('LAC','POR'),('1994-11-04','1994-11-05'),'Yokohama'),(('BKN','ORL'),('1996-11-07','1996-11-08'),'Tokyo'),(('MIN','SAC'),('1999-11-05','1999-11-06'),'Tokyo'),(('LAC','OKC'),('2003-10-30','2003-10-31'),'Saitama'),(('TOR','BKN'),('2011-03-04','2011-03-05'),'London'),(('DAL','HOU'),('1997-12-06',),'Mexico City')]
 for teams,dates,city in pairs:
  if d in dates and set((h,AB[g['away_team_id']]))==set(teams):
   evidence='https://www.nba.com/news/history-this-date-in-nba-nov'
   if city=='Saitama':evidence='https://www.nba.com/game/lac-vs-sea-0020300015'
   if city=='London':evidence='https://www.nba.com/news/nba-london-game-2026-everything-to-know'
   if d.startswith('1997'):evidence='https://www.nba.com/news/history-this-date-in-nba-june'
   if d.startswith('1996'):evidence='https://www.nba.com/magic/news/orlando-magic-utah-jazz-postgame-story-recap-20211107'
   add(g,'PRE2013_NEUTRAL',city,evidence)
dump('corroborated-venue-cases.csv',list(CASES.values()))
# Every affected fixture has inbound and next-game contexts for BOTH teams. Context exposure does
# not assert a numeric error: same-arena/home-home branches can suppress a changed coordinate.
chain=C.defaultdict(list)
for g in G:
 for tid in(g['home_team_id'],g['away_team_id']):chain[(g['season'],tid)].append(g)
context=[]
for(season,tid),gs in chain.items():
 gs.sort(key=lambda g:(g['date'],g['id']))
 for i,g in enumerate(gs):
  if g['id']not in CASES:continue
  a=gs[i-1]if i else None;b=gs[i+1]if i+1<len(gs)else None
  context.append({'case_game_id':g['id'],'category':CASES[g['id']]['category'],'team':AB[tid],'season':season,'from_game_id':a['id']if a else'','from_date':a['date']if a else'','case_date':g['date'],'next_game_id':b['id']if b else'','next_date':b['date']if b else'','actual_case_city':CASES[g['id']]['actual_city'],'exposure':'inbound to case and outbound to next scheduled game; rolling7 and road/circadian features may propagate further; no rescore performed'})
dump('affected-adjacent-team-legs.csv',context)
# Broader confirmed era omission, but do not claim each fixture individually venue-verified.
eras=[]
for h,start,end,arena,city,src in [('DET','1985-07-01','1988-07-01','Pontiac Silverdome','Pontiac','https://www.nba.com/news/pistons-former-arena-palace-torn-down'),('DET','1988-07-01','2017-07-01','Palace of Auburn Hills','Auburn Hills','https://www.nba.com/news/pistons-former-arena-palace-torn-down')]:
 for g in G:
  if AB[g['home_team_id']]==h and start<=g['date']<end and not g['neutral_site']:
   eras.append({'game_id':g['id'],'date':g['date'],'season':g['season'],'home':h,'away':AB[g['away_team_id']],'era_arena':arena,'era_city':city,'confidence':'primary era known; individual venue inferred; alternate-site exceptions may remain','source':src})
dump('confirmed-era-individual-venue-inferences.csv',eras)
# BRef alternate sites are secondary-only candidates except separately corroborated dates.
secondary=[]
for r in INV.values():
 if any(w in r['bref_arenas']for w in('Hartford','Baltimore','Anaheim','Tacoma')):
  secondary.append({k:r[k]for k in('game_id','date','season','home','away','bref_arenas','bref_remarks','bref_source_files')}|{'status':'primary corroborated'if int(r['game_id'])in CASES else'secondary candidate; not individually primary-verified'})
dump('secondary-alternate-venue-candidates.csv',secondary)
counts=C.Counter(x['category']for x in CASES.values());summary={'corroborated_case_register_games':len(CASES),'case_categories':dict(counts),'case_side_adjacent_contexts':len(context),'confirmed_era_individual_inferences':len(eras),'secondary_alternate_candidates':len(secondary),'strict_primary_confirmed_excluding_austin_partly_verified':len(CASES)-counts['AUSTIN']}
(OUT/'case-summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(summary)

coverage=list(csv.DictReader((OUT/"season-venue-coverage.csv").open()))
for r in coverage:
 r["corroborated_case_register_games"]=sum(x["season"]==r["season"]for x in CASES.values());r["case_categories"]=";".join(sorted({x["category"]for x in CASES.values()if x["season"]==r["season"]}))
dump("season-venue-coverage.csv",coverage)
