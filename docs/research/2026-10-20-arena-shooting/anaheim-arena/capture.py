import pathlib,json,urllib.request,hashlib,concurrent.futures
P=pathlib.Path(__file__).parent
D=[('osm-small-area.xml','https://api.openstreetmap.org/api/0.6/map?bbox=-117.923,33.798,-117.917,33.805'),('city-arena-specifications.pdf','https://www.anaheim.net/DocumentCenter/View/35651/Arena-Specifications'),('city-facility-guide.pdf','https://www.anaheim.net/DocumentCenter/View/35656/Facility-Guide'),('city-site-map.pdf','https://local.anaheim.net/docs_agend/questys_pub/16771/16801/16804/18854/18860/2.%20Exhibit%20A18860.pdf')]
def run(t):
 n,u=t
 try:
  if (P/n).exists():b=(P/n).read_bytes();status=200
  else:
   with urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'FullCourtResearch/1.0 evidence archive'}),timeout=70)as r:b=r.read();status=r.status
   (P/n).write_bytes(b)
  m={'url':u,'path':n,'httpStatus':status,'bodySha256':hashlib.sha256(b).hexdigest()};(P/(n+'.metadata.json')).write_text(json.dumps(m,indent=2)+'\n');return m
 except Exception as e:return {'url':u,'error':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=3)as ex:out=list(ex.map(run,D))
(P/'capture-manifest.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
