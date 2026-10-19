"""Freeze four reviewed omissions from authentic archive/scoreboards; never infer unknown fixtures."""
import csv,gzip,hashlib,json,logging
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
logger=logging.getLogger(__name__)
ROOT=Path(__file__).resolve().parents[2]
raw=ROOT/'docs/audit/2026-10-20-historical-audit/sources'
out=ROOT/'docs/audit/history-recalculation/added-fixtures'
inputs=ROOT/'src/data/game-input-corrections.json'
venues=ROOT/'src/data/fixture-venue-corrections.json'
added=[]
for year,gid,date,home,away,hs,aws in [(2020,'0051900111','2020-08-15','POR','MEM',126,122),(2024,'0062300001','2023-12-09','LAL','IND',123,109),(2025,'0062400001','2024-12-17','OKC','MIL',81,97),(2026,'0062500001','2025-12-16','NYK','SAS',124,113)]:
 archive=raw/f'nba_schedule_{year}.csv.gz'
 records=list(csv.DictReader(gzip.decompress(archive.read_bytes()).decode().splitlines()))
 matches=[r for r in records if r['game_id']==gid]
 assert len(matches)==1
 r=matches[0]
 assert (r['game_date'],r['home_team_abbreviation'],r['away_team_abbreviation'],int(r['home_pts']),int(r['away_pts']))==(date,home,away,hs,aws)
 path=(ROOT/'ml/data/officials/sb-20200815.json')if year==2020 else out/f'espn-{date.replace("-","")}.json'
 sb=json.loads(path.read_text());events=[e for e in sb['events']if e['name'].startswith({'MEM':'Memphis','IND':'Indiana','MIL':'Milwaukee','SAS':'San Antonio'}[away])]
 assert len(events)==1
 e=events[0];c=e['competitions'][0];sides={t['homeAway']:t for t in c['competitors']}
 aliases={'NY':'NYK','SA':'SAS','GS':'GSW','NO':'NOP','WSH':'WAS','UTAH':'UTA'}
 canonical=lambda side:aliases.get(sides[side]['team']['abbreviation'],sides[side]['team']['abbreviation'])
 assert (canonical('home'),canonical('away'))==(home,away)
 assert datetime.fromisoformat(e['date'].replace('Z','+00:00')).astimezone(ZoneInfo('America/New_York')).date().isoformat()==date
 assert (int(sides['home']['score']),int(sides['away']['score']))==(hs,aws)
 assert c['status']['type']['completed'] and c['status']['type']['name']=='STATUS_FINAL'
 periods=c['status']['period'];assert periods==4
 for t in sides.values():
  assert [p['period'] for p in t['linescores']]==[1,2,3,4]
  assert sum(p['value']for p in t['linescores'])==int(t['score'])
 cup=gid.startswith('006');pdf=f'https://statsdmz.nba.com/pdfs/{date.replace("-","")}/{date.replace("-","")}_{away}{home}_book.pdf'
 added.append(dict(date=date,homeAbbr=home,awayAbbr=away,externalId=gid,season=f'{year-1}-{str(year)[-2:]}',gameType='cup_final'if cup else'play_in',homeScore=hs,awayScore=aws,status='final',overtimePeriods=0,tipOffUtc=e['date'],neutralSite=True,neutralVenueCity='Las Vegas'if cup else'Orlando',arena='T-Mobile Arena'if cup else'The Field House',latitude=36.1028 if cup else 28.33724,longitude=-115.1783 if cup else-81.55725,altitude=False,sources=[f'https://www.nba.com/game/{away.lower()}-vs-{home.lower()}-{gid}',pdf,f'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates={date.replace("-","")}',str(archive.relative_to(ROOT))],capturedSources=[dict(path=str(p.relative_to(ROOT)),sha256=hashlib.sha256(p.read_bytes()).hexdigest())for p in[archive,path]],evidence='NBA canonical archive identity/results; official scorer gamebook venue/four periods (2024 gamebook unavailable, official NBA summary venue plus ESPN numbered line scores); scoreboard scheduled tip instant. Bubble gamebook says The Field House; provider neutral=false is corrected to physical neutral.'))
data=json.loads(inputs.read_text());data['addedFixtures']=added;inputs.write_text(json.dumps(data,indent=2)+'\n')
data=json.loads(venues.read_text());data['fixtures']=[r for r in data['fixtures']if r.get('coverage')!='reviewed omitted physical fixture; approximate mapped arena feature']
for r in added:
 data['fixtures'].append({k:r[k]for k in['date','homeAbbr','awayAbbr','arena','latitude','longitude','altitude']}|dict(city=r['neutralVenueCity'],neutral=True,sourceUrls=r['sources']+(['https://mapcarta.com/W1450994107','https://cdn2.parksmedia.wdprapps.disney.com/media/espnwwos/pdf/ESPN_0425_Wayfinder.pdf']if r['gameType']=='play_in'else['https://www.t-mobilearena.com/plan-your-visit/directions-parking']),coverage='reviewed omitted physical fixture; approximate mapped arena feature'))
venues.write_text(json.dumps(data,indent=2)+'\n')
logger.info('%s', {'reviewedAdditions':len(added),'physicalVenueRegistry':len(data['fixtures'])})
