"""Emit reviewable machine and human research indexes, without application writes."""
import csv, json, pathlib
P=pathlib.Path(__file__).resolve().parent
rows=list(csv.DictReader((P/'inventory.csv').open()))
sources_by_url={x['url']:x for x in json.loads((P/'sources.json').read_text())}
archive=json.loads((P/'archive-verification.json').read_text())['raw'] if (P/'archive-verification.json').exists() else {}
arenas={}
for r in rows:
 arena=arenas.setdefault(r['arena_id'],{'arenaId':r['arena_id'],'name':r['arena'],'franchises':[],'latitude':float(r['latitude'])if r['latitude']else None,'longitude':float(r['longitude'])if r['longitude']else None,'coordinateStatus':r['coordinate_status'],'pointType':r['coordinate_point_type'],'coordinateUrl':r['coordinate_source_url'],'rawPath':r['coordinate_raw_path'],'primaryIdentityUrls':r['coordinate_identity_source_url'].split(' | ')if r['coordinate_identity_source_url']else[]})
 assert arena['latitude']==(float(r['latitude'])if r['latitude']else None)
 assert arena['longitude']==(float(r['longitude'])if r['longitude']else None)
 if r['franchise']not in arena['franchises']:arena['franchises'].append(r['franchise'])
for arena in arenas.values():
 if arena['rawPath'] in archive:
  arena['coordinateBodySha256']=archive[arena['rawPath']]['bodySha256']
  arena['coordinateRetainedSha256']=archive[arena['rawPath']]['retainedSha256']
 arena['primaryEvidence']=[]
 for url in arena['primaryIdentityUrls']:
  source=sources_by_url.get(url)
  if source:
   arena['primaryEvidence'].append({'url':url,'captureStatus':source.get('status'),'rawPath':source.get('rawPath'),'bodySha256':source.get('bodySha256'),'captureError':source.get('error')})
  else:arena['primaryEvidence'].append({'url':url,'captureStatus':'See historical geospatial comparison / derived building record for the separately captured source.'})
root_path=P/'root-historical-points.json'
if root_path.exists():
 for point in json.loads(root_path.read_text())['records']:
  arena=arenas[point['arenaId']]
  arena.update(coordinateBodySha256=point['sourceSha256'],coordinateRetainedSha256=point['sourceSha256'],estimatedMapSelectionUncertaintyMeters=point['estimatedMapSelectionUncertaintyMeters'],datumTransformAccuracyMeters=point['datumTransformAccuracyMeters'],identityAdjudication=point['identityAdjudication'],derivationEvidencePath='root-historical-points.json',annotatedReviewPath=point['annotatedReviewPath'])
eras=[{'franchise':r['franchise'],'arenaId':r['arena_id'],'firstCoveredActualGameDate':r['candidate_first_covered_game_date'],'lastCompletedActualGameDate':r['candidate_last_actual_game_date'],'firstExternalId':r['first_game_id'],'lastExternalId':r['last_game_id'],'firstBoundaryStatus':r['first_date_status'],'lastBoundaryStatus':r['last_date_status'],'leftCensored':r['notes'].startswith('left-censored'),'activeEra':r['era_season_before']=='9999','eraSourceUrls':r['era_source_url'].split(' | '),'notes':r['notes']}for r in rows]
output={'version':1,'scope':'Research candidate for owner review, not an application runtime registry. Full default eras; alternate fixtures remain separately adjudicated.','baselineManifestSha256':'69582d522ef03055cf093ec7cd83438d1eedd6bbbd076ad50ab75c1461ef0bd0','coordinateInterpretation':'Source-mapped arena/site point or derived original building footprint center. Not surveyed court precision.','arenas':list(arenas.values()),'eras':eras,'counts':{'franchises':len({r['franchise']for r in rows}),'eras':len(eras),'physicalSites':len(arenas),'mappedSites':sum(x['latitude']is not None for x in arenas.values()),'coordinateHolds':[x['arenaId']for x in arenas.values()if x['latitude']is None]}}
(P/'western-arenas.json').write_text(json.dumps(output,indent=2)+'\n')
lines=['# Western arena-era inventory','','First means first covered actual fixture; 1985-86 rows can be left-censored. Active-era last dates mean last completed fixture in the frozen snapshot. No opening or future scheduled date is substituted.','','Mapped points are original named-place points or derived original building-footprint centers, not surveyed basketball-court centers. Shared physical keys have identical coordinate strings.','','| Franchise | Physical arena / era | First covered fixture | Last completed fixture | Latitude, longitude | Coordinate source/status |','|---|---|---|---|---|---|']
for r in rows:
 coord=r['latitude']+', '+r['longitude']if r['latitude']else'**HOLD**';source='[original point/geometry]('+r['coordinate_source_url']+')'if r['latitude']else r['coordinate_status'].replace('HOLD — ','');lines.append('| '+r['franchise']+' | '+r['arena']+' | ['+r['candidate_first_covered_game_date']+']('+r['first_game_source_url']+') | ['+r['candidate_last_actual_game_date']+']('+r['last_game_source_url']+') | '+coord+' | '+source+' |')
(P/'INVENTORY.md').write_text('\n'.join(lines)+'\n')
print(json.dumps(output['counts']))
