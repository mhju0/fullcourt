import {safeError} from './cli-errors';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { config } from 'dotenv';
import postgres from 'postgres';
import { assertLocalDatabase } from './authorization';
import { capture,hash,type Snapshot,type BaselineEvidence } from './core';
import { bytesHash,calculateBridge } from './sources';
async function main() {
  const [output,baselinePath,proofPath,flag,expected]=process.argv.slice(2);
  if(!output||!baselinePath||!proofPath||flag!=='--expected-proof-sha'||!/^[a-f0-9]{64}$/.test(expected??''))throw new Error('Usage: tsx scripts/overtime-correction/bridge.ts OUTPUT.json BASELINE.json PROOF.json --expected-proof-sha SHA256');
  const bytes=readFileSync(proofPath);if(bytesHash(bytes)!==expected)throw new Error('Externally expected source proof SHA-256 mismatch');
  const proof=JSON.parse(bytes.toString()) as {snapshotPath:string;snapshotSha256:string;inputCanonicalHash:string;inputGameIds:number[]};
  const originalBytes=readFileSync(resolve(dirname(proofPath),proof.snapshotPath));if(bytesHash(originalBytes)!==proof.snapshotSha256)throw new Error('Original source snapshot bytes changed');
  const original=JSON.parse(gunzipSync(originalBytes).toString()) as Snapshot;
  if(hash(original)!==proof.inputCanonicalHash||proof.inputGameIds.length!==5815||new Set(proof.inputGameIds).size!==5815)throw new Error('Frozen original source corpus mismatch');
  const baseline=JSON.parse(readFileSync(baselinePath,'utf8')) as BaselineEvidence;
  config({path:'.env.local',quiet:true});const url=process.env.DATABASE_URL??'';assertLocalDatabase(url);const sql=postgres(url,{max:1,prepare:false});
  try {
    const before=await sql.begin(async tx=>{await tx.unsafe('set transaction isolation level repeatable read read only');await tx`select set_config('TimeZone',${baseline.databaseTimeZone},true)`;return capture(tx);});
    if(hash(before)!==baseline.sixTableHash)throw new Error('Fresh six-table baseline drift before source bridge');
    const bridge=calculateBridge(original,before,proof.inputGameIds,proof.snapshotSha256);mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(bridge,null,2)+'\n');console.log(JSON.stringify(bridge));
  }finally{await sql.end();}
}
main().catch(error=>{console.error(safeError(error));process.exitCode=1;});
