import gzip,hashlib,json,pathlib
P=pathlib.Path(__file__).parent
S=pathlib.Path('/Users/michaelju/Workspace/Projects/fullcourt/docs/audit/release-numbers-20261020/team-oracle/snapshot.json.gz')
s=json.loads(gzip.decompress(S.read_bytes()));games={g['external_id']:g for g in s['games']};teams={t['id']:t['abbreviation']for t in s['teams']};aliases={'CHH':'CHA','NJN':'BKN','PHL':'PHI','NOK':'NOP','NOH':'NOP','WSB':'WAS','SEA':'OKC','VAN':'MEM','UTH':'UTA','GOS':'GSW','SAN':'SAS'}
fail=[];n=0
for f in sorted((P/'raw').glob('game-*.json')):
 a=json.loads(f.read_text());g=a.get('game',{});r=games.get(g.get('gameId'))
 if not r:fail.append({'path':str(f.relative_to(P)),'failure':'missing-game-or-snapshot-row','error':a.get('error')});continue
 n+=1
 comparisons={'externalId':g['gameId']==r['external_id'],'date':str(g['gameEt'])[:10]==r['date'],'status':g['gameStatus']==3,'home':aliases.get(g['home'],g['home'])==teams[r['home_team_id']],'away':aliases.get(g['away'],g['away'])==teams[r['away_team_id']],'homeScore':g['homeScore']==r['home_score'],'awayScore':g['awayScore']==r['away_score']}
 for k,ok in comparisons.items():
  if not ok:fail.append({'path':str(f.relative_to(P)),'failure':k,'observed':g,'snapshot':r})
 hashfails=[];raws=0
for f in sorted((P/'raw').glob('*.json')):
 a=json.loads(f.read_text())
 if a.get('rawPath'):
  raws+=1;b=gzip.decompress((P/a['rawPath']).read_bytes())
  if hashlib.sha256(b).hexdigest()!=a['bodySha256']:hashfails.append(str(f.relative_to(P)))
r={'snapshotPath':str(S),'snapshotGzipSha256':hashlib.sha256(S.read_bytes()).hexdigest(),'officialGameCount':n,'fixtureFieldComparisons':n*7,'fixtureMismatches':fail,'rawBodiesChecked':raws,'rawHashMismatches':hashfails,'scope':'Fixture identity/date/status/scores and retained-body integrity. This does not certify historical provider arena labels or all arena boundary assignments.'}
(P/'fixture-identity-check.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({k:v for k,v in r.items()if k not in ['snapshotPath','snapshotGzipSha256','scope']}))
if fail or hashfails:raise SystemExit(1)
