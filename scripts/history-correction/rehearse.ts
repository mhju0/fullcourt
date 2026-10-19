import { readFileSync,writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { config } from 'dotenv';
import postgres from 'postgres';
import { assertLocalDatabase,applyManifest,capture,hash,type Manifest } from './core';
async function main(){
 config({path:'.env.local',quiet:true});const url=process.env.DATABASE_URL??'';assertLocalDatabase(url);
 const path=process.argv[2];if(!path)throw new Error('Usage: tsx scripts/history-correction/rehearse.ts MANIFEST.json');
 const m=JSON.parse(readFileSync(path,'utf8'))as Manifest;const sql=postgres(url,{max:1});const blocker=postgres(url,{max:1});const evidence:string[]=[];
 const captureBound=async(client:postgres.Sql)=>client.begin(async tx=>{await tx`select set_config('TimeZone',${m.databaseTimeZone},true)`;return capture(tx)});
 const pass=(s:string)=>{evidence.push(s);console.log(`PASS ${s}`)};
 try{
 await sql.unsafe("set TimeZone='UTC'");
 assert.notEqual(hash(await capture(sql)),m.beforeHash);pass('different connection timezone changes timestamp text without changing stored values');
 assert.equal(hash(await captureBound(sql)),m.beforeHash);
 await assert.rejects(applyManifest(sql,m,'apply','fatigue_scores'),/Injected/);
 assert.equal(hash(await captureBound(sql)),m.beforeHash);pass('input + fatigue writes roll back atomically on prediction-stage failure');
 for(const table of ['playoff_series','playoff_series_predictions']){await assert.rejects(applyManifest(sql,m,'apply',table),/Injected/);assert.equal(hash(await captureBound(sql)),m.beforeHash);pass(`six-table atomic rollback after ${table} writes`);}
 for(const table of ['playoff_series','playoff_series_predictions'] as const){const field=table==='playoff_series'?'win_pct_diff':'predicted_home_court_win_prob';const row=m.before[table][0];await sql.unsafe(`update ${table} set ${field}=${field}+1 where id=$1`,[row.id]);await assert.rejects(applyManifest(sql,m,'apply'),/drift/);await sql.unsafe(`update ${table} set ${field}=$1 where id=$2`,[String(row[field]),row.id]);assert.equal(hash(await captureBound(sql)),m.beforeHash);pass(`full-domain CAS refuses ${table} drift`);}
 const g=m.before.games[0];await sql`update games set overtime_periods=overtime_periods+1 where id=${g.id}`;
 await assert.rejects(applyManifest(sql,m,'apply'),/drift/);
 await sql`update games set overtime_periods=${Number(g.overtime_periods)} where id=${g.id}`;
 assert.equal(hash(await captureBound(sql)),m.beforeHash);pass('changed source input is refused before writes and exact baseline restored');
 let release!:()=>void;let locked!:()=>void;
 const ready=new Promise<void>(r=>{locked=r}),wait=new Promise<void>(r=>{release=r});
 const lock=blocker.begin(async tx=>{await tx.unsafe('lock table playoff_series_predictions in row exclusive mode');locked();await wait;});
 await ready;
 try{await assert.rejects(applyManifest(sql,m,'apply'),/lock timeout/);pass('real ordinary writer lock blocks candidate atomically');}finally{release();await lock;}
 assert.equal(hash(await captureBound(sql)),m.beforeHash);
 assert.equal(await applyManifest(sql,m,'apply'),'applied');assert.equal(hash(await captureBound(sql)),m.afterHash);pass('all accepted inputs + complete fatigue pairs + eligible forecasts applied');
 const candidate=await captureBound(sql);
 assert.equal(candidate.games.length,m.before.games.length+4);assert.equal(candidate.fatigue_scores.length,m.before.fatigue_scores.length+8);
 for(const g of m.gameAdditions){assert.equal(candidate.games.filter(r=>r.external_id===g.external_id).length,1);assert.equal(candidate.fatigue_scores.filter(s=>s.game_id===g.id).length,2);assert.equal(candidate.predictions.filter(p=>p.game_id===g.id).length,0);}
 pass('four canonical additions have complete FK-backed pairs, no retrospective forecasts, and no duplicate fixture');
 assert.equal(await applyManifest(sql,m,'apply'),'already-current');pass('retry is idempotent');
 await sql.end();const reopened=postgres(url,{max:1});
 try{assert.equal(hash(await captureBound(reopened)),m.afterHash);pass('candidate survives database connection restart');
 const resolved=(await captureBound(reopened)).predictions.filter(p=>p.actual_winner_id!==null);
 assert.equal(hash(resolved),hash(m.before.predictions.filter(p=>p.actual_winner_id!==null)));pass('resolved predictions preserved byte for byte');
 assert.equal(hash((await captureBound(reopened)).playoff_series_predictions.filter(p=>m.before.playoff_series_predictions.some(old=>old.id===p.id))),hash(m.before.playoff_series_predictions));assert.equal(candidate.playoff_series_predictions.length,m.before.playoff_series_predictions.length+1050);pass('all 2099 old playoff predictions preserved and complete 1050-row new revision inserted');
 await reopened`update fatigue_scores set score=score+1 where id=${m.after.fatigue_scores[0].id}`;
 await assert.rejects(applyManifest(reopened,m,'rollback'),/drift/);
 await reopened`update fatigue_scores set score=${String(m.after.fatigue_scores[0].score)} where id=${m.after.fatigue_scores[0].id}`;
 pass('rollback refuses candidate drift instead of overwriting newer work');
 assert.equal(await applyManifest(reopened,m,'rollback'),'rolled-back');assert.equal(hash(await captureBound(reopened)),m.beforeHash);pass('conditional rollback restores exact baseline and removes four games/eight dependent scores in FK-safe order');
 assert.equal(await applyManifest(reopened,m,'rollback'),'already-current');pass('rollback retry is idempotent');
 }finally{await reopened.end();}
 writeFileSync(`${path}.rehearsal.json`,JSON.stringify({checkedAt:new Date().toISOString(),beforeHash:m.beforeHash,afterHash:m.afterHash,evidence},null,2)+'\n');
 }finally{await blocker.end();await sql.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
