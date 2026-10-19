import {writeFile,mkdir} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import postgres from 'postgres';
import {parse} from 'dotenv';
const out=new URL('./',import.meta.url).pathname;
const raw=process.env.SCHEDULE_AUDIT_RAW_DIR??new URL('../../audit/2026-10-20-full-season-audit/',import.meta.url).pathname;
await mkdir(raw,{recursive:true});
const env={...parse(readFileSync('.env.local')),...process.env};
if(!env.DATABASE_URL)throw Error('DATABASE_URL missing');
const sql=postgres(env.DATABASE_URL,{prepare:false,max:1,connect_timeout:10});
const started=new Date().toISOString();
try {
const snap=await sql.begin('isolation level repeatable read read only',async tx=>{
 const teams=await tx`select id,abbreviation,name,city,latitude,longitude,altitude_flag from teams order by abbreviation`;
 const games=await tx`select * from games where season='2026-27' order by date,id`;
 const context=await tx`select id,date,season,game_type,status,home_team_id,away_team_id from games where date between '2026-09-01' and '2027-04-30' order by date,id`;
 const scores=await tx`select distinct on (f.game_id,f.team_id) f.* from fatigue_scores f join games g on g.id=f.game_id where g.season='2026-27' order by f.game_id,f.team_id,f.computed_at desc,f.id desc`;
 const duplicates=await tx`select f.game_id,f.team_id,count(*)::int as count from fatigue_scores f join games g on g.id=f.game_id where g.season='2026-27' group by f.game_id,f.team_id having count(*)>1`;
 return {teams,games,context,scores,duplicates};
});
for(const name of ['games','context'] as const) for (const row of snap[name]) row.date=String(row.date instanceof Date ? row.date.toISOString() : row.date).slice(0,10);
for(const [name,data]of Object.entries(snap))await writeFile((['games','scores','context','duplicates'].includes(name)?raw:out)+name+'.json',JSON.stringify(data,null,2)+'\n');
await writeFile(out+'capture-metadata.json',JSON.stringify({started,finished:new Date().toISOString(),transaction:'REPEATABLE READ READ ONLY',sourceCommit:(await import('node:child_process')).execSync('git rev-parse HEAD').toString().trim(),counts:Object.fromEntries(Object.entries(snap).map(([k,v])=>[k,v.length]))},null,2)+'\n');
console.log(Object.fromEntries(Object.entries(snap).map(([k,v])=>[k,v.length])));
}finally{await sql.end()}
