import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CI_INTEGRITY_URL, integrityTestUrl } from "./integrity-test-url";
import postgres from "postgres";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../../src/lib/db/schema";
import { createDailyRefreshPort, selectRecoveryGameIds, adjacentEasternDateKey } from "../../src/lib/daily-refresh-port";
import { refreshDailyGames, refreshProspectiveGames, type DailyRefreshWrite, type DailyRefreshPort } from "../../src/lib/daily-refresh";
import { fetchRecentGamesForTeam } from "../../src/lib/fatigue-recent-games";
import { formatEasternDateKey, seasonLabelForDateKey } from "../../src/lib/nba-season";

// This harness never loads .env.local. CI uses a fixed disposable service, never DATABASE_URL.
const url = integrityTestUrl();
const testSchema = "fullcourt_integrity_test";
const admin = postgres(url!, { max: 1, prepare: false });
const makeClient = (name: string) => postgres(url!, { max: 1, prepare: false, connection: { application_name: name, search_path: testSchema } });
const first = makeClient("integrity-A");
const second = makeClient("integrity-B");
const dbA = drizzle(first, { schema });
const dbB = drizzle(second, { schema });
const portA = createDailyRefreshPort(dbA);
const portB = createDailyRefreshPort(dbB);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let passed = 0;
const pass = (name: string) => { passed++; console.log(`PASS ${name}`); };
async function waitForLock(tx: Pick<postgres.TransactionSql, "unsafe">, applicationName = "integrity-B") {
  const end = Date.now() + 5_000;
  while (Date.now() < end) {
    await tx.unsafe("select pg_stat_clear_snapshot()");
    const states = await tx.unsafe("select wait_event_type from pg_stat_activity where application_name = $1",[applicationName]);
    if (states.some(state => state.wait_event_type === "Lock")) return;
    await sleep(10);
  }
  throw new Error("independent writer never reached lock barrier");
}
function legacyPort(): DailyRefreshPort {
  // Exact former database protocol: source reads precede the game-level replace transaction.
  return {
    loadRecentGames: (id,date) => fetchRecentGamesForTeam(dbA,id,date,"scheduled"),
    replaceGameRefresh: write => dbA.transaction(async tx => {
      await tx.delete(schema.fatigueScores).where(eq(schema.fatigueScores.gameId,write.gameId));
      await tx.insert(schema.fatigueScores).values(write.fatigueRows.map(row=>({gameId:write.gameId,...row})));
      if (write.replaceUnresolvedPrediction) {
        await tx.delete(schema.predictions).where(and(eq(schema.predictions.gameId,write.gameId),isNull(schema.predictions.actualWinnerId)));
        if (write.prediction) await tx.insert(schema.predictions).values({gameId:write.gameId,...write.prediction,actualWinnerId:null});
      }
    }),
  };
}

async function runCli(script: string, argument: string | string[], marker: string, feedPayload?: unknown): Promise<string> {
  const root = process.cwd();
  const cwd = mkdtempSync(join(tmpdir(), "fullcourt-no-env-"));
  try {
    return await new Promise<string>((resolve,reject) => {
      const preloadArgs: string[]=[];
      let preloadOption="";
      if(feedPayload!==undefined) {
        const preload=join(cwd,"score-feed.mjs");
        writeFileSync(preload,`globalThis.fetch=async()=>new Response(${JSON.stringify(JSON.stringify(feedPayload))});`);
        preloadOption=`--import=${preload}`;
      }
      const child = spawn(process.execPath,[...preloadArgs,join(root,"node_modules/tsx/dist/cli.mjs"),"--tsconfig",join(root,"tsconfig.json"),join(root,script),...(Array.isArray(argument)?argument:[argument])],{
        cwd,
        env:{...process.env,NODE_OPTIONS:[process.env.NODE_OPTIONS,preloadOption].filter(Boolean).join(" "),DATABASE_URL:`${url}?search_path=${testSchema}&application_name=integrity-cli`},
      });
      let output="";
      let complete=false;
      const timeout=setTimeout(()=>{child.kill();reject(new Error(`CLI deadline: ${script}\n${output}`));},10_000);
      child.stdout.on("data",chunk=>{
        output+=String(chunk);
        if(output.includes(marker)) { complete=true; child.kill(); }
      });
      child.stderr.on("data",chunk=>{output+=String(chunk);});
      child.on("close",()=>{
        clearTimeout(timeout);
        if(complete) resolve(output);
        else reject(new Error(output));
      });
      child.on("error",reject);
    });
  } finally { rmSync(cwd,{recursive:true}); }
}

async function main() {
try {
  if (url === CI_INTEGRITY_URL) {
    await admin.unsafe(readFileSync(join(process.cwd(), "scripts/tests/ci-integrity-bootstrap.sql"), "utf8"));
  }
  await admin.unsafe(`create schema ${testSchema}`);
  for (const table of ["teams", "games", "fatigue_scores", "predictions"]) await admin.unsafe(`create table ${testSchema}.${table} (like public.${table} including all)`);
  const sourceForeignKeys = await admin`
    select t.relname as table_name, c.conname as constraint_name, pg_get_constraintdef(c.oid) as definition
    from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relname in ('teams','games','fatigue_scores','predictions') and c.contype='f'
    order by t.relname,c.conname
  `;
  assert.equal(sourceForeignKeys.length,7,"test source must carry all seven expected foreign keys");
  for (const fk of sourceForeignKeys) {
    assert.match(fk.table_name,/^[a-z_]+$/);
    assert.match(fk.constraint_name,/^[a-z_]+$/);
    const definition=String(fk.definition).replace(/REFERENCES (?:public\.)?(games|teams)\(/g,`REFERENCES ${testSchema}.$1(`);
    assert.ok(definition.includes(`REFERENCES ${testSchema}.`));
    await admin.unsafe(`alter table ${testSchema}.${fk.table_name} add constraint ${fk.constraint_name} ${definition}`);
  }
  const copiedForeignKeys = await admin`
    select t.relname as table_name, c.conname as constraint_name, pg_get_constraintdef(c.oid) as definition,
      reference_namespace.nspname as reference_schema
    from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      join pg_class referenced on referenced.oid=c.confrelid join pg_namespace reference_namespace on reference_namespace.oid=referenced.relnamespace
    where n.nspname=${testSchema} and c.contype='f' order by t.relname,c.conname
  `;
  assert.deepEqual(copiedForeignKeys.map(fk=>({
    table_name:fk.table_name,constraint_name:fk.constraint_name,
    definition:String(fk.definition).replaceAll(`${testSchema}.`,""),
  })),sourceForeignKeys.map(fk=>({...fk})));
  assert.ok(copiedForeignKeys.every(fk=>fk.reference_schema===testSchema));
  console.log("FOREIGN KEYS",JSON.stringify(copiedForeignKeys));
  await admin.unsafe(`insert into ${testSchema}.teams select * from public.teams`);
  await assert.rejects(
    first`insert into predictions(game_id,predicted_advantage_team_id,rest_advantage_differential) values(-99999,1,1)`,
    (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "23503",
  );
  pass("all seven expected foreign keys copied to isolated schema; orphan prediction rejected");
  const today = formatEasternDateKey();
  const yesterday = adjacentEasternDateKey(today, -1);
  const season = seasonLabelForDateKey(today);
  await first`insert into games(id,external_id,date,season,home_team_id,away_team_id,status,tip_off_utc,home_score,away_score,overtime_periods) values
    (-1,'integrity-prior',${yesterday},${season},3,2,'final',clock_timestamp()-interval '1 day',110,108,0),
    (-2,'integrity-target',${today},${season},1,2,'scheduled',clock_timestamp()+interval '1 hour',null,null,0)`;
  assert.equal((await portA.refreshGame(-2)).status, "refreshed");
  pass("initial prospective pair committed");

  const originalPath = process.env.FULLCOURT_LEGACY_PORT_PATH;
  if (originalPath) assert.equal(originalPath,"/Users/michaelju/Workspace/Projects/fullcourt/src/lib/daily-refresh-port.ts");
  const legacy: DailyRefreshPort = originalPath
    ? (await import(originalPath)).createDailyRefreshPort(dbA)
    : legacyPort();
  let releaseLegacy!: () => void;
  let legacyReady!: () => void;
  const pause = new Promise<void>(resolve=>{releaseLegacy=resolve;});
  const ready = new Promise<void>(resolve=>{legacyReady=resolve;});
  const [legacyTarget] = await first`select tip_off_utc from games where id=-2`;
  const legacyRun = refreshDailyGames({
    games:[{id:-2,date:today,homeTeamId:1,awayTeamId:2,status:"scheduled",tipOffUtc:new Date(legacyTarget.tip_off_utc),neutralSite:false}],
    teams:await dbA.select().from(schema.teams),
    port:{...legacy,replaceGameRefresh:async write=>{legacyReady();await pause;await legacy.replaceGameRefresh(write);}},
  });
  await ready;
  await second`update games set overtime_periods=2 where id=-1`;
  await portB.refreshGame(-2);
  assert.equal((await second`select is_overtime_penalty from fatigue_scores where game_id=-2 and team_id=2`)[0].is_overtime_penalty,true);
  releaseLegacy();
  assert.deepEqual((await legacyRun).failedGames,[]);
  assert.equal((await first`select is_overtime_penalty from fatigue_scores where game_id=-2 and team_id=2`)[0].is_overtime_penalty,false);
  console.log(`BASELINE REPRODUCED ${originalPath ? "authentic original port" : "portable exact legacy protocol"}: stale precomputed writer overwrote newer OT pair`);
  await first`update games set overtime_periods=0 where id=-1`;
  await portA.refreshGame(-2);

  let waiting: Promise<unknown>;
  await first.begin(async tx => {
    await tx.unsafe('select id from games where id=-2 for update');
    waiting = portB.refreshGame(-2);
    await waitForLock(tx);
    await tx.unsafe('update games set overtime_periods=2 where id=-1');
  });
  assert.equal((await waiting! as {status:string}).status, "refreshed");
  const fresh = await first`select team_id,is_overtime_penalty,score from fatigue_scores where game_id=-2 order by team_id`;
  assert.equal(fresh.length, 2);
  assert.equal(fresh.find(row => row.team_id === 2)?.is_overtime_penalty, true);
  let expected: DailyRefreshWrite | undefined;
  const [target] = await first`select tip_off_utc from games where id=-2`;
  const replay = await refreshDailyGames({
    games: [{ id: -2, date: today, homeTeamId: 1, awayTeamId: 2, status: "scheduled", tipOffUtc: new Date(target.tip_off_utc), neutralSite: false }],
    teams: await dbA.select().from(schema.teams),
    port: { loadRecentGames: (id,date) => fetchRecentGamesForTeam(dbA,id,date,"scheduled"), replaceGameRefresh: async write => { expected=write; } },
  });
  assert.deepEqual(replay.failedGames,[]);
  assert.deepEqual(fresh.map(row => Number(row.score)), expected!.fatigueRows.map(row => Number(row.score)));
  pass("two-client target barrier: post-lock snapshot sees newly committed OT; both scores match pure calculation");

  await first`delete from predictions where game_id=-2`;
  await first`insert into predictions(game_id,predicted_advantage_team_id,rest_advantage_differential,actual_winner_id) values(-2,1,9,2)`;
  const resolved = await first`select * from predictions where game_id=-2`;
  await portB.refreshGame(-2);
  assert.deepEqual(await first`select * from predictions where game_id=-2`, resolved);
  pass("resolved prediction preserved exactly; no open prediction created");

  await first`delete from predictions where game_id=-2`;
  await first`insert into predictions(game_id,predicted_advantage_team_id,rest_advantage_differential) values(-2,1,9)`;
  const beforePair = await first`select * from fatigue_scores where game_id=-2 order by team_id`;
  const beforePick = await first`select * from predictions where game_id=-2`;
  await first.begin(async tx => {
    await tx.unsafe('select id from predictions where game_id=-2 for update');
    const failure = portB.refreshGame(-2).then(() => null, error => error);
    await waitForLock(tx);
    assert.deepEqual(await tx.unsafe('select * from fatigue_scores where game_id=-2 order by team_id'), beforePair);
    assert.ok(await failure, "prediction lock must force a bounded writer failure");
  });
  assert.deepEqual(await first`select * from fatigue_scores where game_id=-2 order by team_id`, beforePair);
  assert.deepEqual(await first`select * from predictions where game_id=-2`, beforePick);
  pass("prediction-stage lock timeout rolls back both fatigue rows and unresolved prediction");

  assert.equal((await portA.refreshGame(-2,{onlyIfMissing:true})).status, "skipped");
  await first`delete from fatigue_scores where game_id=-2 and team_id=2`;
  assert.equal((await portA.refreshGame(-2,{onlyIfMissing:true})).status, "refreshed");
  assert.equal((await first`select count(*)::int as count from fatigue_scores where game_id=-2`)[0].count,2);
  pass("gap mode checks both sides under lock and repairs missing away row");

  await first`update games set tip_off_utc=null where id=-2`;
  assert.equal((await portA.refreshGame(-2)).status, "skipped");
  await first`update games set tip_off_utc=clock_timestamp()+interval '1 hour',status='final' where id=-2`;
  assert.equal((await portA.refreshGame(-2)).status, "skipped");
  await first`update games set status='scheduled' where id=-2`;
  pass("null tip and non-scheduled target are conservatively skipped");

  const beforeStatus = await first`select * from fatigue_scores where game_id=-2 order by team_id`;
  await first.begin(async tx => {
    await tx.unsafe("select id from games where id=-2 for update");
    waiting=portB.refreshGame(-2);
    await waitForLock(tx);
    await tx.unsafe("update games set status='final' where id=-2");
  });
  assert.equal((await waiting! as {status:string}).status,"skipped");
  assert.deepEqual(await first`select * from fatigue_scores where game_id=-2 order by team_id`,beforeStatus);
  await first`update games set status='scheduled' where id=-2`;
  pass("fresh target status after lock wait rejects a concurrent final");

  const beforeClock = await first`select * from fatigue_scores where game_id=-2 order by team_id`;
  await first.begin(async tx => {
    await tx.unsafe("update games set tip_off_utc=clock_timestamp()+interval '200 milliseconds' where id=-2");
    waiting = portB.refreshGame(-2);
    await waitForLock(tx);
    await sleep(250);
  });
  assert.equal((await waiting! as {status:string}).status,"skipped");
  assert.deepEqual(await first`select * from fatigue_scores where game_id=-2 order by team_id`,beforeClock);
  pass("actual DB clock after target lock wait rejects crossed tip");

  await first`create function integrity_delay() returns trigger language plpgsql as $$ begin perform pg_sleep(0.18); return new; end $$`;
  await first`create trigger integrity_delay before insert on fatigue_scores for each row execute function integrity_delay()`;
  await first`update games set tip_off_utc=clock_timestamp()+interval '250 milliseconds' where id=-2`;
  const postWrite = await portA.refreshGame(-2);
  assert.equal(postWrite.status,"skipped");
  assert.deepEqual(await first`select * from fatigue_scores where game_id=-2 order by team_id`,beforeClock);
  await first`drop trigger integrity_delay on fatigue_scores`;
  await first`drop function integrity_delay()`;
  pass("tip crossing during atomic pair insert rolls back post-write");

  await first`update games set tip_off_utc=clock_timestamp()+interval '1 hour' where id=-2`;
  await first`insert into games(id,external_id,date,season,home_team_id,away_team_id,status,tip_off_utc) values
    (-3,'integrity-later',${adjacentEasternDateKey(today,1)},${season},1,2,'scheduled',clock_timestamp()+interval '25 hours')`;
  assert.deepEqual(await selectRecoveryGameIds(dbA,today,season),[-2]);
  await first`update games set status='scheduled' where id=-1`;
  assert.deepEqual(await selectRecoveryGameIds(dbA,today,season),[]);
  await first`update games set status='final',date=${adjacentEasternDateKey(today,-31)} where id=-1`;
  assert.deepEqual(await selectRecoveryGameIds(dbA,today,season),[]);
  pass("independent recovery chooses current next game, requires stored FINAL within model window");

  await first.begin(async tx => {
    await tx.unsafe('select id from games where id=-2 for update');
    waiting = portB.refreshGame(-2,{onlyIfMissing:true});
    await waitForLock(tx);
    await tx.unsafe('delete from fatigue_scores where game_id=-2 and team_id=2');
  });
  assert.equal((await waiting! as {status:string}).status,"refreshed");
  pass("gap decision is rechecked after a waiting target lock");

  await first`update games set date=${yesterday},status='scheduled',overtime_periods=2,home_score=140,away_score=90 where id=-1`;
  await portA.refreshGame(-2);
  assert.equal((await first`select is_overtime_penalty from fatigue_scores where game_id=-2 and team_id=2`)[0].is_overtime_penalty,false);
  await first`update games set status='live' where id=-1`;
  await portA.refreshGame(-2);
  assert.equal((await first`select is_overtime_penalty from fatigue_scores where game_id=-2 and team_id=2`)[0].is_overtime_penalty,false);
  pass("scheduled and live prior results are neutralized on the real writer path");

  await first`delete from fatigue_scores where game_id=-2 and team_id=2`;
  await first`insert into games(id,external_id,date,season,home_team_id,away_team_id,status,tip_off_utc) values
    (-4,'integrity-null',${today},${season},3,4,'scheduled',null)`;
  const projected = await runCli("scripts/project_fatigue.ts",season,"games projected=");
  assert.match(projected,/games projected=2/);
  assert.match(projected,/skipped=1/);
  assert.equal((await first`select count(*)::int as count from fatigue_scores where game_id=-2`)[0].count,2);
  assert.equal((await first`select count(*)::int as count from fatigue_scores where game_id=-4`)[0].count,0);
  console.log(projected.trim());
  pass("actual project_fatigue CLI selects missing away side and preserves null-tip gap");
  const nightly = await runCli("scripts/run-daily.ts",today,"games refreshed=");
  assert.match(nightly,/games refreshed=2/);
  assert.match(nightly,/skipped=1/);
  console.log(nightly.trim());
  pass("actual run-daily CLI uses prospective writer and reports unknown-tip skips");

  const scoreFeed = (state: "pre" | "post", homeScore = "120", awayScore = "117") => ({events:[{
    id:"integrity-event",competitions:[{
      status:{type:{state,completed:state==="post"}},
      competitors:[
        {homeAway:"home",score:homeScore,team:{abbreviation:"BOS"},linescores:Array.from({length:5},()=>({value:20}))},
        {homeAway:"away",score:awayScore,team:{abbreviation:"BKN"},linescores:Array.from({length:5},()=>({value:20}))},
      ],
    }],
  }]});
  const originalFetch=globalThis.fetch;
  const originalDatabaseUrl=process.env.DATABASE_URL;
  const originalSecret=process.env.CRON_SECRET;
  const originalPoolMax=process.env.DB_POOL_MAX;
  process.env.DATABASE_URL=`${url}?search_path=${testSchema}&application_name=integrity-cron`;
  process.env.CRON_SECRET="integrity-test";
  process.env.DB_POOL_MAX="1";
  const {GET}=await import("../../src/app/api/cron/update/route");
  try {
    for(const state of ["pre","post"] as const) {
      await first`update games set status='live',home_score=80,away_score=79 where id=-2`;
      let fetchReady!:()=>void;
      let releaseFetch!:()=>void;
      const ready=new Promise<void>(resolve=>{fetchReady=resolve;});
      const blocked=new Promise<void>(resolve=>{releaseFetch=resolve;});
      globalThis.fetch=async()=>{fetchReady();await blocked;return new Response(JSON.stringify(scoreFeed(state)));};
      const response=GET(new Request("http://localhost/api/cron/update",{headers:{authorization:"Bearer integrity-test"}}));
      await ready;
      await second.begin(async tx=>{
        await tx.unsafe("update games set status='final',home_score=110,away_score=100,overtime_periods=0 where id=-2");
        releaseFetch();
        await waitForLock(tx,"integrity-cron");
      });
      const body=await(await response).json();
      const [stored]=await first`select status,home_score,away_score,overtime_periods from games where id=-2`;
      assert.equal(stored.status,"final");
      if(state==="pre") {
        assert.equal(body.data.gamesUpdated,0);
        assert.equal(body.meta.refusedDowngrades,1);
        assert.equal(stored.home_score,110);
      } else {
        assert.equal(body.data.gamesUpdated,1);
        assert.equal(stored.home_score,120);
        assert.equal(stored.away_score,117);
        assert.equal(stored.overtime_periods,1);
      }
      pass(`actual cron stale read + row-lock wait: ${state==="pre"?"current final preserved/refusal counted":"final correction committed/count accurate"}`);
    }
  } finally {
    globalThis.fetch=originalFetch;
    if(originalDatabaseUrl===undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL=originalDatabaseUrl;
    if(originalSecret===undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET=originalSecret;
    if(originalPoolMax===undefined) delete process.env.DB_POOL_MAX; else process.env.DB_POOL_MAX=originalPoolMax;
    await (globalThis as typeof globalThis & {__nbaRestAdvantageDb?:{sqlClient?:{end():Promise<void>}}}).__nbaRestAdvantageDb?.sqlClient?.end();
  }
  for(const state of ["pre","post"] as const) {
    await first`update games set status='live',home_score=80,away_score=79 where id=-2`;
    let output!:Promise<string>;
    await first.begin(async tx=>{
      await tx.unsafe("update games set status='final',home_score=110,away_score=100,overtime_periods=0 where id=-2");
      output=runCli("scripts/sync_scores_espn.ts",[today,today],"write-time final downgrades refused:",scoreFeed(state));
      await waitForLock(tx,"integrity-cli");
    });
    const log=await output;
    const [stored]=await first`select status,home_score,away_score,overtime_periods from games where id=-2`;
    assert.equal(stored.status,"final");
    if(state==="pre") {
      assert.match(log,/done — 0 row\(s\) updated/);
      assert.match(log,/write-time final downgrades refused: 1/);
      assert.equal(stored.home_score,110);
    } else {
      assert.match(log,/done — 1 row\(s\) updated/);
      assert.match(log,/write-time final downgrades refused: 0/);
      assert.equal(stored.home_score,120);
      assert.equal(stored.away_score,117);
      assert.equal(stored.overtime_periods,1);
    }
    console.log(log.trim());
    pass(`actual score-sync CLI stale read + row-lock wait: ${state==="pre"?"current final preserved/refusal counted":"final correction committed/count accurate"}`);
  }

  const summary = await refreshProspectiveGames({gameIds:[-2,-3],port:portA,deadlineMs:Date.now()-1});
  assert.deepEqual(summary.deferredGames,[-2,-3]);
  pass("budget exhaustion reports every deferred ID");
  console.log(`${passed} real PostgreSQL contracts passed`);
} finally {
  await Promise.all([first.end(),second.end()]);
  await admin.unsafe(`drop schema if exists ${testSchema} cascade`);
  await admin.end();
}

}
main().catch(error => { console.error(error); process.exitCode=1; });
