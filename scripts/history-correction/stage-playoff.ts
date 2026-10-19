import {readFileSync,writeFileSync} from 'node:fs';
import {config} from 'dotenv';
import postgres from 'postgres';
import {assertLocalDatabase,capture,hash,type Row} from './core';
async function main(){
const output='docs/audit/history-recalculation/playoff-stage.json';
const artifact='scripts/history-correction/playoff-feature-corrections.json';
const mode=process.argv[2];
if(!['stage','restore'].includes(mode))throw new Error('stage|restore required');
config({path:'.env.local',quiet:true});const url=process.env.DATABASE_URL??'';assertLocalDatabase(url);
const sql=postgres(url,{max:1});
const tables=['playoff_series','playoff_series_predictions'] as const;
async function playoff(tx:postgres.TransactionSql){const result={} as Record<typeof tables[number],Row[]>;for(const t of tables)result[t]=(await tx.unsafe(`select to_jsonb(t) row from ${t} t order by id`)).map(r=>r.row);return result;}
try{await sql.begin(async tx=>{
 await tx`select set_config('TimeZone','Asia/Seoul',true)`;
 await tx.unsafe('lock table teams,games,fatigue_scores,predictions,playoff_series,playoff_series_predictions in share row exclusive mode');
 const current=await playoff(tx);
 if(mode==='restore'){
  const saved=JSON.parse(readFileSync(output,'utf8'));
  if(hash(current)!==saved.afterHash)throw new Error('Staged playoff domain drift; restore refused');
  for(const row of saved.before.playoff_series)if(hash(row)!==hash(current.playoff_series.find(r=>r.id===row.id)))await tx`update playoff_series set win_pct_diff=${row.win_pct_diff},entry_rest_diff=${row.entry_rest_diff},computed_at=${row.computed_at}::text::timestamp where id=${row.id}`;
  if(hash(await playoff(tx))!==saved.beforeHash)throw new Error('Exact playoff restore failed');
  console.log(JSON.stringify({restored:true,beforeHash:saved.beforeHash}));return;
 }
 const manifest=JSON.parse(readFileSync('docs/audit/history-recalculation/candidate-full-history.json','utf8'));
 if(hash(await capture(tx))!==manifest.afterHash)throw new Error('Expected applied four-table candidate required');
 if(current.playoff_series.length!==600||current.playoff_series_predictions.length!==2099)throw new Error('Unexpected playoff baseline population');
 const teams=new Map((await tx`select id,abbreviation from teams`).map(r=>[r.id,r.abbreviation]));
 const evidence=JSON.parse(readFileSync('docs/audit/history-recalculation/analytics/playoff-feature-domain-evidence.json','utf8'));
 if(evidence.length!==11)throw new Error('Expected exactly eleven accepted facts');
 const after=structuredClone(current);const patches=[];
 const computedAt=(await tx`select to_jsonb(localtimestamp) value`)[0].value;
 for(const e of evidence){
  if(!['win_pct_diff','entry_rest_diff'].includes(e.field))throw new Error('Unsupported feature');
  const matches=after.playoff_series.filter(r=>`${r.season}_${[teams.get(r.home_court_team_id),teams.get(r.opponent_team_id)].sort().join('-')}`===e.series);
  if(matches.length!==1)throw new Error(`Series identity collision ${e.series}`);
  const row=matches[0];if(Number(row[e.field])!==Number(e.stored)||teams.get(row.home_court_team_id)!==e.homeCourtTeam||teams.get(row.opponent_team_id)!==e.opponent)throw new Error(`Before/identity mismatch ${e.series}`);
  patches.push({id:row.id,externalSeriesKey:row.external_series_key,series:e.series,field:e.field,before:row[e.field],after:e.computed});row[e.field]=e.computed;row.computed_at=computedAt;
 }
 const saved={databaseTimeZone:'Asia/Seoul',fourTableAfterHash:manifest.afterHash,before:current,after,beforeHash:hash(current),afterHash:hash(after),patches};
 writeFileSync(output,JSON.stringify(saved));
 writeFileSync(artifact,JSON.stringify({revision:'logistic_grind_v2_r20261020',sources:{standings:'https://cdn.nba.com/teams/uploads/sites/1610612739/2025/04/CLEVELAND-CAVALIERS-OFFICIAL-2025-PLAYOFF-GUIDE-small-v2.pdf',entryRest:['https://www.nba.com/game/por-vs-phx-0052500121','https://www.nba.com/game/gsw-vs-phx-0052500211']},patches},null,2)+'\n');
 for(const p of patches){if(p.field==='win_pct_diff')await tx`update playoff_series set win_pct_diff=${p.after},computed_at=${computedAt}::text::timestamp where id=${p.id}`;else await tx`update playoff_series set entry_rest_diff=${p.after},computed_at=${computedAt}::text::timestamp where id=${p.id}`;}
 const observed=await playoff(tx);if(hash(observed)!==saved.afterHash){for(const t of tables)for(const r of observed[t]){const wanted=after[t].find(p=>p.id===r.id)!;if(hash(r)!==hash(wanted))throw new Error(JSON.stringify({table:t,observed:r,wanted}));}throw new Error('Staged full playoff hash mismatch');}
 console.log(JSON.stringify({staged:true,patches:patches.length,beforeHash:saved.beforeHash,afterHash:saved.afterHash}));
});}finally{await sql.end();}

}
main().catch(error=>{console.error(error);process.exitCode=1;});
