import { readFileSync } from 'node:fs';
import type postgres from 'postgres';
import { capture, canonical, hash, snapshotTables, type Snapshot, type Row } from '../history-correction/core';
import { authorize, connectionTarget, LOCAL_TARGET, type Authorization } from './authorization';
import { components, recomputeFatigue, rebuildForecasts, semanticInputHash } from './semantics';
import { bytesHash, loadProof, type InputChange, type ProofBinding, type SourceBridge } from './sources';
export { capture, canonical, hash, snapshotTables };
export type { Snapshot, Row };
export const frozenPaths=[
  'src/lib/fatigue.ts','src/lib/fatigue-recent-games.ts','src/lib/physical-venue.ts','src/lib/bubble-venue.ts','src/lib/fatigue-windows.ts','src/lib/team-era-coordinates.ts','src/lib/neutral-venues.ts','src/lib/game-input-corrections.ts','src/data/game-input-corrections.json','src/data/fixture-venue-corrections.json','src/lib/haversine.ts','src/lib/rest-advantage-evidence.ts','src/lib/season-regime.ts','src/lib/game-status.ts','src/lib/db/schema.ts','pnpm-lock.yaml',
  'scripts/history-correction/core.ts','scripts/history-correction/authorization.ts','scripts/history-correction/playoff-contract.ts','scripts/history-correction/playoff-feature-corrections.json','scripts/history-correction/playoff-prediction-revision.json',
  'scripts/overtime-correction/core.ts','scripts/overtime-correction/semantics.ts','scripts/overtime-correction/sources.ts','scripts/overtime-correction/observation.ts','scripts/overtime-correction/official-team-aliases.json','scripts/overtime-correction/supplement.ts','scripts/overtime-correction/supplemental-adjudications.json','scripts/overtime-correction/approved-headline-cases.json','scripts/overtime-correction/authorization.ts','scripts/overtime-correction/prepare.ts','scripts/overtime-correction/run.ts','scripts/overtime-correction/capture-baseline.ts','scripts/overtime-correction/bridge.ts','scripts/overtime-correction/rehearse.ts','scripts/overtime-correction/cli-errors.ts',
] as const;
export interface BaselineEvidence {
  schemaVersion:1;databaseTimeZone:string;capturedAt:string;sixTableHash:string;semanticInputHash:string;differences:0;sides:number;targetFingerprint:string;rowCounts:Record<string,number>;
}
export interface Manifest {
  kind:'overtime-correction';version:1;createdAt:string;asOf:string;computedAt:string;databaseTimeZone:string;targetFingerprint:string;
  beforeHash:string;afterHash:string;beforeSemanticInputHash:string;afterSemanticInputHash:string;
  before:Snapshot;after:Snapshot;baseline:BaselineEvidence;baselineEvidence:{path:string;sha256:string};
  sourceHashes:Record<string,string>;sourceProof:ProofBinding;sourceBridge:{path:string;sha256:string;value:SourceBridge};inputChanges:InputChange[];
  report:{scoredSides:number;changedFatigueSides:number;fatigueChanges:{id:number;gameId:number;fields:string[]}[];changedPredictionIds:number[];resolvedPredictionHash:string;sourceVerified:number;sourceUnknown:number;supplementalAccepted:number};
}
const resolved=(snapshot:Snapshot)=>snapshot.predictions.filter(row=>row.actual_winner_id!==null);
export function changedPredictionIds(before:Snapshot,after:Snapshot):number[] {
  const a=new Map(before.predictions.map(row=>[row.id,row])),b=new Map(after.predictions.map(row=>[row.id,row]));
  return [...new Set([...a.keys(),...b.keys()])].filter(id=>hash(a.get(id)??null)!==hash(b.get(id)??null)).sort((x,y)=>x-y);
}
export function verifySources(manifest:Manifest):void {
  for(const path of frozenPaths)if(!manifest.sourceHashes[path])throw new Error(`Missing frozen engine/tool source: ${path}`);
  for(const [path,expected]of Object.entries(manifest.sourceHashes))if(!/^[a-f0-9]{64}$/.test(expected)||bytesHash(readFileSync(path))!==expected)throw new Error(`Frozen source changed: ${path}`);
}
export function verifyManifest(manifest:Manifest):void {
  if(manifest.kind!=='overtime-correction'||manifest.version!==1||!/^\d{4}-\d{2}-\d{2}T/.test(manifest.asOf)||!Number.isFinite(Date.parse(manifest.asOf))||manifest.createdAt!==manifest.asOf||!manifest.computedAt||!manifest.databaseTimeZone)throw new Error('Invalid OT-only manifest contract');
  if(hash(manifest.before)!==manifest.beforeHash||hash(manifest.after)!==manifest.afterHash||semanticInputHash(manifest.before)!==manifest.beforeSemanticInputHash||semanticInputHash(manifest.after)!==manifest.afterSemanticInputHash)throw new Error('OT manifest snapshot/semantic checksum mismatch');
  const baseline=manifest.baseline;
  if(baseline.schemaVersion!==1||baseline.differences!==0||baseline.sixTableHash!==manifest.beforeHash||baseline.semanticInputHash!==manifest.beforeSemanticInputHash||baseline.databaseTimeZone!==manifest.databaseTimeZone||baseline.sides!==manifest.before.fatigue_scores.length||baseline.targetFingerprint!==manifest.targetFingerprint||!/^[a-f0-9]{64}$/.test(manifest.targetFingerprint))throw new Error('Fresh six-table baseline evidence mismatch');
  for(const table of snapshotTables) {
    for(const snapshot of [manifest.before,manifest.after])if(new Set(snapshot[table].map(row=>row.id)).size!==snapshot[table].length)throw new Error(`Duplicate ${table} identity`);
    if(baseline.rowCounts[table]!==manifest.before[table].length)throw new Error(`Baseline population mismatch ${table}`);
  }
  for(const table of ['teams','playoff_series','playoff_series_predictions'] as const)if(hash(manifest.before[table])!==hash(manifest.after[table]))throw new Error(`Immutable table changed: ${table}`);
  if(hash(resolved(manifest.before))!==hash(resolved(manifest.after)))throw new Error('Resolved predictions must remain byte-identical');
  if(hash(manifest.before.games.map(row=>row.id))!==hash(manifest.after.games.map(row=>row.id)))throw new Error('Game additions/removals/reordering forbidden');
  const games=new Map(manifest.after.games.map(row=>[row.id,row]));
  for(const original of manifest.before.games) {
    const after=games.get(original.id)!;
    for(const field of new Set([...Object.keys(original),...Object.keys(after)]))if(field!=='overtime_periods'&&canonical(original[field])!==canonical(after[field]))throw new Error(`Only overtime_periods may change: ${original.id}.${field}`);
    if(!Number.isSafeInteger(after.overtime_periods)||Number(after.overtime_periods)<0)throw new Error('Overtime must be an exact nonnegative integer');
  }
  if(hash(manifest.before.fatigue_scores.map(row=>[row.id,row.game_id,row.team_id]))!==hash(manifest.after.fatigue_scores.map(row=>[row.id,row.game_id,row.team_id])))throw new Error('Fatigue identities/additions/removals forbidden');
  if(bytesHash(readFileSync(manifest.baselineEvidence.path))!==manifest.baselineEvidence.sha256||hash(JSON.parse(readFileSync(manifest.baselineEvidence.path,'utf8')))!==hash(baseline))throw new Error('Frozen baseline artifact mismatch');
  if(bytesHash(readFileSync(manifest.sourceBridge.path))!==manifest.sourceBridge.sha256||hash(JSON.parse(readFileSync(manifest.sourceBridge.path,'utf8')))!==hash(manifest.sourceBridge.value))throw new Error('Frozen explicit bridge artifact mismatch');
  const proof=loadProof(manifest.sourceProof.path,manifest.sourceProof.sha256,manifest.before,manifest.sourceBridge.value);
  if(hash(proof.binding)!==hash(manifest.sourceProof)||hash(proof.changes)!==hash(manifest.inputChanges))throw new Error('OT patch set differs from authenticated official source outcomes');
  for(const [path,digest]of Object.entries(proof.sourceHashes))if(manifest.sourceHashes[path]!==digest)throw new Error('Missing source proof artifact from frozen manifest');
  const expectedGames=structuredClone(manifest.before.games);const changes=new Map(manifest.inputChanges.map(change=>[change.id,change]));
  for(const game of expectedGames)if(changes.has(game.id))game.overtime_periods=changes.get(game.id)!.after;
  if(hash(expectedGames)!==hash(manifest.after.games))throw new Error('Candidate games do not exactly match the OT-only source transition');
  if(recomputeFatigue(manifest.before,manifest.computedAt).changed.length)throw new Error('Baseline fatigue does not match the current ratified engine');
  const recomputed=recomputeFatigue({...manifest.before,games:manifest.after.games},manifest.computedAt);
  if(hash(recomputed.rows)!==hash(manifest.after.fatigue_scores))throw new Error('Candidate fatigue/timestamp transition differs from complete semantic replay');
  const predictions=rebuildForecasts({...manifest.before,games:manifest.after.games,fatigue_scores:recomputed.rows},manifest.asOf,manifest.computedAt);
  if(hash(predictions)!==hash(manifest.after.predictions))throw new Error('Candidate forecasts differ from prior approved eligibility/rebuild policy');
  const expectedReport={scoredSides:manifest.after.fatigue_scores.length,changedFatigueSides:recomputed.changed.length,fatigueChanges:recomputed.changed,changedPredictionIds:changedPredictionIds(manifest.before,manifest.after),resolvedPredictionHash:hash(resolved(manifest.before)),sourceVerified:proof.binding.verified,sourceUnknown:proof.binding.unknown,supplementalAccepted:proof.binding.supplementalAccepted};
  if(hash(expectedReport)!==hash(manifest.report))throw new Error('OT report does not reconcile to actual transition');
}
export async function applyManifest(sql:postgres.Sql,manifest:Manifest,direction:'apply'|'rollback',failAfterTable?:'games'|'fatigue_scores'|'predictions',authorization?:Authorization):Promise<'applied'|'rolled-back'|'already-current'> {
  const target=connectionTarget(sql);
  if(authorization) {
    if(sql.options.ssl!=='verify-full')throw new Error('OT production requires certificate-verified TLS');
    authorize(target,manifest,direction,authorization);
  }else if(target.host!==LOCAL_TARGET.host||target.port!==LOCAL_TARGET.port||target.database!==LOCAL_TARGET.database)throw new Error('OT mutation requires the exact local shadow or reviewed production authorization');
  verifySources(manifest);verifyManifest(manifest);
  const from=direction==='apply'?manifest.before:manifest.after,to=direction==='apply'?manifest.after:manifest.before;
  const changedIds=new Set(changedPredictionIds(from,to));const predictionGames=new Set([...from.predictions,...to.predictions].filter(row=>changedIds.has(row.id)).map(row=>Number(row.game_id)));
  const verifyForecastClock=(snapshot:Snapshot)=>{
    const games=new Map(snapshot.games.map(row=>[row.id,row]));
    for(const id of predictionGames){const game=games.get(id);if(!game||game.status!=='scheduled'||!game.tip_off_utc||!(Date.parse(String(game.tip_off_utc))>Date.now())||snapshot.predictions.some(row=>row.game_id===id&&row.actual_winner_id!==null))throw new Error(`Forecast eligibility expired or resolved before ${direction}: ${id}`);}
  };
  return sql.begin(async tx=>{
    await tx.unsafe("set local lock_timeout='2s'");await tx.unsafe("set local statement_timeout='180s'");
    if(authorization)await tx.unsafe('set local search_path=public');
    await tx`select set_config('TimeZone',${manifest.databaseTimeZone},true)`;
    await tx.unsafe('lock table teams, games, fatigue_scores, predictions, playoff_series, playoff_series_predictions in share row exclusive mode');
    const current=await capture(tx);const currentHash=hash(current);
    if(currentHash===hash(to))return 'already-current';
    if(currentHash!==hash(from))throw new Error('Frozen complete six-table state drift; no writes performed');
    verifyForecastClock(current);
    for(const table of ['games','fatigue_scores'] as const) {
      const old=new Map(from[table].map(row=>[row.id,row]));const rows=to[table].filter(row=>hash(row)!==hash(old.get(row.id)));
      const columns=table==='games'?['overtime_periods']:[...Object.values(components),'computed_at'];
      for(let i=0;i<rows.length;i+=500)await tx.unsafe(`update ${table} target set ${columns.map(column=>`${column}=source.${column}`).join(',')} from jsonb_populate_recordset(null::${table},$1::jsonb) source where target.id=source.id`,[tx.json(rows.slice(i,i+500) as postgres.JSONValue)]);
      if(failAfterTable===table)throw new Error(`Injected OT transaction failure after ${table}`);
    }
    const beforePredictions=new Map(from.predictions.map(row=>[row.id,row]));const afterPredictions=new Map(to.predictions.map(row=>[row.id,row]));
    const deletes=from.predictions.filter(row=>!afterPredictions.has(row.id)).map(row=>row.id);
    if(deletes.length)await tx.unsafe('delete from predictions where id=any($1::int[])',[deletes]);
    const updates=to.predictions.filter(row=>beforePredictions.has(row.id)&&hash(row)!==hash(beforePredictions.get(row.id)));
    for(let i=0;i<updates.length;i+=500)await tx.unsafe('update predictions target set predicted_advantage_team_id=source.predicted_advantage_team_id,rest_advantage_differential=source.rest_advantage_differential from jsonb_populate_recordset(null::predictions,$1::jsonb) source where target.id=source.id',[tx.json(updates.slice(i,i+500) as postgres.JSONValue)]);
    const additions=to.predictions.filter(row=>!beforePredictions.has(row.id));
    for(const row of additions) {
      const columns=Object.keys(row);if(columns.some(column=>!/^[a-z][a-z0-9_]*$/.test(column)))throw new Error('Unsafe prediction column');
      await tx.unsafe(`insert into predictions (${columns.join(',')}) select ${columns.join(',')} from jsonb_populate_recordset(null::predictions,$1::jsonb)`,[tx.json([row] as postgres.JSONValue)]);
    }
    if(failAfterTable==='predictions')throw new Error('Injected OT transaction failure after predictions');
    const observed=await capture(tx);if(hash(observed)!==hash(to))throw new Error('Post-write complete six-table hash mismatch; transaction rolled back');
    verifyForecastClock(observed);verifySources(manifest);
    if(additions.length)await tx.unsafe("select setval(pg_get_serial_sequence('predictions','id'),greatest((select last_value from predictions_id_seq),(select coalesce(max(id),1) from predictions)),true)");
    return direction==='apply'?'applied':'rolled-back';
  });
}
