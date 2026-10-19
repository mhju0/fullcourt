import {readFile,writeFile,mkdir} from 'node:fs/promises';
const out=new URL('./',import.meta.url).pathname;
const raw=process.env.SCHEDULE_AUDIT_RAW_DIR??new URL('../../audit/2026-10-20-schedule-audit/',import.meta.url).pathname;
await mkdir(raw,{recursive:true});
const games=JSON.parse(await readFile(raw+'games.json'));
const dates=[];for(let d=new Date('2026-09-01T00:00:00Z');d<=new Date('2027-01-31T00:00:00Z');d.setUTCDate(d.getUTCDate()+1))dates.push(d.toISOString().slice(0,10));
const tasks=dates.map(date=>({source:'espn',date,url:'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates='+date.replaceAll('-','')}));
for(const date of [...new Set(games.filter(g=>g.date<='2026-12-31').map(g=>g.date))])tasks.push({source:'api',date,url:'https://fullcourt.fyi/api/games/'+date});
const result=[];let index=0;
await mkdir(raw+'espn',{recursive:true});await mkdir(raw+'api',{recursive:true});
async function worker(){for(;;){const t=tasks[index++];if(!t)return;try{try { if (JSON.parse(await readFile(raw+t.source+'/'+t.date+'.json')).events && t.source==='espn') continue; } catch {} const r=await fetch(t.url,{signal:AbortSignal.timeout(30000)});const body=await r.text();await writeFile(raw+t.source+'/'+t.date+'.json',body);result.push({...t,status:r.status,bytes:body.length,capturedAt:new Date().toISOString()});}catch(e){result.push({...t,error:String(e),capturedAt:new Date().toISOString()})}if(index%30===0)console.log('Captured',result.length,'of',tasks.length);if(t.source==='api')await new Promise(r=>setTimeout(r,1800));}}
await Promise.all(Array.from({length:4},worker));
await writeFile(out+'daily-fetch-metadata.json',JSON.stringify(result,null,2)+'\n');console.log('Finished',result.length,JSON.stringify(result.filter(r=>r.status!==200)));
