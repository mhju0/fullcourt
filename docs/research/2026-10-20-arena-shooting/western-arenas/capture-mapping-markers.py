"""Retain original Apple Maps address markers; names are request labels, not POI proof."""
import concurrent.futures, datetime, gzip, hashlib, json, pathlib, re, urllib.parse, urllib.request
ROOT = pathlib.Path(__file__).resolve().parent
INPUTS = [
('dal-reunion','Reunion Arena','777 Sports St, Dallas, TX'),('dal-aac','American Airlines Center','2500 Victory Ave, Dallas, TX 75219'),
('den-mcnichols','McNichols Sports Arena','1635 Bryant St, Denver, CO'),('den-ball','Ball Arena','1000 Chopper Cir, Denver, CO 80204'),
('gsw-oakland','Oakland Arena','7000 Coliseum Way, Oakland, CA 94621'),('gsw-sanjose','SAP Center','525 W Santa Clara St, San Jose, CA 95113'),('gsw-chase','Chase Center','1 Warriors Way, San Francisco, CA 94158'),
('hou-summit','The Summit','3700 Southwest Fwy, Houston, TX 77027'),('hou-toyota','Toyota Center','1510 Polk St, Houston, TX 77002'),
('lac-sports','Los Angeles Memorial Sports Arena','3939 S Figueroa St, Los Angeles, CA'),('la-staples','Crypto.com Arena','1111 S Figueroa St, Los Angeles, CA 90015'),('lac-intuit','Intuit Dome','3930 W Century Blvd, Inglewood, CA 90303'),('lal-forum','Kia Forum','3900 W Manchester Blvd, Inglewood, CA 90305'),
('mem-vancouver','Rogers Arena','800 Griffiths Way, Vancouver, BC V6B 6G1, Canada'),('mem-pyramid','Memphis Pyramid','1 Bass Pro Dr, Memphis, TN 38105'),('mem-fedex','FedExForum','191 Beale St, Memphis, TN 38103'),
('min-metrodome','Metrodome','900 S 5th St, Minneapolis, MN'),('min-target','Target Center','600 N 1st Ave, Minneapolis, MN 55403'),
('nop-neworleans','Smoothie King Center','1501 Dave Dixon Dr, New Orleans, LA 70113'),('okc-ford','Paycom Center','100 W Reno Ave, Oklahoma City, OK 73102'),
('sea-coliseum','Climate Pledge Arena','334 1st Ave N, Seattle, WA 98109'),('sea-tacoma','Tacoma Dome','2727 E D St, Tacoma, WA 98421'),
('phx-veterans','Arizona Veterans Memorial Coliseum','1826 W McDowell Rd, Phoenix, AZ 85007'),('phx-americawest','Mortgage Matchup Center','201 E Jefferson St, Phoenix, AZ 85004'),
('por-memorial','Veterans Memorial Coliseum','300 N Ramsay Way, Portland, OR 97227'),('por-rose','Moda Center','1 N Center Court St, Portland, OR 97227'),
('sac-arco1','Original ARCO Arena','1625 N Market Blvd, Sacramento, CA'),('sac-arco2','ARCO Arena','1 Sports Pkwy, Sacramento, CA'),('sac-golden1','Golden 1 Center','500 David J Stern Walk, Sacramento, CA 95814'),
('sas-hemisfair','HemisFair Arena','600 Hemisfair Plaza Way, San Antonio, TX'),('sas-alamodome','Alamodome','100 Montana St, San Antonio, TX 78203'),('sas-frost','Frost Bank Center','1 Frost Bank Center Dr, San Antonio, TX 78219'),
('uta-saltpalace','Original Salt Palace Arena','100 S West Temple, Salt Lake City, UT'),('uta-delta','Delta Center','301 S Temple, Salt Lake City, UT 84101')]
def capture(row):
 ident,name,address=row
 url='https://maps.apple.com/place?'+urllib.parse.urlencode({'name':name,'address':address})
 rec={'id':'apple-'+ident,'arenaId':ident,'requestedName':name,'requestedAddress':address,'url':url,'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'unverified-address-candidate'}
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=25) as res:
   body=res.read();rec.update(httpStatus=res.status,finalUrl=res.url)
  sha=hashlib.sha256(body).hexdigest(); path='raw/'+rec['id']+'-'+sha[:12]+'.html.gz';retained=gzip.compress(body,mtime=0);(ROOT/path).write_bytes(retained)
  text=body.decode(errors='replace'); coords=re.findall(r'property="place:location:(?:latitude|longitude)" content="([^"]+)"',text)
  rec.update(bodySha256=sha,rawPath=path,retainedSha256=hashlib.sha256(retained).hexdigest(),bytes=len(body),coordinates=coords,
   returnedAddressHtml=re.findall(r'class="sc-address".*?</a>',text),
   interpretation='Address-geocoding marker. Requested name may be echoed; not an independently resolved named POI. Historical exact building/court point and official address corroboration remain required.')
 except Exception as exc:rec['error']=str(exc)
 return rec
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:records=list(pool.map(capture,INPUTS))
 (ROOT/'mapping-marker-candidates.json').write_text(json.dumps(records,indent=2)+'\n')
 print(json.dumps([{'arenaId':r['arenaId'],'coordinates':r.get('coordinates'),'error':r.get('error')}for r in records],indent=2))
