import { scoreGameFatigue, FATIGUE_RECENT_LOOKBACK_DAYS } from '../../src/lib/fatigue';
import { neutralizeIfUnplayed, rowToRecentGame } from '../../src/lib/fatigue-recent-games';
import { resolvePhysicalVenue } from '../../src/lib/physical-venue';
import { classifyRestAdvantage, isCalledSide } from '../../src/lib/rest-advantage-evidence';
import { isNormallyPlayed } from '../../src/lib/season-regime';
import { canonical, hash, type Row, type Snapshot } from '../history-correction/core';

export const components = {
  score:'score', decayLoadScore:'decay_load_score', travelLoadScore:'travel_load_score',
  backToBackMultiplier:'b2b_multiplier', altitudeMultiplier:'altitude_multiplier', densityMultiplier:'density_multiplier',
  freshnessBonus:'freshness_bonus', gamesInLast7Days:'games_in_last_7_days', gamesInLast30Days:'games_in_last_30_days',
  travelDistanceMiles:'travel_distance_miles', isBackToBack:'is_back_to_back', daysSinceLastGame:'days_since_last_game',
  isOvertimePenalty:'is_overtime_penalty', roadTripConsecutiveAway:'road_trip_consecutive_away',
  isThreeInFour:'is_three_in_four', isFourInSix:'is_four_in_six', hasTimeZoneDisplacement:'has_time_zone_displacement',
} as const;
export const semanticInputHash = (snapshot: Snapshot): string => hash({ teams:snapshot.teams, games:snapshot.games });
const numericColumns = new Set(Object.values(components).filter(column=>!['is_back_to_back','is_overtime_penalty','is_three_in_four','is_four_in_six','has_time_zone_displacement'].includes(column)));
export const semanticScoreValue = (column:string,value:unknown):unknown => value===null ? null : numericColumns.has(column as typeof components[keyof typeof components]) ? Number(value) : value;
export function scoreDifferences(a:Row,b:Row):string[] {
  return Object.values(components).filter(column=>canonical(semanticScoreValue(column,a[column]))!==canonical(semanticScoreValue(column,b[column])));
}
export function recomputeFatigue(snapshot:Snapshot,computedAt:string):{ rows:Row[]; changed:{id:number;gameId:number;fields:string[]}[] } {
  const teams=new Map(snapshot.teams.map(team=>[team.id,team]));
  const byTeam=new Map(snapshot.teams.map(team=>[team.id,[] as Row[]]));
  const scores=new Map<string,Row>();
  for(const score of snapshot.fatigue_scores) {
    const key=`${score.game_id}:${score.team_id}`;
    if(scores.has(key))throw new Error(`Duplicate fatigue side ${key}`);
    scores.set(key,score);
  }
  for(const game of snapshot.games)for(const id of [game.home_team_id,game.away_team_id]) {
    const chain=byTeam.get(Number(id));if(!chain)throw new Error(`Missing team ${id}`);chain.push(game);
  }
  for(const chain of byTeam.values())chain.sort((a,b)=>String(a.date).localeCompare(String(b.date))||a.id-b.id);
  const team=(id:unknown)=>{
    const row=teams.get(Number(id));if(!row)throw new Error(`Missing team ${id}`);
    return {id:row.id,abbreviation:String(row.abbreviation),latitude:String(row.latitude),longitude:String(row.longitude),altitudeFlag:Boolean(row.altitude_flag)};
  };
  const identity=(game:Row)=>({date:String(game.date),homeAbbr:team(game.home_team_id).abbreviation,awayAbbr:team(game.away_team_id).abbreviation});
  function priorRow(game:Row) {
    const home=team(game.home_team_id),away=team(game.away_team_id);
    return {...identity(game),homeTeamId:home.id,awayTeamId:away.id,homeLat:home.latitude,homeLon:home.longitude,awayLat:away.latitude,awayLon:away.longitude,homeAltitude:home.altitudeFlag,awayAltitude:away.altitudeFlag,overtimePeriods:Number(game.overtime_periods),tipOffUtc:game.tip_off_utc?new Date(String(game.tip_off_utc)):null,homeScore:game.home_score as number|null,awayScore:game.away_score as number|null,neutralSite:Boolean(game.neutral_site),neutralVenueCity:game.neutral_venue_city as string|null,status:String(game.status)};
  }
  function lower(chain:Row[],day:string) {
    let left=0,right=chain.length;
    while(left<right){const mid=(left+right)>>>1;if(String(chain[mid].date)<day)left=mid+1;else right=mid;}
    return left;
  }
  function history(teamId:number,game:Row) {
    const chain=byTeam.get(teamId)!;const day=String(game.date);
    const first=new Date(Date.parse(day)-FATIGUE_RECENT_LOOKBACK_DAYS*86400000).toISOString().slice(0,10);
    return chain.slice(lower(chain,first),lower(chain,day))
      .filter(prior=>game.status==='final'?prior.status==='final':['final','scheduled','live'].includes(String(prior.status)))
      .map(prior=>rowToRecentGame(neutralizeIfUnplayed(priorRow(prior)),teamId));
  }
  const changes:{id:number;gameId:number;fields:string[]}[]=[];const output=new Map<number,Row>();
  for(const game of snapshot.games) {
    const home=team(game.home_team_id),away=team(game.away_team_id);
    const venue=(value:typeof home)=>({abbreviation:value.abbreviation,latitude:Number(value.latitude),longitude:Number(value.longitude),altitude:value.altitudeFlag});
    if(resolvePhysicalVenue({date:String(game.date),homeTeam:venue(home),awayTeam:venue(away),neutralSite:Boolean(game.neutral_site),neutralVenueCity:game.neutral_venue_city as string|null}).venueSource==='unknown-neutral-fallback')throw new Error(`Unresolved true-neutral venue ${game.id}`);
    const result=scoreGameFatigue({game:{...identity(game),tipOffUtc:game.tip_off_utc?new Date(String(game.tip_off_utc)):null,neutralSite:Boolean(game.neutral_site),neutralVenueCity:game.neutral_venue_city as string|null},homeTeam:home,awayTeam:away,homeRecentGames:history(home.id,game),awayRecentGames:history(away.id,game)});
    for(const [side,id]of [['home',home.id],['away',away.id]] as const) {
      const original=scores.get(`${game.id}:${id}`);if(!original)throw new Error(`Incomplete fatigue pair ${game.id}:${id}`);
      const candidate={...original};
      for(const [field,column]of Object.entries(components)) {
        const value=result[side][field as keyof typeof result.home];
        if(typeof value!=='number'&&typeof value!=='boolean'&&value!==null)throw new Error(`Invalid fatigue component ${field}`);
        if(typeof value==='number'&&!Number.isFinite(value))throw new Error(`Nonfinite fatigue component ${field}`);
        if(value===null&&column!=='days_since_last_game')throw new Error(`Null required fatigue component ${field}`);
        candidate[column]=value;
      }
      const changed=scoreDifferences(original,candidate);
      if(changed.length){candidate.computed_at=computedAt;changes.push({id:original.id,gameId:game.id,fields:changed});output.set(original.id,candidate);}
      else output.set(original.id,original);
    }
  }
  if(output.size!==snapshot.fatigue_scores.length)throw new Error('Unexpected fatigue rows outside complete game pairs');
  return {rows:snapshot.fatigue_scores.map(row=>output.get(row.id)!),changed:changes};
}
export function rebuildForecasts(snapshot:Snapshot,asOf:string,computedAt:string):Row[] {
  const cutoff=Date.parse(asOf);if(!Number.isFinite(cutoff))throw new Error('Invalid forecast as-of instant');
  const resolved=new Set(snapshot.predictions.filter(p=>p.actual_winner_id!==null).map(p=>Number(p.game_id)));
  const scores=new Map(snapshot.fatigue_scores.map(score=>[`${score.game_id}:${score.team_id}`,score]));
  const byGame=new Map<number,Row[]>();
  for(const row of snapshot.predictions){const group=byGame.get(Number(row.game_id))??[];group.push(row);byGame.set(Number(row.game_id),group);}
  let nextId=Math.max(0,...snapshot.predictions.map(row=>row.id));
  const template=Object.fromEntries(Object.keys(snapshot.predictions[0]??{}).map(key=>[key,null]));
  const result=new Map(snapshot.predictions.map(row=>[row.id,row]));
  for(const game of snapshot.games) {
    if(game.status!=='scheduled'||!game.tip_off_utc||!(Date.parse(String(game.tip_off_utc))>cutoff)||resolved.has(game.id))continue;
    const old=(byGame.get(game.id)??[]).filter(row=>row.actual_winner_id===null);
    if(old.length>1)throw new Error(`Duplicate unresolved forecast ${game.id}`);
    const home=scores.get(`${game.id}:${game.home_team_id}`),away=scores.get(`${game.id}:${game.away_team_id}`);
    if(!home||!away)throw new Error(`Missing forecast fatigue pair ${game.id}`);
    const edge=classifyRestAdvantage(Number(home.score),Number(away.score));
    if(game.game_type==='regular'&&isNormallyPlayed(String(game.season),String(game.date))&&isCalledSide(edge.advantageTeam,Boolean(game.neutral_site))) {
      const row={...template,...old[0],id:old[0]?.id??++nextId,game_id:game.id,predicted_advantage_team_id:game.home_team_id,rest_advantage_differential:edge.differential,actual_winner_id:null,created_at:old[0]?.created_at??computedAt};
      result.set(row.id,old[0]&&hash(row)===hash(old[0])?old[0]:row);
    }else if(old[0])result.delete(old[0].id);
  }
  return [...result.values()].sort((a,b)=>a.id-b.id);
}
