import csv,json,gzip,logging
from pathlib import Path
logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
logger=logging.getLogger(__name__)
ROOT=Path(__file__).resolve().parents[2]
A=ROOT/'docs/research/2026-10-20-historical-audit'
def rows(p): return list(csv.DictReader(p.open()))
patches={}
def add(r,field,before,after,source):
 key=f"{r['date']}:{r['home']}:{r['away']}"
 p=patches.setdefault(key,dict(date=r['date'],homeAbbr=r['home'],awayAbbr=r['away'],auditGameId=int(r['game_id']),fields={},sources=[]))
 if field in p['fields'] and p['fields'][field]!={'before':before,'after':after}:raise ValueError(key)
 p['fields'][field]={'before':before,'after':after}
 if source not in p['sources']:p['sources'].append(source)
for f in [A/'sources/known-overtime-defaults.csv',A/'sources/supplement/known-overtime-defaults.csv']:
 for r in rows(f):add(r,'overtimePeriods',int(r['stored_ot']),int(r['source_ot']),str(f.relative_to(ROOT)))
for r in rows(A/'sources/finals-type-mismatches.csv'):add(r,'gameType',r['stored_type'],r['verified_type'],r['authority'])
for r in rows(A/'venues/corroborated-venue-cases.csv'):
 if r['category'] in ['PRE2013_NEUTRAL','MISSED_NEUTRAL']:
  add(r,'neutralSite',False,True,r['evidence']);add(r,'neutralVenueCity',None,r['actual_city'],r['evidence'])
# IDs asserted against fresh capture during manifest preparation; registry identity survives re-key.
raw=ROOT/'docs/audit/2026-10-20-historical-audit/snapshot/games.jsonl.gz'
games=[json.loads(s) for s in gzip.decompress(raw.read_bytes()).decode().splitlines()]
teams=[json.loads(s) for s in gzip.decompress((raw.parent/'teams.jsonl.gz').read_bytes()).decode().splitlines()]
ab={t['id']:t['abbreviation'] for t in teams}
for date,home,away,before,after,source in [('2026-10-23','MIL','CHI','2026-10-24T00:00:00.000Z','2026-10-23T20:00:00.000Z','https://www.nba.com/news/milwaukee-bucks-move-home-opener-world-series'),('2026-10-24','ATL','HOU','2026-10-25T00:00:00.000Z','2026-10-25T00:30:00.000Z','https://www.statefarmarena.com/news/detail/joint-statement-from-the-atlanta-dream-and-atlanta-hawks')]:
 matches=[g for g in games if g['date']==date and ab[g['home_team_id']]==home and ab[g['away_team_id']]==away]
 assert len(matches)==1
 add(dict(date=date,home=home,away=away,game_id=matches[0]['id']),'tipOffUtc',before,after,source)
bubble=[g for g in games if g['season']=='2019-20' and '2020-07-30'<=g['date']<='2020-10-11']
assert len(bubble)==171
for g in bubble:
 assert g['neutral_site'] is False and g['neutral_venue_city'] is None
 r=dict(date=g['date'],home=ab[g['home_team_id']],away=ab[g['away_team_id']],game_id=g['id'])
 source='https://www.nba.com/news/nba-nbpa-finalize-season-comeback-official-release'
 add(r,'neutralSite',False,True,source)
 add(r,'neutralVenueCity',None,'Orlando',source)
out=ROOT/'src/data/game-input-corrections.json'
out.write_text(json.dumps(dict(version=1,approvedScope='Verified OT, postseason sublabels, genuine neutral flags/cities, and two confirmed future tips; no disputed scores, unknown tips, or inferred Detroit fixtures.',fixtures=sorted(patches.values(),key=lambda p:(p['date'],p['homeAbbr'],p['awayAbbr']))),indent=2)+'\n')
logger.info('%s', {f:sum(f in p['fields'] for p in patches.values()) for f in ['overtimePeriods','gameType','neutralSite','neutralVenueCity','tipOffUtc']})
# Coordinates are building/arena feature points; event sources establish dates independently.
# Map references are separated from event authority to preserve their confidence boundary.
locations={
'HARTFORD':('Hartford Civic Center',41.76843,-72.67676,'https://mapcarta.com/22017282','https://uconnhuskies.com/documents/download/2018/10/17/2018_2019_Women_s_Basketball_XL_Visiting_Team_Guide.pdf'),
'TACOMA':('Tacoma Dome',47.23690,-122.42695,'https://mapcarta.com/W32660308','https://www.tacomadome.org/plan-your-visit/directions-parking'),
'SAN_JOSE':('San Jose Arena',37.33286,-121.90132,'https://mapcarta.com/26611640','https://www.sapcenter.com/plan-your-visit/directions-parking'),
'TAMPA':('Amalie Arena',27.94270,-82.45189,'https://mapy.com/en/?id=1088281291&source=osm','https://www.nba.com/raptors/raptors-announce-2020-21-first-half-schedule'),
'AUSTIN':('Moody Center',30.28098,-97.73065,'https://mapcarta.com/W953200132','https://moodycenteratx.com/plan-your-trip/'),
'BALTIMORE':('Baltimore Arena',39.28848,-76.61870,'https://mapcarta.com/W337906758','https://www.cfgbankarena.com/plan-your-visit/'),
'TokyoGym':('Tokyo Metropolitan Gymnasium',35.67977,139.71252,'https://mapcarta.com/W153182207','https://www.tef.or.jp/tmg/access.html'),
'TokyoDome':('Tokyo Dome',35.70551,139.75197,'https://mapcarta.com/29355332','https://www.tokyo-dome.co.jp/en/dome/access/?lang=en'),
'Yokohama':('Yokohama Arena',35.51227,139.62019,'https://mapcarta.com/W123630243','https://www.yokohama-arena.co.jp/en/access/'),
'Saitama':('Saitama Super Arena',35.89495,139.63097,'https://mapcarta.com/34400924','https://www.saitama-arena.co.jp/e/access/car.html'),
'MexicoOld':('Palacio de los Deportes',19.40493,-99.09951,'https://mapcarta.com/35467796','https://www.palaciodelosdeportes.mx/como-llegar'),
'MexicoNew':('Arena Ciudad de Mexico',19.49765,-99.17520,'https://mapcarta.com/es/W284698840','https://pr.nba.com/nba-mexico-city-game-to-return-with-regular-season-matchup-featuring-san-antonio-spurs-and-miami-heat-on-dec-17/'),
'London':('The O2 Arena',51.50293,0.00318,'https://mapcarta.com/de/W161559801','https://www.theo2.co.uk/m/visit-us/maps'),
'Las Vegas':('T-Mobile Arena',36.1028,-115.1783,'https://www.t-mobilearena.com/plan-your-visit/directions-parking','https://statsdmz.nba.com/pdfs/20231207/20231207_INDMIL_book.pdf'),
'New Orleans':('New Orleans Arena',29.94906,-90.08217,'https://mapcarta.com/W328774581','https://ak-static-int.nba.com/wp-content/uploads/sites/3/2016/10/2016-17-Media-Guide-Pelicans.pdf'),
'Baton Rouge':('Pete Maravich Assembly Center',30.41448,-91.18449,'https://mapcarta.com/21010772','https://ak-static-int.nba.com/wp-content/uploads/sites/3/2016/10/2016-17-Media-Guide-Pelicans.pdf'),
'Norman':('Lloyd Noble Center',35.18703,-97.44427,'https://mapcarta.com/W162153700','https://ak-static-int.nba.com/wp-content/uploads/sites/3/2016/10/2016-17-Media-Guide-Pelicans.pdf'),
'ANAHEIM1992':('Anaheim Convention Center',33.80057,-117.92072,'https://mapcarta.com/22993306','https://www.nba.com/lakers/news/161021-lakers-history-orange-county'),
'ANAHEIM':('Arrowhead Pond of Anaheim',33.80778,-117.87654,'https://mapcarta.com/26611642','https://www.nba.com/lakers/news/161021-lakers-history-orange-county'),
}
austin={'2023-04-06':'https://statsdmz.nba.com/pdfs/20230406/20230406_PORSAS_book.pdf','2023-04-08':'https://www.nba.com/game/min-vs-sas-0022201214','2024-03-15':'https://www.nba.com/news/spurs-victor-wembanyama-austin-community','2024-03-17':'https://www.nba.com/game/bkn-vs-sas-0022300981/box-score','2025-02-20':'https://statsdmz.nba.com/pdfs/20250220/20250220_PHXSAS_book.pdf','2025-02-21':'https://statsdmz.nba.com/pdfs/20250221/20250221_DETSAS_book.pdf','2026-02-19':'https://statsdmz.nba.com/pdfs/20260219/20260219_PHXSAS_book.pdf','2026-02-21':'https://statsdmz.nba.com/pdfs/20260221/20260221_SACSAS_book.pdf'}
fixtures=[]
for r in rows(A/'venues/corroborated-venue-cases.csv'):
 category=r['category'];key=category
 if category=='KATRINA_MINOR':key=r['actual_city']
 if category in ['PRE2013_NEUTRAL','MISSED_NEUTRAL']:
  key=r['actual_city']
  if key=='Tokyo':key='TokyoGym' if r['date']<'1991' else 'TokyoDome'
  if key=='Mexico City':key='MexicoOld' if r['date']<'2000' else 'MexicoNew'
 if category=='ANAHEIM' and r['date'].startswith('1992'):key='ANAHEIM1992'
 name,lat,lon,mapurl,operator=locations[key]
 sources=[r['evidence'],operator,mapurl]
 if category=='AUSTIN':sources.insert(0,austin.get(r['date'],'https://www.nba.com/spurs/schedule'))
 if key=='TokyoDome':sources.insert(0,'https://www.nba.com/game/min-vs-sac-0029900034' if r['date']>'1997' else 'https://cdn.nba.com/teams/uploads/sites/1610612753/2022/11/orlando-magic-media-guide-2022-23.pdf')
 fixtures.append(dict(date=r['date'],homeAbbr=r['home'],awayAbbr=r['away'],auditGameId=int(r['game_id']),arena=name,city=r['actual_city'],latitude=lat,longitude=lon,altitude=r['actual_city']=='Mexico City',neutral=category in ['PRE2013_NEUTRAL','MISSED_NEUTRAL'],sourceUrls=list(dict.fromkeys(sources)),coverage=('primary dated event' if category in ['AUSTIN','PRE2013_NEUTRAL','MISSED_NEUTRAL'] else r['confidence'])+'; coordinate is mapped arena feature estimate, not surveyed precision'))
(ROOT/'src/data/fixture-venue-corrections.json').write_text(json.dumps(dict(version=1,fixtures=fixtures),indent=2)+'\n')
assert len(fixtures)==167
logger.info('%s', {'physicalVenueFixtures':len(fixtures),'neutral':sum(f['neutral'] for f in fixtures)})
