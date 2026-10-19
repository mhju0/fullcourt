import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { config } from "dotenv";
import postgres from "postgres";
import { applyManifest, assertLocalDatabase, type Manifest } from "./core";
import { productionTarget,validateProductionAuthorization,requireReviewedManifestDigest,type ProductionAuthorization } from './authorization';
async function main() {
  const [action,path,...flags]=process.argv.slice(2);
  if(!['apply','rollback'].includes(action)||!path)throw new Error('Usage: tsx scripts/history-correction/run.ts apply|rollback MANIFEST.json [--production --expected-manifest-sha SHA256 --expected-target SHA256 --expected-before SHA256 --ack LITERAL]');
  const direction=action as 'apply'|'rollback';
  const production=flags.includes('--production');
  const readFlag=(name:string)=>{const index=flags.indexOf(name);return index<0?'':flags[index+1]??''};
  const allowed=new Set(['--production','--expected-manifest-sha','--expected-target','--expected-before','--ack']);
  const seenFlags=new Set<string>();
  for(let i=0;i<flags.length;i++){
    if(seenFlags.has(flags[i]))throw new Error(`Duplicate flag ${flags[i]}`);
    seenFlags.add(flags[i]);
    if(!allowed.has(flags[i]))throw new Error(`Unknown flag ${flags[i]}`);
    if(flags[i]!=='--production')i++;
  }
  if(!production && flags.length)throw new Error('Production guard flags require explicit --production');
  // A production invocation never reads the checkout's local connection file.
  if(!production)config({path:'.env.local',quiet:true});
  const url=production?(process.env.HISTORY_CORRECTION_DATABASE_URL??''):(process.env.DATABASE_URL??'');
  if(!production)assertLocalDatabase(url);
  const bytes=readFileSync(path);
  const observedManifestDigest=createHash('sha256').update(bytes).digest('hex');
  if(production)requireReviewedManifestDigest(readFlag('--expected-manifest-sha'),observedManifestDigest);
  if(observedManifestDigest!==readFileSync(`${path}.sha256`,'utf8').trim())throw new Error('Manifest file checksum mismatch');
  const manifest=JSON.parse(bytes.toString()) as Manifest;
  for(const [source,expected]of Object.entries(manifest.sourceHashes))if(createHash('sha256').update(readFileSync(source)).digest('hex')!==expected)throw new Error(`Frozen source changed: ${source}`);
  const authorization:ProductionAuthorization|undefined=production?{production:true,expectedTargetFingerprint:readFlag('--expected-target'),expectedBeforeHash:readFlag('--expected-before'),acknowledgement:readFlag('--ack')}:undefined;
  if(authorization)validateProductionAuthorization(productionTarget(url),manifest,direction,authorization);
  const sql=postgres(url,{max:1,...(production?{ssl:'verify-full' as const}:{})});
  try{console.log(await applyManifest(sql,manifest,direction,undefined,authorization));}finally{await sql.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
