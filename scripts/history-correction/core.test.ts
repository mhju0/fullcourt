import { describe,it,expect } from 'vitest';
import { assertLocalDatabase,canonical,hash,verifyManifest,type Manifest,type Snapshot } from './core';
import { applyGameInputCorrection,lookupFixtureVenueCorrection } from '../../src/lib/game-input-corrections';
import inputs from '../../src/data/game-input-corrections.json';
import venues from '../../src/data/fixture-venue-corrections.json';
describe('historical correction safety',()=>{
 it('denies every non-shadow destination including connection overrides',()=>{
  expect(()=>assertLocalDatabase('postgres://u@127.0.0.1:55434/fullcourt_recalculation')).not.toThrow();
  for(const target of ['postgres://u@production:5432/postgres','postgres://u@localhost:55434/fullcourt_recalculation','postgres://u@127.0.0.1:55434/postgres','postgres://u@127.0.0.1:55434/fullcourt_recalculation?host=production'])expect(()=>assertLocalDatabase(target)).toThrow();
 });
 it('canonicalizes only key order while preserving exact values',()=>{
  expect(hash({a:1,b:'2'})).toBe(hash({b:'2',a:1}));expect(hash({a:1})).not.toBe(hash({a:'1'}));expect(canonical(null)).toBe('null');
 });
 it('pins accepted input scope and independently dated arena identities',()=>{
  const counts=Object.fromEntries(['overtimePeriods','gameType','neutralSite','tipOffUtc'].map(field=>[field,inputs.fixtures.filter(f=>field in f.fields).length]));
  expect(counts).toEqual({overtimePeriods:783,gameType:109,neutralSite:189,tipOffUtc:2});expect(venues.fixtures).toHaveLength(171);expect(venues.fixtures.filter(f=>f.neutral)).toHaveLength(22);
  expect(lookupFixtureVenueCorrection({date:'1990-11-02',homeAbbr:'UTA',awayAbbr:'PHX'})?.arena).toBe('Tokyo Metropolitan Gymnasium');
  expect(venues.fixtures.filter(f=>f.date.startsWith('1996')&&f.city==='Tokyo').every(f=>f.arena==='Tokyo Dome')).toBe(true);
  expect(venues.fixtures.find(f=>f.date==='1997-12-06')?.arena).toBe('Palacio de los Deportes');
  expect(venues.fixtures.filter(f=>f.city==='Austin').every(f=>!f.neutral)).toBe(true);
 });
 it('reingest overlay survives provider rekey and overrides defaults after normalization',()=>{
  const f=inputs.fixtures.find(f=>f.fields.overtimePeriods)!;
  const normalized={date:f.date,homeAbbr:f.homeAbbr,awayAbbr:f.awayAbbr,externalId:'new-provider-id',overtimePeriods:0};
  expect(applyGameInputCorrection(normalized).overtimePeriods).toBe(f.fields.overtimePeriods!.after);
  expect(applyGameInputCorrection(normalized).externalId).toBe('new-provider-id');
 });
 it('rejects resolved-history edits and incomplete score pairs',()=>{
  const before:Snapshot={teams:[],games:[{id:1,home_team_id:1,away_team_id:2}],fatigue_scores:[{id:1,game_id:1,team_id:1},{id:2,game_id:1,team_id:2}],predictions:[{id:1,game_id:1,actual_winner_id:1}],playoff_series:[],playoff_series_predictions:[]};
  const after=structuredClone(before);after.predictions[0].actual_winner_id=2;
  const manifest={version:2,baseline:{differences:0},before,after,beforeHash:hash(before),afterHash:hash(after)}as Manifest;
  expect(()=>verifyManifest(manifest)).toThrow('Resolved');
  after.predictions=structuredClone(before.predictions);after.fatigue_scores.pop();manifest.afterHash=hash(after);expect(()=>verifyManifest(manifest)).toThrow('Incomplete');
 });
});

it('score reconciliation applies accepted OT after provider period normalization',async()=>{
 const {reconcileScores}=await import('../../src/lib/espn-scoreboard');
 const fixture=inputs.fixtures.find(f=>f.fields.overtimePeriods)!;
 const result=reconcileScores([{id:fixture.auditGameId,homeAbbr:fixture.homeAbbr,awayAbbr:fixture.awayAbbr,status:'final',homeScore:100,awayScore:90,overtimePeriods:0}],[{eventId:'different-provider-key',date:fixture.date,homeAbbr:fixture.homeAbbr,awayAbbr:fixture.awayAbbr,status:'final',homeScore:100,awayScore:90,periods:4}],fixture.date);
 expect(result.updates[0].overtimePeriods).toBe(fixture.fields.overtimePeriods!.after);
 expect(result.updates[0].expectedIdentity).toEqual({date:fixture.date,homeAbbr:fixture.homeAbbr,awayAbbr:fixture.awayAbbr});
});

it('production guard requires explicit target, expected hash, and literal acknowledgement without a connection',async()=>{
 const {productionTarget,targetFingerprint,validateProductionAuthorization,requiredAcknowledgement}=await import('./authorization');
 const target=productionTarget('postgres://reviewer:secret@reviewed.example:6543/postgres');
 expect(targetFingerprint(target)).toBe(targetFingerprint(productionTarget('postgres://reviewer:other-secret@reviewed.example:6543/postgres')));
 const manifest={beforeHash:'a'.repeat(64),afterHash:'b'.repeat(64)}as Manifest;
 const valid={production:true as const,expectedTargetFingerprint:targetFingerprint(target),expectedBeforeHash:manifest.beforeHash,acknowledgement:requiredAcknowledgement('apply')};
 expect(()=>validateProductionAuthorization(target,manifest,'apply',valid)).not.toThrow();
 for(const bad of [{...valid,expectedTargetFingerprint:'0'.repeat(64)},{...valid,expectedBeforeHash:manifest.afterHash},{...valid,acknowledgement:''}])expect(()=>validateProductionAuthorization(target,manifest,'apply',bad)).toThrow();
 expect(()=>productionTarget('postgres://u@127.0.0.1:55434/fullcourt_recalculation')).toThrow();
 expect(()=>productionTarget('postgres://u@reviewed.example/postgres?sslmode=disable')).toThrow();
});

it('retains reviewed omissions as nonregular physical workload during reingest',async()=>{
 const {acceptedAddedFixtures,canonicalGameType,espnScheduleGameType}=await import('../../src/lib/game-input-corrections');
 expect(acceptedAddedFixtures).toHaveLength(4);
 expect(canonicalGameType('0062600001')).toBe('cup_final');expect(canonicalGameType('0051900111')).toBe('play_in');
 expect(espnScheduleGameType([{headline:'NBA Cup Championship'}])).toBe('cup_final');
 expect(espnScheduleGameType([{headline:'NBA In-Season Tournament Championship'}])).toBe('cup_final');
 expect(espnScheduleGameType([{headline:'NBA Cup Semifinals'}])).toBe('regular');
 for(const f of acceptedAddedFixtures){
  expect(f.overtimePeriods).toBe(0);expect(f.neutralSite).toBe(true);
  const got=applyGameInputCorrection({...f,externalId:'provider-rekey',gameType:'regular',neutralSite:false,overtimePeriods:3});
  expect(got.gameType).toBe(f.gameType);expect(got.neutralSite).toBe(true);expect(got.overtimePeriods).toBe(0);
 }
 expect(lookupFixtureVenueCorrection({date:'2020-08-15',homeAbbr:'POR',awayAbbr:'MEM'})?.arena).toBe('The Field House');
});

it('permits exactly four reviewed omissions and rejects an extra or altered fixture',()=>{
 const additions=inputs.addedFixtures;
 const abbreviations=[...new Set(additions.flatMap(f=>[f.homeAbbr,f.awayAbbr]))];
 const teams=abbreviations.map((abbreviation,i)=>({id:i+1,abbreviation}));
 const teamId=(abbr:string)=>teams.find(t=>t.abbreviation===abbr)!.id;
 const games=additions.map((f,i)=>({id:100+i,date:f.date,external_id:f.externalId,season:f.season,game_type:f.gameType,home_team_id:teamId(f.homeAbbr),away_team_id:teamId(f.awayAbbr),home_score:f.homeScore,away_score:f.awayScore,status:f.status,overtime_periods:f.overtimePeriods,tip_off_utc:f.tipOffUtc,neutral_site:f.neutralSite,neutral_venue_city:f.neutralVenueCity}));
 const before:Snapshot={teams,games:[],fatigue_scores:[],predictions:[],playoff_series:[],playoff_series_predictions:[]};
 const after:Snapshot={teams,games,fatigue_scores:games.flatMap((g,i)=>[{id:2*i+1,game_id:g.id,team_id:g.home_team_id},{id:2*i+2,game_id:g.id,team_id:g.away_team_id}]),predictions:[],playoff_series:[],playoff_series_predictions:[]};
 const manifest:Manifest={version:2,databaseTimeZone:'UTC',createdAt:'2026-10-19T00:00:00Z',asOf:'2026-10-19T00:00:00Z',sourceHashes:{},inputChanges:[],report:null,baseline:{sides:0,differences:0},before,after,gameAdditions:games,beforeHash:hash(before),afterHash:hash(after)};
 expect(()=>verifyManifest(manifest)).toThrow("Unexpected full playoff baseline population");
 const changedFatigueIdentity=structuredClone(manifest);
 changedFatigueIdentity.gameAdditions=structuredClone(games);
 const historical={id:1,date:'2010-01-01',home_team_id:teams[0].id,away_team_id:teams[1].id};
 changedFatigueIdentity.before.games.push(historical);changedFatigueIdentity.after.games.push({...historical});
 changedFatigueIdentity.before.fatigue_scores.push({id:900,game_id:1,team_id:teams[0].id},{id:901,game_id:1,team_id:teams[1].id});
 changedFatigueIdentity.after.fatigue_scores.push({id:902,game_id:1,team_id:teams[0].id},{id:901,game_id:1,team_id:teams[1].id});
 changedFatigueIdentity.beforeHash=hash(changedFatigueIdentity.before);changedFatigueIdentity.afterHash=hash(changedFatigueIdentity.after);
 expect(()=>verifyManifest(changedFatigueIdentity)).toThrow('Existing fatigue identity');
 games[0].game_type='regular';manifest.afterHash=hash(after);expect(()=>verifyManifest(manifest)).toThrow('value mismatch');
 games[0].game_type=additions[0].gameType;games.push({...games[0],id:999});after.fatigue_scores.push({id:999,game_id:999,team_id:games[0].home_team_id},{id:1000,game_id:999,team_id:games[0].away_team_id});manifest.afterHash=hash(after);expect(()=>verifyManifest(manifest)).toThrow('four reviewed');
});

it('requires an external exact manifest digest rather than trusting a neighboring sidecar',async()=>{
 const {requireReviewedManifestDigest}=await import('./authorization');
 const observed='a'.repeat(64);
 for(const expected of ['', 'a'.repeat(63), 'A'.repeat(64),'b'.repeat(64)])expect(()=>requireReviewedManifestDigest(expected,observed)).toThrow();
 expect(()=>requireReviewedManifestDigest(observed,observed)).not.toThrow();
});

it('production CLI rejects absent, malformed, or different byte SHA before parsing/connecting',async()=>{
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {spawnSync}=await import('node:child_process');
 const directory=mkdtempSync(join(tmpdir(),'fullcourt-manifest-guard-'));const path=join(directory,'candidate.json');
 writeFileSync(path,'not valid JSON');
 try{for(const digest of [undefined,'bad','0'.repeat(64)]){
  const args=['node_modules/tsx/dist/cli.mjs','scripts/history-correction/run.ts','apply',path,'--production',...(digest===undefined?[]:['--expected-manifest-sha',digest])];
  const result=spawnSync(process.execPath,args,{encoding:'utf8',timeout:10000,env:{...process.env,HISTORY_CORRECTION_DATABASE_URL:'postgres://test@must-not-connect.invalid/postgres'}});
  expect(result.status).toBe(1);expect(result.stderr).toMatch(/expected-manifest-sha|manifest SHA-256 mismatch/);expect(result.stderr).not.toMatch(/SyntaxError|ENOTFOUND|ECONNREFUSED/);
 }}finally{rmSync(directory,{recursive:true,force:true});}
});

it('rejects changes to existing game identity/results before approving mutable inputs',()=>{
 const before:Snapshot={teams:[],games:[{id:1,external_id:'kept',date:'2020-01-01',season:'2019-20',home_team_id:1,away_team_id:2,home_score:100}],fatigue_scores:[{id:1,game_id:1,team_id:1},{id:2,game_id:1,team_id:2}],predictions:[],playoff_series:[],playoff_series_predictions:[]};
 for(const change of [{external_id:'new'},{date:'2020-01-02'},{home_team_id:2},{home_score:101}]){
  const after=structuredClone(before);Object.assign(after.games[0],change);
  const manifest={version:2,baseline:{differences:0},before,after,beforeHash:hash(before),afterHash:hash(after)}as Manifest;
  expect(()=>verifyManifest(manifest)).toThrow('immutable column');
 }
});
