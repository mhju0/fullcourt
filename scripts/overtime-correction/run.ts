import {safeError} from './cli-errors';
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import postgres from 'postgres';
import { applyManifest,verifySources,verifyManifest,capture,hash,type Manifest } from './core';
import { assertLocalDatabase,productionTarget,authorize,requireReviewedManifestDigest,type Authorization } from './authorization';
import { bytesHash } from './sources';
async function main() {
  const [action,path,...flags]=process.argv.slice(2);
  if(!['apply','rollback','check'].includes(action)||!path)throw new Error('Usage: tsx scripts/overtime-correction/run.ts apply|rollback|check MANIFEST.json [--production --expected-manifest-sha SHA --expected-source-proof-sha SHA --expected-target SHA --expected-before SHA --ack LITERAL]');
  const direction=action as 'apply'|'rollback',values=new Map<string,string>();
  const allowed=new Set(['--production','--expected-manifest-sha','--expected-source-proof-sha','--expected-target','--expected-before','--ack']);
  for(let i=0;i<flags.length;i++){const flag=flags[i];if(!allowed.has(flag)||values.has(flag))throw new Error('Unknown or duplicate production guard flag');if(flag==='--production')values.set(flag,'true');else{const value=flags[++i];if(!value||value.startsWith('--'))throw new Error('Missing production guard value');values.set(flag,value);}}
  const production=values.has('--production');if(action==='check'&&production)throw new Error('Read-only check is restricted to the local shadow');if(!production&&values.size)throw new Error('Production guard flags require --production');
  const bytes=readFileSync(path),digest=bytesHash(bytes);
  if(production)requireReviewedManifestDigest(values.get('--expected-manifest-sha')??'',digest);
  if(readFileSync(path+'.sha256','utf8').trim()!==digest)throw new Error('Manifest sidecar checksum mismatch');
  const manifest=JSON.parse(bytes.toString()) as Manifest;
  if(production&&(!/^[a-f0-9]{64}$/.test(values.get('--expected-source-proof-sha')??'')||values.get('--expected-source-proof-sha')!==manifest.sourceProof.sha256))throw new Error('Externally reviewed source corpus SHA-256 mismatch');
  verifySources(manifest);
  if(!production)config({path:'.env.local',quiet:true});const url=production?(process.env.OVERTIME_CORRECTION_DATABASE_URL??''):(process.env.DATABASE_URL??'');
  if(!production)assertLocalDatabase(url);
  const authorization:Authorization|undefined=production?{production:true,expectedTargetFingerprint:values.get('--expected-target')??'',expectedBeforeHash:values.get('--expected-before')??'',acknowledgement:values.get('--ack')??''}:undefined;
  if(authorization)authorize(productionTarget(url),manifest,direction,authorization);
  const sql=postgres(url,{max:1,prepare:false,...(production?{ssl:'verify-full' as const}:{})});
  try{
    if(action==='check'){verifyManifest(manifest);const snapshot=await sql.begin(async tx=>{await tx.unsafe('set transaction isolation level repeatable read read only');await tx`select set_config('TimeZone',${manifest.databaseTimeZone},true)`;return capture(tx);});const current=hash(snapshot);if(current!==manifest.beforeHash&&current!==manifest.afterHash)throw new Error('Frozen complete six-table state drift; check performed no writes');console.log(JSON.stringify({mode:'read-only',state:current===manifest.beforeHash?'before':'after',hash:current,sourceProofSha256:manifest.sourceProof.sha256}));}
    else console.log(await applyManifest(sql,manifest,direction,undefined,authorization));
  }finally{await sql.end();}
}
main().catch(error=>{console.error(safeError(error));process.exitCode=1;});
