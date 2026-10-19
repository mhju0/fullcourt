"""Archive primary source pages used for corroboration (read only)."""
import concurrent.futures as cf,gzip,hashlib,json,urllib.request
from pathlib import Path
from datetime import datetime,timezone
RAW=Path('docs/audit/2026-10-20-historical-audit/venues')
SOURCES=[
 ('raptors-team-tampa','https://www.nba.com/raptors/toronto-raptors-to-play-2020-21-season-in-tampa','TOR2020-21temporarybase; URL may redirect/block'),
 ('raptors-full-season','https://www.nba.com/news/raptors-to-finish-2020-21-season-in-tampa','TORall2020-21homegamesTampa'),
 ('katrina-team','https://www.nba.com/pelicans/news/the_hornets__hurricane_katr_2010_08_26.html','3NewOrleans2005-06,6NewOrleans2006-07'),
 ('norman-2006','https://www.nba.com/game/sac-vs-nok-0020500518','2006-01-13Norman'),
 ('hartford-1995','https://www.nba.com/game/orl-vs-bos-0029400699','1995-02-23Hartford'),
 ('hartford-1986','https://www.nba.com/news/history-this-date-in-nba-dec','1986-12-02Hartford'),
 ('baltimore-1997','https://www.nba.com/game/njn-vs-was-0029600707/box-score','1997-02-14Baltimore'),
 ('global-japan','https://www.nba.com/news/history-this-date-in-nba-nov','1990Tokyo1992Yokohama1994Yokohama1999Tokyo'),
 ('london-list','https://www.nba.com/news/nba-london-game-2026-everything-to-know','2011andlaterLondonhistory'),
 ('mexico-history','https://www.nba.com/news/looking-back-at-the-history-of-nba-mexico-games','1997MexicoCityregularseason'),
 ('spurs-2025','https://pr.nba.com/2024-25-nba-regular-season-schedule/','2025-02-20MoodyCenterAustin'),
 ('provider-error-boston','https://www.nba.com/game/was-vs-bos-0021000160/play-by-play','TDGardenBostoncontradictsESPNOrlando'),
 ('sf-city-report','https://sfocii.org/sites/default/files/inline-files/Vol%201_GSW_MB_DSEIR.pdf','Officialcityenvironmentalreport1996-97SanJose'),
 ('tacoma-nba-game','https://www.nba.com/game/lal-vs-sea-0049400021','1995-04-27TacomaDome'),
]
def capture(s):
 name,url,support=s;p=RAW/f'source-{name}.gz'
 try:
  with urllib.request.urlopen(url,timeout=25)as r:b=r.read();final=r.url
  p.write_bytes(gzip.compress(b,mtime=0));return {'name':name,'url':url,'final_url':final,'support':support,'file':p.name,'bytes':len(b),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'uncompressed_sha256':hashlib.sha256(b).hexdigest(),'captured_at_utc':datetime.now(timezone.utc).isoformat()}
 except Exception as e:return {'name':name,'url':url,'support':support,'error':str(e),'web_tool_read':'See VENUE_AUDIT.md citations; failed raw fetch does not claim archived body'}
if __name__=='__main__':
 with cf.ThreadPoolExecutor(max_workers=6)as ex:rs=list(ex.map(capture,SOURCES))
 Path(__file__).with_name('primary-source-manifest.json').write_text(json.dumps(rs,indent=2)+'\n');print([(r['name'],r.get('error',r.get('bytes')))for r in rs])
