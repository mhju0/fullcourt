import {writeFile,mkdir} from 'node:fs/promises';
const out=new URL('./',import.meta.url).pathname;
const raw=process.env.SCHEDULE_AUDIT_RAW_DIR??new URL('../../audit/2026-10-20-schedule-audit/',import.meta.url).pathname;
await mkdir(raw,{recursive:true});
const sources=[
 ['nba-cdn','https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json'],
 ['espn-range','https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20260901-20270131&limit=1000'],
 ['nba-release','https://pr.nba.com/2026-27-nba-regular-season-schedule/'],
 ['nba-cup-faq','https://www.nba.com/news/nba-cup-frequently-asked-questions'],
 ['supabase-changelog','https://supabase.com/changelog.md']
];
const metadata=[];
const pdfUrl='https://ak-static.cms.nba.com/wp-content/uploads/sites/46/2026/08/2026-27-NBA-Regular-Season-Schedule-By-Date.pdf';
const pdf=await fetch(pdfUrl);if(!pdf.ok)throw Error('NBA PDF HTTP '+pdf.status);await writeFile(raw+'nba-by-date.pdf',Buffer.from(await pdf.arrayBuffer()));
(await import('node:child_process')).execFileSync('pdftotext',['-layout',raw+'nba-by-date.pdf',raw+'nba-by-date.txt']);
metadata.push({name:'nba-by-date',url:pdfUrl,status:pdf.status,capturedAt:new Date().toISOString()});
for(const [name,url]of sources){
 try{const response=await fetch(url,{signal:AbortSignal.timeout(30000)});const body=await response.text();const json=response.headers.get('content-type')?.includes('json');await writeFile(raw+name+(json?'.json':'.txt'),body);metadata.push({name,url,status:response.status,capturedAt:new Date().toISOString(),bytes:body.length,contentType:response.headers.get('content-type')});}
 catch(e){metadata.push({name,url,error:String(e),capturedAt:new Date().toISOString()})}
}
await writeFile(out+'provider-metadata.json',JSON.stringify(metadata,null,2)+'\n');console.log(metadata);
