import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../../src/lib/db/schema";
import { writeGameStatus } from "../../src/lib/game-status-write";
import { createDailyRefreshPort, selectRecoveryGameIds } from "../../src/lib/daily-refresh-port";
import { integrityTestUrl } from "./integrity-test-url";

// Explicit disposable loopback URLs only; never read .env.local.
const url = integrityTestUrl();
const name = "fullcourt_status_test";
const admin = postgres(url, {max:1});
const a = postgres(url, {max:1,connection:{search_path:name,application_name:"status-A"}});
const b = postgres(url, {max:1,connection:{search_path:name,application_name:"status-B"}});
const dbA = drizzle(a,{schema});
const dbB = drizzle(b,{schema});
let sourceDate = "";
let passed = 0;
const pass = (label:string) => {passed++;console.log(`PASS ${label}`);};
const update = (status:"postponed"|"cancelled"|"final"|"scheduled") => ({expectedIdentity:{date:sourceDate,homeAbbr:"BOS",awayAbbr:"BKN"},gameId:90,status,homeScore:status === "final" ? 100:null,awayScore:status === "final" ? 90:null,overtimePeriods:null});
async function seedFatigue() {
  await a`insert into fatigue_scores(game_id,team_id,score,decay_load_score,travel_load_score,b2b_multiplier,altitude_multiplier,density_multiplier,freshness_bonus,games_in_last_7_days,travel_distance_miles,is_back_to_back)
    select g.id,s.team,4,0,0,1,1,1,0,2,0,false from games g cross join lateral(values(g.home_team_id),(g.away_team_id))s(team)`;
}
async function main() {
try {
  await admin.unsafe(`create schema ${name}`);
  await a.unsafe(readFileSync("scripts/tests/ci-integrity-bootstrap.sql","utf8"));
  await a`insert into games(id,external_id,date,season,home_team_id,away_team_id,status,tip_off_utc) values
    (90,'source',current_date,'2099-00',1,2,'scheduled',now()+interval '1 hour'),
    (10,'target',current_date+2,'2099-00',1,3,'scheduled',now()+interval '2 days'),
    (11,'outside',current_date+31,'2099-00',1,3,'scheduled',now()+interval '31 days'),
    (12,'unrelated',current_date+2,'2099-00',3,4,'scheduled',now()+interval '2 days'),
    (13,'tipped',current_date+1,'2099-00',1,3,'scheduled',now()-interval '1 hour'),
    (14,'historical',current_date-1,'2099-00',1,3,'final',now()-interval '1 day')`;
  sourceDate=String((await a`select date::text from games where id=90`)[0].date);
  await seedFatigue();
  await a`insert into predictions(game_id,predicted_advantage_team_id,rest_advantage_differential,actual_winner_id) values(10,1,4,null),(10,1,4,1),(14,1,4,1)`;
  assert.deepEqual(await writeGameStatus(dbA,update("postponed")),{written:true,invalidated:1});
  assert.equal((await a`select status,home_score from games where id=90`)[0].status,"postponed");
  assert.equal((await a`select count(*)::int n from fatigue_scores where game_id=10`)[0].n,0);
  assert.equal((await a`select count(*)::int n from fatigue_scores where game_id in(11,12,13,14)`)[0].n,8);
  assert.equal((await a`select count(*)::int n from predictions where game_id=10 and actual_winner_id is null`)[0].n,0);
  assert.equal((await a`select count(*)::int n from predictions where actual_winner_id is not null`)[0].n,2);
  pass("hold roundtrip atomically invalidates only future related 30-day forecasts and preserves resolved/history");
  assert.equal((await writeGameStatus(dbB,update("scheduled"))).written,false);
  assert.equal((await a`select status from games where id=90`)[0].status,"postponed");
  pass("stale pregame cannot reopen authoritative hold");
  assert.ok((await selectRecoveryGameIds(dbA,"2099-01-01","2099-00")).includes(10));
  assert.equal((await createDailyRefreshPort(dbA).refreshGame(10)).status,"refreshed");
  assert.equal((await a`select count(*)::int n from fatigue_scores where game_id=10`)[0].n,2);
  pass("missing-pair recovery reaches beyond today/tomorrow and rebuilds through real locked prospective port");
  await Promise.all([writeGameStatus(dbA,update("final")),writeGameStatus(dbB,update("cancelled"))]);
  assert.equal((await a`select status,home_score from games where id=90`)[0].status,"final");
  assert.equal((await a`select home_score from games where id=90`)[0].home_score,100);
  assert.equal((await writeGameStatus(dbB,update("cancelled"))).written,false);
  assert.equal((await a`select count(*)::int n from fatigue_scores where game_id=10`)[0].n,0);
  pass("final vs hold race stays final and held-to-final invalidates prospective workload again");
  await assert.rejects(writeGameStatus(dbA,{...update("postponed"),expectedIdentity:{date:"1900-01-01",homeAbbr:"BOS",awayAbbr:"BKN"}}),/identity no longer matches/);
  pass("a fixture moved before write-time metadata read cannot consume the old feed");
  await a`update games set status='scheduled',home_score=null,away_score=null where id=90`;
  await a.unsafe(`create function refuse_status_test() returns trigger language plpgsql as $$begin raise exception 'injected invalidation failure';end$$`);
  await a.unsafe(`create trigger refuse_status before delete on fatigue_scores for each statement execute function refuse_status_test()`);
  await assert.rejects(writeGameStatus(dbA,update("postponed")), error => error instanceof Error && String(error.cause).includes("injected invalidation failure"));
  assert.equal((await a`select status from games where id=90`)[0].status,"scheduled");
  pass("invalidation failure rolls back status write");
  console.log(`${passed} PostgreSQL lifecycle contracts passed`);
} finally {
  await a.end();await b.end();
  await admin.unsafe(`drop schema if exists ${name} cascade`);await admin.end();
}

}
main().catch(error => {console.error(error);process.exitCode=1;});
