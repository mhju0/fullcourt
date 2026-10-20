import pathlib,json,hashlib,xml.etree.ElementTree as E,math
from shapely.geometry import Polygon
P=pathlib.Path(__file__).parent
c=json.loads((P/'arena-coordinate.json').read_text());b=(P/c['sourcePath']).read_bytes();assert hashlib.sha256(b).hexdigest()==c['bodySha256']
r=E.fromstring(b);nodes={n.attrib['id']:[float(n.attrib['lon']),float(n.attrib['lat'])]for n in r.findall('node')};w=r.find('way');v=[nodes[n.attrib['ref']]for n in w.findall('nd')];assert v==c['verticesWgs84LonLat'];assert v[0]==v[-1] and len(v)==38
lo,la=v[0];co=math.cos(math.radians(sum(x[1]for x in v)/len(v)));p=Polygon([((x-lo)*co,y-la)for x,y in v]);assert p.is_valid and p.area>0
cent=p.centroid;lat=la+cent.y;lon=lo+cent.x/co;assert abs(lat-c['latitude'])<1e-12 and abs(lon-c['longitude'])<1e-12
m=json.loads((P/'operator-linked-2026-spec-guide.metadata.json').read_text());assert hashlib.sha256((P/m['path']).read_bytes()).hexdigest()==m['bodySha256']
# Haversine check only documents why the rejected campus marker differs materially.
a,b=map(math.radians,[33.80057,c['latitude']]);dlat=b-a;dlon=math.radians(c['longitude']-(-117.92072));dist=2*6371000*math.asin(math.sqrt(math.sin(dlat/2)**2+math.cos(a)*math.cos(b)*math.sin(dlon/2)**2))
result={'roofWayId':int(w.attrib['id']),'roofWayVersion':int(w.attrib['version']),'closedPolygonVertices':len(v),'polygonValid':p.is_valid,'centroidReproduced':True,'originalOsmBodyHashVerified':True,'officiallyLinkedGuideBodyHashVerified':True,'rejectedCampusCandidateDistanceMeters':dist,'latitude':lat,'longitude':lon,'coordinateRecordSha256':hashlib.sha256((P/'arena-coordinate.json').read_bytes()).hexdigest()};(P/'verification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
