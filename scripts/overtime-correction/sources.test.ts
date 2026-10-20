import {describe,it,expect} from 'vitest';
import factJson from './fixtures/official-0028801021.json';
import fiveOvertimeJson from './fixtures/official-0028900045.json';
import {normalizeOfficialAbbreviation} from './observation';
import {validateVerifiedFact,matchFactToGame,calculateBridge,type OfficialFact} from './sources';
import type {Snapshot} from './core';
const fact=()=>structuredClone(factJson) as OfficialFact;
describe('independent official numbered-period acceptance',()=>{
  it('reconciles the retained actual POR-SAC 1989 final and tie before OT',()=>{
    const f=fact();expect(f.stored).toEqual({homeScore:126,awayScore:120,overtimePeriods:0});expect(validateVerifiedFact(f)).toBe(1);
    expect(f.observed.home!.periods.slice(0,4).reduce((n,p)=>n+p.score,0)).toBe(114);
    expect(f.observed.away!.periods.slice(0,4).reduce((n,p)=>n+p.score,0)).toBe(114);
  });
  it('accepts the actual 1989 SEA-MIL five-OT final and rejects a capped count',()=>{
    const f=structuredClone(fiveOvertimeJson) as OfficialFact;
    expect(f.observed.away!.tricode).toBe('SEA');expect(f.observed.away!.canonicalAbbr).toBe('OKC');expect(f.observed.home!.minutes).toBe('365:00');
    expect(validateVerifiedFact(f)).toBe(5);f.decision.overtimePeriods=2;expect(()=>validateVerifiedFact(f)).toThrow('Exact overtime');
  });
  it.each([['SEA','OKC'],['WSB','WAS'],['PHL','PHI'],['GOS','GSW'],['SAN','SAS'],['NJN','BKN'],['CHH','CHA'],['NOH','NOP']])('uses the frozen official alias %s to %s', (raw,canonical)=>expect(normalizeOfficialAbbreviation(raw)).toBe(canonical));
  it.each(['wrong-home-raw','wrong-away-raw','wrong-code-away','wrong-code-home','reversed-code','forged-canonical'])('independently refuses %s despite a trusted-looking normalized label',kind=>{
    const f=fact();
    if(kind==='wrong-home-raw')f.observed.home!.tricode='BOS';
    if(kind==='wrong-away-raw')f.observed.away!.tricode='BOS';
    if(kind==='wrong-code-away')f.observed.gameCode='19890423/BOSPOR';
    if(kind==='wrong-code-home')f.observed.gameCode='19890423/SACNYK';
    if(kind==='reversed-code')f.observed.gameCode='19890423/PORSAC';
    if(kind==='forged-canonical'){f.observed.gameCode='19890423/BOSNYK';f.observed.home!.canonicalAbbr='POR';f.observed.away!.canonicalAbbr='SAC';}
    expect(()=>validateVerifiedFact(f)).toThrow(/pairing/);
  });
  it.each(['365:00','240:00','265:01','265:60','garbage'])('refuses available team minutes %s inconsistent with the actual one-OT observation',minutes=>{
    const f=fact();f.observed.home!.minutes=minutes;expect(()=>validateVerifiedFact(f)).toThrow('minutes');
  });
  it.each(['Final','Final/OT2','Final/2OT','In Progress'])('refuses available contradictory status %s',text=>{const f=fact();f.observed.gameStatusText=text;expect(()=>validateVerifiedFact(f)).toThrow(/status/);});
  it('accepts authentic explicit OT-count spellings and permits genuinely missing optional fields',()=>{
    for(const text of ['Final/OT5','Final/5OT']){const f=structuredClone(fiveOvertimeJson) as OfficialFact;f.observed.gameStatusText=text;expect(validateVerifiedFact(f)).toBe(5);}
    const f=fact();f.observed.gameStatusText='Final/OT';expect(validateVerifiedFact(f)).toBe(1);delete f.observed.gameStatusText;delete f.observed.home!.minutes;f.observed.away!.minutes=null;expect(validateVerifiedFact(f)).toBe(1);
  });
  it.each(['missing-period','duplicate-period','wrong-score','untied-regulation','wrong-date','nonfinal','unknown'])( 'refuses %s evidence',kind=>{
    const f=fact();
    if(kind==='missing-period')f.observed.away!.periods.pop();
    if(kind==='duplicate-period')f.observed.home!.periods[4].period=4;
    if(kind==='wrong-score')f.observed.home!.score++;
    if(kind==='untied-regulation'){f.observed.home!.periods[3].score++;f.observed.home!.periods[4].score--;}
    if(kind==='wrong-date')f.observed.gameEt='1989-04-24T00:00:00Z';
    if(kind==='nonfinal')f.observed.gameStatus=2;
    if(kind==='unknown'){f.decision.status='unknown';f.decision.overtimePeriods=null;f.decision.reasons=['missing_period_arrays'];}
    expect(()=>validateVerifiedFact(f)).toThrow();
  });
  it('matches source facts to stored teams/ET date/scores/before-OT rather than source labels alone',()=>{
    const f=fact(),teams=new Map([[1,{id:1,abbreviation:'POR'}],[2,{id:2,abbreviation:'SAC'}]]);const g={id:f.gameId,external_id:f.externalId,date:f.date,season:f.season,home_team_id:1,away_team_id:2,home_score:126,away_score:120,overtime_periods:0,status:'final'};
    expect(()=>matchFactToGame(f,g,teams)).not.toThrow();
    for(const bad of [{...g,home_score:125},{...g,date:'1989-04-24'},{...g,overtime_periods:1},{...g,home_team_id:2},{...g,external_id:'0028801022'}])expect(()=>matchFactToGame(f,bad,teams)).toThrow();
  });
});
describe('source corpus to fresh backup semantic bridge',()=>{
  const snapshot=():Snapshot=>({teams:[{id:1,abbreviation:'POR'},{id:2,abbreviation:'SAC'}],games:[{id:1,date:'1989-04-23',status:'final',game_type:'regular',external_id:'0028801021',season:'1988-89',home_team_id:1,away_team_id:2,home_score:126,away_score:120,overtime_periods:0},{id:2,date:'2099-10-20',status:'scheduled',home_team_id:2,away_team_id:1}],fatigue_scores:[{id:1,game_id:1,team_id:1,computed_at:'old',score:0},{id:2,game_id:2,team_id:2,computed_at:'old',score:0}],predictions:[],playoff_series:[],playoff_series_predictions:[]});
  it('permits only irrelevant future/compute-time drift while preserving both original and fresh full hashes',()=>{
    const original=snapshot(),fresh=structuredClone(original);fresh.fatigue_scores[0].computed_at='new';fresh.fatigue_scores[1].score=3;fresh.games[1].tip_off_utc='2099-10-20T23:00:00Z';
    const bridge=calculateBridge(original,fresh,[1],'a'.repeat(64));expect(bridge.sourceInputCanonicalHash).not.toBe(bridge.freshBeforeHash);expect(bridge.originalTargetProjectionHash).toBe(bridge.freshTargetProjectionHash);expect(bridge.originalFinalHistorySemanticHash).toBe(bridge.freshFinalHistorySemanticHash);
  });
  it.each(['team-map','target-date','target-OT','final-fatigue','final-score'])('refuses %s drift',kind=>{
    const original=snapshot(),fresh=structuredClone(original);
    if(kind==='team-map')fresh.teams[0].abbreviation='SAC';
    if(kind==='target-date')fresh.games[0].date='1989-04-24';
    if(kind==='target-OT')fresh.games[0].overtime_periods=1;
    if(kind==='final-fatigue')fresh.fatigue_scores[0].score=1;
    if(kind==='final-score')fresh.games[0].home_score=127;
    expect(()=>calculateBridge(original,fresh,[1],'a'.repeat(64))).toThrow('drift');
  });
});
