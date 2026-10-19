import { correctedPlayoffs, type PredictionRevision } from "./playoff-contract";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { config } from "dotenv";
import postgres from "postgres";
import { scoreGameFatigue, FATIGUE_RECENT_LOOKBACK_DAYS } from "../../src/lib/fatigue";
import { neutralizeIfUnplayed, rowToRecentGame } from "../../src/lib/fatigue-recent-games";
import { lookupGameInputCorrection, fixtureKey, acceptedAddedFixtures } from "../../src/lib/game-input-corrections";
import { classifyRestAdvantage, isCalledSide, buildHistoricalBacktest } from "../../src/lib/rest-advantage-evidence";
import { resolvePhysicalVenue } from "../../src/lib/physical-venue";
import { isNormallyPlayed } from "../../src/lib/season-regime";
import { assertLocalDatabase, capture, hash, fourTableProjection, verifyManifest, type Row, type Snapshot, type Manifest } from "./core";
async function main() {
config({ path: ".env.local", quiet: true });
const url=process.env.DATABASE_URL??"";
assertLocalDatabase(url);
const [output,baselinePath]=process.argv.slice(2);
if(!output||!baselinePath)throw new Error("Usage: tsx scripts/history-correction/prepare.ts OUTPUT.json BASELINE_EVIDENCE.json");
const baseline=JSON.parse(readFileSync(baselinePath,"utf8"));
if(baseline.differences!==0 || !baseline.fourTableInputHash||!baseline.playoffInputHash)throw new Error("Fresh matching baseline evidence with inputHash required");
const sql=postgres(url,{max:1});
try {
 const sourcePaths=['src/lib/fatigue.ts','src/lib/fatigue-recent-games.ts','src/lib/physical-venue.ts','src/lib/bubble-venue.ts','src/lib/fatigue-windows.ts','src/lib/team-era-coordinates.ts','src/lib/neutral-venues.ts','src/lib/game-input-corrections.ts','src/data/game-input-corrections.json','src/data/fixture-venue-corrections.json','scripts/history-correction/core.ts','scripts/history-correction/prepare.ts','scripts/history-correction/run.ts','scripts/history-correction/authorization.ts','src/lib/haversine.ts','src/lib/rest-advantage-evidence.ts','src/lib/season-regime.ts','src/lib/game-status.ts','src/lib/db/schema.ts','pnpm-lock.yaml','scripts/history-correction/build-additions.py','scripts/history-correction/build-registry.py','scripts/history-correction/playoff-contract.ts','scripts/history-correction/playoff-feature-corrections.json','scripts/history-correction/playoff-prediction-revision.json',...Object.keys(JSON.parse(readFileSync('docs/audit/history-recalculation/analytics/playoff-producer-source-hashes.json','utf8')))];
 const reviewedProducerHashes=JSON.parse(readFileSync('docs/audit/history-recalculation/analytics/playoff-producer-source-hashes.json','utf8'));
 for(const [path,expected]of Object.entries(reviewedProducerHashes))if(createHash('sha256').update(readFileSync(path)).digest('hex')!==expected)throw new Error(`Reviewed ML source changed: ${path}`);
 const sourceHashes=Object.fromEntries(sourcePaths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
 const databaseTimeZone=String((await sql`select current_setting('TimeZone') as zone`)[0].zone);
 const before=await sql.begin(async tx=>{
  await tx.unsafe("set transaction isolation level repeatable read read only");
  return capture(tx);
 });
 if(hash(fourTableProjection(before))!==baseline.fourTableInputHash || hash({playoff_series:before.playoff_series,playoff_series_predictions:before.playoff_series_predictions})!==baseline.playoffInputHash)throw new Error("Six-table baseline bridge does not bind to original four-table replay plus captured playoff domain");
 const after:Snapshot=structuredClone(before);
 const asOf=new Date().toISOString();
 const [{timestamp:computedAt}]=await sql`select to_jsonb(localtimestamp) as timestamp`;
 const playoffProducer=JSON.parse(readFileSync("scripts/history-correction/playoff-prediction-revision.json","utf8")) as PredictionRevision;
 Object.assign(after,correctedPlayoffs(before,playoffProducer,computedAt));
 const teams=new Map(after.teams.map(t=>[t.id,t]));
 const identity=(g:Row)=>({date:String(g.date),homeAbbr:String(teams.get(Number(g.home_team_id))!.abbreviation),awayAbbr:String(teams.get(Number(g.away_team_id))!.abbreviation)});
 const byFixture=new Map<string,number>();
 const inputChanges:Manifest["inputChanges"]=[];
 const fieldMap:Record<string,string>={overtimePeriods:"overtime_periods",gameType:"game_type",tipOffUtc:"tip_off_utc",neutralSite:"neutral_site",neutralVenueCity:"neutral_venue_city"};
 for(const g of after.games) {
  const key=fixtureKey(identity(g));
  if(byFixture.has(key))throw new Error(`Fixture identity collision ${key}`);
  byFixture.set(key,g.id);
  const patch=lookupGameInputCorrection(identity(g));
  if(!patch)continue;
  if(g.id!==patch.auditGameId)throw new Error(`Audit ID/identity mismatch ${key}`);
  const fields:Record<string,{before:unknown;after:unknown}>={};
  for(const [field,values]of Object.entries(patch.fields)) {
   const column=fieldMap[field];if(!column||!values)throw new Error(`Unsupported correction ${field}`);
   const equal=field==='tipOffUtc'?new Date(String(g[column])).getTime()===new Date(String(values.before)).getTime():g[column]===values.before;
   if(!equal)throw new Error(`Expected input mismatch ${g.id}.${column}: ${g[column]}`);
   const value=field==='tipOffUtc'?(await sql`select to_jsonb(${String(values.after)}::timestamptz) as value`)[0].value:values.after;
   fields[column]={before:g[column],after:value};g[column]=value;
  }
  inputChanges.push({id:g.id,identity:key,fields});
 }
 const registry=JSON.parse(readFileSync("src/data/game-input-corrections.json","utf8"));
 if(inputChanges.length!==registry.fixtures.length)throw new Error("An accepted input fixture is missing");
 const gameTemplate=Object.fromEntries(Object.keys(before.games[0]).map(key=>[key,null]));
 let nextGameId=Math.max(...before.games.map(g=>g.id));
 const gameAdditions:Row[]=[];
 for(const f of acceptedAddedFixtures){
  if(byFixture.has(fixtureKey(f))||before.games.some(g=>g.external_id===f.externalId))throw new Error(`Reviewed omission already exists: ${f.externalId}`);
  const home=after.teams.find(t=>t.abbreviation===f.homeAbbr)!,away=after.teams.find(t=>t.abbreviation===f.awayAbbr)!;
  if(!home||!away)throw new Error(`Unknown reviewed addition team ${f.externalId}`);
  const tip=(await sql`select to_jsonb(${f.tipOffUtc}::timestamptz) as tip`)[0].tip;
  const row:Row={...gameTemplate,id:++nextGameId,external_id:f.externalId,date:f.date,season:f.season,home_team_id:home.id,away_team_id:away.id,home_score:f.homeScore,away_score:f.awayScore,status:f.status,game_type:f.gameType,overtime_periods:f.overtimePeriods,tip_off_utc:tip,neutral_site:f.neutralSite,neutral_venue_city:f.neutralVenueCity};
  after.games.push(row);gameAdditions.push(row);
 }
 const byTeam=new Map(after.teams.map(t=>[t.id,[] as Row[]]));
 for(const g of after.games)for(const tid of [g.home_team_id,g.away_team_id])byTeam.get(Number(tid))!.push(g);
 for(const chain of byTeam.values())chain.sort((a,b)=>String(a.date).localeCompare(String(b.date))||a.id-b.id);
 const team=(t:Row)=>({id:t.id,abbreviation:String(t.abbreviation),latitude:String(t.latitude),longitude:String(t.longitude),altitudeFlag:Boolean(t.altitude_flag)});
 function priorRow(g:Row) {
  const h=teams.get(Number(g.home_team_id))!,a=teams.get(Number(g.away_team_id))!;
  return { ...identity(g),homeTeamId:h.id,awayTeamId:a.id,homeLat:String(h.latitude),homeLon:String(h.longitude),awayLat:String(a.latitude),awayLon:String(a.longitude),homeAltitude:Boolean(h.altitude_flag),awayAltitude:Boolean(a.altitude_flag),overtimePeriods:Number(g.overtime_periods),tipOffUtc:g.tip_off_utc?new Date(String(g.tip_off_utc)):null,homeScore:g.home_score as number|null,awayScore:g.away_score as number|null,neutralSite:Boolean(g.neutral_site),neutralVenueCity:g.neutral_venue_city as string|null,status:String(g.status)};
 }
 function lower(chain:Row[],date:string){let l=0,r=chain.length;while(l<r){const m=(l+r)>>>1;if(String(chain[m].date)<date)l=m+1;else r=m;}return l;}
 function history(tid:number,g:Row){const chain=byTeam.get(tid)!,date=String(g.date),begin=new Date(Date.parse(date)-FATIGUE_RECENT_LOOKBACK_DAYS*86400000).toISOString().slice(0,10);return chain.slice(lower(chain,begin),lower(chain,date)).filter(p=>g.status==='final'?p.status==='final':['final','scheduled','live'].includes(String(p.status))).map(p=>rowToRecentGame(neutralizeIfUnplayed(priorRow(p)),tid));}
 const components={score:'score',decayLoadScore:'decay_load_score',travelLoadScore:'travel_load_score',backToBackMultiplier:'b2b_multiplier',altitudeMultiplier:'altitude_multiplier',densityMultiplier:'density_multiplier',freshnessBonus:'freshness_bonus',gamesInLast7Days:'games_in_last_7_days',gamesInLast30Days:'games_in_last_30_days',travelDistanceMiles:'travel_distance_miles',isBackToBack:'is_back_to_back',daysSinceLastGame:'days_since_last_game',isOvertimePenalty:'is_overtime_penalty',roadTripConsecutiveAway:'road_trip_consecutive_away',isThreeInFour:'is_three_in_four',isFourInSix:'is_four_in_six',hasTimeZoneDisplacement:'has_time_zone_displacement'} as const;
 const scores=new Map(after.fatigue_scores.map(s=>[`${s.game_id}:${s.team_id}`,s]));
 let nextScoreId=Math.max(...before.fatigue_scores.map(s=>s.id));
 const scoreTemplate=Object.fromEntries(Object.keys(before.fatigue_scores[0]).map(key=>[key,null]));
 for(const g of gameAdditions)for(const tid of [g.home_team_id,g.away_team_id]){
  const row:Row={...scoreTemplate,id:++nextScoreId,game_id:g.id,team_id:tid};
  after.fatigue_scores.push(row);scores.set(`${g.id}:${tid}`,row);
 }
 const oldScores=new Map(before.fatigue_scores.map(s=>[`${s.game_id}:${s.team_id}`,s]));
 const decimalFields=new Set(['score','decay_load_score','travel_load_score','b2b_multiplier','altitude_multiplier','density_multiplier','freshness_bonus','travel_distance_miles']);
 const changesBySeason:Record<string,Record<string,number>>={};
 for(const g of after.games){
  const venueTeam=(tid:unknown)=>{const t=teams.get(Number(tid))!;return {abbreviation:String(t.abbreviation),latitude:Number(t.latitude),longitude:Number(t.longitude),altitude:Boolean(t.altitude_flag)}};
  if(resolvePhysicalVenue({date:String(g.date),homeTeam:venueTeam(g.home_team_id),awayTeam:venueTeam(g.away_team_id),neutralSite:Boolean(g.neutral_site),neutralVenueCity:g.neutral_venue_city as string|null}).venueSource==='unknown-neutral-fallback')throw new Error(`Unresolved true-neutral venue ${g.id}`);
  const result=scoreGameFatigue({game:{...identity(g),tipOffUtc:g.tip_off_utc?new Date(String(g.tip_off_utc)):null,neutralSite:Boolean(g.neutral_site),neutralVenueCity:g.neutral_venue_city as string|null},homeTeam:team(teams.get(Number(g.home_team_id))!),awayTeam:team(teams.get(Number(g.away_team_id))!),homeRecentGames:history(Number(g.home_team_id),g),awayRecentGames:history(Number(g.away_team_id),g)});
  for(const [side,tid]of [['home',g.home_team_id],['away',g.away_team_id]] as const){
   const score=scores.get(`${g.id}:${tid}`);if(!score)throw new Error(`Missing baseline fatigue side ${g.id}:${tid}`);
   score.computed_at=computedAt;
   for(const [key,column]of Object.entries(components)){
    const value=result[side][key as keyof typeof result.home];
    if(typeof value!=='number'&&typeof value!=='boolean'&&value!==null)throw new Error(`Unexpected score type ${key}`);
    if(typeof value==='number'&&!Number.isFinite(value))throw new Error(`Nonfinite score ${g.id}`);
    if(value===null&&column!=='days_since_last_game')throw new Error(`Null required fatigue component ${g.id}.${column}`);
    const old=score[column],observed=decimalFields.has(column)&&old!==null?Number(old):old;
    if(observed!==value){const bucket=changesBySeason[String(g.season)]??={};bucket[column]=(bucket[column]??0)+1;}
    score[column]=value;
   }
  }
 }
 const resolvedGames=new Set(after.predictions.filter(p=>p.actual_winner_id!==null).map(p=>Number(p.game_id)));
 let nextId=Math.max(0,...after.predictions.map(p=>p.id));
 const predictionTemplate=Object.fromEntries(Object.keys(before.predictions[0]??{}).map(key=>[key,null]));
 let predictionRebuilt=0;
 for(const g of after.games){
  if(g.status!=='scheduled'||!g.tip_off_utc||Date.parse(String(g.tip_off_utc))<=Date.parse(asOf)||resolvedGames.has(g.id))continue;
  const old=after.predictions.filter(p=>p.game_id===g.id&&p.actual_winner_id===null);
  if(old.length>1)throw new Error(`Duplicate unresolved prediction ${g.id}`);
  after.predictions=after.predictions.filter(p=>!(p.game_id===g.id&&p.actual_winner_id===null));
  const edge=classifyRestAdvantage(Number(scores.get(`${g.id}:${g.home_team_id}`)!.score),Number(scores.get(`${g.id}:${g.away_team_id}`)!.score));
  if(g.game_type==='regular'&&isNormallyPlayed(String(g.season),String(g.date))&&isCalledSide(edge.advantageTeam,Boolean(g.neutral_site)))after.predictions.push({...predictionTemplate,...old[0],id:old[0]?.id??++nextId,game_id:g.id,predicted_advantage_team_id:g.home_team_id,rest_advantage_differential:edge.differential,actual_winner_id:null,created_at:old[0]?.created_at??computedAt});
  predictionRebuilt++;
 }
 after.predictions.sort((a,b)=>a.id-b.id);
 function evidence(snapshot:Snapshot){const sd=snapshot===before?oldScores:scores;return snapshot.games.filter(g=>g.status==='final'&&g.game_type==='regular'&&isNormallyPlayed(String(g.season),String(g.date))).map(g=>({date:String(g.date),season:String(g.season),homeScore:g.home_score as number|null,awayScore:g.away_score as number|null,homeFatigueScore:String(sd.get(`${g.id}:${g.home_team_id}`)!.score),awayFatigueScore:String(sd.get(`${g.id}:${g.away_team_id}`)!.score),neutralSite:Boolean(g.neutral_site)}));}
 const oldEvidence=evidence(before),newEvidence=evidence(after),recentSeasons=[...new Set(newEvidence.map(r=>r.season))].sort().slice(-10);
 for(const [source,expected]of Object.entries(sourceHashes))if(createHash('sha256').update(readFileSync(source)).digest('hex')!==expected)throw new Error(`Source changed during replay: ${source}`);
 const manifest:Manifest={version:2,databaseTimeZone,createdAt:asOf,asOf,sourceHashes,beforeHash:hash(before),afterHash:hash(after),before,after,gameAdditions,inputChanges,baseline:{sides:baseline.sides,differences:baseline.differences},report:{baselineBridge:{fourTableInputHash:baseline.fourTableInputHash,playoffInputHash:baseline.playoffInputHash},playoff:{correctedFeatures:11,preservedPredictions:before.playoff_series_predictions.length,insertedPredictions:after.playoff_series_predictions.length-before.playoff_series_predictions.length,modelInputSha256:playoffProducer.modelInputSha256,counts:playoffProducer.counts},changesBySeason,predictionRebuilt,resolvedPredictionHash:hash(before.predictions.filter(p=>p.actual_winner_id!==null)),allHistory:{before:buildHistoricalBacktest(oldEvidence),after:buildHistoricalBacktest(newEvidence)},recentTen:{seasons:recentSeasons,before:buildHistoricalBacktest(oldEvidence.filter(r=>recentSeasons.includes(r.season))),after:buildHistoricalBacktest(newEvidence.filter(r=>recentSeasons.includes(r.season)))}}};
 verifyManifest(manifest);mkdirSync(output.slice(0,output.lastIndexOf('/'))||'.',{recursive:true});
 writeFileSync(output,JSON.stringify(manifest));writeFileSync(`${output}.sha256`,createHash('sha256').update(readFileSync(output)).digest('hex')+'\n');
 writeFileSync(`${output}.report.json`,JSON.stringify({beforeHash:manifest.beforeHash,afterHash:manifest.afterHash,inputChanges:inputChanges.length,gameAdditions:gameAdditions.length,report:manifest.report},null,2)+'\n');
 console.log(JSON.stringify({output,inputChanges:inputChanges.length,gameAdditions:gameAdditions.length,scoredSides:after.fatigue_scores.length,predictionRebuilt,beforeHash:manifest.beforeHash,afterHash:manifest.afterHash}));
}finally{await sql.end();}

}
main().catch(error=>{console.error(error);process.exitCode=1;});
