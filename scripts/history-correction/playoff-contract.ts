import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import corrections from './playoff-feature-corrections.json';
import {canonical,hash,type Row} from './core';
export const PLAYOFF_REVISION='logistic_grind_v2_r20261020';
export interface PlayoffDomain {playoff_series:Row[];playoff_series_predictions:Row[]}
export interface PredictionRevision {
 modelVersion:string;features:string[];minimumTrainSeasons:number;modelInputSha256:string;
 counts:Record<string,number>;rows:Omit<Row,'id'>[];
}
export function correctedPlayoffs(before:PlayoffDomain,producer:PredictionRevision,computedAt:unknown):PlayoffDomain {
 if(producer.minimumTrainSeasons!==10||canonical(producer.features)!==canonical(['seed_diff','win_pct_diff','prior_grind_diff','h2h_diff'])||producer.counts.full_insample!==600||producer.counts.walk_forward_oos!==450||producer.modelVersion!==PLAYOFF_REVISION||!/^[a-f0-9]{64}$/.test(producer.modelInputSha256))throw new Error('Unbound playoff producer revision/input');
 const after=structuredClone(before);
 for(const patch of corrections.patches){
  const row=after.playoff_series.find(r=>r.id===patch.id);
  if(!row||row.external_series_key!==patch.externalSeriesKey||canonical(row[patch.field])!==canonical(patch.before))throw new Error(`Playoff correction before/identity mismatch ${patch.id}`);
  row[patch.field]=patch.after;row.computed_at=computedAt;
 }
 const ordered=[...after.playoff_series].sort((a,b)=>String(a.season).localeCompare(String(b.season))||Number(a.round)-Number(b.round)||String(a.external_series_key).localeCompare(String(b.external_series_key)));
 const inputs={keys:ordered.map(r=>r.external_series_key),seasons:ordered.map(r=>r.season),features:producer.features,X:ordered.map(r=>producer.features.map(f=>Number(r[f]))),y:ordered.map(r=>Number(r.series_winner_team_id===r.home_court_team_id))};
 // Match the Python producer's float JSON representation, including integral floats.
 const encoded=spawnSync('python3',['-c',"import json,sys; d=json.load(sys.stdin); d['X']=[[float(v) for v in r] for r in d['X']]; sys.stdout.write(json.dumps(d,sort_keys=True,separators=(',',':')))"],{input:JSON.stringify(inputs),encoding:'utf8',timeout:10000});
 if(encoded.status!==0||createHash('sha256').update(encoded.stdout).digest('hex')!==producer.modelInputSha256)throw new Error('Playoff producer input digest does not match corrected series');
 const template=Object.fromEntries(Object.keys(before.playoff_series_predictions[0]??{}).map(k=>[k,null]));
 let id=Math.max(0,...before.playoff_series_predictions.map(r=>r.id));
 for(const row of producer.rows)after.playoff_series_predictions.push({...template,...row,id:++id,created_at:computedAt});
 verifyPlayoffTransition(before,after);
 return after;
}
export function verifyPlayoffTransition(before:PlayoffDomain,after:PlayoffDomain):void {
 if(before.playoff_series.length!==600||before.playoff_series_predictions.length!==2099)throw new Error('Unexpected full playoff baseline population');
 const series=new Map(after.playoff_series.map(r=>[r.id,r]));
 if(series.size!==600||after.playoff_series.length!==600)throw new Error('Playoff series domain changed');
 const patches=new Map(corrections.patches.map(p=>[p.id,p]));
 if([...before.playoff_series].filter(r=>patches.has(r.id)).length!==11||patches.size!==11)throw new Error('Exactly eleven accepted playoff feature corrections required');
 for(const row of before.playoff_series){
  const candidate=series.get(row.id);if(!candidate)throw new Error('Playoff series removed');
  const patch=patches.get(row.id);
  for(const field of new Set([...Object.keys(row),...Object.keys(candidate)])){
   if(patch&&field===patch.field){
    if(row.external_series_key!==patch.externalSeriesKey||canonical(row[field])!==canonical(patch.before)||canonical(candidate[field])!==canonical(patch.after))throw new Error(`Playoff feature correction mismatch ${row.id}.${field}`);
   }else if(!(patch&&field==='computed_at')&&canonical(row[field])!==canonical(candidate[field]))throw new Error(`Playoff immutable field changed ${row.id}.${field}`);
  }
 }
 const oldIds=new Set(before.playoff_series_predictions.map(r=>r.id));
 const predictions=new Map(after.playoff_series_predictions.map(r=>[r.id,r]));
 if(predictions.size!==after.playoff_series_predictions.length)throw new Error('Duplicate playoff prediction ID');
 for(const row of before.playoff_series_predictions)if(hash(row)!==hash(predictions.get(row.id)??null))throw new Error(`Existing playoff prediction history changed ${row.id}`);
 const added=after.playoff_series_predictions.filter(r=>!oldIds.has(r.id));
 const methods=new Map<string,Set<number>>([['full_insample',new Set()],['walk_forward_oos',new Set()]]);
 const earliestOos=[...new Set(before.playoff_series.map(r=>String(r.season)))].sort().slice(10);
 for(const row of added){
  const parent=series.get(Number(row.series_id)),method=methods.get(String(row.prediction_method)),prob=Number(row.predicted_home_court_win_prob);
  if(row.model_version!==PLAYOFF_REVISION||!parent||row.external_series_key!==parent.external_series_key||!method||method.has(parent.id)||!Number.isFinite(prob)||prob<0||prob>1)throw new Error('Invalid/duplicate new playoff revision row');
  const winner=prob>=0.5?parent.home_court_team_id:parent.opponent_team_id;
  if(row.predicted_winner_team_id!==winner)throw new Error('New playoff prediction orientation mismatch');
  if(row.prediction_method==='walk_forward_oos'&&!earliestOos.includes(String(parent.season)))throw new Error('Playoff OOS warmup cohort changed');
  method.add(parent.id);
 }
 if(added.length!==1050||methods.get('full_insample')!.size!==600||methods.get('walk_forward_oos')!.size!==450)throw new Error('Incomplete new playoff revision: expected 600 full and 450 OOS');
}
