import {safeError} from './cli-errors';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { config } from 'dotenv';
import postgres from 'postgres';
import { assertLocalDatabase } from './authorization';
import { capture,hash,frozenPaths,verifyManifest,verifySources,changedPredictionIds,type BaselineEvidence,type Manifest,type Snapshot } from './core';
import { recomputeFatigue,rebuildForecasts,semanticInputHash } from './semantics';
import { bytesHash,loadProof,type SourceBridge } from './sources';
async function main() {
  const [output,baselinePath,proofPath,bridgePath,flag,expectedProof,...extra]=process.argv.slice(2);
  if(!output||!baselinePath||!proofPath||!bridgePath||flag!=='--expected-proof-sha'||!/^[a-f0-9]{64}$/.test(expectedProof??'')||extra.length)throw new Error('Usage: tsx scripts/overtime-correction/prepare.ts OUTPUT.json BASELINE.json PROOF.json BRIDGE.json --expected-proof-sha SHA256');
  const baselineBytes=readFileSync(baselinePath),bridgeBytes=readFileSync(bridgePath);const baseline=JSON.parse(baselineBytes.toString()) as BaselineEvidence;const bridge=JSON.parse(bridgeBytes.toString()) as SourceBridge;
  config({path:'.env.local',quiet:true});const url=process.env.DATABASE_URL??'';assertLocalDatabase(url);const sql=postgres(url,{max:1,prepare:false});
  try {
    const before=await sql.begin(async tx=>{await tx.unsafe('set transaction isolation level repeatable read read only');await tx`select set_config('TimeZone',${baseline.databaseTimeZone},true)`;return capture(tx);});
    if(baseline.sixTableHash!==hash(before)||baseline.semanticInputHash!==semanticInputHash(before)||baseline.differences!==0)throw new Error('Fresh complete baseline hash mismatch');
    const proof=loadProof(proofPath,expectedProof,before,bridge);
    const sourceHashes:Record<string,string>={...Object.fromEntries(frozenPaths.map(path=>[path,bytesHash(readFileSync(path))])),...proof.sourceHashes,[resolve(baselinePath)]:bytesHash(baselineBytes),[resolve(bridgePath)]:bytesHash(bridgeBytes)};
    const asOf=new Date().toISOString();const [{stamp}]=await sql.begin(async tx=>{await tx`select set_config('TimeZone',${baseline.databaseTimeZone},true)`;return tx`select to_jsonb(localtimestamp) as stamp`;});const computedAt=String(stamp);
    if(recomputeFatigue(before,computedAt).changed.length)throw new Error('Original baseline ratified-engine replay differs');
    const after:Snapshot=structuredClone(before);const games=new Map(after.games.map(game=>[game.id,game]));
    for(const change of proof.changes)games.get(change.id)!.overtime_periods=change.after;
    const fatigue=recomputeFatigue(after,computedAt);after.fatigue_scores=fatigue.rows;after.predictions=rebuildForecasts({...after,predictions:before.predictions},asOf,computedAt);
    const manifest:Manifest={kind:'overtime-correction',version:1,createdAt:asOf,asOf,computedAt,databaseTimeZone:baseline.databaseTimeZone,targetFingerprint:baseline.targetFingerprint,beforeHash:hash(before),afterHash:hash(after),beforeSemanticInputHash:semanticInputHash(before),afterSemanticInputHash:semanticInputHash(after),before,after,baseline,baselineEvidence:{path:resolve(baselinePath),sha256:bytesHash(baselineBytes)},sourceHashes,sourceProof:proof.binding,sourceBridge:{path:resolve(bridgePath),sha256:bytesHash(bridgeBytes),value:bridge},inputChanges:proof.changes,report:{scoredSides:after.fatigue_scores.length,changedFatigueSides:fatigue.changed.length,fatigueChanges:fatigue.changed,changedPredictionIds:changedPredictionIds(before,after),resolvedPredictionHash:hash(before.predictions.filter(row=>row.actual_winner_id!==null)),sourceVerified:proof.binding.verified,sourceUnknown:proof.binding.unknown,supplementalAccepted:proof.binding.supplementalAccepted}};
    verifySources(manifest);verifyManifest(manifest);mkdirSync(dirname(output),{recursive:true});const encoded=JSON.stringify(manifest);writeFileSync(output,encoded);writeFileSync(output+'.sha256',bytesHash(encoded)+'\n');writeFileSync(output+'.report.json',JSON.stringify({beforeHash:manifest.beforeHash,afterHash:manifest.afterHash,beforeSemanticInputHash:manifest.beforeSemanticInputHash,afterSemanticInputHash:manifest.afterSemanticInputHash,sourceProof:manifest.sourceProof,inputChanges:manifest.inputChanges,report:manifest.report},null,2)+'\n');console.log(JSON.stringify({output,manifestSha256:bytesHash(encoded),beforeHash:manifest.beforeHash,afterHash:manifest.afterHash,inputChanges:manifest.inputChanges.length,changedFatigueSides:fatigue.changed.length,changedPredictionIds:manifest.report.changedPredictionIds}));
  }finally{await sql.end();}
}
main().catch(error=>{console.error(safeError(error));process.exitCode=1;});
