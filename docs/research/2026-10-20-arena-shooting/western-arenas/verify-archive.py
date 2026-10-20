"""Validate retained original bytes and research inventory consistency only."""
import csv, gzip, hashlib, json, pathlib
P=pathlib.Path(__file__).resolve().parent
checked={}; failures=[]
def visit(value, origin):
 if isinstance(value,dict):
  raw=value.get('rawPath');sha=value.get('bodySha256')
  if raw and sha:
   file=P/raw
   try:
    body=file.read_bytes();retained=hashlib.sha256(body).hexdigest()
    if value.get('retainedSha256'):assert retained==value['retainedSha256'],'retained hash mismatch'
    actual=hashlib.sha256(gzip.decompress(body)if raw.endswith('.gz')else body).hexdigest()
    assert actual==sha,'body hash mismatch'
    checked[raw]={'bodySha256':actual,'retainedSha256':retained,'bytes':len(body)}
   except Exception as exc:failures.append({'origin':origin,'rawPath':raw,'error':str(exc)})
  for child in value.values():visit(child,origin)
 elif isinstance(value,list):
  for child in value:visit(child,origin)
for file in P.glob('*.json'):
 if file.name in ['archive-verification.json','artifact-manifest.json']:continue
 visit(json.loads(file.read_text()),file.name)
for file in (P/'raw').glob('marker-*.json'):visit(json.loads(file.read_text()),file.name)
assert not failures,failures
rows=list(csv.DictReader((P/'inventory.csv').open()));assert len(rows)==39
assert len({r['franchise']for r in rows})==15
assert len({r['arena_id']for r in rows})==34
assert len({(r['franchise'],r['arena_id'],r['candidate_first_covered_game_date'])for r in rows})==39
for row in rows:
 assert row['candidate_first_covered_game_date']<=row['candidate_last_actual_game_date']<='2026-10-20'
 assert bool(row['latitude'])==bool(row['longitude'])
 if row['latitude']:assert (P/row['coordinate_raw_path']).is_file()
for ident in {r['arena_id']for r in rows}:
 same=[r for r in rows if r['arena_id']==ident]
 assert len({(r['latitude'],r['longitude'])for r in same})==1,(ident,'shared physical coordinate mismatch')
assert json.loads((P/'boundary-identity-check.json').read_text())['passed']==78
result={'status':'pass','retainedOriginalBodiesChecked':len(checked),'eraRows':39,'franchises':15,'physicalSites':34,'mappedSites':len({r['arena_id']for r in rows if r['latitude']}),'coordinateHolds':sorted({r['arena_id']for r in rows if not r['latitude']}),'sharedPhysicalCoordinateChecks':'All repeated site keys byte-identical latitude/longitude strings, including LAL/LAC and NOP/OKC.','failures':failures,'raw':checked}
(P/'archive-verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items()if k!='raw'}))
