"""Assemble research claims; an unresolved physical-site coordinate stays empty."""
import csv, json, pathlib
P=pathlib.Path(__file__).resolve().parent
sources={x['id']:x for x in json.loads((P/'sources.json').read_text())}
markers={x['key']:x for filename in ['map-marker-manifest.json','map-marker-extra-manifest.json'] for x in json.loads((P/filename).read_text())}
markers['sac-golden1-cid']=json.loads((P/'raw/marker-sac-golden1-cid.json').read_text())
extra={'gsw-oakland':'gsw-oakland-short','nop-neworleans':'nop-neworleans-short','por-rose':'por-rose-short','sac-golden1':'sac-golden1-cid'}
# These responses need a historical footprint or converted-building adjudication.
holds={'dal-reunion':'No historical arena point retained; search returned a nearby parking lot.',
'den-mcnichols':'Former-arena named pin exists, but historical footprint/address corroboration remains open.',
'hou-summit':'Lakewood Church marker retained; municipal appraisal links the building, but historic court/site-point adjudication remains open.',
'lac-sports':'Google resolves the adjacent outdoor Coliseum; reject that point.',
'mem-pyramid':'Converted Bass Pro Pyramid marker retained; historic court/site-point adjudication remains open.',
'min-metrodome':'Demolished stadium; current address geocoding is not historic arena proof.',
'sac-arco1':'Google resolves ARCO II at 1 Sports Parkway; reject for ARCO I.',
'sac-arco2':'Historical named pin plus preserved HIFLD corroboration retained; demolished-building footprint confirmation remains open.',
'sas-hemisfair':'Former-arena named pin retained; municipal historical footprint confirmation remains open.',
'uta-saltpalace':'Google resolves present convention center; reject for old arena.'}
era_sources={'DAL':['dal-guide'],'DEN':['den-guide'],'GSW':['gsw-guide','gsw-opening'],'HOU':['hou-guide'],
'LAC':['lac-guide','lac-intuit-first'],'LAL':['lal-seasoncapsule'],'MEM':['mem-relocation'],
'MIN':['min-guide'],'NOP':['nop-guide','nop-record-allocation'],'OKC':['sea-cityreport'],
'PHX':['phx-guide'],'POR':['por-city-history','nps-por-coliseum'],'SAC':['sac-guide','sac-arco-bound'],
'SAS':['sas-guide'],'UTA':['uta-guide','uta-history']}
identity_sources={'dal-aac':['dal-directions'],'den-ball':['den-ball'],'gsw-oakland':['gsw-oakland-address'],
'gsw-sanjose':['gsw-sap'],'gsw-chase':['gsw-guide'],'hou-toyota':['hou-directions'],
'la-staples':['lal-directions'],'lac-intuit':['lac-intuit-address'],'lal-forum':['nps-forum'],
'mem-vancouver':['mem-vancouver-city'],'mem-fedex':['min-guide'],'min-target':['min-guide'],
'nop-neworleans':['nop-directions'],'okc-ford':['okc-ford-address'],
'sea-coliseum':['sea-cityreport'],'sea-tacoma':['sea-tacoma-address'],
'phx-veterans':['phx-veterans-address'],'phx-americawest':['sac-guide'],
'por-memorial':['por-memorial-address','nps-por-coliseum'],'por-rose':['por-directions'],
'sac-golden1':['sac-guide'],'sas-alamodome':['sas-guide'],'sas-frost':['sas-frost-address'],'uta-delta':['uta-delta']}
rows=json.loads((P/'boundary-candidates.json').read_text())['rows']
for r in rows:
 r['first_date_status']='NBA fixture identity/date/final/scores verified; first covered fixture conditional on era/exception inventory'
 r['last_date_status']='NBA fixture identity/date/final/scores verified; last completed fixture conditional on era/exception inventory'
 r['first_game_source_url']='https://www.nba.com/game/'+r['first_game_id']+'/box-score'
 r['last_game_source_url']='https://www.nba.com/game/'+r['last_game_id']+'/box-score'
 r['era_source_url']=' | '.join(sources[k]['url']for k in era_sources[r['franchise']])
 r['era_source_ids']=' | '.join(era_sources[r['franchise']])
 r['era_status']='Team/municipal history plus boundary fixtures corroborate venue-era; all intervening fixture venues not individually replayed'
 r['coordinate_point_type']='';r['coordinate_raw_path']='';r['coordinate_identity_source_url']='';r['candidate_latitude']='';r['candidate_longitude']=''
 ident=r['arena_id'];m=markers[extra.get(ident,ident)];points=m.get('namedPlaceMarkers',[])
 if ident in holds:
  r.update(latitude='',longitude='',coordinate_source_url=m['url'],coordinate_status='HOLD — '+holds[ident])
  if len(points)==1:r.update(candidate_latitude=str(points[0]['latitude']),candidate_longitude=str(points[0]['longitude']))
 else:
  assert len(points)==1,(ident,points)
  point=points[0];r.update(latitude=str(point['latitude']),longitude=str(point['longitude']),coordinate_source_url=m['url'],coordinate_raw_path=m['rawPath'],coordinate_point_type='original mapping-provider named-place marker; not surveyed court centroid',coordinate_status='Verified original named-place marker with primary venue identity/address corroboration; historical court-center position unverified',coordinate_identity_source_url=' | '.join(sources[k]['url']for k in identity_sources[ident]))
  if ident=='sea-coliseum':r['coordinate_status']+='; post2021 reconstruction marker agrees with preserved historical KeyArena HIFLD site point, not proof of identical court center'
 if r['era_season_before']=='9999':r['notes']+=' | Active-era endpoint is last FINAL fixture in frozen snapshot; no scheduled future fixture used.'
 if r['franchise']=='NOP':r['notes']+=' | Official statistical franchise history starts2002-03; pre2002 Charlotte history belongs to CHA.'
 if r['franchise']=='LAC'and ident=='la-staples':r['notes']+=' | Regular-season first1999-11-02; preseason1999-10-27 excluded. Shared physical key/point with LAL.'
 if ident=='lal-forum':r['notes']+=' | Final competitive game1999-05-23; later preseason returns excluded.'
 if ident=='okc-ford':r['notes']+=' | Shared physical key/point for displaced NOP and later OKC.'
historic_path=P/'historical-geospatial-candidates.json'
if historic_path.exists():
 for point in json.loads(historic_path.read_text()):
  if not point['status'].startswith('accepted'):continue
  for r in rows:
   if r['arena_id']==point['arenaId']:
    r.update(latitude=str(point['latitude']),longitude=str(point['longitude']),coordinate_source_url=point['url'],coordinate_raw_path=point['rawPath'],coordinate_point_type=point['pointType'],coordinate_identity_source_url=' | '.join(x['url']for x in point['primaryBridges']),coordinate_status='Original GeoNames historical facility point + primary historic site/address corroboration; mapped estimate, not court survey')
osm_path=P/'osm-derived-building-points.json'
if osm_path.exists():
 for point in json.loads(osm_path.read_text()):
  for r in rows:
   if r['arena_id']==point['arenaId']:
    r.update(latitude=str(point['latitude']),longitude=str(point['longitude']),coordinate_source_url=point['url'],coordinate_raw_path=point['rawPath'],coordinate_point_type=point['pointType'],coordinate_identity_source_url=' | '.join(x['url']for x in point['primaryBridges']),coordinate_status='Original OSM building vertices + primary converted-building identity corroboration; mapped footprint center, not court survey')
for r in rows:
 if r['arena_id']=='sac-arco2':
  point=markers['sac-arco2']['namedPlaceMarkers'][0]
  r.update(latitude=str(point['latitude']),longitude=str(point['longitude']),coordinate_source_url=markers['sac-arco2']['url'],coordinate_raw_path=markers['sac-arco2']['rawPath'],coordinate_point_type='Original mapping-provider named historical arena marker; not court survey',coordinate_identity_source_url=sources['sac-arco2-city-contract']['url'],coordinate_status='Original Google named ARCO II marker, primary municipal One Sports Parkway contract, preserved HIFLD corroboration; not the rejected GeoNames point')
root_path=P/'root-historical-points.json'
if root_path.exists():
 for point in json.loads(root_path.read_text())['records']:
  for r in rows:
   if r['arena_id']==point['arenaId']:
    r.update(latitude=str(point['latitude']),longitude=str(point['longitude']),coordinate_source_url=point['sourceUrl'],coordinate_raw_path=point['rawPath'],coordinate_point_type=point['coordinateMethod'],coordinate_identity_source_url=' | '.join(point['primaryIdentityUrls']),coordinate_status='Root-adjudicated original USGS historical map-symbol point, NAD27→WGS84; selection uncertainty '+str(point['estimatedMapSelectionUncertaintyMeters'])+'m; transform accuracy '+str(point['datumTransformAccuracyMeters'])+'m; not surveyed court center')
with(P/'inventory.csv').open('w')as f:
 writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
# Strong physical-building contradictions; sponsor-only renames are deliberately excluded.
conflicts={'0020100006':'dal-aac','0028500008':'gsw-oakland','0029501163':'gsw-oakland','0029600013':'gsw-sanjose','0029601180':'gsw-sanjose','0029400013':'sea-tacoma','0049400011':'sea-tacoma','0028500026':'phx-veterans','0049100046':'phx-veterans','0028500009':'por-memorial','0049400021':'por-memorial','0028500006':'sac-arco1','0028700937':'sac-arco1','0028500019':'sas-hemisfair','0049200055':'sas-hemisfair','0028500011':'uta-saltpalace','0049000045':'uta-saltpalace'}
evidence=json.loads((P/'boundary-primary-evidence.json').read_text());bad=[]
for x in evidence:
 if x['externalId']not in conflicts:continue
 correct=conflicts[x['externalId']];r=next(r for r in rows if r['arena_id']==correct)
 bad.append({'externalId':x['externalId'],'date':x['observed']['gameEt'][:10],'raw_nba_arena':x['observed']['arena']['arenaName'],'correct_physical_arena_id':correct,'primary_history_urls':r['era_source_url'],'raw_path':x['rawPath'],'body_sha256':x['bodySha256']})
with(P/'venue-label-conflicts.csv').open('w')as f:
 writer=csv.DictWriter(f,fieldnames=list(bad[0]));writer.writeheader();writer.writerows(bad)
print(json.dumps({'eraRows':len(rows),'physicalSites':len({r['arena_id']for r in rows}),'mappedSites':len({r['arena_id']for r in rows if r['latitude']}),'coordinateHoldSites':len({r['arena_id']for r in rows if not r['latitude']}),'demonstratedWrongBuildingLabels':len(bad)}))
