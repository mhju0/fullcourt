"""Fingerprint retained raw public/schedule evidence without storing raw responses in Git."""
import pathlib,json,hashlib,os
P=pathlib.Path(__file__).resolve().parent
R=pathlib.Path(os.environ.get('SCHEDULE_AUDIT_RAW_DIR',P.parents[1]/'audit/2026-10-20-full-season-audit'))
metadata=json.loads((P/'daily-fetch-metadata.json').read_text());sources={x['source']+'/'+x['date']+'.json':x for x in metadata}
for x in json.loads((P/'additional-sources.json').read_text()):sources[x['name']+'.html']=x
pdfurl='https://ak-static.cms.nba.com/wp-content/uploads/sites/46/2026/08/2026-27-NBA-Regular-Season-Schedule-By-Date.pdf'
sources['nba-by-date.pdf']={'url':pdfurl,'capture_provenance':'Reused byte-identical official PDF captured 2026-10-19 approximately 16:23 UTC in opening-quarter audit; dated August 13, 2026'}
sources['nba-by-date.txt']={'url':pdfurl,'capture_provenance':'pdftotext -layout from retained official PDF'}
files=[]
for f in sorted(R.rglob('*')):
 if not f.is_file():continue
 n=f.relative_to(R).as_posix();m=sources.get(n,{})
 files.append({'file':str(f.relative_to(P.parents[2])),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'source':m.get('url','database READ ONLY snapshot' if n in ['games.json','scores.json','context.json','duplicates.json'] else 'derived from captured snapshots'),'captured_at':m.get('capturedAt'),'provenance':m.get('capture_provenance')})
(P/'raw-manifest.json').write_text(json.dumps({'database_capture':json.loads((P/'capture-metadata.json').read_text()),'files':files},indent=2)+'\n')
print('Fingerprinted',len(files),'raw files')
