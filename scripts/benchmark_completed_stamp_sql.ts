import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import postgres from "postgres";
const url = new URL(process.env.DATABASE_URL ?? "");
if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname !== "127.0.0.1" || url.port !== "55434" || url.pathname !== "/fullcourt_recalculation" || url.search) throw new Error("Explicit local recalculation database required");
const client = postgres(url.toString(), { max: 1, prepare: false });
const scope = "g.game_type='regular' and g.status='final' and g.home_score is not null and g.away_score is not null and not(g.season='2019-20' and g.date between '2020-07-30' and '2020-10-11')";
const gameFields = "g.id,g.date,g.season,g.home_team_id,g.away_team_id,g.status,g.home_score,g.away_score,g.neutral_site";
const variants: Record<string,string> = {
  typedSeparate: `with inputs as(select hash_record_extended(row('game'::text,${gameFields}),0) as a,hash_record_extended(row('game'::text,${gameFields}),1) as b from games g where ${scope} union all select hash_record_extended(row('fatigue'::text,f.game_id,f.team_id,f.id,f.computed_at,f.score),0),hash_record_extended(row('fatigue'::text,f.game_id,f.team_id,f.id,f.computed_at,f.score),1) from games g join fatigue_scores f on f.game_id=g.id and f.team_id in(g.home_team_id,g.away_team_id) where ${scope}) select count(*),bit_xor(a)::text a,bit_xor(b)::text b from inputs`,
  allRevisionsMd5: `with game_stamp as(select md5(coalesce(string_agg(row(${gameFields})::text,E'\\n' order by g.id),'')) as digest from games g where ${scope}), fatigue_stamp as(select md5(coalesce(string_agg(row(f.game_id,f.team_id,f.id,f.computed_at,f.score)::text,E'\\n' order by f.id),'')) as digest from games g join fatigue_scores f on f.game_id=g.id and f.team_id in(g.home_team_id,g.away_team_id) where ${scope}) select md5(row(g.digest,f.digest)::text) digest from game_stamp g cross join fatigue_stamp f`,
  allRevisionsHash: `with inputs as(select row(${gameFields})::text as input from games g where ${scope} union all select row(f.game_id,f.team_id,f.id,f.computed_at,f.score)::text from games g join fatigue_scores f on f.game_id=g.id and f.team_id in(g.home_team_id,g.away_team_id) where ${scope}) select count(*), bit_xor(hashtextextended(input,0))::text a,bit_xor(hashtextextended(input,1))::text b from inputs`,
  typedHash: `select count(*),bit_xor(hash_record_extended(row(${gameFields},f.team_id,f.id,f.computed_at,f.score),0))::text a,bit_xor(hash_record_extended(row(${gameFields},f.team_id,f.id,f.computed_at,f.score),1))::text b from games g left join fatigue_scores f on f.game_id=g.id and f.team_id in(g.home_team_id,g.away_team_id) where ${scope}`,
};
async function main() {
  const results = [];
  try {
    await client`begin read only`;
    for (const [name,query] of Object.entries(variants)) {
      const timingsMs=[]; let digest;
      for(let trial=0;trial<5;trial++){const start=performance.now(); const rows=await client.unsafe(query); timingsMs.push(performance.now()-start); digest=rows[0].digest;}
      const plan=await client.unsafe(`explain(analyze,buffers,format json) ${query}`);
      results.push({name,digest,timingsMs,query,plan:plan[0]["QUERY PLAN"]});
    }
    await client`rollback`;
    const output="docs/audit/history-recalculation/analytics/cache-stamp-all-revisions-variants.json";
    mkdirSync("docs/audit/history-recalculation/analytics",{recursive:true}); writeFileSync(output,JSON.stringify(results,null,2)+"\n");
    console.log(JSON.stringify(results.map(({name,timingsMs})=>({name,timingsMs}))));
  } finally { await client.end(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
