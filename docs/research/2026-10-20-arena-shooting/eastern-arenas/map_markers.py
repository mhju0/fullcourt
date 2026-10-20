import pathlib,urllib.request,urllib.parse,concurrent.futures,time,threading,json,hashlib,gzip,re,datetime
P=pathlib.Path(__file__).parent
QUERIES={'atl-omni':'Omni Coliseum Atlanta','atl-georgia-dome':'Georgia Dome Atlanta','atl-alexander':'McCamish Pavilion Atlanta','atl-statefarm':'State Farm Arena Atlanta','bos-garden':'Boston Garden historical arena','bos-td':'TD Garden Boston','bkn-meadowlands':'Meadowlands Arena East Rutherford','bkn-prudential':'Prudential Center Newark','bkn-barclays':'Barclays Center Brooklyn','cha-coliseum':'Charlotte Coliseum 100 Paul Buck Boulevard','cha-spectrum':'Spectrum Center Charlotte','chi-stadium':'Chicago Stadium demolished','chi-united':'United Center Chicago','cle-richfield':'Richfield Coliseum Ohio','cle-rocket':'Rocket Arena Cleveland','det-silverdome':'Pontiac Silverdome demolished','det-palace':'Palace of Auburn Hills','det-lca':'Little Caesars Arena Detroit','ind-market':'Market Square Arena Indianapolis demolished','ind-gainbridge':'Gainbridge Fieldhouse Indianapolis','mia-old':'Miami Arena demolished','mia-kaseya':'Kaseya Center Miami','mil-mecca':'UW Milwaukee Panther Arena','mil-bradley':'Bradley Center Milwaukee demolished','mil-fiserv':'Fiserv Forum Milwaukee','nyk-msg4':'Madison Square Garden New York','orl-old':'Amway Arena demolished Orlando','orl-kia':'Kia Center Orlando','phi-spectrum':'Spectrum Philadelphia demolished','phi-xfinity':'Xfinity Mobile Arena Philadelphia','tor-skydome':'Rogers Centre Toronto','tor-mapleleaf':'Maple Leaf Gardens Toronto','tor-scotia':'Scotiabank Arena Toronto','tor-amalie':'Amalie Arena Tampa','was-capitalcentre':'Capital Centre Landover demolished','was-capitalone':'Capital One Arena Washington'}
lock=threading.Lock();next_start=0

def tuples(v):
 if isinstance(v,list):
  if len(v)>=4 and isinstance(v[0],str) and v[0].startswith('0x') and isinstance(v[1],str) and isinstance(v[2],list) and len(v[2])==2 and all(isinstance(n,(int,float))for n in v[2]):yield v
  for x in v:yield from tuples(x)

def get(kq):
 global next_start
 k,q=kq;meta=P/'raw'/f'marker-{k}.json'
 if meta.exists():return json.loads(meta.read_text())
 with lock:delay=max(0,next_start-time.monotonic());next_start=max(next_start,time.monotonic())+.5
 if delay:time.sleep(delay)
 u='https://www.google.com/maps?'+urllib.parse.urlencode({'q':q,'output':'embed','hl':'en'})
 a={'key':k,'query':q,'url':u,'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'unreviewed-mapping-provider-response'}
 try:
  with urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=30)as r:b=r.read();a.update(httpStatus=r.status,finalUrl=r.url)
  h=hashlib.sha256(b).hexdigest();f=f'raw/marker-{k}-{h}.html.gz';(P/f).write_bytes(gzip.compress(b,mtime=0));a.update(bodySha256=h,rawPath=f)
  m=re.search(rb'initEmbed\((.*?)\);',b,re.S)
  if m:a['namedPlaceMarkers']=[{'providerPlaceId':x[0],'nameAddress':x[1],'latitude':x[2][0],'longitude':x[2][1],'providerCid':x[3]} for x in tuples(json.loads(m[1]))]
 except Exception as e:a['error']=type(e).__name__+':'+str(e)[:150]
 meta.write_text(json.dumps(a,indent=2)+'\n');return a
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=3)as pool:out=list(pool.map(get,QUERIES.items()))
 (P/'map-marker-manifest.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({'queries':len(out),'markers':sum(bool(a.get('namedPlaceMarkers'))for a in out),'errors':sum('error'in a for a in out)}))
