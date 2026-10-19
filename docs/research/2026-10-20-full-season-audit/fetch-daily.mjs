import {readFile,writeFile,mkdir} from 'node:fs/promises';
const out=new URL('./',import.meta.url).pathname;
const raw=process.env.SCHEDULE_AUDIT_RAW_DIR??new URL('../../audit/2026-10-20-full-season-audit/',import.meta.url).pathname;
await mkdir(raw+'espn',{recursive:true});await mkdir(raw+'api',{recursive:true});
const games=JSON.parse(await readFile(raw+'games.json'));
const tasks=[];for(let d=new Date('2026-09-01T00:00:00Z');d<=new Date('2027-04-30T00:00:00Z');d.setUTCDate(d.getUTCDate()+1)){const date=d.toISOString().slice(0,10);tasks.push({source:'espn',date,url:'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates='+date.replaceAll('-','')});}
const result=[];let index=0;
async function capture(t){try{const r=await fetch(t.url,{signal:AbortSignal.timeout(30000)});const body=await r.text();await writeFile(raw+t.source+'/'+t.date+'.json',body);const m={...t,status:r.status,bytes:body.length,capturedAt:new Date().toISOString()};result.push(m);return m;}catch(e){const m={...t,error:String(e),capturedAt:new Date().toISOString()};result.push(m);return m}}
async function worker(){for(;;){const t=tasks[index++];if(!t)return;await capture(t);if(result.length%40===0)console.log('ESPN captured',result.length,'of',tasks.length);}}
await Promise.all(Array.from({length:4},worker));
const dates=[...new Set(games.map(g=>g.date))];let n=0;
for(const date of dates){const t={source:'api',date,url:'https://fullcourt.fyi/api/games/'+date};const response=await capture(t);if(response.status===429){await new Promise(r=>setTimeout(r,30000));await capture(t);}n++;if(n%20===0)console.log('API captured',n,'of',dates.length);await new Promise(r=>setTimeout(r,800));}
await writeFile(out+'daily-fetch-metadata.json',JSON.stringify(result,null,2)+'\n');console.log('Finished',result.length,'non200',JSON.stringify(result.filter(r=>r.status!==200)));
