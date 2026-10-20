import {safeError} from './cli-errors';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {config} from 'dotenv';
import postgres from 'postgres';
import {assertLocalDatabase} from './authorization';
import {applyManifest,capture,hash,verifySources,type Manifest} from './core';
import {bytesHash} from './sources';
async function main() {
  const [path]=process.argv.slice(2);if(!path)throw new Error('Usage: tsx scripts/overtime-correction/rehearse.ts MANIFEST.json');
  const bytes=readFileSync(path);if(bytesHash(bytes)!==readFileSync(path+'.sha256','utf8').trim())throw new Error('Manifest sidecar mismatch');
  const manifest=JSON.parse(bytes.toString()) as Manifest;verifySources(manifest);
  config({path:'.env.local',quiet:true});const url=process.env.DATABASE_URL??'';assertLocalDatabase(url);
  const sql=postgres(url,{max:1,prepare:false}),blocker=postgres(url,{max:1,prepare:false});const checks:string[]=[];
  const captureBound=(client:postgres.Sql)=>client.begin(async tx=>{await tx`select set_config('TimeZone',${manifest.databaseTimeZone},true)`;return capture(tx);});
  const pass=(name:string)=>{checks.push(name);console.log(`PASS ${name}`);};
  try {
    assert.equal(hash(await captureBound(sql)),manifest.beforeHash);
    for(const stage of ['games','fatigue_scores','predictions'] as const){await assert.rejects(applyManifest(sql,manifest,'apply',stage),/Injected/);assert.equal(hash(await captureBound(sql)),manifest.beforeHash);pass(`complete six-table rollback after ${stage}-stage failure`);}
    const tampered=structuredClone(manifest);tampered.sourceHashes['src/lib/fatigue.ts']='0'.repeat(64);await assert.rejects(applyManifest(sql,tampered,'apply'),/Frozen source/);assert.equal(hash(await captureBound(sql)),manifest.beforeHash);pass('frozen engine source hash refusal before writes');
    for(const table of ['games','playoff_series','playoff_series_predictions'] as const) {
      const field=table==='games'?'overtime_periods':table==='playoff_series'?'win_pct_diff':'predicted_home_court_win_prob';const row=manifest.before[table][0];if(!row)throw new Error(`Missing real rehearsal row ${table}`);
      await sql.unsafe(`update ${table} set ${field}=${field}+1 where id=$1`,[row.id]);
      try{await assert.rejects(applyManifest(sql,manifest,'apply'),/state drift/);}finally{const restored=await sql.unsafe(`update ${table} set ${field}=$1 where id=$2 and ${field}=$1::numeric+1 returning id`,[String(row[field]),row.id]);assert.equal(restored.length,1,'Concurrent rehearsal drift: refusing blind restoration');}
      assert.equal(hash(await captureBound(sql)),manifest.beforeHash);pass(`full-domain CAS refuses ${table} drift`);
    }
    let ready!:()=>void,release!:()=>void;const acquired=new Promise<void>(r=>{ready=r;}),held=new Promise<void>(r=>{release=r;});
    const lock=blocker.begin(async tx=>{await tx.unsafe('lock table playoff_series_predictions in row exclusive mode');ready();await held;});await acquired;
    try{await assert.rejects(applyManifest(sql,manifest,'apply'),/lock timeout/);}finally{release();await lock;}
    assert.equal(hash(await captureBound(sql)),manifest.beforeHash);pass('real ordinary writer lock blocks all candidate changes');
    assert.equal(await applyManifest(sql,manifest,'apply'),'applied');assert.equal(hash(await captureBound(sql)),manifest.afterHash);pass('unmocked full source-bound OT-only candidate applied atomically');
    assert.equal(await applyManifest(sql,manifest,'apply'),'already-current');pass('apply retry returns already-current');
    const reconnected=postgres(url,{max:1,prepare:false});
    try {
      const after=await captureBound(reconnected);assert.equal(hash(after),manifest.afterHash);pass('exact candidate survives connection restart');
      for(const table of ['teams','playoff_series','playoff_series_predictions'] as const)assert.equal(hash(after[table]),hash(manifest.before[table]));
      assert.equal(hash(after.predictions.filter(row=>row.actual_winner_id!==null)),manifest.report.resolvedPredictionHash);pass('teams, both playoff tables and resolved history remain byte-identical');
      const changed=new Set(manifest.report.fatigueChanges.map(row=>row.id));const old=new Map(manifest.before.fatigue_scores.map(row=>[row.id,row]));
      for(const row of after.fatigue_scores)if(!changed.has(row.id))assert.equal(hash(row),hash(old.get(row.id)));pass('every semantically unchanged fatigue row retains all bytes and timestamps');
      const row=after.fatigue_scores[0];await reconnected.unsafe('update fatigue_scores set score=score+1 where id=$1',[row.id]);
      try{await assert.rejects(applyManifest(reconnected,manifest,'rollback'),/state drift/);}finally{const restored=await reconnected.unsafe('update fatigue_scores set score=$1 where id=$2 and score=$1::numeric+1 returning id',[String(row.score),row.id]);assert.equal(restored.length,1,'Concurrent rehearsal drift: refusing blind restoration');}
      pass('rollback refuses later work');
      assert.equal(await applyManifest(reconnected,manifest,'rollback'),'rolled-back');assert.equal(hash(await captureBound(reconnected)),manifest.beforeHash);pass('conditional rollback restores exact complete fresh baseline');
      assert.equal(await applyManifest(reconnected,manifest,'rollback'),'already-current');pass('rollback retry returns already-current');
    }finally{await reconnected.end();}
    writeFileSync(path+'.rehearsal.json',JSON.stringify({checkedAt:new Date().toISOString(),manifestSha256:bytesHash(bytes),beforeHash:manifest.beforeHash,afterHash:manifest.afterHash,sourceProofSha256:manifest.sourceProof.sha256,checks},null,2)+'\n');
  }finally{await blocker.end();await sql.end();}
}
main().catch(error=>{console.error(safeError(error));process.exitCode=1;});
