import pathlib,json,gzip,sys
P=pathlib.Path(__file__).parent;sys.path.insert(0,str(P));import collect
s=json.loads(gzip.decompress(pathlib.Path('/Users/michaelju/Workspace/Projects/fullcourt/docs/audit/release-numbers-20261020/team-oracle/snapshot.json.gz').read_bytes()));tid=next(t['id']for t in s['teams']if t['abbreviation']=='TOR')
items=[{'key':'game-'+g['external_id'],'url':'https://www.nba.com/game/'+g['external_id']+'/box-score','category':'primary-toronto-temporary-venue-inventory','snapshotGameId':g['id']}for g in s['games']if g['home_team_id']==tid and '1995-07-01'<=g['date']<'1999-02-21'and g['status']=='final']
(P/'toronto-requests.json').write_text(json.dumps(items,indent=2)+'\n');out=[]
for n,item in enumerate(items):
 out.append(collect.fetch(item))
 if n%25==0:print('captured/reused',n+1,'/',len(items),flush=True)
(P/'toronto-capture-manifest.json').write_text(json.dumps(out,indent=2)+'\n')
