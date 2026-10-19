import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { parse } from 'dotenv';
const out = fileURLToPath(new URL('./', import.meta.url));
const raw = fileURLToPath(new URL('../../../audit/2026-10-20-historical-audit/snapshot/', import.meta.url));
await mkdir(raw, { recursive: true });
const env = { ...parse(readFileSync('.env.local')), ...process.env };
if (!env.DATABASE_URL) throw Error('DATABASE_URL missing');
const sql = postgres(env.DATABASE_URL, { prepare: false, max: 1, connect_timeout: 10 });
const started = new Date().toISOString();
try {
 const snap = await sql.begin('isolation level repeatable read read only', async tx => {
  const metadata = await tx`select transaction_timestamp()::text as transaction_timestamp, current_setting('transaction_isolation') as isolation, current_setting('transaction_read_only') as read_only, version() as postgres_version`;
  const teams = await tx`select * from teams order by id`;
  const games = await tx`select * from games order by date,id`;
  const scores = await tx`select distinct on (game_id,team_id) * from fatigue_scores order by game_id,team_id,computed_at desc,id desc`;
  const duplicates = await tx`select game_id,team_id,count(*)::int as count, min(computed_at)::text as first_computed,max(computed_at)::text as last_computed from fatigue_scores group by game_id,team_id having count(*)>1 order by game_id,team_id`;
  const latestTies = await tx`with ranked as (select *,dense_rank() over(partition by game_id,team_id order by computed_at desc) as rank from fatigue_scores) select game_id,team_id,computed_at::text,count(*)::int as count,count(distinct score)::int as distinct_scores from ranked where rank=1 group by game_id,team_id,computed_at having count(*)>1 order by game_id,team_id`;
  const totals = await tx`select (select count(*)::int from fatigue_scores) as all_score_rows,(select count(*)::int from games) as all_games,(select count(*)::int from teams) as all_teams`;
  return { teams, games, scores, duplicates, latestTies, metadata, totals };
 });
 for (const row of snap.games) row.date = String(row.date instanceof Date ? row.date.toISOString() : row.date).slice(0,10);
 const files = [];
 for (const [name, data] of Object.entries(snap)) {
  const bytes = Buffer.from(data.map(row => JSON.stringify(row)).join('\n') + '\n');
  const compressed = gzipSync(bytes);
  const filename = name + '.jsonl.gz';
  await writeFile(raw + filename, compressed);
  files.push({file:filename,rows:data.length,bytes:compressed.length,sha256:createHash('sha256').update(compressed).digest('hex'),uncompressedSha256:createHash('sha256').update(bytes).digest('hex')});
 }
 await writeFile(out+'snapshot-manifest.json', JSON.stringify({started,finished:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),transaction:'REPEATABLE READ READ ONLY',latestSelection:'computed_at DESC, id DESC; latestTies separately records application tie ambiguity',files,metadata:snap.metadata,totals:snap.totals},null,2)+'\n');
 console.log(JSON.stringify({files,totals:snap.totals}));
} finally { await sql.end(); }
