import {readFileSync,writeFileSync} from 'node:fs';
import {scoreGameFatigue} from '../../../src/lib/fatigue';
import {rowToRecentGame,neutralizeIfUnplayed} from '../../../src/lib/fatigue-recent-games';
const out=new URL('./',import.meta.url).pathname;
const raw=process.env.SCHEDULE_AUDIT_RAW_DIR??new URL('../../audit/2026-10-20-schedule-audit/',import.meta.url).pathname;
const teams=JSON.parse(readFileSync(out+'teams.json','utf8'));const games=JSON.parse(readFileSync(raw+'games.json','utf8'));const scores=JSON.parse(readFileSync(raw+'scores.json','utf8'));const td=new Map(teams.map((t)=>[t.id,t]));const sd=new Map(scores.map((s)=>[`${s.game_id}:${s.team_id}`,s]));
const team=(t)=>({id:t.id,abbreviation:t.abbreviation,latitude:t.latitude,longitude:t.longitude,altitudeFlag:t.altitude_flag});
function row(g){const h=td.get(g.home_team_id);const a=td.get(g.away_team_id);return {date:g.date,homeTeamId:h.id,awayTeamId:a.id,homeAbbr:h.abbreviation,awayAbbr:a.abbreviation,homeLat:h.latitude,homeLon:h.longitude,awayLat:a.latitude,awayLon:a.longitude,homeAltitude:h.altitude_flag,awayAltitude:a.altitude_flag,overtimePeriods:g.overtime_periods,tipOffUtc:g.tip_off_utc?new Date(g.tip_off_utc):null,homeScore:g.home_score,awayScore:g.away_score,neutralSite:g.neutral_site,neutralVenueCity:g.neutral_venue_city,status:g.status}}
const impact=[];const differences=[];let checks=0;
for(const g of games.filter((g)=>g.date<='2026-12-31')){
 const recent=(tid)=>games.filter((p)=>['scheduled','live','final'].includes(p.status)&&[p.home_team_id,p.away_team_id].includes(tid)&&p.date<g.date&&(Date.parse(g.date)-Date.parse(p.date))/86400000<=30).map((p)=>rowToRecentGame(neutralizeIfUnplayed(row(p)),tid));
 const result=scoreGameFatigue({game:{date:g.date,tipOffUtc:g.tip_off_utc?new Date(g.tip_off_utc):null,neutralSite:g.neutral_site,neutralVenueCity:g.neutral_venue_city},homeTeam:team(td.get(g.home_team_id)),awayTeam:team(td.get(g.away_team_id)),homeRecentGames:recent(g.home_team_id),awayRecentGames:recent(g.away_team_id)});
 for(const [side,tid]of [['home',g.home_team_id],['away',g.away_team_id]]){const fresh=result[side];const stored=sd.get(`${g.id}:${tid}`);checks++;if(fresh.score!==Number(stored.score))differences.push({gameId:g.id,team:(td.get(tid)).abbreviation,stored:Number(stored.score),fresh:fresh.score});}
 const home=result.home,away=result.away;
 if(!g.neutral_site&&home.roadTripConsecutiveAway>2){
  const counter=Math.round(Math.max(0,(home.decayLoadScore+home.travelLoadScore)*home.backToBackMultiplier*home.altitudeMultiplier*home.densityMultiplier+home.freshnessBonus+home.overtimeFatigueBonus)*100)/100;
  const gap=Math.round((away.score-home.score)*100)/100,other=Math.round((away.score-counter)*100)/100;
  const bucket=(x)=>Math.abs(x)<0.5?'neutral':x>0?'rested_home':'rested_away';const size=(x)=>Math.abs(x)<0.5?'neutral':Math.abs(x)<3?'small':Math.abs(x)<5?'medium':'large';
  impact.push({game_id:g.id,date:g.date,team:(td.get(g.home_team_id)).abbreviation,opponent:(td.get(g.away_team_id)).abbreviation,prior_road_streak:home.roadTripConsecutiveAway,road_load:home.roadSegmentLoadScore,score:home.score,counterfactual_home_streak_zero_score:counter,score_difference:Math.round((home.score-counter)*100)/100,gap,counterfactual_gap:other,classification:bucket(gap),counterfactual_classification:bucket(other),size:size(gap),counterfactual_size:size(other)});
 }
}
writeFileSync(out+'score-diagnostic.json',JSON.stringify({checks,stored_fresh_score_differences:differences,homecoming_positive_road_load:impact.length,classification_changes:impact.filter(r=>r.classification!==r.counterfactual_classification).length,size_changes:impact.filter(r=>r.size!==r.counterfactual_size).length,max:impact.reduce((a,b)=>a.score_difference>b.score_difference?a:b),impact},null,2)+'\n');
const fields=Object.keys(impact[0]);writeFileSync(out+'homecoming-impact.csv',fields.join(',')+'\n'+impact.map(r=>fields.map(f=>r[f]).join(',')).join('\n')+'\n');console.log({checks,scoreDifferences:differences.length,positiveHomecomings:impact.length,classificationChanges:impact.filter(r=>r.classification!==r.counterfactual_classification).length,max:impact.reduce((a,b)=>a.score_difference>b.score_difference?a:b)});
