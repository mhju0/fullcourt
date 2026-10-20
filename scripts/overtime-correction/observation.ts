import aliases from './official-team-aliases.json';
import type {OfficialFact} from './sources';
const aliasPolicy:Readonly<Record<string,string>>=aliases;
export function normalizeOfficialAbbreviation(value:unknown):string|null {
  return typeof value==='string' ? aliasPolicy[value]??value : null;
}
function nonnegativeInteger(value:unknown):value is number {return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;}
export function statusOvertimeCount(value:unknown):number|null {
  if(typeof value!=='string'||!value.trim())return null;
  const text=value.trim();if(/^Final$/i.test(text))return 0;
  const match=text.match(/^Final\s*\/\s*(?:OT([1-9][0-9]*)?|([1-9][0-9]*)OT)$/i);
  if(!match)throw new Error('Available official status text is not a usable final result');
  const count=Number(match[1]??match[2]??1);if(!Number.isSafeInteger(count))throw new Error('Invalid official status overtime count');return count;
}
export function inspectOfficialObservation(fact:OfficialFact):{overtime:number;untiedBeforePeriods:number[];headlineScoreConflicts:{side:'home'|'away';headline:number;stored:number;periodSum:number}[]} {
  const observed=fact.observed,home=observed.home,away=observed.away;
  if(fact.source.httpStatus!==200||!/^https:\/\/www\.nba\.com\//.test(fact.source.url)||!Number.isFinite(Date.parse(fact.source.capturedAt)))throw new Error('Official source transport/provenance invalid');
  if(observed.gameId!==fact.externalId||observed.gameStatus!==3||!observed.gameEt||observed.gameEt.slice(0,10)!==fact.date||!Number.isFinite(Date.parse(observed.gameEt)))throw new Error('Official game identity/date/final status mismatch');
  const code=observed.gameCode?.match(/^(\d{8})\/([A-Z]{3})([A-Z]{3})$/);
  if(!code||code[1]!==fact.date.replaceAll('-',''))throw new Error('Official gameCode date mismatch');
  if(!home||!away||normalizeOfficialAbbreviation(home.tricode)!==fact.homeAbbr||normalizeOfficialAbbreviation(away.tricode)!==fact.awayAbbr||home.canonicalAbbr!==fact.homeAbbr||away.canonicalAbbr!==fact.awayAbbr||home.teamId===away.teamId)throw new Error('Official raw/normalized team pairing mismatch');
  if(normalizeOfficialAbbreviation(code[2])!==fact.awayAbbr||normalizeOfficialAbbreviation(code[3])!==fact.homeAbbr)throw new Error('Official gameCode team pairing mismatch');
  const n=home.periods?.length;
  if(!n||n<4||n!==away.periods?.length||observed.period!==n)throw new Error('Incomplete or inconsistent official period arrays');
  const overtime=n-4,expectedSeconds=(240+25*overtime)*60;
  const headlineScoreConflicts:{side:'home'|'away';headline:number;stored:number;periodSum:number}[]=[];
  for(const [side,score,name]of [[home,fact.stored.homeScore,'home'],[away,fact.stored.awayScore,'away']] as const) {
    if(!nonnegativeInteger(side.score)||!nonnegativeInteger(score))throw new Error('Invalid official/stored final score');
    if(side.minutes!==undefined&&side.minutes!==null&&side.minutes!=='') {
      const clock=typeof side.minutes==='string'?side.minutes.match(/^([0-9]+):([0-5][0-9](?:\.[0-9]+)?)$/):null;
      if(!clock||Number(clock[1])*60+Number(clock[2])!==expectedSeconds)throw new Error('Available official team minutes contradict numbered periods');
    }
    side.periods.forEach((period,index)=>{if(period.period!==index+1||period.periodType!==(index<4?'REGULAR':'OVERTIME')||!nonnegativeInteger(period.score))throw new Error('Invalid official numbered period');});
    const periodSum=side.periods.reduce((sum,p)=>sum+p.score,0);if(periodSum!==score)throw new Error('Period numerator does not reconcile to stored final score');
    if(side.score!==score)headlineScoreConflicts.push({side:name,headline:side.score,stored:score,periodSum});
  }
  const statusCount=statusOvertimeCount(observed.gameStatusText);
  if(statusCount!==null&&statusCount!==overtime)throw new Error('Available official final status text contradicts numbered periods');
  if(fact.stored.homeScore===fact.stored.awayScore)throw new Error('Tied official final score');
  const untiedBeforePeriods:number[]=[];
  for(let end=4;end<n;end++)if(home.periods.slice(0,end).reduce((sum,p)=>sum+p.score,0)!==away.periods.slice(0,end).reduce((sum,p)=>sum+p.score,0))untiedBeforePeriods.push(end+1);
  return {overtime,untiedBeforePeriods,headlineScoreConflicts};
}
