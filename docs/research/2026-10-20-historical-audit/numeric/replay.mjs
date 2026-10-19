import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { scoreGameFatigue, FATIGUE_CONSTANTS } from '../../../../src/lib/fatigue';
import { rowToRecentGame, neutralizeIfUnplayed } from '../../../../src/lib/fatigue-recent-games';
import { isNormallyPlayed } from '../../../../src/lib/season-regime';
import { classifyRestAdvantage } from '../../../../src/lib/rest-advantage-evidence';
const out = new URL('./', import.meta.url).pathname;
const raw = new URL('../../../audit/2026-10-20-historical-audit/snapshot/', import.meta.url).pathname;
const load = name => gunzipSync(readFileSync(raw + name + '.jsonl.gz')).toString().trim().split('\n').filter(Boolean).map(s => JSON.parse(s));
const teams = load('teams'), games = load('games'), scores = load('scores');
const td = new Map(teams.map(t => [t.id,t]));
const sd = new Map(scores.map(s => [`${s.game_id}:${s.team_id}`,s]));
const team = t => ({id:t.id,abbreviation:t.abbreviation,latitude:t.latitude,longitude:t.longitude,altitudeFlag:t.altitude_flag});
function priorRow(g) {
 const h=td.get(g.home_team_id),a=td.get(g.away_team_id);
 return {date:g.date,homeTeamId:h.id,awayTeamId:a.id,homeAbbr:h.abbreviation,awayAbbr:a.abbreviation,homeLat:h.latitude,homeLon:h.longitude,awayLat:a.latitude,awayLon:a.longitude,homeAltitude:h.altitude_flag,awayAltitude:a.altitude_flag,overtimePeriods:g.overtime_periods,tipOffUtc:g.tip_off_utc?new Date(g.tip_off_utc):null,homeScore:g.home_score,awayScore:g.away_score,neutralSite:g.neutral_site,neutralVenueCity:g.neutral_venue_city,status:g.status};
}
const byTeam = new Map(teams.map(t=>[t.id,[]]));
for(const g of games) for(const tid of [g.home_team_id,g.away_team_id]) byTeam.get(tid).push(g);
function lowerBound(list,date) {let l=0,r=list.length;while(l<r){const m=(l+r)>>>1;if(list[m].date<date)l=m+1;else r=m;}return l;}
function history(tid,g) {
 const chain=byTeam.get(tid),basis=g.status==='final'?'played':'scheduled';
 const begin=new Date(Date.parse(g.date)-30*86400000).toISOString().slice(0,10);
 return chain.slice(lowerBound(chain,begin),lowerBound(chain,g.date)).filter(p=>basis==='played'?p.status==='final':['final','scheduled','live'].includes(p.status)).map(p=>rowToRecentGame(neutralizeIfUnplayed(priorRow(p)),tid));
}
const fieldMap={score:'score',decayLoadScore:'decay_load_score',travelLoadScore:'travel_load_score',backToBackMultiplier:'b2b_multiplier',altitudeMultiplier:'altitude_multiplier',densityMultiplier:'density_multiplier',freshnessBonus:'freshness_bonus',gamesInLast7Days:'games_in_last_7_days',gamesInLast30Days:'games_in_last_30_days',travelDistanceMiles:'travel_distance_miles',isBackToBack:'is_back_to_back',daysSinceLastGame:'days_since_last_game',isOvertimePenalty:'is_overtime_penalty',roadTripConsecutiveAway:'road_trip_consecutive_away',isThreeInFour:'is_three_in_four',isFourInSix:'is_four_in_six',hasTimeZoneDisplacement:'has_time_zone_displacement'};
const sides=[],gameResults=[],anomalies=[],failures=[];
const round=x=>Math.round(x*100)/100;
for(const g of games) {
 try {
  const histories={home:history(g.home_team_id,g),away:history(g.away_team_id,g)};
  const fresh=scoreGameFatigue({game:{date:g.date,tipOffUtc:g.tip_off_utc?new Date(g.tip_off_utc):null,neutralSite:g.neutral_site,neutralVenueCity:g.neutral_venue_city},homeTeam:team(td.get(g.home_team_id)),awayTeam:team(td.get(g.away_team_id)),homeRecentGames:histories.home,awayRecentGames:histories.away});
  for(const [side,tid] of [['home',g.home_team_id],['away',g.away_team_id]]) {
   const result=fresh[side],stored=sd.get(`${g.id}:${tid}`);
   if(!stored) anomalies.push({game_id:g.id,team_id:tid,field:'missing_score',stored:null,fresh:result.score});
   else for(const [key,col] of Object.entries(fieldMap)) {
    const observed=stored[col]===null?null:typeof result[key]==='number'?Number(stored[col]):stored[col];
    if(observed!==result[key])anomalies.push({game_id:g.id,team_id:tid,season:g.season,date:g.date,status:g.status,computed_at:stored.computed_at,field:col,stored:observed,fresh:result[key]});
   }
   sides.push({game_id:g.id,team_id:tid,season:g.season,status:g.status,side,prior_basis:g.status==='final'?'played':'scheduled',prior_count:histories[side].length,result});
  }
  const h=fresh.home,a=fresh.away;
  const counter= !g.neutral_site && h.roadTripConsecutiveAway>2 ? round(Math.max(0,(h.decayLoadScore+h.travelLoadScore)*h.backToBackMultiplier*h.altitudeMultiplier*h.densityMultiplier+h.freshnessBonus+h.overtimeFatigueBonus)) : h.score;
  const storedHome=sd.get(`${g.id}:${g.home_team_id}`),storedAway=sd.get(`${g.id}:${g.away_team_id}`);
  gameResults.push({game_id:g.id,season:g.season,date:g.date,status:g.status,game_type:g.game_type,neutral_site:g.neutral_site,publishable:g.game_type==='regular'&&isNormallyPlayed(g.season,g.date),decidable:g.status==='final'&&g.home_score!==null&&g.away_score!==null&&g.home_score!==g.away_score,home_won:g.home_score!==null&&g.away_score!==null?g.home_score>g.away_score:null,stored_gap:storedHome&&storedAway?classifyRestAdvantage(Number(storedHome.score),Number(storedAway.score)).differential:null,replay_gap:classifyRestAdvantage(h.score,a.score).differential,zero_home_streak_gap:classifyRestAdvantage(counter,a.score).differential,home_score:h.score,home_streak:h.roadTripConsecutiveAway,home_road_load:h.roadSegmentLoadScore,diagnostic_home_score:counter,diagnostic_score_change:round(h.score-counter)});
 } catch(error) {failures.push({game_id:g.id,error:String(error)});}
}
for(const [name,rows] of [['replay-sides',sides],['replay-games',gameResults],['replay-anomalies',anomalies],['replay-failures',failures]])writeFileSync(raw+name+'.jsonl.gz',gzipSync(rows.map(r=>JSON.stringify(r)).join('\n')+'\n'));
writeFileSync(out+'replay-summary.json',JSON.stringify({games:gameResults.length,sides:sides.length,failures:failures.length,anomaly_fields:anomalies.length,anomaly_sides:new Set(anomalies.map(r=>`${r.game_id}:${r.team_id}`)).size,constants:FATIGUE_CONSTANTS,fieldMap,geometry:'authentic scoreGameFatigue + rowToRecentGame; history all game types and seasons, 30 prior calendar days; final targets final priors, others workload statuses; held target replay diagnostic only',diagnostic:'current engine component assembly removing only road streak load on true home games; coefficients unchanged; no results pooled into unplayed seasons'},null,2)+'\n');
console.log({games:gameResults.length,sides:sides.length,failures:failures.length,anomalyFields:anomalies.length,anomalySides:new Set(anomalies.map(r=>`${r.game_id}:${r.team_id}`)).size});
