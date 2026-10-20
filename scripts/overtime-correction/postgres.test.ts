import {beforeAll,afterAll,beforeEach,describe,it,expect,vi} from 'vitest';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import postgres from 'postgres';
import type {LoadedProof} from './sources';
const sourceBoundary=vi.hoisted(()=>({proof:undefined as LoadedProof|undefined}));
vi.mock('./sources',async importOriginal=>({...await importOriginal<typeof import('./sources')>(),loadProof:()=>{if(!sourceBoundary.proof)throw new Error('Missing test source boundary');return sourceBoundary.proof;}}));
import {applyManifest,capture,hash,snapshotTables,frozenPaths,changedPredictionIds,verifyManifest,type Manifest,type Row} from './core';
import {recomputeFatigue,rebuildForecasts,semanticInputHash} from './semantics';
import {bytesHash,calculateBridge} from './sources';
import {assertLocalDatabase,targetFingerprint,connectionTarget} from './authorization';

const url=process.env.OVERTIME_CONTRACT_DATABASE_URL;
// Source adjudication is isolated here; these contracts exercise the real PostgreSQL mutation boundary.
describe.skipIf(!url)('OT correction PostgreSQL atomicity and CAS (private fixture schema)',()=>{
  const schema=`ot_contract_${process.pid}_${Date.now()}`;const directory=mkdtempSync(join(tmpdir(),'fullcourt-ot-pg-'));
  let admin:postgres.Sql,sql:postgres.Sql,blocker:postgres.Sql,manifest:Manifest;
  const open=()=>postgres(url!,{max:1,prepare:false,connection:{search_path:schema}});
  const captureBound=(client:postgres.Sql)=>client.begin(async tx=>{await tx.unsafe("set local TimeZone='UTC'");return capture(tx);});
  async function insert(table:string,rows:Row[]) {
    if(!rows.length)return;const columns=Object.keys(rows[0]);
    await sql.unsafe(`insert into ${table} (${columns.join(',')}) select ${columns.join(',')} from jsonb_populate_recordset(null::${table},$1::jsonb)`,[sql.json(rows as postgres.JSONValue)]);
  }
  beforeAll(async()=>{
    assertLocalDatabase(url!);admin=postgres(url!,{max:1,prepare:false});
    await admin.unsafe(`create schema ${schema}`);
    for(const table of snapshotTables)await admin.unsafe(`create table ${schema}.${table} (like public.${table} including all)`);
    for(const [table,column,parent]of [['games','home_team_id','teams'],['games','away_team_id','teams'],['fatigue_scores','game_id','games'],['fatigue_scores','team_id','teams'],['predictions','game_id','games']] as const)await admin.unsafe(`alter table ${schema}.${table} add foreign key (${column}) references ${schema}.${parent}(id)`);
    await admin.unsafe(`create sequence ${schema}.predictions_id_seq owned by ${schema}.predictions.id`);
    await admin.unsafe(`alter table ${schema}.predictions alter id set default nextval('${schema}.predictions_id_seq')`);
    sql=open();blocker=open();
  });
  afterAll(async()=>{await sql?.end();await blocker?.end();if(admin){await admin.unsafe(`drop schema if exists ${schema} cascade`);await admin.end();}rmSync(directory,{recursive:true,force:true});});
  beforeEach(async()=>{
    await sql.unsafe(`truncate ${snapshotTables.join(',')} restart identity cascade`);
    await sql.unsafe("insert into teams select * from public.teams where abbreviation in ('POR','SAC')");
    await sql.unsafe("insert into games select * from public.games where external_id='0028801021'");
    const games=(await captureBound(sql)).games;expect(games).toHaveLength(1);const original=games[0];
    const second:Row={...original,id:999991,external_id:'test-following-night',date:'1989-04-24',home_score:100,away_score:90,overtime_periods:0,tip_off_utc:null};
    const future:Row={...original,id:999992,external_id:'test-future',date:'2099-10-21',season:'2099-00',status:'scheduled',home_score:null,away_score:null,overtime_periods:0,tip_off_utc:'2099-10-21T23:00:00+00:00'};
    await insert('games',[second,future]);
    const template=(await admin.unsafe('select to_jsonb(t) as row from public.fatigue_scores t limit 1'))[0].row as Row;
    const scoreRows=[original,second,future].flatMap((g,index)=>[g.home_team_id,g.away_team_id].map((id,side)=>({...template,id:900000+index*2+side,game_id:g.id,team_id:id,computed_at:'2000-01-01T00:00:00'})));
    await insert('fatigue_scores',scoreRows);
    const initial=await captureBound(sql);const normalized=recomputeFatigue(initial,'2000-01-01T00:00:00').rows;
    for(const row of normalized)await sql.unsafe('update fatigue_scores target set (score,decay_load_score,travel_load_score,b2b_multiplier,altitude_multiplier,density_multiplier,freshness_bonus,games_in_last_7_days,games_in_last_30_days,travel_distance_miles,is_back_to_back,days_since_last_game,is_overtime_penalty,road_trip_consecutive_away,is_three_in_four,is_four_in_six,has_time_zone_displacement,computed_at)=(source.score,source.decay_load_score,source.travel_load_score,source.b2b_multiplier,source.altitude_multiplier,source.density_multiplier,source.freshness_bonus,source.games_in_last_7_days,source.games_in_last_30_days,source.travel_distance_miles,source.is_back_to_back,source.days_since_last_game,source.is_overtime_penalty,source.road_trip_consecutive_away,source.is_three_in_four,source.is_four_in_six,source.has_time_zone_displacement,source.computed_at) from jsonb_populate_recordset(null::fatigue_scores,$1::jsonb) source where target.id=source.id',[sql.json([row] as postgres.JSONValue)]);
    const predTemplate=(await admin.unsafe('select to_jsonb(t) as row from public.predictions t limit 1'))[0].row as Row;
    await insert('predictions',[{...predTemplate,id:1,game_id:original.id,predicted_advantage_team_id:original.home_team_id,rest_advantage_differential:2,actual_winner_id:original.home_team_id,created_at:'2000-01-01T00:00:00'},{...predTemplate,id:2,game_id:future.id,predicted_advantage_team_id:future.home_team_id,rest_advantage_differential:3,actual_winner_id:null,created_at:'2000-01-01T00:00:00'}]);
    for(const table of ['playoff_series','playoff_series_predictions'])await sql.unsafe(`insert into ${table} select * from public.${table} order by id limit 1`);
    const before=await captureBound(sql),after=structuredClone(before),asOf=new Date().toISOString(),computedAt='2026-10-20T00:00:00';
    after.games[0].overtime_periods=1;const fatigue=recomputeFatigue(after,computedAt);after.fatigue_scores=fatigue.rows;after.predictions=rebuildForecasts({...after,predictions:before.predictions},asOf,computedAt);
    const baseline={schemaVersion:1 as const,databaseTimeZone:'UTC',capturedAt:asOf,sixTableHash:hash(before),semanticInputHash:semanticInputHash(before),differences:0 as const,sides:before.fatigue_scores.length,targetFingerprint:targetFingerprint(connectionTarget(sql)),rowCounts:Object.fromEntries(snapshotTables.map(t=>[t,before[t].length]))};
    const bridge=calculateBridge(before,before,[original.id],'a'.repeat(64));const baselinePath=join(directory,'baseline.json'),bridgePath=join(directory,'bridge.json');writeFileSync(baselinePath,JSON.stringify(baseline));writeFileSync(bridgePath,JSON.stringify(bridge));
    const sourceProof={path:join(directory,'source-boundary-mocked.json'),sha256:'a'.repeat(64),inputCanonicalHash:hash(before),verified:1,unknown:0,expected:5815,factsHash:'b'.repeat(64),validatorSha256:'c'.repeat(64),bridge};
    const inputChanges=[{id:original.id,externalId:String(original.external_id),identity:'1989-04-23:POR:SAC',before:0,after:1,factSha256:'d'.repeat(64)}];sourceBoundary.proof={binding:sourceProof,facts:[],changes:inputChanges,sourceHashes:{}};
    manifest={kind:'overtime-correction',version:1,createdAt:asOf,asOf,computedAt,databaseTimeZone:'UTC',targetFingerprint:baseline.targetFingerprint,beforeHash:hash(before),afterHash:hash(after),beforeSemanticInputHash:semanticInputHash(before),afterSemanticInputHash:semanticInputHash(after),before,after,baseline,baselineEvidence:{path:baselinePath,sha256:bytesHash(readFileSync(baselinePath))},sourceBridge:{path:bridgePath,sha256:bytesHash(readFileSync(bridgePath)),value:bridge},sourceProof,inputChanges,sourceHashes:Object.fromEntries([...frozenPaths,baselinePath,bridgePath].map(p=>[p,bytesHash(readFileSync(p))])),report:{scoredSides:after.fatigue_scores.length,changedFatigueSides:fatigue.changed.length,fatigueChanges:fatigue.changed,changedPredictionIds:changedPredictionIds(before,after),resolvedPredictionHash:hash(before.predictions.filter(p=>p.actual_winner_id!==null)),sourceVerified:1,sourceUnknown:0}};
    verifyManifest(manifest);
  });
  it('changes only a later score, preserves exact timestamps/IDs elsewhere, and survives retry/reconnect/rollback',async()=>{
    expect(manifest.report.changedFatigueSides).toBe(2);expect(manifest.report.fatigueChanges.every(r=>r.gameId===999991)).toBe(true);
    expect(await applyManifest(sql,manifest,'apply')).toBe('applied');const applied=await captureBound(sql);expect(hash(applied)).toBe(manifest.afterHash);
    const originalScores=applied.fatigue_scores.filter(r=>r.game_id===manifest.before.games[0].id);expect(hash(originalScores)).toBe(hash(manifest.before.fatigue_scores.filter(r=>r.game_id===manifest.before.games[0].id)));
    expect(hash(applied.predictions.filter(p=>p.actual_winner_id!==null))).toBe(manifest.report.resolvedPredictionHash);
    expect(await applyManifest(sql,manifest,'apply')).toBe('already-current');const reopened=open();try{expect(hash(await captureBound(reopened))).toBe(manifest.afterHash);}finally{await reopened.end();}
    expect(await applyManifest(sql,manifest,'rollback')).toBe('rolled-back');expect(hash(await captureBound(sql))).toBe(manifest.beforeHash);expect(await applyManifest(sql,manifest,'rollback')).toBe('already-current');
  });
  it.each(['games','fatigue_scores','predictions'] as const)('rolls back every table after injected %s-stage failure',async table=>{
    await expect(applyManifest(sql,manifest,'apply',table)).rejects.toThrow('Injected');expect(hash(await captureBound(sql))).toBe(manifest.beforeHash);
  });
  it('refuses unrelated table drift and refuses rollback over later work',async()=>{
    await sql.unsafe('update playoff_series set computed_at=computed_at+interval \'1 second\'');await expect(applyManifest(sql,manifest,'apply')).rejects.toThrow('drift');await sql.unsafe('update playoff_series set computed_at=computed_at-interval \'1 second\'');
    expect(await applyManifest(sql,manifest,'apply')).toBe('applied');await sql.unsafe('update fatigue_scores set score=score+1 where id=$1',[manifest.after.fatigue_scores[0].id]);await expect(applyManifest(sql,manifest,'rollback')).rejects.toThrow('drift');
  });
  it('refuses a changed forecast whose tip has elapsed before the transaction',async()=>{
    const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse('2100-01-01T00:00:00Z'));
    try{await expect(applyManifest(sql,manifest,'apply')).rejects.toThrow('eligibility expired');}finally{clock.mockRestore();}
    expect(hash(await captureBound(sql))).toBe(manifest.beforeHash);
  });
  it('takes all-six-table writer locks before any update',async()=>{
    let ready!:()=>void,release!:()=>void;const acquired=new Promise<void>(r=>{ready=r;}),held=new Promise<void>(r=>{release=r;});
    const lock=blocker.begin(async tx=>{await tx.unsafe('lock table playoff_series_predictions in row exclusive mode');ready();await held;});await acquired;
    try{await expect(applyManifest(sql,manifest,'apply')).rejects.toThrow(/lock timeout/);}finally{release();await lock;}
    expect(hash(await captureBound(sql))).toBe(manifest.beforeHash);
  });
});
