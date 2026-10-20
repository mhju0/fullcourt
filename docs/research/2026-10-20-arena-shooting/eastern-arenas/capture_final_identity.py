import urllib.request,pathlib,hashlib,json,gzip,concurrent.futures
P=pathlib.Path(__file__).parent
D=[('miami-developer-primary','https://www.barkerpacific.com/commercial-projects/miami-arena'),('orlando-city-former-site','https://orlando.novusagenda.com/AgendaPublic/AttachmentViewer.ashx?AttachmentID=70311&ItemID=41659')]
def run(t):
 n,u=t
 try:
  with urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'FullCourtResearch/1.0 evidence archive'}),timeout=70)as r:b=r.read();status=r.status
  raw='raw/source-'+n+'.body.gz';(P/raw).write_bytes(gzip.compress(b,mtime=0));m={'url':u,'httpStatus':status,'rawPath':raw,'bodySha256':hashlib.sha256(b).hexdigest()};(P/('raw/source-'+n+'.json')).write_text(json.dumps(m,indent=2)+'\n');print(n,status,len(b))
 except Exception as e:print(n,type(e).__name__,str(e))
with concurrent.futures.ThreadPoolExecutor(max_workers=2)as ex:list(ex.map(run,D))
