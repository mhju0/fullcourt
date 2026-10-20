import {safeError} from './cli-errors';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from 'dotenv';
import postgres from 'postgres';
import { assertLocalDatabase, connectionTarget, targetFingerprint } from './authorization';
import { capture, hash, snapshotTables, type BaselineEvidence } from './core';
import { recomputeFatigue, semanticInputHash } from './semantics';
async function main() {
  const [output,...flags]=process.argv.slice(2);
  if(!output||!(flags.length===0||(flags.length===2&&flags[0]==='--target-fingerprint'&&/^[a-f0-9]{64}$/.test(flags[1]))))throw new Error('Usage: tsx scripts/overtime-correction/capture-baseline.ts OUTPUT.json [--target-fingerprint REVIEWED_DESTINATION_SHA]');
  config({path:'.env.local',quiet:true});const url=process.env.DATABASE_URL??'';assertLocalDatabase(url);const sql=postgres(url,{max:1,prepare:false});
  try {
    const before=await sql.begin(async tx=>{await tx.unsafe('set transaction isolation level repeatable read read only');await tx.unsafe("set local TimeZone='UTC'");return capture(tx);});
    const replay=recomputeFatigue(before,new Date().toISOString());
    if(replay.changed.length)throw new Error(`Fresh baseline has ${replay.changed.length} ratified-engine semantic differences`);
    const evidence:BaselineEvidence={schemaVersion:1,databaseTimeZone:'UTC',capturedAt:new Date().toISOString(),sixTableHash:hash(before),semanticInputHash:semanticInputHash(before),differences:0,sides:before.fatigue_scores.length,targetFingerprint:flags[1]??targetFingerprint(connectionTarget(sql)),rowCounts:Object.fromEntries(snapshotTables.map(table=>[table,before[table].length]))};
    mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
  }finally{await sql.end();}
}
main().catch(error=>{console.error(safeError(error));process.exitCode=1;});
