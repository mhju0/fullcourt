import json,urllib.request,urllib.parse,pathlib,hashlib,concurrent.futures
P=pathlib.Path(__file__).parent
UA={'User-Agent':'FullCourtResearch/1.0 evidence archive'}
def fetch(name,url):
 p=P/name
 if not p.exists():
  with urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=70) as r:b=r.read()
  p.write_bytes(b)
 else:b=p.read_bytes()
 (P/(name+'-metadata.json')).write_text(json.dumps({'url':url,'path':name,'bodySha256':hashlib.sha256(b).hexdigest()},indent=2)+'\n')
 return json.loads(b)
def query(arg):
 name,box=arg
 u='https://tnmaccess.nationalmap.gov/api/v1/products?'+urllib.parse.urlencode({'datasets':'Historical Topographic Maps','bbox':box,'max':100})
 a=fetch('usgs-'+name+'-map-products.json',u)
 return name,[{k:x.get(k) for k in ['title','publicationDate','dateCreated','downloadURL','sourceId']}for x in a.get('items',[])if'24000'in x.get('title','')or'24,000'in x.get('title','')]
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=2)as ex:
  for x in ex.map(query,[('miami','-80.198,25.779,-80.191,25.787'),('orlando','-81.390,28.545,-81.380,28.552')]):print(json.dumps(x))
