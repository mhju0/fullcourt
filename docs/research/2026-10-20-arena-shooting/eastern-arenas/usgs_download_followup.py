from usgs_followup import *
import fitz,pypdf
def download(t):
 name,url=t
 p=P/('usgs-'+name+'.pdf')
 if not p.exists():
  with urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=120)as r:b=r.read()
  p.write_bytes(b)
 else:b=p.read_bytes()
 (P/('usgs-'+name+'-metadata.json')).write_text(json.dumps({'url':url,'path':p.name,'bodySha256':hashlib.sha256(b).hexdigest()},indent=2)+'\n')
 pg=pypdf.PdfReader(p).pages[0];print(name,str(pg.mediabox),pg.get('/LGIDict'))
 d=fitz.open(p);d[0].get_pixmap(matrix=fitz.Matrix(.7,.7)).save(str(P/('usgs-'+name+'-overview.png')))
 print(name,d[0].get_text()[:700])
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=2)as ex:list(ex.map(download,[('miami-1994','https://prd-tnm.s3.amazonaws.com/StagedProducts/Maps/HistoricalTopo/PDF/FL/24000/FL_Miami_347456_1994_24000_geo.pdf'),('orlando-west-1995','https://prd-tnm.s3.amazonaws.com/StagedProducts/Maps/HistoricalTopo/PDF/FL/24000/FL_Orlando%20West_347871_1995_24000_geo.pdf')]))
