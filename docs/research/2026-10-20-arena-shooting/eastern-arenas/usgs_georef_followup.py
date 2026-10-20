import pathlib,json,urllib.request,urllib.parse,hashlib,pypdf,fitz
P=pathlib.Path(__file__).parent
for name,lat,lon in [('miami-1994',25.7836,-80.195),('orlando-west-1995',28.5487,-81.3843)]:
 pg=pypdf.PdfReader(P/('usgs-'+name+'.pdf')).pages[0];L=pg['/LGIDict'][0];pr=L['/Projection'];ctm=list(map(float,L['/CTM']));H=float(pg.mediabox.height)
 wkt='PROJCS["NAD83_Custom_TM",GEOGCS["GCS_North_American_1983",DATUM["D_North_American_1983",SPHEROID["GRS_1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",0],PARAMETER["False_Northing",0],PARAMETER["Central_Meridian",'+str(pr['/CentralMeridian'])+'],PARAMETER["Scale_Factor",1],PARAMETER["Latitude_Of_Origin",'+str(pr['/OriginLatitude'])+'],UNIT["Meter",1]]'
 u='https://utility.arcgisonline.com/ArcGIS/rest/services/Geometry/GeometryServer/project?'+urllib.parse.urlencode({'inSR':4326,'outSR':json.dumps({'wkt':wkt}),'geometries':json.dumps({'geometryType':'esriGeometryPoint','geometries':[{'x':lon,'y':lat}]}),'f':'json'})
 with urllib.request.urlopen(u,timeout=60)as r:b=r.read()
 z=json.loads(b)['geometries'][0];a,bb,c,d,e,f=ctm;xx=(z['x']-e)/a;yy=H-(z['y']-f)/d
 meta={'url':u,'sourceWkt':wkt,'ctm':ctm,'candidateUsedOnlyToLocateCrop':[lat,lon],'candidatePdfTopLeftPoint':[xx,yy],'rawResponse':json.loads(b),'bodySha256':hashlib.sha256(b).hexdigest()}
 (P/('usgs-'+name+'-crop-location.json')).write_text(json.dumps(meta,indent=2)+'\n')
 doc=fitz.open(P/('usgs-'+name+'.pdf'));doc[0].get_pixmap(matrix=fitz.Matrix(3,3),clip=fitz.Rect(xx-110,yy-110,xx+110,yy+110)).save(str(P/('usgs-'+name+'-candidate-area.png')))
 print(name,xx,yy)
