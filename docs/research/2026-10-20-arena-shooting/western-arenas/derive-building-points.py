"""Derive a mapped building center from retained original OSM closed-ring vertices."""
import gzip, json, pathlib, xml.etree.ElementTree as ET
P=pathlib.Path(__file__).resolve().parent
accepted=[]
ids={'osm-pyramid':'mem-pyramid','osm-summit':'hou-summit','osm-arco1':'sac-arco1'}
bridges={
'mem-pyramid':[{'url':'https://about.basspro.com/newsroom/press-center/bass-pro-shops-at-the-pyramid/','rawRetention':'Direct403; original operator page text inspected with browsing.','claim':'Operator identifies current shop inside the transformed sports arena.'}],
'hou-summit':[{'url':'https://www.houstontx.gov/council/committees/bfacommittee/3.29.10/lakewoodlewisappraisal.pdf','rawRetention':'Direct timeout; original municipal PDF text inspected with browsing.','claim':'Municipal appraisal links Lakewood property to former Compaq Center.'}],
'sac-arco1':[{'url':'https://thedcapage.blog/2017/04/28/dca-daughters-and-sons-discover-the-working-world/','claim':'State DCA author explicitly identifies its building as original Arco Arena.'},{'url':'https://solid.dca.ca.gov/about_us/directions.html','claim':'State DCA gives1625NorthMarketBlvd, distinct from ARCOII.'}]}
for source in json.loads((P/'osm-building-queries.json').read_text()):
 if source.get('status')!=200:continue
 root=ET.fromstring(gzip.decompress((P/source['rawPath']).read_bytes()))
 nodes={x.attrib['id']:(float(x.attrib['lon']),float(x.attrib['lat']))for x in root.findall('node')}
 way=root.find('way');vertices=[nodes[n.attrib['ref']]for n in way.findall('nd')]
 assert vertices[0]==vertices[-1] and len(vertices)>=4
 ox,oy=vertices[0];local=[(x-ox,y-oy)for x,y in vertices];edges=list(zip(local,local[1:]))
 area2=sum(x*v-u*y for(x,y),(u,v)in edges);assert area2!=0
 lon=ox+sum((x+u)*(x*v-u*y)for(x,y),(u,v)in edges)/(3*area2)
 lat=oy+sum((y+v)*(x*v-u*y)for(x,y),(u,v)in edges)/(3*area2)
 ident=ids[source['id']]
 accepted.append({'arenaId':ident,'status':'accepted mapped surviving arena-building footprint estimate','provider':'Original OpenStreetMap building geometry','url':source['url'],'rawPath':source['rawPath'],'bodySha256':source['bodySha256'],'retainedSha256':source['retainedSha256'],'wayId':way.attrib['id'],'wayVersion':way.attrib['version'],'tags':{x.attrib['k']:x.attrib['v']for x in way.findall('tag')},'vertices':vertices,'latitude':round(lat,8),'longitude':round(lon,8),'method':'Area-weighted shoelace centroid of closed OSM building ring, translated to first vertex before arithmetic, planar lon/lat approximation over <250m footprint.','pointType':'Derived original-mapper building-footprint center; not surveyed basketball-court centroid','primaryBridges':bridges[ident]})
(P/'osm-derived-building-points.json').write_text(json.dumps(accepted,indent=2)+'\n')
print(json.dumps([{'arenaId':r['arenaId'],'latitude':r['latitude'],'longitude':r['longitude']}for r in accepted]))
