import pathlib,urllib.request,urllib.parse,concurrent.futures,time,threading,json,hashlib,gzip,re,datetime
P=pathlib.Path(__file__).parent
QUERIES={'dal-reunion': 'Reunion Arena 777 Sports St, Dallas, TX', 'dal-aac': 'American Airlines Center 2500 Victory Ave, Dallas, TX 75219', 'den-mcnichols': 'McNichols Sports Arena 1635 Bryant St, Denver, CO', 'den-ball': 'Ball Arena 1000 Chopper Cir, Denver, CO 80204', 'gsw-oakland': 'Oakland Arena 7000 Coliseum Way, Oakland, CA 94621', 'gsw-sanjose': 'SAP Center 525 W Santa Clara St, San Jose, CA 95113', 'gsw-chase': 'Chase Center 1 Warriors Way, San Francisco, CA 94158', 'hou-summit': 'The Summit 3700 Southwest Fwy, Houston, TX 77027', 'hou-toyota': 'Toyota Center 1510 Polk St, Houston, TX 77002', 'lac-sports': 'Los Angeles Memorial Sports Arena 3939 S Figueroa St, Los Angeles, CA', 'la-staples': 'Crypto.com Arena 1111 S Figueroa St, Los Angeles, CA 90015', 'lac-intuit': 'Intuit Dome 3930 W Century Blvd, Inglewood, CA 90303', 'lal-forum': 'Kia Forum 3900 W Manchester Blvd, Inglewood, CA 90305', 'mem-vancouver': 'Rogers Arena 800 Griffiths Way, Vancouver, BC V6B 6G1, Canada', 'mem-pyramid': 'Memphis Pyramid 1 Bass Pro Dr, Memphis, TN 38105', 'mem-fedex': 'FedExForum 191 Beale St, Memphis, TN 38103', 'min-metrodome': 'Metrodome 900 S 5th St, Minneapolis, MN', 'min-target': 'Target Center 600 N 1st Ave, Minneapolis, MN 55403', 'nop-neworleans': 'Smoothie King Center 1501 Dave Dixon Dr, New Orleans, LA 70113', 'okc-ford': 'Paycom Center 100 W Reno Ave, Oklahoma City, OK 73102', 'sea-coliseum': 'Climate Pledge Arena 334 1st Ave N, Seattle, WA 98109', 'sea-tacoma': 'Tacoma Dome 2727 E D St, Tacoma, WA 98421', 'phx-veterans': 'Arizona Veterans Memorial Coliseum 1826 W McDowell Rd, Phoenix, AZ 85007', 'phx-americawest': 'Mortgage Matchup Center 201 E Jefferson St, Phoenix, AZ 85004', 'por-memorial': 'Veterans Memorial Coliseum 300 N Ramsay Way, Portland, OR 97227', 'por-rose': 'Moda Center 1 N Center Court St, Portland, OR 97227', 'sac-arco1': 'Original ARCO Arena 1625 N Market Blvd, Sacramento, CA', 'sac-arco2': 'ARCO Arena 1 Sports Pkwy, Sacramento, CA', 'sac-golden1': 'Golden 1 Center 500 David J Stern Walk, Sacramento, CA 95814', 'sas-hemisfair': 'HemisFair Arena 600 Hemisfair Plaza Way, San Antonio, TX', 'sas-alamodome': 'Alamodome 100 Montana St, San Antonio, TX 78203', 'sas-frost': 'Frost Bank Center 1 Frost Bank Center Dr, San Antonio, TX 78219', 'uta-saltpalace': 'Original Salt Palace Arena 100 S West Temple, Salt Lake City, UT', 'uta-delta': 'Delta Center 301 S Temple, Salt Lake City, UT 84101'}
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
