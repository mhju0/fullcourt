import pathlib,json,hashlib,gzip
P=pathlib.Path(__file__).parent
r=json.loads((P/'eastern-research-registry.json').read_text());errors=[];checks=0
assert len(r['episodes'])==37 and len(set(x['franchise']for x in r['episodes']))==15
for aid,c in r['sites'].items():
 assert -90<=c['latitude']<=90 and -180<=c['longitude']<=180
 assert c.get('sourceUrl')or c.get('sourceUrls')
 assert c.get('pointMeaning')or c.get('method')
 # Follow original source references where the coordinate record identifies the retained source explicitly.
 src=c.get('sourcePath')or c.get('rawPath')
 h=c.get('sourceBodySha256')or c.get('bodySha256')
 if src and h:
  p=P/src
  if not p.exists():errors.append({'arenaId':aid,'error':'missing-source','path':src});continue
  b=p.read_bytes()
  if p.suffix=='.gz':b=gzip.decompress(b)
  checks+=1
  if hashlib.sha256(b).hexdigest()!=h:errors.append({'arenaId':aid,'error':'source-hash','path':src})
for x in r['episodes']:
 assert x['arenaId']in r['sites']
 assert x['firstActualGameInScope']<=x['lastActualGameObserved']
 assert x['effectiveFrom']is None and x['effectiveBefore']is None
 assert x['firstAnchorStatus']=='official-game-date-observed'and x['lastAnchorStatus']=='official-game-date-observed'
for x in r['secondaryFixtureObservations']:
 if x.get('arenaId'):assert x['arenaId']in r['sites']
a={'sites':len(r['sites']),'episodes':len(r['episodes']),'franchises':len(set(x['franchise']for x in r['episodes'])),'actualGameAnchors':2*len(r['episodes']),'coordinateOriginalSourcesHashChecked':checks,'errors':errors,'registrySha256':hashlib.sha256((P/'eastern-research-registry.json').read_bytes()).hexdigest(),'scope':'Structural consistency and retained original coordinate body hashes. Not a blanket arena-history/point-precision certification.'}
(P/'delivery-check.json').write_text(json.dumps(a,indent=2)+'\n');print(json.dumps(a))
if errors:raise SystemExit(1)
