import { verifyPlayoffTransition } from "./playoff-contract";
import { acceptedAddedFixtures, fixtureKey } from "../../src/lib/game-input-corrections";
import { readFileSync } from "node:fs";
import { validateProductionAuthorization, type ProductionAuthorization } from "./authorization";
import { createHash } from "node:crypto";
import type postgres from "postgres";
export type Row = Record<string, unknown> & { id: number };
export interface Snapshot { teams: Row[]; games: Row[]; fatigue_scores: Row[]; predictions: Row[]; playoff_series:Row[]; playoff_series_predictions:Row[] }
export const snapshotTables=["teams","games","fatigue_scores","predictions","playoff_series","playoff_series_predictions"] as const;
export const fourTableProjection=(s:Snapshot)=>({teams:s.teams,games:s.games,fatigue_scores:s.fatigue_scores,predictions:s.predictions});
export interface Manifest {
  version: 2; databaseTimeZone: string; createdAt: string; asOf: string; sourceHashes: Record<string, string>;
  beforeHash: string; afterHash: string; before: Snapshot; after: Snapshot;
  gameAdditions: Row[];
  inputChanges: { id: number; identity: string; fields: Record<string, { before: unknown; after: unknown }> }[];
  baseline: { sides: number; differences: number }; report: unknown;
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export const hash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
export function assertLocalDatabase(url: string): void {
  const parsed = new URL(url);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || parsed.hostname !== "127.0.0.1" || parsed.port !== "55434" || parsed.pathname !== "/fullcourt_recalculation")
    throw new Error("Write-capable tooling is restricted to 127.0.0.1:55434/fullcourt_recalculation; production mode is disabled");
  if (parsed.searchParams.has("host") || parsed.searchParams.has("port")) throw new Error("Connection target overrides forbidden");
}
export async function capture(sql: postgres.Sql | postgres.TransactionSql): Promise<Snapshot> {
  const result: Partial<Snapshot> = {};
  for (const table of snapshotTables) {
    const rows = await sql.unsafe(`select to_jsonb(t) as row from ${table} t order by id`);
    result[table] = rows.map(r=>r.row as Row);
  }
  return result as Snapshot;
}
export function verifyManifest(manifest: Manifest): void {
  if (manifest.version !== 2 || manifest.baseline.differences !== 0 || hash(manifest.before) !== manifest.beforeHash || hash(manifest.after) !== manifest.afterHash)
    throw new Error("Manifest checksum/baseline validation failed");
  const resolved = (s: Snapshot) => s.predictions.filter(p=>p.actual_winner_id !== null);
  if (hash(resolved(manifest.before)) !== hash(resolved(manifest.after))) throw new Error("Resolved prediction history changed");
  if (hash(manifest.before.teams)!==hash(manifest.after.teams)) throw new Error("Teams cannot change");
  const seen = new Set<string>();
  for(const score of manifest.after.fatigue_scores) {
    const key=`${score.game_id}:${score.team_id}`;
    if(seen.has(key))throw new Error(`Duplicate fatigue side ${key}`);
    seen.add(key);
  }
  for(const game of manifest.after.games) for(const team of [game.home_team_id,game.away_team_id])
    if(!seen.has(`${game.id}:${team}`))throw new Error(`Incomplete fatigue pair ${game.id}`);
  const beforeIds=new Set(manifest.before.games.map(g=>g.id));
  const afterIds=new Set(manifest.after.games.map(g=>g.id));
  if(afterIds.size!==manifest.after.games.length)throw new Error("Duplicate candidate game ID");
  const afterGames=new Map(manifest.after.games.map(g=>[g.id,g]));
  const mutableInputs=new Set(["overtime_periods","game_type","tip_off_utc","neutral_site","neutral_venue_city"]);
  for(const original of manifest.before.games){
    const candidate=afterGames.get(original.id);
    if(!candidate)throw new Error("Existing games cannot be removed");
    for(const column of new Set([...Object.keys(original),...Object.keys(candidate)]))
      if(!mutableInputs.has(column)&&canonical(original[column])!==canonical(candidate[column]))throw new Error(`Existing game immutable column changed: ${original.id}.${column}`);
  }
  const additions=manifest.after.games.filter(g=>!beforeIds.has(g.id));
  if(additions.length!==acceptedAddedFixtures.length || hash(additions)!==hash(manifest.gameAdditions))throw new Error("Only the four reviewed game additions are permitted");
  const afterScores=new Map(manifest.after.fatigue_scores.map(s=>[s.id,s]));
  if(afterScores.size!==manifest.after.fatigue_scores.length)throw new Error("Duplicate candidate fatigue ID");
  for(const original of manifest.before.fatigue_scores){
    const candidate=afterScores.get(original.id);
    if(!candidate || candidate.game_id!==original.game_id || candidate.team_id!==original.team_id)throw new Error(`Existing fatigue identity changed: ${original.id}`);
  }
  const beforeScoreIds=new Set(manifest.before.fatigue_scores.map(s=>s.id));
  const addedGameIds=new Set(additions.map(g=>g.id));
  const newScores=manifest.after.fatigue_scores.filter(s=>!beforeScoreIds.has(s.id));
  if(newScores.length!==8 || newScores.some(s=>!addedGameIds.has(Number(s.game_id))))throw new Error("Only eight new reviewed fatigue-pair rows are permitted");
  const teams=new Map(manifest.before.teams.map(t=>[t.id,String(t.abbreviation)]));
  const expected=new Map(acceptedAddedFixtures.map(f=>[fixtureKey(f),f]));
  const used=new Set<string>();
  for(const g of additions){
    const key=fixtureKey({date:String(g.date),homeAbbr:teams.get(Number(g.home_team_id))!,awayAbbr:teams.get(Number(g.away_team_id))!});
    const f=expected.get(key);
    if(!f||used.has(key))throw new Error(`Unreviewed/duplicate game addition ${key}`);
    used.add(key);
    for(const [column,value]of Object.entries({external_id:f.externalId,season:f.season,game_type:f.gameType,home_score:f.homeScore,away_score:f.awayScore,status:f.status,overtime_periods:f.overtimePeriods,neutral_site:f.neutralSite,neutral_venue_city:f.neutralVenueCity}))if(g[column]!==value)throw new Error(`Reviewed addition value mismatch ${key}.${column}`);
    if(Date.parse(String(g.tip_off_utc))!==Date.parse(f.tipOffUtc))throw new Error(`Reviewed addition tip mismatch ${key}`);
  }
  verifyPlayoffTransition(manifest.before,manifest.after);
}
export function verifySources(manifest: Manifest): void {
  for(const [source,expected]of Object.entries(manifest.sourceHashes))
    if(createHash('sha256').update(readFileSync(source)).digest('hex')!==expected)throw new Error(`Frozen source changed: ${source}`);
}
export async function applyManifest(sql: postgres.Sql, manifest: Manifest, direction: "apply" | "rollback", failAfterTable?: string, productionAuthorization?: ProductionAuthorization): Promise<string> {
  const options=sql.options;
  if(options.host.length!==1 || options.port.length!==1)throw new Error("A single explicit database target is required");
  if(productionAuthorization){
    if(options.ssl!=="verify-full")throw new Error("Production requires certificate-verified TLS");
    validateProductionAuthorization({host:options.host[0],port:options.port[0],user:options.user,database:options.database},manifest,direction,productionAuthorization);
  }else if(options.host[0]!=="127.0.0.1" || options.port[0]!==55434 || options.database!=="fullcourt_recalculation")
    throw new Error("Transaction writes require the explicit local shadow database unless reviewed production authorization is supplied");
  verifyManifest(manifest);
  verifySources(manifest);
  const from = direction === "apply" ? manifest.before : manifest.after;
  const to = direction === "apply" ? manifest.after : manifest.before;
  return await sql.begin(async tx=>{
    await tx.unsafe("set local lock_timeout='5s'");
    await tx.unsafe("set local statement_timeout='120s'");
    await tx`select set_config('TimeZone',${manifest.databaseTimeZone},true)`;
    await tx.unsafe("lock table teams, games, fatigue_scores, predictions, playoff_series, playoff_series_predictions in share row exclusive mode");
    const current = await capture(tx);
    if(hash(current)===hash(to))return "already-current";
    if(hash(current)!==hash(from))throw new Error("Frozen full-domain input/target drift; no writes performed");
    const fromPredictions = new Map(from.predictions.map(p=>[p.id,p]));
    const toPredictions = new Map(to.predictions.map(p=>[p.id,p]));
    const changedPredictionGames = new Set([...from.predictions.filter(p=>hash(p)!==hash(toPredictions.get(p.id)??null)), ...to.predictions.filter(p=>hash(p)!==hash(fromPredictions.get(p.id)??null))].map(p=>Number(p.game_id)));
    const clock = Date.now();
    for(const id of changedPredictionGames) {
      const game=current.games.find(g=>g.id===id);
      if(!game || game.status!=="scheduled" || !game.tip_off_utc || Date.parse(String(game.tip_off_utc))<=clock)
        throw new Error(`Prediction eligibility expired before ${direction}: ${id}`);
    }
    for(const table of ["playoff_series_predictions","predictions","fatigue_scores","games"] as const){
      const newIds=new Set(to[table].map(row=>row.id));
      const deletes=from[table].filter(row=>!newIds.has(row.id)).map(row=>row.id);
      if(deletes.length)await tx.unsafe(`delete from ${table} where id = any($1::int[])`,[deletes]);
    }
    for(const table of ["games","fatigue_scores","predictions","playoff_series","playoff_series_predictions"] as const) {
      const oldById=new Map(from[table].map(row=>[row.id,row]));
      const changed=to[table].filter(row=>hash(row)!==hash(oldById.get(row.id)??null));
      for(let i=0;i<changed.length;i+=500) {
        const chunk=changed.slice(i,i+500);
        const columns=Object.keys(chunk[0]);
        if(columns.some(c=>!/^[a-z][a-z0-9_]*$/.test(c)))throw new Error("Unsafe column identifier");
        const updates=columns.filter(c=>c!=="id").map(c=>`${c}=excluded.${c}`).join(",");
        await tx.unsafe(`insert into ${table} (${columns.join(",")}) select ${columns.join(",")} from jsonb_populate_recordset(null::${table},$1::jsonb) ${table==="playoff_series_predictions"?"":"on conflict(id) do update set "+updates}`,[tx.json(chunk as postgres.JSONValue)]);
      }
      if(failAfterTable===table)throw new Error(`Injected failure after ${table}`);
    }
    const observed=await capture(tx);
    if(hash(observed)!==hash(to)){
      for(const table of snapshotTables){
        const expected=new Map(to[table].map(r=>[r.id,r]));
        for(const row of observed[table])for(const [field,value]of Object.entries(row))
          if(canonical(value)!==canonical(expected.get(row.id)?.[field]))throw new Error(`Post-write mismatch ${table}.${row.id}.${field}: observed=${canonical(value)} expected=${canonical(expected.get(row.id)?.[field])}; rolled back`);
      }
      throw new Error("Post-write row-domain mismatch; rolled back");
    }
    for(const id of changedPredictionGames){
      const game=to.games.find(g=>g.id===id)!;
      if(Date.parse(String(game.tip_off_utc))<=Date.now())throw new Error(`Prediction tipped during ${direction}; transaction rolled back: ${id}`);
    }
    verifySources(manifest);
    // Sequences are monotonic; gaps on a rolled-back insertion are harmless.
    for(const table of ["games","fatigue_scores","predictions","playoff_series_predictions"])
      await tx.unsafe(`select setval(pg_get_serial_sequence('${table}','id'),greatest((select last_value from ${table}_id_seq),(select coalesce(max(id),1) from ${table})),true)`);
    return direction === "apply" ? "applied" : "rolled-back";
  });
}
