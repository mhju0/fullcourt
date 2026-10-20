import {readFileSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {hash} from '../history-correction/core';
import {inspectOfficialObservation} from './observation';
import approvedHeadlineCases from './approved-headline-cases.json';
import type {OfficialFact} from './sources';
export const SUPPLEMENT_PATH='scripts/overtime-correction/supplemental-adjudications.json';
const APPROVED_PRESS_IDS=['0028900220','0028900266','0028900270','0028900387','0028900514','0028900645','0028900664','0028900743','0028900781','0028900800','0028900857','0028900958','0028900981'];
const pressCases:Readonly<Record<string,{gameId:number;bodySha256:string}>>=approvedHeadlineCases;
export const supplementalGame=(fact:OfficialFact):boolean=>fact.externalId==='0028800519'||APPROVED_PRESS_IDS.includes(fact.externalId);
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
interface BaseRecord {
  recordId:string;gameId:number;externalId:string;date:string;season:string;homeAbbr:string;awayAbbr:string;homeScore:number;awayScore:number;beforeOvertimePeriods:number;overtimePeriods:number;
  strictFactSha256:string|null;strictRawBodySha256:string;strictRawGzipSha256:string;strictReasons:string[];
}
export interface GuideRecord extends BaseRecord {
  type:'period_tie_anomaly_overtime_confirmed';regulationScores:{home:number;away:number};
  source:{url:string;pdfPath:string;pdfSha256:string;physicalPage:number;printedPage:number;heading:string;row:string;pageTextPath:string;pageTextSha256:string};
}
export interface HeadlineRecord extends BaseRecord {
  type:'headline_score_conflict_regulation_confirmed';allowedMismatchFields:string[];headlineScoreConflicts:HeadlineConflict[];
  source:{url:string|null;rawPath:string|null;bodySha256:string|null;corroboration:{date:string;homeAbbr:string;awayAbbr:string;homeScore:number;awayScore:number}};
}
export interface HeadlineConflict {side:'home'|'away';headline:number;stored:number;periodSum:number}
export type SupplementalRecord=GuideRecord|HeadlineRecord;
export function readSupplementalRecords():{records:SupplementalRecord[];sha256:string} {
  const bytes=readFileSync(SUPPLEMENT_PATH),data=JSON.parse(bytes.toString()) as {schemaVersion:number;kind:string;adjudications:SupplementalRecord[]};
  const expected=['0028800519',...APPROVED_PRESS_IDS].sort();
  if(data.schemaVersion!==1||data.kind!=='official-overtime-supplement'||data.adjudications.length!==14||hash(data.adjudications.map(r=>r.externalId).sort())!==hash(expected)||hash(Object.keys(pressCases).sort())!==hash([...APPROVED_PRESS_IDS].sort()))throw new Error('Only the fourteen specifically reviewed supplemental fixtures are permitted');
  return {records:data.adjudications,sha256:digest(bytes)};
}
export function validateSupplementalFact(fact:OfficialFact,factSha256:string,record:SupplementalRecord):0|1 {
  if(!record.strictFactSha256||!/^[a-f0-9]{64}$/.test(record.strictFactSha256)||record.strictFactSha256!==factSha256)throw new Error('Supplement requires the frozen final strict fact SHA-256; unfilled records cannot prepare a candidate');
  if(fact.decision.status!=='unknown'||fact.decision.overtimePeriods!==null||hash(fact.decision.reasons)!==hash(record.strictReasons)||fact.source.bodySha256!==record.strictRawBodySha256||fact.source.rawGzipSha256!==record.strictRawGzipSha256)throw new Error('Supplement strict unknown reason or raw official source bytes changed');
  const target={gameId:record.gameId,externalId:record.externalId,date:record.date,season:record.season,homeAbbr:record.homeAbbr,awayAbbr:record.awayAbbr};
  for(const [field,value]of Object.entries(target))if(fact[field as keyof OfficialFact]!==value)throw new Error('Supplement cannot reassign stored fixture identity');
  if(record.beforeOvertimePeriods!==0||hash(fact.stored)!==hash({homeScore:record.homeScore,awayScore:record.awayScore,overtimePeriods:0}))throw new Error('Supplement cannot change stored final scores or before-OT');
  const observed=inspectOfficialObservation(fact);
  if(record.type==='headline_score_conflict_regulation_confirmed') {
    const approved=pressCases[record.externalId];
    if(!APPROVED_PRESS_IDS.includes(record.externalId)||!approved||record.gameId!==approved.gameId||record.strictRawBodySha256!==approved.bodySha256||record.recordId!==`press-regulation-${record.externalId}`||record.overtimePeriods!==0)throw new Error('Unreviewed headline-conflict regulation fixture');
    if(observed.overtime!==0||observed.untiedBeforePeriods.length||fact.observed.home!.minutes!=='240:00'||fact.observed.away!.minutes!=='240:00'||observed.headlineScoreConflicts.length!==1)throw new Error('Regulation supplement requires exact period4, both240minutes and only the headline conflict');
    const conflicts=observed.headlineScoreConflicts;
    if(hash(conflicts)!==hash(record.headlineScoreConflicts)||hash(record.allowedMismatchFields)!==hash(conflicts.map(c=>`observed.${c.side}.score`))||hash(record.strictReasons)!==hash(conflicts.map(c=>`${c.side}_final_score_mismatch`)))throw new Error('Headline mismatch fields or raw/stored/period numerators differ from the exact adjudication');
    const source=record.source;
    if(!source.url||new URL(source.url).protocol!=='https:'||!source.rawPath?.startsWith('supplements/press/')||!source.bodySha256||!/^[a-f0-9]{64}$/.test(source.bodySha256)||hash(source.corroboration)!==hash({date:record.date,homeAbbr:record.homeAbbr,awayAbbr:record.awayAbbr,homeScore:record.homeScore,awayScore:record.awayScore}))throw new Error('Regulation supplement requires the frozen contemporary press source and exact date/pair/final-score corroboration');
    return 0;
  }
  const expected={type:'period_tie_anomaly_overtime_confirmed',recordId:'bulls-guide-19890131-ot1',gameId:29679,externalId:'0028800519',date:'1989-01-31',season:'1988-89',homeAbbr:'CHI',awayAbbr:'DET',homeScore:98,awayScore:104,beforeOvertimePeriods:0,overtimePeriods:1};
  for(const [field,value]of Object.entries(expected))if(record[field as keyof GuideRecord]!==value)throw new Error('Unreviewed supplemental fixture or overtime transition');
  if(record.strictRawBodySha256!=='80843899e8f05abe988ed8c8ebdc809638751c0a7f716550843d1302d8e45a35'||record.strictRawGzipSha256!=='870e3bd19b87328e3ddc653b9ad0b1f0eb60a4e89cef2d85a2f2e32f7c6875df'||hash(record.strictReasons)!==hash(['not_tied_before_overtime_period_5']))throw new Error('Unreviewed Bulls raw source or strict reason');
  if(observed.overtime!==1||hash(observed.untiedBeforePeriods)!==hash([5])||observed.headlineScoreConflicts.length||fact.observed.home!.minutes!=='265:00'||fact.observed.away!.minutes!=='265:00')throw new Error('Supplement requires exact period5, both265minutes and the sole pre-period5 tie discrepancy');
  const regulation={home:fact.observed.home!.periods.slice(0,4).reduce((n,p)=>n+p.score,0),away:fact.observed.away!.periods.slice(0,4).reduce((n,p)=>n+p.score,0)};
  if(hash(regulation)!==hash({home:91,away:92})||hash(record.regulationScores)!==hash(regulation))throw new Error('Unreviewed regulation discrepancy');
  const source=record.source;
  if(source.url!=='https://chibullsdigital.com/mediaGuide/2022_ChicagoBulls_MG_NBA_HI.pdf'||source.pdfPath!=='supplements/bulls-2022-media-guide.pdf'||source.pdfSha256!=='113bf68ccc0d5b891f3bbc942a96f2c32b96caa6d3438299ebe92fc3ffebfe9e'||source.physicalPage!==127||source.printedPage!==125||source.heading!=='BULLS VS. PISTONS IN OVERTIME:'||source.row!=='01/31/89 Chicago 98-104 L'||source.pageTextPath!=='supplements/bulls-guide-page127.txt'||source.pageTextSha256!=='c706db4f514ac263dc65b7588f958ec98c8051ad4d055db2eb4b53badc7d48b6')throw new Error('Supplement must retain the exact independently reviewed Bulls media-guide evidence');
  return 1;
}
export function validateSupplementalEvidence(directory:string,record:SupplementalRecord):Record<string,string> {
  const entries=record.type==='period_tie_anomaly_overtime_confirmed'?[[record.source.pdfPath,record.source.pdfSha256],[record.source.pageTextPath,record.source.pageTextSha256]]:[[record.source.rawPath,record.source.bodySha256]];
  const paths:Record<string,string>={};
  for(const [name,expected]of entries) {
    if(!name||!expected)throw new Error('Supplemental primary source is not frozen');
    const path=resolve(directory,name);if(!path.startsWith(resolve(directory)+sep)||digest(readFileSync(path))!==expected)throw new Error('Supplemental primary source path/byte hash mismatch');paths[path]=expected;
  }
  if(record.type==='period_tie_anomaly_overtime_confirmed') {
    const text=readFileSync(resolve(directory,record.source.pageTextPath),'utf8');
    if(!text.includes('BULLS VS. PISTONS IN OVERTIME:')||!/01\/31\/89\s+Chicago\s+98-104\s+L/.test(text))throw new Error('Reviewed overtime heading and exact game row absent from pinned page text');
  }
  return paths;
}
