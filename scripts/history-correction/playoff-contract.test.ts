import {describe,it,expect} from 'vitest';
import {verifyPlayoffTransition,PLAYOFF_REVISION,type PlayoffDomain} from './playoff-contract';
import corrections from './playoff-feature-corrections.json';
function transition(){
 const before:PlayoffDomain={playoff_series:Array.from({length:600},(_,i)=>({id:i+1,season:`${1986+Math.floor(i/15)}-${String(87+Math.floor(i/15)).slice(-2)}`,external_series_key:`series-${i+1}`,home_court_team_id:1,opponent_team_id:2,series_winner_team_id:1,round:1,seed_diff:1,win_pct_diff:0,entry_rest_diff:0,computed_at:'old'})),playoff_series_predictions:Array.from({length:2099},(_,i)=>({id:i+1,series_id:i%600+1,model_version:'immutable-old',value:i}))};
 for(const patch of corrections.patches){const row=before.playoff_series[patch.id-1];row.external_series_key=patch.externalSeriesKey;row[patch.field]=patch.before;}
 const after=structuredClone(before);
 for(const patch of corrections.patches){const row=after.playoff_series[patch.id-1];row[patch.field]=patch.after;row.computed_at='new';}
 for(const method of ['full_insample','walk_forward_oos'])for(const row of after.playoff_series){if(method==='walk_forward_oos'&&row.id<=150)continue;after.playoff_series_predictions.push({id:after.playoff_series_predictions.length+1,series_id:row.id,external_series_key:row.external_series_key,predicted_home_court_win_prob:0.6,predicted_winner_team_id:1,prediction_method:method,model_version:PLAYOFF_REVISION,created_at:'new'});}
 return {before,after};
}
describe('six-table playoff transition contract',()=>{
 it('accepts exactly eleven features and a complete additive revision',()=>{const {before,after}=transition();expect(()=>verifyPlayoffTransition(before,after)).not.toThrow();});
 it('preserves every old prediction and every series skeleton/other feature',()=>{
  for(const mutate of [(s:PlayoffDomain)=>{s.playoff_series_predictions[0].value=42;},(s:PlayoffDomain)=>{s.playoff_series[576].seed_diff=3;},(s:PlayoffDomain)=>{s.playoff_series[0].computed_at='unapproved';},(s:PlayoffDomain)=>{s.playoff_series[576].win_pct_diff=0;}]){const {before,after}=transition();mutate(after);expect(()=>verifyPlayoffTransition(before,after)).toThrow();}
 });
 it('rejects incomplete, duplicate, wrong-key, wrong-winner and old-version replacement rows',()=>{
  for(const mutate of [(s:PlayoffDomain)=>{s.playoff_series_predictions.pop();},(s:PlayoffDomain)=>{s.playoff_series_predictions[2100].series_id=1;},(s:PlayoffDomain)=>{s.playoff_series_predictions[2099].external_series_key='wrong';},(s:PlayoffDomain)=>{s.playoff_series_predictions[2099].predicted_winner_team_id=2;},(s:PlayoffDomain)=>{s.playoff_series_predictions[2099].model_version='logistic_grind_v2';},(s:PlayoffDomain)=>{s.playoff_series_predictions[2099].predicted_home_court_win_prob=NaN;}]){const {before,after}=transition();mutate(after);expect(()=>verifyPlayoffTransition(before,after)).toThrow();}
 });
});
