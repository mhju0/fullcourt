import assert from 'node:assert/strict';
import postgres from "postgres";
import { createDatabase, createDbPool, dbPoolConfig } from "../../src/lib/db/pool";
import { readDailyFreshness } from "../daily-freshness";
import { integrityTestUrl } from "./integrity-test-url";
async function main(){
 const name='fc_freshness_'+process.pid;
 const client=postgres(integrityTestUrl(),{max:1});
 const pool=createDbPool({...dbPoolConfig(integrityTestUrl()),max:1,options:`-c search_path=${name} -c timezone=UTC`});
 try {
  await client.unsafe(`create schema ${name}`);
  await client.unsafe(`set search_path to ${name}`);
  await client.unsafe('set timezone to UTC');
  await client.unsafe('create table games(id int primary key, home_team_id int, away_team_id int, date date, status text, tip_off_utc timestamptz)');
  await client.unsafe('create table fatigue_scores(game_id int, team_id int, computed_at timestamp)');
  await client.unsafe("insert into games values(1,1,2,current_date+2,'scheduled',now()+interval '2 days')");
  await client.unsafe("insert into fatigue_scores values(1,1,localtimestamp-interval '1 hour'),(1,1,localtimestamp-interval '10 minutes')");
  const date=await client.unsafe('select current_date::text as date, (current_date+14)::text as to_date');
  const db=createDatabase(pool);
  let r=await readDailyFreshness(db,date[0].date,date[0].to_date);
  assert.equal(r.status,'incomplete');assert.equal(r.present_rows,1);assert.equal(r.missing_rows,1);assert.equal(r.oldest_age_seconds!>=599 && r.oldest_age_seconds!<=620,true);console.log('PASS latest-per-side SQL ignores obsolete older row and reports missing side');
  await client.unsafe("insert into fatigue_scores values(1,2,localtimestamp-interval '20 minutes')");
  r=await readDailyFreshness(db,date[0].date,date[0].to_date);assert.equal(r.status,'estimated');assert.equal(r.expected_rows,2);assert.equal(r.oldest_age_seconds!>=1199 && r.oldest_age_seconds!<=1220,true);console.log('PASS complete scoped rows have estimated bounded SQL ages');
  await client.unsafe("insert into fatigue_scores values(1,2,localtimestamp+interval '1 hour')");
  r=await readDailyFreshness(db,date[0].date,date[0].to_date);assert.equal(r.status,'unknown');assert.equal(r.latest_age_seconds,null);console.log('PASS future timestamps are unknown, not fresh');
  await pool.query("set timezone to 'America/New_York'");r=await readDailyFreshness(db,date[0].date,date[0].to_date);assert.equal(r.status,'unknown');assert.equal(r.oldest_age_seconds,null);console.log('PASS non-UTC observation suppresses unverified ages');
  await client.unsafe("update games set tip_off_utc=now()-interval '1 hour'");r=await readDailyFreshness(db,date[0].date,date[0].to_date);assert.equal(r.eligible_games,0);console.log('PASS tipped games excluded from prospective freshness window');
 }finally{await pool.end();await client.unsafe(`drop schema if exists ${name} cascade`);await client.end()}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
