import { readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { hash, type Snapshot, type Row } from '../history-correction/core';
import { components, semanticScoreValue } from './semantics';
export const bytesHash=(bytes:Buffer|string):string=>createHash('sha256').update(bytes).digest('hex');
export interface OfficialFact {
  schemaVersion:1;validatorVersion:string;gameId:number;externalId:string;date:string;season:string;homeAbbr:string;awayAbbr:string;
  stored:{homeScore:number;awayScore:number;overtimePeriods:number};
  source:{url:string;capturedAt:string;httpStatus:number|null;bodySha256?:string;rawPath?:string;rawGzipSha256?:string};
  observed:{gameId?:string;gameCode?:string;gameEt?:string;gameStatus?:number;period?:number;home?:OfficialSide;away?:OfficialSide};
  decision:{status:'verified'|'unknown';overtimePeriods:number|null;reasons:string[]};
}
interface OfficialSide {teamId:number;tricode:string;canonicalAbbr:string;score:number;minutes:string;periods:{period:number;periodType:string;score:number}[]}
export interface SourceBridge { sourceInputCanonicalHash:string; sourceSnapshotSha256:string; freshBeforeHash:string; originalTargetProjectionHash:string; freshTargetProjectionHash:string; originalFinalHistorySemanticHash:string; freshFinalHistorySemanticHash:string; originalTeamMappingHash:string; freshTeamMappingHash:string }
export interface ProofBinding {path:string;sha256:string;inputCanonicalHash:string;verified:number;unknown:number;expected:number;factsHash:string;validatorSha256:string;bridge:SourceBridge}
export interface InputChange {id:number;externalId:string;identity:string;before:number;after:number;factSha256:string}
export interface LoadedProof {binding:ProofBinding;facts:OfficialFact[];changes:InputChange[];sourceHashes:Record<string,string>}
function inside(directory:string,path:string):string {
  const full=resolve(directory,path);
  if(!full.startsWith(resolve(directory)+sep))throw new Error('Proof evidence path must remain inside the proof directory');
  return full;
}
function nonnegativeInteger(value:unknown):value is number {return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;}
export function validateVerifiedFact(fact:OfficialFact):number {
  const observed=fact.observed,home=observed.home,away=observed.away;
  if(fact.decision.status!=='verified'||fact.decision.reasons.length||!nonnegativeInteger(fact.decision.overtimePeriods))throw new Error('Unverified official overtime fact');
  if(fact.source.httpStatus!==200||!/^https:\/\/www\.nba\.com\//.test(fact.source.url)||!Number.isFinite(Date.parse(fact.source.capturedAt)))throw new Error('Official source transport/provenance invalid');
  if(observed.gameId!==fact.externalId||observed.gameStatus!==3||!observed.gameEt||observed.gameEt.slice(0,10)!==fact.date||!Number.isFinite(Date.parse(observed.gameEt)))throw new Error('Official game identity/date/final status mismatch');
  const code=observed.gameCode?.match(/^(\d{8})\/([A-Z]{3})([A-Z]{3})$/);
  if(!code||code[1]!==fact.date.replaceAll('-',''))throw new Error('Official gameCode date mismatch');
  if(!home||!away||home.canonicalAbbr!==fact.homeAbbr||away.canonicalAbbr!==fact.awayAbbr||home.teamId===away.teamId)throw new Error('Official normalized team pairing mismatch');
  const n=home.periods?.length;
  if(!n||n<4||n!==away.periods?.length||observed.period!==n)throw new Error('Incomplete or inconsistent official period arrays');
  for(const [side,score]of [[home,fact.stored.homeScore],[away,fact.stored.awayScore]] as const) {
    if(!nonnegativeInteger(side.score)||side.score!==score)throw new Error('Official final score mismatch');
    side.periods.forEach((period,index)=>{
      if(period.period!==index+1||period.periodType!==(index<4?'REGULAR':'OVERTIME')||!nonnegativeInteger(period.score))throw new Error('Invalid official numbered period');
    });
    if(side.periods.reduce((sum,p)=>sum+p.score,0)!==score)throw new Error('Period numerator does not reconcile to final score');
  }
  if(home.score===away.score)throw new Error('Tied official final score');
  for(let end=4;end<n;end++)if(home.periods.slice(0,end).reduce((sum,p)=>sum+p.score,0)!==away.periods.slice(0,end).reduce((sum,p)=>sum+p.score,0))throw new Error('Not tied before a claimed overtime period');
  const overtime=n-4;
  if(fact.decision.overtimePeriods!==overtime)throw new Error('Exact overtime count disagrees with numbered periods');
  return overtime;
}
export function matchFactToGame(fact:OfficialFact,game:Row,teams:Map<number,Row>):void {
  if(fact.gameId!==game.id||fact.externalId!==game.external_id||fact.date!==game.date||fact.season!==game.season||fact.homeAbbr!==teams.get(Number(game.home_team_id))?.abbreviation||fact.awayAbbr!==teams.get(Number(game.away_team_id))?.abbreviation||fact.stored.homeScore!==game.home_score||fact.stored.awayScore!==game.away_score||fact.stored.overtimePeriods!==game.overtime_periods||game.status!=='final')throw new Error(`Official fact does not match frozen game ${fact.gameId}`);
}
export function calculateBridge(original:Snapshot,before:Snapshot,ids:number[],snapshotSha256:string):SourceBridge {
  const projection=(snapshot:Snapshot)=>{const games=new Map(snapshot.games.map(g=>[g.id,g]));return [...ids].sort((a,b)=>a-b).map(id=>{const g=games.get(id);if(!g)throw new Error('Source target absent from bridge snapshot');const teams=new Map(snapshot.teams.map(t=>[t.id,t.abbreviation]));return {...Object.fromEntries(['id','external_id','date','season','status','game_type','home_team_id','away_team_id','home_score','away_score','overtime_periods'].map(field=>[field,g[field]])),homeAbbr:teams.get(Number(g.home_team_id)),awayAbbr:teams.get(Number(g.away_team_id))};});};
  const finalHistory=(snapshot:Snapshot)=>{const games=snapshot.games.filter(g=>g.status==='final');const ids=new Set(games.map(g=>g.id));return {teams:snapshot.teams,games,fatigue_scores:snapshot.fatigue_scores.filter(row=>ids.has(Number(row.game_id))).map(row=>({id:row.id,game_id:row.game_id,team_id:row.team_id,...Object.fromEntries(Object.values(components).map(column=>[column,semanticScoreValue(column,row[column])]))}))};};
  const teamMapping=(snapshot:Snapshot)=>snapshot.teams.map(t=>({id:t.id,abbreviation:t.abbreviation}));
  const bridge={originalTeamMappingHash:hash(teamMapping(original)),freshTeamMappingHash:hash(teamMapping(before)),sourceInputCanonicalHash:hash(original),sourceSnapshotSha256:snapshotSha256,freshBeforeHash:hash(before),originalTargetProjectionHash:hash(projection(original)),freshTargetProjectionHash:hash(projection(before)),originalFinalHistorySemanticHash:hash(finalHistory(original)),freshFinalHistorySemanticHash:hash(finalHistory(before))};
  if(bridge.originalTeamMappingHash!==bridge.freshTeamMappingHash||bridge.originalTargetProjectionHash!==bridge.freshTargetProjectionHash||bridge.originalFinalHistorySemanticHash!==bridge.freshFinalHistorySemanticHash)throw new Error('Source-to-fresh-baseline projection or final-history semantic drift; re-adjudication required');
  return bridge;
}
export function loadProof(path:string,expectedSha256:string,before:Snapshot,expectedBridge:SourceBridge):LoadedProof {
  const full=resolve(path),bytes=readFileSync(full);
  if(!/^[a-f0-9]{64}$/.test(expectedSha256)||bytesHash(bytes)!==expectedSha256)throw new Error('Externally expected source proof SHA-256 mismatch');
  const proof=JSON.parse(bytes.toString()) as {schemaVersion:number;kind:string;complete:boolean;unattemptedGameIds:number[];targetProjectionPath:string;targetProjectionSha256:string;teamMapPath:string;teamMapSha256:string;validatorVersion:string;validatorSha256:string;validatorPath?:string;inputCanonicalHash:string;snapshotSha256:string;snapshotPath?:string;inputGameIds:number[];targetManifestPath:string;targetManifestSha256:string;facts:{gameId:number;externalId:string;path:string;sha256:string;decision:string;overtimePeriods:number|null}[];counts:{expected:number;attempted:number;verified:number;unknown:number;verifiedPositiveOT:number}};
  if(proof.schemaVersion!==1||proof.kind!=='official-overtime-proof'||proof.validatorVersion!=='official-nba-periods-v1')throw new Error('Invalid official source proof contract');
  if(proof.complete!==true||proof.unattemptedGameIds.length!==0||proof.counts.expected!==5815||proof.counts.attempted!==5815||proof.inputGameIds.length!==5815||proof.facts.length!==5815||new Set(proof.inputGameIds).size!==5815)throw new Error('Source proof must freeze all 5815 attempted targets, including unknowns');
  const sourceHashes:Record<string,string>={[full]:expectedSha256};
  const directory=dirname(full);const targetPath=inside(directory,proof.targetManifestPath);
  if(bytesHash(readFileSync(targetPath))!==proof.targetManifestSha256)throw new Error('Frozen target manifest hash mismatch');
  sourceHashes[targetPath]=proof.targetManifestSha256;
  const validatorPath=inside(directory,proof.validatorPath??'capture.py');
  if(bytesHash(readFileSync(validatorPath))!==proof.validatorSha256)throw new Error('Frozen official validator hash mismatch');
  sourceHashes[validatorPath]=proof.validatorSha256;
  const targets=JSON.parse(readFileSync(targetPath,'utf8')) as {targets:OfficialFact[];inputCanonicalHash:string;inputSnapshotSha256:string};
  if(targets.inputCanonicalHash!==proof.inputCanonicalHash||targets.inputSnapshotSha256!==proof.snapshotSha256||hash(targets.targets.map(f=>f.gameId).sort((a,b)=>a-b))!==hash([...proof.inputGameIds].sort((a,b)=>a-b)))throw new Error('Frozen target inventory mismatch');
  if(!proof.snapshotPath)throw new Error('Source proof requires its original snapshot path');
  const snapshotPath=inside(directory,proof.snapshotPath),snapshotBytes=readFileSync(snapshotPath);
  if(bytesHash(snapshotBytes)!==proof.snapshotSha256)throw new Error('Original source snapshot byte hash mismatch');
  sourceHashes[snapshotPath]=proof.snapshotSha256;
  const original=JSON.parse(gunzipSync(snapshotBytes).toString()) as Snapshot;
  const bridge=calculateBridge(original,before,proof.inputGameIds,proof.snapshotSha256);
  if(bridge.sourceInputCanonicalHash!==proof.inputCanonicalHash||hash(bridge)!==hash(expectedBridge))throw new Error('Explicit reviewed source bridge mismatch');
  const originalGames=new Map(original.games.map(g=>[g.id,g])),originalTeams=new Map(original.teams.map(t=>[t.id,t]));
  const columns=['id','external_id','date','season','status','game_type','home_team_id','away_team_id','home_score','away_score','overtime_periods'];
  const projectionPath=inside(directory,proof.targetProjectionPath),teamMapPath=inside(directory,proof.teamMapPath);
  if(bytesHash(readFileSync(projectionPath))!==proof.targetProjectionSha256||bytesHash(readFileSync(teamMapPath))!==proof.teamMapSha256)throw new Error('Frozen target projection/team mapping byte hash mismatch');
  sourceHashes[projectionPath]=proof.targetProjectionSha256;sourceHashes[teamMapPath]=proof.teamMapSha256;
  const projection=JSON.parse(readFileSync(projectionPath,'utf8'));const mapping=JSON.parse(readFileSync(teamMapPath,'utf8'));
  const expectedRows=[...proof.inputGameIds].sort((a,b)=>a-b).map(id=>{const game=originalGames.get(id);if(!game)throw new Error('Source projection contains missing original game');return Object.fromEntries(columns.map(column=>[column,game[column]]));});
  if(projection.schemaVersion!==1||hash(projection.columns)!==hash(columns)||hash(projection.rows)!==hash(expectedRows)||mapping.schemaVersion!==1||hash(mapping.teams)!==hash(original.teams.map(t=>({id:t.id,abbreviation:t.abbreviation}))))throw new Error('Source target projection/team map was not derived from the authenticated original snapshot');
  const games=new Map(before.games.map(g=>[g.id,g])),teams=new Map(before.teams.map(t=>[t.id,t]));
  const targetById=new Map(targets.targets.map(f=>[f.gameId,f]));const facts:OfficialFact[]=[];const changes:InputChange[]=[];const seen=new Set<number>();let verified=0,unknown=0,positive=0;
  for(const entry of proof.facts) {
    if(seen.has(entry.gameId)||!proof.inputGameIds.includes(entry.gameId))throw new Error('Duplicate or unexpected source target');seen.add(entry.gameId);
    const factPath=inside(directory,entry.path),factBytes=readFileSync(factPath);
    if(bytesHash(factBytes)!==entry.sha256)throw new Error('Frozen fact hash mismatch');sourceHashes[factPath]=entry.sha256;
    const fact=JSON.parse(factBytes.toString()) as OfficialFact;const game=games.get(fact.gameId),target=targetById.get(fact.gameId);
    if(!game||!target||fact.gameId!==entry.gameId||fact.externalId!==entry.externalId||fact.validatorVersion!==proof.validatorVersion||fact.schemaVersion!==1||entry.decision!==fact.decision.status||entry.overtimePeriods!==fact.decision.overtimePeriods)throw new Error('Fact/index contract mismatch');
    for(const field of ['gameId','externalId','date','season','homeAbbr','awayAbbr','stored'] as const)if(hash(fact[field])!==hash(target[field]))throw new Error('Fact/frozen target identity mismatch');
    matchFactToGame(fact,game,teams);
    const originalGame=originalGames.get(fact.gameId);
    if(!originalGame)throw new Error('Fact absent from original source snapshot');
    matchFactToGame(fact,originalGame,originalTeams);
    if(game.overtime_periods!==0)throw new Error('OT discovery corpus must originate from stored zero values');
    if(fact.source.rawPath) {
      const rawPath=inside(directory,fact.source.rawPath),compressed=readFileSync(rawPath),body=gunzipSync(compressed);
      if(bytesHash(compressed)!==fact.source.rawGzipSha256||bytesHash(body)!==fact.source.bodySha256)throw new Error('Frozen raw official response hash mismatch');
      sourceHashes[rawPath]=fact.source.rawGzipSha256!;
      if(fact.decision.status==='verified') {
        const match=body.toString().match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
        if(!match)throw new Error('Verified fact has no raw official embedded data');
        const game=JSON.parse(match[1]).props.pageProps.game;
        for(const field of ['gameId','gameCode','gameEt','gameStatus','period'] as const)if(hash(game[field])!==hash(fact.observed[field]))throw new Error('Normalized observation differs from raw official game');
        for(const side of ['home','away'] as const){const raw=game[side+'Team'];const observed=fact.observed[side]!;if(hash({teamId:raw.teamId,tricode:raw.teamTricode,score:raw.score,minutes:raw.statistics?.minutes,periods:raw.periods})!==hash({teamId:observed.teamId,tricode:observed.tricode,score:observed.score,minutes:observed.minutes,periods:observed.periods}))throw new Error('Normalized observation differs from raw official side');}
      }
    }
    if(fact.decision.status==='unknown') {
      if(fact.decision.overtimePeriods!==null||!fact.decision.reasons.length)throw new Error('Unknown source must remain an explicit holdout');unknown++;
    }else {
      if(!fact.source.rawPath)throw new Error('Verified source requires raw byte evidence');
      const overtime=validateVerifiedFact(fact);verified++;if(overtime>0)positive++;
      if(overtime!==game.overtime_periods)changes.push({id:game.id,externalId:fact.externalId,identity:`${fact.date}:${fact.homeAbbr}:${fact.awayAbbr}`,before:Number(game.overtime_periods),after:overtime,factSha256:entry.sha256});
    }
    facts.push(fact);
  }
  if(verified!==proof.counts.verified||unknown!==proof.counts.unknown||positive!==proof.counts.verifiedPositiveOT||verified+unknown!==5815)throw new Error('Source outcome counts mismatch');
  return {binding:{path:full,sha256:expectedSha256,inputCanonicalHash:proof.inputCanonicalHash,verified,unknown,expected:5815,factsHash:hash(facts),validatorSha256:proof.validatorSha256,bridge},facts,changes:changes.sort((a,b)=>a.id-b.id),sourceHashes};
}
