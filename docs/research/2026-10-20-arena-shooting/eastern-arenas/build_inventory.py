import csv,gzip,hashlib,json,pathlib,re,collections
P=pathlib.Path(__file__).parent
S=pathlib.Path('/Users/michaelju/Workspace/Projects/fullcourt/docs/audit/release-numbers-20261020/team-oracle/snapshot.json.gz')
snapshot=json.loads(gzip.decompress(S.read_bytes()));teams={t['id']:t['abbreviation']for t in snapshot['teams']};games=snapshot['games']
sourceguide='https://nyc3.digitaloceanspaces.com/sportsarchive-documents/prod/698bb7aee7a16/2013-nba-guide.pdf'
# Arena episodes are research anchors, not effective travel-base dates.
D=[
('ATL','atl-omni','Omni','1985-10-25','1997-05-11','default','https://www.nba.com/game/chi-vs-atl-0049600053','Provider venue correct at both anchors; last in-scope NBA game.'),
('ATL','atl-alexander','Alexander Memorial Coliseum / Georgia Tech / McCamish Pavilion','1997-11-01','1999-05-20','mixed-fixture','https://repository.gatech.edu/bitstreams/6a55bc7f-ff78-4c13-80ae-e0cc949f2e9e/download','29 captured fixtures; do not use entire interval as every home-game venue.'),
('ATL','atl-georgia-dome','Georgia Dome','1997-11-04','1999-05-05','mixed-fixture','https://repository.gatech.edu/bitstreams/6a55bc7f-ff78-4c13-80ae-e0cc949f2e9e/download','44 captured fixtures; interleaved with Alexander.'),
('ATL','atl-statefarm','Philips Arena / State Farm Arena','1999-11-04',None,'current',sourceguide,'First NBA game independently stated by NBA guide.'),
('BOS','bos-garden','Boston Garden','1985-10-30','1995-05-05','default','https://www.nba.com/game/orl-vs-bos-0049400029/box-score','Hartford fixtures require separate inventory; first is scope anchor.'),
('BOS','bos-td','FleetCenter / TD Banknorth Garden / TD Garden','1995-11-03',None,'current',sourceguide,'1995 first-game official NBA object incorrectly says Boston Garden; NBA-authored guide independently says Nov 3 1995 in current arena.'),
('BKN','bkn-meadowlands','Brendan Byrne Arena / Continental Airlines Arena / IZOD Center / Meadowlands Arena','1985-10-25','2010-04-12','default','https://www.njsea.com/who-we-are/','NJN precursor; name changes do not mean new physical arena.'),
('BKN','bkn-prudential','Prudential Center','2010-10-27','2012-04-23','default','https://www.nba.com/nets/news/history/2020/04/20/this-week-in-nets-history-april-20','Official Nets history explicitly identifies final Newark game.'),
('BKN','bkn-barclays','Barclays Center','2012-11-03',None,'current',sourceguide,'First NBA game stated by guide; neutral international/bubble fixtures separate.'),
('CHA','cha-coliseum','Charlotte Coliseum (Tyvola Road; second building)','1988-11-04','2002-05-12','default','https://www.nba.com/hornets/news/ranking-the-top-10-best-home-openers-in-hornets-history','NBA game objects retroactively say Spectrum Center. Do not use Bojangles Coliseum coordinates.'),
('CHA','cha-coliseum','Charlotte Coliseum (Bobcats episode)','2004-11-04','2005-04-20','default','https://www.nba.com/hornets/news/ranking-the-top-10-best-home-openers-in-hornets-history','Same Tyvola building; 2002-04 no Charlotte franchise games. Provider Spectrum labels conflict with physical era.'),
('CHA','cha-spectrum','Charlotte Bobcats Arena / Time Warner Cable Arena / Spectrum Center','2005-11-05',None,'current',sourceguide,'NBA guide first-game date matches fixture; same building throughout rename history.'),
('CHI','chi-stadium','Chicago Stadium','1985-10-25','1994-05-20','default','https://www.nba.com/bulls/history/pippen10_940520.html','Official Bulls article identifies final Stadium game; NBA object incorrectly says United Center.'),
('CHI','chi-united','United Center','1994-11-04',None,'current',sourceguide,'First game stated in NBA guide.'),
('CLE','cle-richfield','Richfield Coliseum','1985-10-26','1994-05-03','default','https://www.nba.com/cavaliers/photogallery/remembering-coliseum','Official Cavs retrospective gives final NBA game; NBA objects incorrectly say Quicken Loans Arena.'),
('CLE','cle-rocket','Gund Arena / Quicken Loans Arena / Rocket Mortgage FieldHouse / Rocket Arena','1994-11-08',None,'current',sourceguide,'First game stated in NBA guide; official arena JSON-LD supplies alternative direct coordinate.'),
('DET','det-silverdome','Pontiac Silverdome','1985-10-25','1988-06-16','default','https://www.nba.com/news/history-this-date-in-nba-june','NBA objects incorrectly say Palace. Joe Louis March 1985 episode predates scope.'),
('DET','det-palace','Palace of Auburn Hills','1988-11-05','2017-04-10','default',sourceguide,'First game stated by NBA guide; last game NBA retrospective/video corroboration. Historic named-place pin needs former footprint review.'),
('DET','det-lca','Little Caesars Arena','2017-10-18',None,'current','https://www.313presents.com/venues-events/little-caesars-arena','Actual first regular NBA fixture captured; opening/concert date not used.'),
('IND','ind-market','Market Square Arena','1985-10-26','1999-06-09','default','https://www.nba.com/pacers/news/nine-pacers-moments-shaped-1990s','Official Pacers history confirms move at 1999-2000 start. Last means final regular/postseason game; preseason later in 1999 is outside snapshot scope.'),
('IND','ind-gainbridge','Conseco Fieldhouse / Bankers Life Fieldhouse / Gainbridge Fieldhouse','1999-11-06',None,'current',sourceguide,'First game stated by NBA guide.'),
('MIA','mia-old','Miami Arena','1988-11-05','1999-12-28','default','https://www.nba.com/news/history-this-date-in-nba-nov','Complete transition window captured; midseason January move.'),
('MIA','mia-kaseya','AmericanAirlines Arena / FTX Arena / Miami-Dade Arena / Kaseya Center','2000-01-02',None,'current','https://www.miamidade.gov/resources-oig/pdf/Reports2012/IG11.34FinalBasketball.pdf','County audit explicitly identifies first Heat game; NBA guide corroborates.'),
('MIL','mil-mecca','Milwaukee Arena / MECCA / UW-Milwaukee Panther Arena','1985-10-26','1988-05-06','default','https://www.nba.com/news/milwaukee-bucks-return-mecca-face-boston-celtics?sf125889622=1','NBA retrospective confirms 1968-69 through 1987-88 tenancy; game objects incorrectly say Bradley Center.'),
('MIL','mil-bradley','Bradley Center / BMO Harris Bradley Center','1988-11-05','2018-04-26','default','https://www.nba.com/news/milwaukee-bucks-new-arena-fiserv-forum','Official retrospective confirms 1988 move; first-game date also NBA guide.'),
('MIL','mil-fiserv','Fiserv Forum','2018-10-19',None,'current','https://www.fiservforum.com/plan-your-visit/directions-parking','Actual first regular NBA fixture captured.'),
('NYK','nyk-msg4','Madison Square Garden IV','1985-10-26',None,'current','https://www.msg.com/madison-square-garden/directions','Only Garden IV is in 1985-86 onward scope; international fixtures separate.'),
('ORL','orl-old','Orlando Arena / TD Waterhouse Centre / Amway Arena','1989-11-04','2010-05-26','default','https://www.nba.com/game/bos-vs-orl-0040900305','Old building distinct from Amway Center; false current Google match rejected.'),
('ORL','orl-kia','Amway Center / Kia Center','2010-10-28',None,'current',sourceguide,'First game stated by NBA guide.'),
('PHI','phi-spectrum','Spectrum / CoreStates Spectrum','1985-10-30','1996-04-19','default','https://www.nba.com/sixers/history/76ers-team-history','NBA objects use arenaId 12/name Core States Spectrum Arena across both physical buildings; independent team history essential.'),
('PHI','phi-xfinity','CoreStates Center / First Union Center / Wachovia Center / Wells Fargo Center / Xfinity Mobile Arena','1996-11-01',None,'current','https://www.nba.com/sixers/history/76ers-team-history','Official Sixers history explicitly states first game Nov 1 1996.'),
('TOR','tor-skydome','SkyDome / Rogers Centre','1995-11-03','1999-02-19','default','https://www.nba.com/news/history-this-date-in-nba-nov','Maple Leaf Gardens/Copps exceptions separate; complete pre-ACC page inventory retained.'),
('TOR','tor-scotia','Air Canada Centre / Scotiabank Arena','1999-02-21','2020-02-28','default',sourceguide,'Pause for bubble/Tampa; current arena not continuously used in 2020-21.'),
('TOR','tor-amalie','Amalie Arena / Benchmark International Arena (same Tampa building)','2020-12-23','2021-05-16','temporary-base','https://www.nba.com/news/raptors-to-finish-2020-21-season-in-tampa','Entire 2020-21 home slate Tampa; this is operating base episode, not generic neutral-site override.'),
('TOR','tor-scotia','Scotiabank Arena (Toronto return)','2021-10-20',None,'current','https://www.scotiabankarena.com/venue-information/contact-us','First regular/postseason return anchor captured; effective base before this home game needs separate policy.'),
('WAS','was-capitalcentre','Capital Centre / USAir Arena','1985-10-31','1997-11-29','default','https://www.nba.com/wizards/news/monroe_071115.html','NBA provider city Washington DC is not physical Landover; Baltimore games separate.'),
('WAS','was-capitalone','MCI Center / Verizon Center / Capital One Arena','1997-12-02',None,'current','https://www.nba.com/wizards/news/monroe_071115.html','Official Wizards article explicitly states first NBA game; do not use July season-boundary cutoff.')]
markers={}
for f in (P/'raw').glob('marker-*.json'):
 a=json.loads(f.read_text());m=re.search(rb'initEmbed\((.*?)\);',gzip.decompress((P/a['rawPath']).read_bytes()),re.S)if a.get('rawPath')else None;found=[]
 def walk(v):
  if isinstance(v,list):
   if len(v)>=3 and isinstance(v[0],str)and v[0].startswith('0x')and isinstance(v[1],str)and isinstance(v[2],list)and len(v[2])==2 and all(isinstance(x,(int,float))for x in v[2]):found.append({'providerPlaceId':v[0],'nameAddress':v[1],'latitude':v[2][0],'longitude':v[2][1]})
   for x in v:walk(x)
 if m:walk(json.loads(m[1]))
 markers[f.stem.removeprefix('marker-')]={'sourceUrl':a['url'],'rawPath':a.get('rawPath'),'bodySha256':a.get('bodySha256'),'markers':found}
select={'atl-statefarm':'atl-statefarm-cid','nyk-msg4':'nyk-msg4-exact'}
rejected={'atl-omni','atl-georgia-dome','bos-garden','cha-coliseum','chi-stadium','det-silverdome','ind-market','mia-old','mil-bradley','orl-old','phi-spectrum'}
provisional={'cle-richfield','det-palace','was-capitalcentre'}
select['was-capitalcentre']='capitalcentre-candidate'
coords={}
for _,aid,_,_,_,_,_,_ in D:
 if aid in coords:continue
 record=markers.get(select.get(aid,aid),{});pins=record.get('markers',[])
 if aid in rejected or len(pins)!=1:coords[aid]={'status':'unverified-no-accepted-unique-historical-marker','rejectedCandidateResponse':record};continue
 pin=pins[0];coords[aid]={'status':'named-historical-site-pin-former-footprint-unverified'if aid in provisional else'named-place-map-pin-observed-official-identity-corroboration-required','pointMeaning':'mapping-provider named place marker; not surveyed court or guaranteed footprint centroid',**pin,**{k:record[k]for k in ['sourceUrl','rawPath','bodySha256']}}
# Prefer the arena operator's own declared geo point when available.
a=json.loads((P/'raw/arena-site-cle.json').read_text());coords['cle-rocket']={'status':'official-arena-jsonld-geo-observed','pointMeaning':'arena operator declared GeoCoordinates; not surveyed court center','latitude':41.49647969999999,'longitude':-81.6882129,'sourceUrl':a['url'],'rawPath':a['rawPath'],'bodySha256':a['bodySha256']}
for c in json.loads((P/'geonames-historical-coordinate-observations.json').read_text()):
 coords[c['arenaId']]={**c,'status':'original-gazetteer-historical-site-point-observed','pointMeaning':'native GeoNames historical venue point; location precision is not a claim of court-center or survey accuracy'}
for c in json.loads((P/'ohm-derived-historical-centroids.json').read_text()):
 coords[c['arenaId']]={**c,'status':'original-historical-building-polygon-centroid-derived','bodySha256':c['sourceBodySha256'],'rawPath':c['sourcePath']}
c=json.loads((P/'market-square-derived-site-point.json').read_text());coords[c['arenaId']]=c
for f in ['richfield-usgs-derived-coordinate.json','miami-usgs-derived-coordinate.json','orlando-usgs-derived-coordinate.json']:
 if (P/f).exists():
  c=json.loads((P/f).read_text());coords[c['arenaId']]=c
for aid in coords:
 coords[aid]['primaryIdentitySources']=list(dict.fromkeys(x[6]for x in D if x[1]==aid))
coords['atl-alexander']['primaryIdentitySources'].append('https://ramblinwreck.com/facilities/mccamish-pavilion')
coords['tor-amalie']['primaryIdentitySources'].append('https://www.nhl.com/lightning/news/vinik-sports-group-benchmark-international-announce-multi-year-naming-rights-partnership')
record=markers['tor-mapleleaf'];pin=record['markers'][0]
coords['tor-mapleleaf']={**pin,'status':'original-named-place-point-observed','pointMeaning':'mapping-provider named place marker; same historic Maple Leaf Gardens site, not old court center','sourceUrl':record['sourceUrl'],'rawPath':record['rawPath'],'bodySha256':record['bodySha256'],'primaryIdentitySources':['https://www.torontomu.ca/recreation/facilities/Mac/','https://tmubold.ca/sports/2021/8/5/map-and-directions-mattamy-athletic-centre.aspx']}
(P/'arena-coordinate-observations.json').write_text(json.dumps(coords,indent=2)+'\n')
rows=[]
for team,aid,name,first,last,kind,identity,note in D:
 if last is None:last=max(g['date']for g in games if teams[g['home_team_id']]==team and g['status']=='final')
 def anchor(d):
  g=next(g for g in games if teams[g['home_team_id']]==team and g['date']==d and g['status']=='final');f=P/'raw'/('game-'+g['external_id']+'.json');a=json.loads(f.read_text())if f.exists()else{};raw=a.get('game',{});return {'date':d,'externalId':g['external_id'],'url':'https://www.nba.com/game/'+g['external_id']+'/box-score','rawPath':a.get('rawPath',''),'bodySha256':a.get('bodySha256',''),'providerArenaName':raw.get('arena',{}).get('arenaName',''),'dateStatus':'official-game-date-observed'if raw.get('gameId')==g['external_id'] and str(raw.get('gameEt',''))[:10]==d and raw.get('gameStatus')==3 else'UNVERIFIED'}
 f,l=anchor(first),anchor(last);c=coords[aid]
 row={'franchise':team,'arenaId':aid,'arenaNames':name,'episodeKind':kind,'firstActualGameInScope':first,'lastActualGameObserved':last,'currentOpenEnd':str(kind=='current').lower(),'firstGameId':f['externalId'],'lastGameId':l['externalId'],'firstGameUrl':f['url'],'lastGameUrl':l['url'],'firstAnchorStatus':f['dateStatus'],'lastAnchorStatus':l['dateStatus'],'firstProviderArenaName':f['providerArenaName'],'lastProviderArenaName':l['providerArenaName'],'identityPrimaryUrl':identity,'latitude':c.get('latitude',''),'longitude':c.get('longitude',''),'coordinateStatus':c['status'],'coordinateUrl':c.get('sourceUrl',''),'notes':note}
 rows.append(row)
with(P/'eastern-arena-era-inventory.csv').open('w',newline='')as f:w=csv.DictWriter(f,fieldnames=rows[0].keys());w.writeheader();w.writerows(rows)
(P/'eastern-arena-era-inventory.json').write_text(json.dumps(rows,indent=2)+'\n')
# All mixed ATL fixtures are explicit source observations, not inferred home bases.
mixed=[];tor=[]
for f in sorted((P/'raw').glob('game-*.json')):
 a=json.loads(f.read_text());g=a.get('game',{});d=str(g.get('gameEt',''))[:10]
 if (g.get('home')=='ATL' and '1997-07-01'<=d<'1999-07-01')or(g.get('home')=='TOR'and'1995-07-01'<=d<'1999-02-21'):
  x={'date':d,'gameId':g['gameId'],'home':g['home'],'away':g['away'],'providerArenaName':g['arena']['arenaName'],'providerArenaId':g['arena']['arenaId'],'sourceUrl':a['url'],'rawPath':a.get('rawPath'),'bodySha256':a.get('bodySha256'),'adjudication':'source-observation-only; not approved override'}
  (mixed if g['home']=='ATL'else tor).append(x)
for name,items in [('atlanta-mixed-fixture-observations.json',mixed),('toronto-preacc-fixture-observations.json',tor)]: (P/name).write_text(json.dumps(sorted(items,key=lambda x:x['date']),indent=2)+'\n')
manifest=[]
for f in sorted((P/'raw').glob('*.json')):
 a=json.loads(f.read_text());raw=a.get('rawPath');h=a.get('bodySha256');valid=bool(raw and hashlib.sha256(gzip.decompress((P/raw).read_bytes())).hexdigest()==h);manifest.append({'metadataPath':str(f.relative_to(P)),'url':a.get('url'),'rawPath':raw,'bodySha256':h,'hashVerified':valid,'httpStatus':a.get('httpStatus'),'error':a.get('error')})
(P/'raw-source-integrity.json').write_text(json.dumps({'captureCount':len(manifest),'bodyHashVerified':sum(x['hashVerified']for x in manifest),'failedCaptureCount':sum(bool(x['error'])for x in manifest),'sources':manifest},indent=2)+'\n')
print(json.dumps({'episodes':len(rows),'franchises':len(set(x['franchise']for x in rows)),'arenas':len(coords),'coordinatePoints':sum('latitude'in x for x in coords.values()),'coordinateHolds':sum('latitude'not in x for x in coords.values()),'unverifiedAnchors':sum(x[k]=='UNVERIFIED'for x in rows for k in ['firstAnchorStatus','lastAnchorStatus']),'atlMixedFixtures':len(mixed),'torPreAccCaptured':len(tor),'rawCaptured':len(manifest)}))
