"""Read-only fixture identity replay against retained NBA payloads and frozen baseline."""
import gzip, hashlib, json, pathlib, re
P = pathlib.Path(__file__).resolve().parent
candidate = json.loads((P / 'boundary-candidates.json').read_text())
manifest_path = pathlib.Path(candidate['sourceSnapshotPath'])
assert hashlib.sha256(manifest_path.read_bytes()).hexdigest() == candidate['sourceManifestSha256']
state = json.loads(manifest_path.read_text())['after']
games = {g['external_id']: g for g in state['games']}
teams = {t['id']: t['abbreviation'] for t in state['teams']}
aliases = {'PHL':'PHI','GOS':'GSW','SAN':'SAS','UTH':'UTA','SEA':'OKC','VAN':'MEM','NOH':'NOP','NOK':'NOP','NJN':'BKN','CHH':'CHA'}
canon = lambda x: aliases.get(x, x)
checks = []
for record in json.loads((P / 'boundary-primary-evidence.json').read_text()):
 raw = (P / record['rawPath']).read_bytes()
 assert hashlib.sha256(raw).hexdigest() == record['retainedSha256']
 body = gzip.decompress(raw)
 assert hashlib.sha256(body).hexdigest() == record['bodySha256']
 data = json.loads(re.search(rb'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', body, re.S)[1])
 observed = data['props']['pageProps']['game']
 game = games[record['externalId']]
 expected = record['observed']
 for side in ('home','away'):
  raw_team = observed[side+'Team']; assert raw_team['teamTricode'] == expected[side]['teamTricode']
  assert raw_team['score'] == expected[side]['score']
 assert observed['gameId'] == game['external_id']
 assert observed['gameEt'][:10] == game['date']
 assert observed['gameCode'][:8] == game['date'].replace('-', '')
 assert observed['gameStatus'] == 3
 for side in ('home','away'):
  assert canon(observed[side+'Team']['teamTricode']) == teams[game[side+'_team_id']]
  assert observed[side+'Team']['score'] == game[side+'_score']
 code = observed['gameCode'].split('/')[1]
 assert canon(code[:3]) == teams[game['away_team_id']]
 assert canon(code[3:]) == teams[game['home_team_id']]
 checks.append({'externalId':game['external_id'],'date':game['date'],'arenaName':observed['arena']['arenaName'],
  'checksPassed':True,'rawPath':record['rawPath'],'bodySha256':record['bodySha256']})
output = {'manifestSha256':candidate['sourceManifestSha256'],'checked':len(checks),'passed':len(checks),
 'note':'Identity/date/final/scores verified; arena labels are not assumed historically correct. First/last extremality remains conditioned on the separately researched era and fixture exception inventory.',
 'aliases':aliases,'checks':checks}
(P / 'boundary-identity-check.json').write_text(json.dumps(output, indent=2)+'\n')
print(json.dumps({'checked':len(checks),'passed':len(checks)}))
