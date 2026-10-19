import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import {
  getCompletedGamesStamp,
  getCompletedGamesWithFatigue,
  getDataAsOf,
  getSeasonGamesStamp,
  getSeasonReportRows,
} from "@/lib/db/queries";
import { getHistoricalBacktest } from "@/lib/rest-advantage-evidence-server";

const databaseUrl = process.env.DATABASE_URL ?? "";
const target = new URL(databaseUrl);
if (!["postgres:", "postgresql:"].includes(target.protocol) || target.hostname !== "127.0.0.1" || target.port !== "55434" || target.pathname !== "/fullcourt_recalculation" || target.search) {
  throw new Error("Mutation verification requires the explicit local recalculation database");
}
const output = process.argv[2] ?? "docs/audit/history-recalculation/analytics/cache-stamp-verification.json";
const client = postgres(databaseUrl, { max: 1, prepare: false });
type Runtime = { dbInstance?: ReturnType<typeof drizzle<typeof schema>>; sqlClient?: postgres.Sql };
const runtime = globalThis as typeof globalThis & { __nbaRestAdvantageDb?: Runtime };
const previous = runtime.__nbaRestAdvantageDb;
type LoggedQuery = { query: string; params: unknown[] };
const logged: LoggedQuery[] = [];
const cases: Array<{ name: string; verified: boolean }> = [];

function params(values: unknown[]): Array<string | number | boolean | null> {
  return values.map((value) => {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    throw new Error("Unexpected benchmark query parameter");
  });
}

async function main() {
  const connection = await client.reserve();
  const before = await connection`select md5(string_agg(md5(to_jsonb(t)::text), '' order by id)) as digest from games t`;
  const beforeFatigue = await connection`select md5(string_agg(md5(to_jsonb(t)::text), '' order by id)) as digest from fatigue_scores t`;
  let transactionOpen = false;
  try {
    await connection`begin isolation level repeatable read`;
    transactionOpen = true;
    runtime.__nbaRestAdvantageDb = {
      sqlClient: client,
      dbInstance: drizzle(Object.assign(connection, { options: client.options }), { schema, logger: { logQuery(query, values) { logged.push({ query, params: values }); } } }),
    };
    const candidates = await connection`
      select g.id, g.date::text as date, g.season, g.home_team_id, g.away_team_id, g.home_score, g.away_score,
             h.id as fatigue_id, h.score::text as fatigue_score, a.score::text as away_fatigue_score
      from games g
      join lateral (select * from fatigue_scores f where f.game_id=g.id and f.team_id=g.home_team_id order by computed_at desc,id desc limit 1) h on true
      join lateral (select * from fatigue_scores f where f.game_id=g.id and f.team_id=g.away_team_id order by computed_at desc,id desc limit 1) a on true
      where g.game_type='regular' and g.status='final' and g.season='2023-24' and not g.neutral_site
        and g.home_score is not null and g.away_score is not null and a.score-h.score >= 0.5
      order by g.id limit 2`;
    assert.equal(candidates.length, 2);
    const [game, other] = candidates;
    const changedFatigue = Number(game.away_fatigue_score) + 1;
    const baseline = await getCompletedGamesStamp();
    const publicDate = await getDataAsOf();
    const baselineBacktest = await getHistoricalBacktest(0);

    async function changed(name: string, mutate: () => Promise<void>) {
      await connection`savepoint mutation_case`;
      try {
        await mutate();
        assert.notEqual(await getCompletedGamesStamp(), baseline, name);
        cases.push({ name, verified: true });
      } finally {
        await connection`rollback to savepoint mutation_case`;
        await connection`release savepoint mutation_case`;
      }
      assert.equal(await getCompletedGamesStamp(), baseline, `${name} rollback`);
    }

    await changed("isolated fatigue score edit invalidates warmed backtest", async () => {
      await connection`update fatigue_scores set score=${changedFatigue} where id=${game.fatigue_id}`;
      assert.deepEqual(await getDataAsOf(), publicDate);
      const corrected = await getHistoricalBacktest(0);
      assert.equal(corrected.totalGames, baselineBacktest.totalGames - 1);
    });
    assert.equal((await getHistoricalBacktest(0)).totalGames, baselineBacktest.totalGames);
    await changed("deleted fatigue side and same-row recovery", async () => {
      const removed = await connection`delete from fatigue_scores where game_id=${game.id} and team_id=${game.home_team_id} returning to_jsonb(fatigue_scores) as row`;
      assert.notEqual(await getCompletedGamesStamp(), baseline);
      for (const row of removed) {
        await connection.unsafe("insert into fatigue_scores select * from jsonb_populate_record(null::fatigue_scores, $1::jsonb)", [JSON.stringify(row.row)]);
      }
      assert.equal(await getCompletedGamesStamp(), baseline);
      await connection`delete from fatigue_scores where game_id=${game.id} and team_id=${game.home_team_id}`;
    });
    await changed("neutral-site edit", async () => { await connection`update games set neutral_site=true where id=${game.id}`; });
    await changed("season edit", async () => { await connection`update games set season='2022-23' where id=${game.id}`; });
    await changed("date edit", async () => { await connection`update games set date=date+1 where id=${game.id}`; });
    await changed("team identity edit with a missing fatigue marker", async () => {
      const [third] = await connection`select id from teams where id not in (${game.home_team_id},${game.away_team_id}) order by id limit 1`;
      await connection`update games set home_team_id=${third.id} where id=${game.id}`;
    });
    await changed("status edit", async () => { await connection`update games set status='scheduled' where id=${game.id}`; });
    await changed("scoreboard sides swapped", async () => { await connection`update games set home_score=away_score, away_score=home_score where id=${game.id}`; });
    await changed("offsetting scoreboard corrections", async () => {
      const beforeChecksum = await connection`select sum(home_score::bigint*1000+away_score)::text as checksum from games where id in (${game.id},${other.id})`;
      await connection`update games set home_score=home_score+1 where id=${game.id}`;
      await connection`update games set home_score=home_score-1 where id=${other.id}`;
      const afterChecksum = await connection`select sum(home_score::bigint*1000+away_score)::text as checksum from games where id in (${game.id},${other.id})`;
      assert.deepEqual(afterChecksum, beforeChecksum, "old weighted checksum cancels these corrections");
      assert.deepEqual(await getDataAsOf(), publicDate);
    });
    await changed("equal-time revisions select highest id in both loader paths", async () => {
      const [source] = await connection`select to_jsonb(f) as row from fatigue_scores f where id=${game.fatigue_id}`;
      const [maximum] = await connection`select max(id) as id from fatigue_scores`;
      const duplicate = { ...source.row, id: Number(maximum.id) + 1000000, score: changedFatigue };
      await connection.unsafe("insert into fatigue_scores select * from jsonb_populate_record(null::fatigue_scores, $1::jsonb)", [JSON.stringify(duplicate)]);
      const selectedStamp = await getCompletedGamesStamp();
      const rows = await getCompletedGamesWithFatigue();
      assert(rows.some((row) => row.date === game.date && row.season === game.season && Number(row.homeFatigueScore) === changedFatigue));
      const season = await getSeasonReportRows(String(game.season));
      assert.equal(Number(season.find((row) => row.gameId === game.id)!.home!.fatigueScore), changedFatigue);
      await connection`update fatigue_scores set score=score+1 where id=${game.fatigue_id}`;
      assert.notEqual(await getCompletedGamesStamp(), selectedStamp, "superseded revisions conservatively evict the cache");
    });

    const [context] = await connection`select id,season from games where game_type='cup_final' order by date limit 1`;
    assert(context, "restored Cup workload fixture required");
    await connection`savepoint physical_context`;
    try {
      const seasonStamp = await getSeasonGamesStamp(String(context.season));
      await connection`update games set overtime_periods=overtime_periods+1, date=date+1 where id=${context.id}`;
      assert.equal(await getCompletedGamesStamp(), baseline, "nonregular workload is outside the completed target cohort");
      assert.notEqual(await getSeasonGamesStamp(String(context.season)), seasonStamp);
      cases.push({ name: "Cup physical context changes season stamp while preserving completed cohort", verified: true });
    } finally {
      await connection`rollback to savepoint physical_context`;
      await connection`release savepoint physical_context`;
    }

    logged.length = 0;
    await getCompletedGamesStamp();
    const digestQuery = logged.at(-1)!;
    logged.length = 0;
    await getCompletedGamesWithFatigue();
    const loaderQuery = logged.at(-1)!;
    logged.length = 0;
    await getDataAsOf();
    const dateQuery = logged.at(-1)!;
    assert(!dateQuery.query.includes("fatigue_scores"), "AS OF must stay cheap");
    const oldStampQuery = {
      query: "select count(*), max(date), coalesce(sum(home_score::bigint*1000+away_score),0)::text from games where game_type='regular' and status='final' and not(season='2019-20' and date between '2020-07-30' and '2020-10-11')",
      params: [],
    };
    const benchmarks = [];
    for (const [name, query] of [["old-count-date-checksum", oldStampQuery], ["completed-input-fingerprint", digestQuery], ["full-loader", loaderQuery]] as const) {
      const timings = [];
      for (let trial = 0; trial < 3; trial++) {
        const started = performance.now();
        await connection.unsafe(query.query, params(query.params));
        timings.push(performance.now() - started);
      }
      const plan = await connection.unsafe(`explain (analyze,buffers,format json) ${query.query}`, params(query.params));
      benchmarks.push({ name, timingsMs: timings, plan: plan[0]["QUERY PLAN"] });
    }
    await connection`rollback`;
    transactionOpen = false;
    const after = await connection`select md5(string_agg(md5(to_jsonb(t)::text), '' order by id)) as digest from games t`;
    const afterFatigue = await connection`select md5(string_agg(md5(to_jsonb(t)::text), '' order by id)) as digest from fatigue_scores t`;
    assert.deepEqual(after, before);
    assert.deepEqual(afterFatigue, beforeFatigue);
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify({ checkedAt: new Date().toISOString(), cases, baseline, publicDate, gamesDigest: before[0].digest, fatigueDigest: beforeFatigue[0].digest, rollbackVerified: true, benchmarks }, null, 2) + "\n");
    console.log(JSON.stringify({ cases: cases.length, rollbackVerified: true, output }));
  } finally {
    if (transactionOpen) await connection`rollback`;
    runtime.__nbaRestAdvantageDb = previous;
    await connection.release();
    await client.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
