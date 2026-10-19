"""Read-only public-provider venue capture; run from repository root. No DB connection."""
import concurrent.futures as cf
import gzip, hashlib, json, time, urllib.request
from pathlib import Path
from datetime import datetime, timezone
RAW = Path('docs/audit/2026-10-20-historical-audit/venues')
RAW.mkdir(parents=True, exist_ok=True)
BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/'
# ESPN IDs; current labels are used solely to request franchise histories.
IDS = {'ATL':1,'BOS':2,'NOP':3,'CHI':4,'CLE':5,'DAL':6,'DEN':7,'DET':8,'GSW':9,'HOU':10,'IND':11,'LAC':12,'LAL':13,'MIA':14,'MIL':15,'MIN':16,'BKN':17,'NYK':18,'ORL':19,'PHI':20,'PHX':21,'POR':22,'SAC':23,'SAS':24,'OKC':25,'UTA':26,'WAS':27,'TOR':28,'MEM':29,'CHA':30}

def fetch(item):
    ab, year = item
    path = RAW / f'espn-{ab}-{year}.json.gz'
    url = BASE+f'teams/{IDS[ab]}/schedule?season={year}&seasontype=2'
    if path.exists():
        data = gzip.decompress(path.read_bytes()); cached = True
    else:
        cached = False
        for attempt in range(3):
            try:
                with urllib.request.urlopen(url, timeout=30) as r: data=r.read()
                parsed=json.loads(data)
                if not isinstance(parsed.get('events'),list): raise ValueError('no events array')
                path.write_bytes(gzip.compress(data,mtime=0)); break
            except Exception as exc:
                if attempt==2:return {'team':ab,'end_year':year,'url':url,'error':str(exc)}
                time.sleep(attempt+1)
    d=json.loads(data)
    return {'team':ab,'end_year':year,'url':url,'file':path.name,'events':len(d['events']),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'uncompressed_sha256':hashlib.sha256(data).hexdigest(),'requestedSeason':d.get('requestedSeason'),'season':d.get('season'),'captured_at_utc':datetime.now(timezone.utc).isoformat(),'cached':cached}

if __name__=='__main__':
    seasons=sorted({int(g['season'][:4])+1 for g in map(json.loads,gzip.open('docs/audit/2026-10-20-historical-audit/snapshot/games.jsonl.gz','rt'))})
    jobs=[(ab,y)for y in seasons for ab in IDS]
    results=[]
    with cf.ThreadPoolExecutor(max_workers=10) as ex:
        for r in ex.map(fetch,jobs):
            results.append(r)
            if len(results)%60==0: print(f'{len(results)}/{len(jobs)} captured',flush=True)
    Path('docs/research/2026-10-20-historical-audit/venues/espn-manifest.json').write_text(json.dumps(results,indent=2)+'\n')
    print(json.dumps({'requests':len(results),'errors':sum('error'in x for x in results),'events':sum(x.get('events',0)for x in results)}))
