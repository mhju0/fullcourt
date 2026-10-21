import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { seedHistoricalRows } from "../seed-season-write";
import type { HistoricalSeedRow } from "../seed-season-contract";
import { integrityTestUrl } from "./integrity-test-url";

const url = integrityTestUrl();
const schema = "fullcourt_seed_test";
const admin = postgres(url, { max: 1 });
const a = postgres(url, { max: 1, connection: { search_path: schema, application_name: "seed-test-a" } });
const b = postgres(url, { max: 1, connection: { search_path: schema, application_name: "seed-test-b" } });
const row = (suffix: number, extra: Partial<HistoricalSeedRow> = {}): HistoricalSeedRow => ({
  externalId: `002030${String(suffix).padStart(4, "0")}`, date: `2004-01-${String(suffix).padStart(2, "0")}`,
  season: "2003-04", gameType: "regular", homeTeamId: 1, awayTeamId: 2,
  homeScore: 94, awayScore: 99, overtimePeriods: 0, neutralSite: false, neutralVenueCity: null,
  tipOffUtc: null, ...extra,
});
let passed = 0;
const pass = (label: string) => { passed++; console.log(`PASS ${label}`); };
const count = async () => Number((await a`select count(*)::int as n from games`)[0].n);

async function main() {
  try {
    await admin.unsafe(`create schema ${schema}`);
    await a.unsafe(readFileSync("scripts/tests/ci-integrity-bootstrap.sql", "utf8"));
    assert.equal(await seedHistoricalRows(a, [row(1)], { dryRun: true }), 1);
    assert.equal(await count(), 0);
    assert.equal(await seedHistoricalRows(a, [row(1)]), 1);
    const before = JSON.stringify(await a`select * from games order by id`);
    assert.equal(await seedHistoricalRows(a, [row(1, { overtimePeriods: 2 })]), 0);
    assert.equal(JSON.stringify(await a`select * from games order by id`), before);
    pass("dry-run writes nothing, missing fixture inserts, identical rerun preserves exact stored context");

    for (const change of [{ date: "2004-02-01" }, { season: "2004-05" }, { homeTeamId: 3 },
      { awayTeamId: 3 }, { gameType: "playoffs" }, { homeScore: 95 }, { externalId: "espn-1" }]) {
      await assert.rejects(seedHistoricalRows(a, [row(2), row(1, change)]), /REFUSING/);
      assert.equal(JSON.stringify(await a`select * from games order by id`), before);
    }
    await a`update games set status='scheduled',home_score=null,away_score=null`;
    await assert.rejects(seedHistoricalRows(a, [row(1)]), /existing fixture\/result differs/);
    await a`update games set status='final',home_score=94,away_score=99`;
    pass("existing ID/date/season/teams/type/result, cross-ID collision and nonfinal states refuse entire batch");

    await a.unsafe(`create function refuse_seed_test() returns trigger language plpgsql as $$begin if new.external_id='0020300003' then raise exception 'injected late chunk failure';end if;return new;end$$`);
    await a.unsafe(`create trigger refuse_seed before insert on games for each row execute function refuse_seed_test()`);
    await assert.rejects(seedHistoricalRows(a, [row(2), row(3)], { chunkSize: 1 }), /injected late chunk failure/);
    assert.equal(await count(), 1);
    await a`drop trigger refuse_seed on games`;
    pass("a later chunk failure rolls back every earlier chunk");

    let unlock!: () => void;
    const wait = new Promise<void>(resolve => { unlock = resolve; });
    let ready!: () => void;
    const acquired = new Promise<void>(resolve => { ready = resolve; });
    const writer = b.begin(async tx => {
      await tx`lock table games in share row exclusive mode`;
      ready();
      await wait;
      await tx`insert into games(external_id,date,season,game_type,home_team_id,away_team_id,status,home_score,away_score)
        values('espn-concurrent','2004-01-02','2003-04','regular',1,2,'final',94,99)`;
    });
    await acquired;
    const waitingSeed = seedHistoricalRows(a, [row(2)]);
    const rejected = assert.rejects(waitingSeed, /fixture already stored/);
    try {
      let blocked = false;
      for (let i = 0; i < 100; i++) {
        const rows = await admin`select wait_event_type from pg_stat_activity where application_name='seed-test-a' and state='active'`;
        if (rows.some(item => item.wait_event_type === "Lock")) { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.equal(blocked, true, "seed must wait for the conflicting writer before preflight");
    } finally { unlock(); }
    await writer;
    await rejected;
    assert.deepEqual((await a`select external_id from games order by id`).map(game => game.external_id), [row(1).externalId, "espn-concurrent"]);
    pass("concurrent writer completes before locked preflight, conflict is observed and no duplicate is inserted");
    console.log(`${passed} PostgreSQL seed contracts passed`);
  } finally {
    await a.end(); await b.end();
    await admin.unsafe(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
