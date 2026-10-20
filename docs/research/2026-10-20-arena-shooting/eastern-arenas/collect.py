import concurrent.futures,datetime as dt,gzip,hashlib,json,pathlib,re,threading,time,urllib.request
P=pathlib.Path(__file__).parent
lock=threading.Lock();next_start=0

def fetch(item):
 global next_start
 name,url=item['key'],item['url'];meta=P/'raw'/(name+'.json')
 if meta.exists():return json.loads(meta.read_text())
 with lock:
  delay=max(0,next_start-time.monotonic());next_start=max(next_start,time.monotonic())+.35
 if delay:time.sleep(delay)
 result=dict(**item,capturedAt=dt.datetime.now(dt.timezone.utc).isoformat())
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; FullCourtArenaResearch/1.0)'}),timeout=35)as r:body=r.read();result.update(httpStatus=r.status,finalUrl=r.url,headers=dict(r.headers))
  digest=hashlib.sha256(body).hexdigest();path='raw/'+name+'-'+digest+'.html.gz';(P/path).write_bytes(gzip.compress(body,mtime=0));result.update(bodySha256=digest,rawPath=path)
  m=re.search(rb'<script\b[^>]*\bid=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>',body,re.S)
  if m:
   d=json.loads(m[1]);g=d.get('props',{}).get('pageProps',{}).get('game')
   if isinstance(g,dict):result['game']={k:g.get(k)for k in['gameId','gameCode','gameEt','gameTimeUTC','gameStatus','arena','homeTeamId','awayTeamId']};result['game'].update(home=g.get('homeTeam',{}).get('teamTricode'),away=g.get('awayTeam',{}).get('teamTricode'),homeScore=g.get('homeTeam',{}).get('score'),awayScore=g.get('awayTeam',{}).get('score'))
  text=body.decode('utf8','replace');result['coordinateSnippets']=re.findall(r'.{0,100}(?:latitude|longitude|data-lat|data-lng|@\d{2}\.\d{3}).{0,130}',text,re.I)[:30]
 except Exception as e:result.update(error=type(e).__name__+':'+str(e)[:180])
 meta.write_text(json.dumps(result,indent=2)+'\n');return result

def main():
 items=json.loads((P/'requests.json').read_text())
 with concurrent.futures.ThreadPoolExecutor(max_workers=4)as pool:
  out=list(pool.map(fetch,items))
 (P/'capture-manifest.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({'requests':len(out),'http200':sum(x.get('httpStatus')==200for x in out),'games':sum('game'in x for x in out),'errors':sum('error'in x for x in out)}))
if __name__=='__main__':main()
