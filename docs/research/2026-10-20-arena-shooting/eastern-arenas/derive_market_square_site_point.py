import hashlib,json,pathlib,xml.etree.ElementTree as E
P=pathlib.Path(__file__).parent
f=P/'osm-market-square-streets.xml';r=E.parse(f).getroot();nodes={int(x.attrib['id']):x for x in r.findall('node')};ways={int(x.attrib['id']):x for x in r.findall('way')}
def tags(x):return{t.attrib['k']:t.attrib['v']for t in x.findall('tag')}
def refs(w):return[int(x.attrib['ref'])for x in w.findall('nd')]
assert tags(ways[425527627])['name']=='North Alabama Street'
assert tags(ways[17499090])['name']=='North New Jersey Street'
assert tags(ways[692299917])['name']=='East Market Street'
assert tags(ways[305485084])['name']=='East Market Street'
a,b=180485815,180485817
assert a in refs(ways[425527627])and a in refs(ways[692299917])
assert b in refs(ways[17499090])and b in refs(ways[305485084])
pa,pb=[{k:float(nodes[i].attrib[k])for k in ['lat','lon']}for i in [a,b]]
source=json.loads((P/'osm-market-square-streets-metadata.json').read_text());mp=json.loads((P/'raw/source-market-square-city-map.json').read_text())
out={'arenaId':'ind-market','latitude':(pa['lat']+pb['lat'])/2,'longitude':(pa['lon']+pb['lon'])/2,'status':'proposed-inferred-historic-site-point-requires-owner-review','pointMeaning':'venue-scale historical site anchor, NOT a measured court center or polygon centroid','method':'midpoint of named original OSM East Market Street intersections with North Alabama Street and North New Jersey Street; municipal historic map identifies arena on this two-block site; inferred travel-location proxy','osmNodeIds':[a,b],'osmIntersectionCoordinates':[pa,pb],'osmWayIds':[425527627,17499090,692299917,305485084],'sourceUrl':source['url'],'sourcePath':f.name,'bodySha256':hashlib.sha256(f.read_bytes()).hexdigest(),'historicMap':{'url':mp['url'],'rawPath':mp['rawPath'],'bodySha256':mp['bodySha256'],'pdfPage':7,'mapTitle':'Airspace District Zoning Map: Downtown Heliport, Map No. 5, part of Marion County Airport Zoning Ordinance 94-AO-2; retained in 1998 ordinance amendment'},'uncertainty':'Street midpoint gives a reproducible point at the correct historical arena site. Exact old arena footprint center and court position are not established by this derivation. Use only with explicit acceptance of a venue-scale point.'}
(P/'market-square-derived-site-point.json').write_text(json.dumps(out,indent=2)+'\n');print(out['latitude'],out['longitude'])
