import {describe,it,expect} from 'vitest';
import fixture from './fixtures/official-0028800519.json';
import skeleton from './supplemental-adjudications.json';
import {validateSupplementalFact,readSupplementalRecords,validateSupplementalEvidence,type GuideRecord,type HeadlineRecord} from './supplement';
import headlineFixtures from './fixtures/official-headline-conflicts.json';
import {validateVerifiedFact,type OfficialFact} from './sources';
import {inspectOfficialObservation} from './observation';
const fact=()=>structuredClone(fixture) as OfficialFact;
const record=():GuideRecord=>({...structuredClone(skeleton.adjudications[0]),strictFactSha256:'a'.repeat(64)}) as GuideRecord;
describe('the one independently reviewed Bulls-guide supplement',()=>{
  it('retains the strict unknown while accepting only its separately typed exact-one-OT corroboration',()=>{
    const f=fact();expect(f.decision).toEqual({status:'unknown',overtimePeriods:null,reasons:['not_tied_before_overtime_period_5']});
    expect(()=>validateVerifiedFact(f)).toThrow('Unverified');expect(inspectOfficialObservation(f)).toEqual({overtime:1,untiedBeforePeriods:[5],headlineScoreConflicts:[]});
    const before=JSON.stringify(f);expect(validateSupplementalFact(f,'a'.repeat(64),record())).toBe(1);expect(JSON.stringify(f)).toBe(before);
  });
  it('refuses the committed unfilled strict-fact digest until final source freeze',()=>{
    const loaded=readSupplementalRecords();const unfilled={...loaded.records[0],strictFactSha256:null};expect(()=>validateSupplementalFact(fact(),'a'.repeat(64),unfilled)).toThrow('frozen final strict fact');
  });
  it.each(['other-id','other-date','other-team','other-score','wrong-minutes','wrong-period','raw-drift','extra-reason','different-regulation','changed-source-page','changed-pdf','claimed-five-OT'])('cannot broaden the adjudication through %s',kind=>{
    const f=fact(),r=record();
    if(kind==='other-id')f.gameId=29680;
    if(kind==='other-date')f.date='1989-02-01';
    if(kind==='other-team')f.observed.home!.tricode='BOS';
    if(kind==='other-score')f.stored.homeScore=99;
    if(kind==='wrong-minutes')f.observed.home!.minutes='365:00';
    if(kind==='wrong-period')f.observed.period=6;
    if(kind==='raw-drift')f.source.bodySha256='0'.repeat(64);
    if(kind==='extra-reason')f.decision.reasons.push('home_final_score_mismatch');
    if(kind==='different-regulation'){f.observed.home!.periods[3].score--;f.observed.home!.periods[4].score++;}
    if(kind==='changed-source-page')r.source.physicalPage=128;
    if(kind==='changed-pdf')r.source.pdfSha256='0'.repeat(64);
    if(kind==='claimed-five-OT')r.overtimePeriods=5;
    expect(()=>validateSupplementalFact(f,'a'.repeat(64),r)).toThrow();
  });
});

const pressRecord=(externalId:string):HeadlineRecord=>{
  const value=structuredClone(skeleton.adjudications.find(r=>r.externalId===externalId)) as HeadlineRecord;
  value.strictFactSha256='a'.repeat(64);value.source.url='https://press.example.test/retained-contemporary-article';value.source.rawPath='supplements/press/test.html';value.source.bodySha256='b'.repeat(64);return value;
};
describe('thirteen specifically reviewed regulation coverage records',()=>{
  it.each(headlineFixtures)('retains strict unknown but records zero-OT coverage for $externalId without mutating its numbers', raw=>{
    const f=structuredClone(raw) as OfficialFact,r=pressRecord(f.externalId),before=JSON.stringify(f);
    expect(()=>validateVerifiedFact(f)).toThrow('Unverified');expect(inspectOfficialObservation(f).overtime).toBe(0);expect(validateSupplementalFact(f,'a'.repeat(64),r)).toBe(0);expect(JSON.stringify(f)).toBe(before);
  });
  it('refuses an unfilled press source even when all NBA fields support the pinned case',()=>{
    const f=structuredClone(headlineFixtures[0]) as OfficialFact;const r=pressRecord(f.externalId);r.source.bodySha256=null;expect(()=>validateSupplementalFact(f,'a'.repeat(64),r)).toThrow('frozen contemporary press');
  });
  it.each(['new-fixture','changed-raw','extra-reason','OT-minutes','OT-text','changed-period','changed-period-sum','altered-headline','broadened-fields','claimed-OT'])('refuses %s on regulation supplements', kind=>{
    const f=structuredClone(headlineFixtures[0]) as OfficialFact,r=pressRecord(f.externalId);
    if(kind==='new-fixture'){f.externalId='0028900221';r.externalId=f.externalId;}
    if(kind==='changed-raw'){f.source.bodySha256='0'.repeat(64);r.strictRawBodySha256=f.source.bodySha256;}
    if(kind==='extra-reason')f.decision.reasons.push('home_team_mismatch');
    if(kind==='OT-minutes')f.observed.home!.minutes='265:00';
    if(kind==='OT-text')f.observed.gameStatusText='Final/OT';
    if(kind==='changed-period')f.observed.period=5;
    if(kind==='changed-period-sum')f.observed.home!.periods[3].score++;
    if(kind==='altered-headline')f.observed.away!.score++;
    if(kind==='broadened-fields')r.allowedMismatchFields.push('observed.home.score');
    if(kind==='claimed-OT')r.overtimePeriods=1;
    expect(()=>validateSupplementalFact(f,'a'.repeat(64),r)).toThrow();
  });
});
it.skipIf(!process.env.OVERTIME_SOURCE_PROOF_DIR)('checks the actual retained approved Bulls PDF and page-text bytes',()=>{
  const r=record();const hashes=validateSupplementalEvidence(process.env.OVERTIME_SOURCE_PROOF_DIR!,r);expect(Object.values(hashes).sort()).toEqual([r.source.pdfSha256,r.source.pageTextSha256].sort());
});
