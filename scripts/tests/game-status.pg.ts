import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import type { Pool } from "pg";
import { createDatabase, createDbPool, dbPoolConfig } from "../../src/lib/db/pool";
import { writeGameStatus } from "../../src/lib/game-status-write";
import { createDailyRefreshPort, selectRecoveryGameIds } from "../../src/lib/daily-refresh-port";
import { createStampedCache } from "../../src/lib/stamped-cache";
import { scoreGameFatigue } from "../../src/lib/fatigue";
import { buildGameStoryline } from "../../src/lib/game-storyline";
import { formatEasternDateKey } from "../../src/lib/nba-season";
import { integrityTestUrl } from "./integrity-test-url";

// Explicit disposable loopback URLs only; never read .env.local.
const url = integrityTestUrl();
const name = "fullcourt_status_test";
const admin = postgres(url, {max:1});
const a = postgres(url, {max:1,connection:{search_path:name,application_name:"status-A"}});
const b = postgres(url, {max:1,connection:{search_path:name,application_name:"status-B"}});
const poolA = createDbPool({ ...dbPoolConfig(url), max: 1, options: `-c search_path=${name}`, application_name: "status-A" });
const poolB = createDbPool({ ...dbPoolConfig(url), max: 1, options: `-c search_path=${name}`, application_name: "status-B" });
const dbA = createDatabase(poolA);
const dbB = createDatabase(poolB);
let sourceDate = "";
let queryClient: Pool | undefined;
const previousDatabaseUrl = process.env.DATABASE_URL;
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
  process.env.DATABASE_URL = `${url}?options=-c%20search_path%3D${name}&application_name=status-cache`;
  const {getSeasonGamesStamp,getSeasonReportRows,getGameById} = await import("../../src/lib/db/queries");
  queryClient = (await import("../../src/lib/db")).db.$client;
  const {getSeasonReport} = await import("../../src/lib/season-report-server");
  const beforeReport = await getSeasonReport("2099-00");
  let loads = 0;
  const read = createStampedCache({readStamp:getSeasonGamesStamp,load:async (season:string) => {loads++;return getSeasonReportRows(season);}});
  const beforeStamp = await getSeasonGamesStamp("2099-00");
  const beforeCache = await read("2099-00");
  assert.equal(await read("2099-00"),beforeCache);
  assert.deepEqual(await writeGameStatus(dbA,update("postponed")),{written:true,invalidated:1});
  assert.equal((await a`select status,home_score from games where id=90`)[0].status,"postponed");
  assert.equal((await a`select count(*)::int n from fatigue_scores where game_id=10`)[0].n,0);
  assert.equal((await a`select count(*)::int n from fatigue_scores where game_id in(11,12,13,14)`)[0].n,8);
  assert.equal((await a`select count(*)::int n from predictions where game_id=10 and actual_winner_id is null`)[0].n,0);
  assert.equal((await a`select count(*)::int n from predictions where actual_winner_id is not null`)[0].n,2);
  const heldStamp = await getSeasonGamesStamp("2099-00");
  assert.equal(heldStamp.split("~")[0],beforeStamp.split("~")[0],"old count/final/date/score stamp is unchanged");
  assert.notEqual(heldStamp,beforeStamp);
  const heldCache = await read("2099-00");
  assert.notEqual(heldCache,beforeCache);
  assert.equal(heldCache.find(row=>row.gameId===10)?.home,null);
  assert.equal(loads,2);
  const heldReport = await getSeasonReport("2099-00");
  assert.notEqual(heldReport,beforeReport);
  pass("production season stamp/cache immediately sees hold and missing pair without count/final changes");
  pass("hold roundtrip atomically invalidates only future related 30-day forecasts and preserves resolved/history");
  assert.equal((await writeGameStatus(dbB,update("scheduled"))).written,false);
  assert.equal((await a`select status from games where id=90`)[0].status,"postponed");
  pass("stale pregame cannot reopen authoritative hold");
  assert.ok((await selectRecoveryGameIds(dbA,"2099-01-01","2099-00")).includes(10));
  assert.equal((await createDailyRefreshPort(dbA).refreshGame(10)).status,"refreshed");
  assert.equal((await a`select count(*)::int n from fatigue_scores where game_id=10`)[0].n,2);
  const recoveredStamp = await getSeasonGamesStamp("2099-00");
  assert.notEqual(recoveredStamp,heldStamp);
  const recoveredCache = await read("2099-00");
  assert.ok(recoveredCache.find(row=>row.gameId===10)?.home);
  assert.equal(loads,3);
  const recoveredReport = await getSeasonReport("2099-00");
  assert.notEqual(recoveredReport,heldReport);
  assert.notDeepEqual(recoveredReport.teams,heldReport.teams);
  const restored = await a`select team_id,score,games_in_last_7_days,days_since_last_game,is_back_to_back from fatigue_scores where game_id=10 order by team_id`;
  const [dates] = await a`select (current_date-1)::text as earlier,(current_date+1)::text as recent,(current_date+2)::text as target`;
  const tips = new Map((await a`select id,tip_off_utc from games where id in(10,13,14)`).map(row=>[row.id,new Date(String(row.tip_off_utc))]));
  const priors = (home:boolean) => [dates.earlier,dates.recent].map((date,index)=>({date:String(date),isHome:home,tipOffUtc:tips.get(index === 0 ? 14 : 13),
    teamLat:home?42.3662:40.7505,teamLon:home?-71.0621:-73.9934,
    opponentLat:home?40.7505:42.3662,opponentLon:home?-73.9934:-71.0621,overtimePeriods:0,pointMargin:null}));
  const expected = scoreGameFatigue({game:{date:String(dates.target),tipOffUtc:tips.get(10)},
    homeTeam:{id:1,abbreviation:"BOS",latitude:"42.3662",longitude:"-71.0621",altitudeFlag:false},
    awayTeam:{id:3,abbreviation:"NYK",latitude:"40.7505",longitude:"-73.9934",altitudeFlag:false},
    homeRecentGames:priors(true),awayRecentGames:priors(false)});
  for (const [index,side] of [expected.home,expected.away].entries()) {
    assert.equal(restored[index].games_in_last_7_days,2,"held source is excluded, leaving exactly two known prior games");
    assert.equal(restored[index].days_since_last_game,1);
    assert.equal(restored[index].is_back_to_back,true);
    assert.equal(Number(restored[index].score),Math.round(side.score*100)/100);
  }
  pass("recovery restores exact ratified scores and workload features from two independently specified eligible priors");
  await a`update fatigue_scores set computed_at='2000-01-01' where game_id=10`;
  const beforeDelete = await getSeasonGamesStamp("2099-00");
  const [maximum] = await a`select max(computed_at)::text as value from fatigue_scores`;
  await a`delete from fatigue_scores where game_id=10 and team_id=1`;
  assert.equal((await a`select max(computed_at)::text as value from fatigue_scores`)[0].value,maximum.value);
  assert.notEqual(await getSeasonGamesStamp("2099-00"),beforeDelete);
  assert.equal((await read("2099-00")).find(row=>row.gameId===10)?.home,null);
  assert.equal((await createDailyRefreshPort(dbA).refreshGame(10)).status,"refreshed");
  assert.ok((await read("2099-00")).find(row=>row.gameId===10)?.home);
  pass("deleting a non-maximum revision and recovering it both invalidate the actual season cache");
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
  await a`drop trigger refuse_status on fatigue_scores`;
  await a`insert into games(id,external_id,date,season,home_team_id,away_team_id,status,tip_off_utc)
    values(70,'overlap-source',current_date+1,'2099-00',1,2,'scheduled',now()+interval '1 day')`;
  const overlapDate = String((await a`select date::text from games where id=70`)[0].date);
  await a.unsafe(`create function delay_hold_test() returns trigger language plpgsql as $$begin perform pg_sleep(0.1);return new;end$$`);
  await a.unsafe(`create trigger delay_hold before update on games for each row execute function delay_hold_test()`);
  const concurrent = await Promise.all([
    writeGameStatus(dbA,update("postponed")),
    writeGameStatus(dbB,{...update("cancelled"),gameId:70,expectedIdentity:{date:overlapDate,homeAbbr:"BOS",awayAbbr:"BKN"}}),
  ]);
  assert.ok(concurrent.every(result=>result.written));
  assert.deepEqual((await a`select id,status from games where id in(70,90) order by id`).map(row=>[row.id,row.status]),[[70,"cancelled"],[90,"postponed"]]);
  await a`drop trigger delay_hold on games`;
  pass("concurrent holds with inverted source ID/date order and overlapping targets commit without deadlock");
  await a`insert into games(id,external_id,date,season,home_team_id,away_team_id,status,tip_off_utc) values
    (110,'held-opener',current_date+5,'2098-99',3,4,'postponed',now()+interval '5 days'),
    (111,'actual-opener',current_date+7,'2098-99',3,4,'scheduled',now()+interval '7 days')`;
  const actualOpener = await getGameById(111);
  assert.deepEqual(actualOpener?.seasonOpeners,{home:true,away:true});
  assert.match(buildGameStoryline(actualOpener!)!,/Season opener for both teams/);
  assert.equal(buildGameStoryline((await getGameById(110))!),null);
  pass("real game query ignores held opener for both teams and held fixture has no opener/fatigue storyline");
  const lifecycleOnlyBefore = await getSeasonGamesStamp("2099-00");
  const outlyingDate = String((await a`select date::text from games where id=11`)[0].date);
  assert.deepEqual(await writeGameStatus(dbA,{...update("cancelled"),gameId:11,expectedIdentity:{date:outlyingDate,homeAbbr:"BOS",awayAbbr:"NYK"}}),{written:true,invalidated:0});
  const lifecycleOnlyAfter = await getSeasonGamesStamp("2099-00");
  assert.equal(lifecycleOnlyBefore.split("~")[0],lifecycleOnlyAfter.split("~")[0]);
  assert.equal(lifecycleOnlyBefore.split("~")[1].split("/")[1],lifecycleOnlyAfter.split("~")[1].split("/")[1]);
  assert.notEqual(lifecycleOnlyBefore,lifecycleOnlyAfter);
  const editedFatigue = await a`update fatigue_scores set is_back_to_back=not is_back_to_back where game_id=90 and team_id=1 returning id`;
  assert.equal(editedFatigue.length,1);
  assert.notEqual(await getSeasonGamesStamp("2099-00"),lifecycleOnlyAfter);
  const beforeTip = await getSeasonGamesStamp("2099-00");
  await a`update games set tip_off_utc=tip_off_utc+interval '1 minute' where id=11`;
  assert.notEqual(await getSeasonGamesStamp("2099-00"),beforeTip);
  pass("lifecycle-only holds, content-only fatigue edits and tip-only changes all move the season stamp");

  const [tipClock] = await a`select (((clock_timestamp() at time zone 'America/New_York')::date + 2 + time '12:00') at time zone 'America/New_York') as old_tip`;
  const oldTip = new Date(String(tipClock.old_tip));
  const newTip = new Date(oldTip.getTime() + 3_600_000);
  const tipDate = formatEasternDateKey(oldTip);
  await a`insert into games(id,external_id,date,season,home_team_id,away_team_id,status,tip_off_utc) values
    (199,'tip-prior',${tipDate}::date-1,'2097-98',1,2,'scheduled',${oldTip}::timestamptz-interval '1 day'),
    (200,'espn-tip-source',${tipDate},'2097-98',1,2,'scheduled',${oldTip}),
    (201,'tip-related',${tipDate}::date+1,'2097-98',1,3,'scheduled',${newTip}::timestamptz+interval '1 day'),
    (202,'tip-outside',${tipDate}::date+31,'2097-98',1,3,'scheduled',${newTip}::timestamptz+interval '31 days'),
    (203,'tip-unrelated',${tipDate}::date+1,'2097-98',3,4,'scheduled',${newTip}::timestamptz+interval '1 day'),
    (204,'tip-tipped',${tipDate}::date+1,'2097-98',1,3,'scheduled',clock_timestamp()-interval '1 hour')`;
  await a`insert into fatigue_scores(game_id,team_id,score,decay_load_score,travel_load_score,b2b_multiplier,altitude_multiplier,density_multiplier,freshness_bonus,games_in_last_7_days,travel_distance_miles,is_back_to_back)
    select g.id,s.team,4,0,0,1,1,1,0,2,0,false from games g cross join lateral(values(g.home_team_id),(g.away_team_id))s(team) where g.id between 200 and 204`;
  assert.equal((await createDailyRefreshPort(dbA).refreshGame(200)).status,"refreshed");
  assert.equal((await createDailyRefreshPort(dbA).refreshGame(201)).status,"refreshed");
  assert.equal(Number((await a`select b2b_multiplier from fatigue_scores where game_id=200 and team_id=1`)[0].b2b_multiplier),1.38);
  assert.equal(Number((await a`select b2b_multiplier from fatigue_scores where game_id=201 and team_id=1`)[0].b2b_multiplier),1.36);
  await a`insert into predictions(game_id,predicted_advantage_team_id,rest_advantage_differential,actual_winner_id) values
    (200,1,4,null),(201,1,4,null),(200,1,4,1),(202,1,4,null),(203,3,4,null),(204,1,4,null)`;
  const tipUpdate = {expectedIdentity:{date:tipDate,homeAbbr:"BOS",awayAbbr:"BKN"},gameId:200,status:"scheduled" as const,
    homeScore:null,awayScore:null,overtimePeriods:null,
    scheduledTip:{expectedExternalId:"espn-tip-source",expectedTipOffUtc:oldTip.toISOString(),tipOffUtc:newTip.toISOString()}};
  assert.deepEqual(await writeGameStatus(dbA,tipUpdate),{written:true,invalidated:2});
  assert.equal(new Date(String((await a`select tip_off_utc from games where id=200`)[0].tip_off_utc)).toISOString(),newTip.toISOString());
  assert.equal((await a`select count(*)::int n from fatigue_scores where game_id in(200,201)`)[0].n,0);
  assert.equal((await a`select count(*)::int n from fatigue_scores where game_id in(202,203,204)`)[0].n,6);
  assert.equal((await a`select count(*)::int n from predictions where game_id in(200,201) and actual_winner_id is null`)[0].n,0);
  assert.equal((await a`select count(*)::int n from predictions where game_id=200 and actual_winner_id is not null`)[0].n,1);
  assert.equal((await a`select count(*)::int n from predictions where game_id in(202,203,204)`)[0].n,3);
  assert.equal((await writeGameStatus(dbA,tipUpdate)).written,false,"replaying an old tip comparison must be a no-op");
  assert.equal((await createDailyRefreshPort(dbA).refreshGame(200)).status,"refreshed");
  assert.equal((await createDailyRefreshPort(dbA).refreshGame(201)).status,"refreshed");
  assert.equal((await a`select count(*)::int n from fatigue_scores where game_id in(200,201)`)[0].n,4);
  assert.equal(Number((await a`select b2b_multiplier from fatigue_scores where game_id=200 and team_id=1`)[0].b2b_multiplier),1.36,"source turnaround becomes 25 hours");
  assert.equal(Number((await a`select b2b_multiplier from fatigue_scores where game_id=201 and team_id=1`)[0].b2b_multiplier),1.38,"downstream turnaround becomes 24 hours");
  pass("same-date tip correction atomically invalidates source and related future pairs/open predictions, preserves boundaries/resolved results, and locked recovery restores pairs");

  await a`update games set tip_off_utc=${oldTip} where id=200`;
  for (const status of ["live","postponed","cancelled","final"]) {
    await a`update games set status=${status} where id=200`;
    assert.equal((await writeGameStatus(dbA,tipUpdate)).written,false);
  }
  await a`update games set status='scheduled' where id=200`;
  assert.equal((await writeGameStatus(dbA,{...tipUpdate,scheduledTip:{...tipUpdate.scheduledTip,expectedExternalId:"espn-other"}})).written,false);
  await assert.rejects(writeGameStatus(dbA,{...tipUpdate,scheduledTip:{...tipUpdate.scheduledTip,tipOffUtc:new Date(newTip.getTime()+86_400_000).toISOString()}}),/same Eastern/);
  const [tipPairBefore] = await a`select count(*)::int n from fatigue_scores where game_id=200`;
  assert.equal(tipPairBefore.n,2);
  await a.unsafe(`create function refuse_tip_test() returns trigger language plpgsql as $$begin raise exception 'injected tip invalidation failure';end$$`);
  await a.unsafe(`create trigger refuse_tip before delete on fatigue_scores for each statement execute function refuse_tip_test()`);
  await assert.rejects(writeGameStatus(dbA,tipUpdate), error => error instanceof Error && String(error.cause).includes("injected tip invalidation failure"));
  assert.equal(new Date(String((await a`select tip_off_utc from games where id=200`)[0].tip_off_utc)).toISOString(),oldTip.toISOString());
  assert.equal((await a`select count(*)::int n from fatigue_scores where game_id=200`)[0].n,2);
  await a`drop trigger refuse_tip on fatigue_scores`;
  pass("tip writer refuses non-scheduled states/event or date drift and rolls tip back on invalidation failure");

  const now = new Date();
  const todayEt = formatEasternDateKey(now);
  const [dayBounds] = await a`select ((${todayEt}::date + time '00:00') at time zone 'America/New_York')::text as start,
    ((${todayEt}::date + time '23:59:59.999') at time zone 'America/New_York')::text as finish`;
  const sameDayPast = new Date(String(dayBounds.start));
  const sameDayFuture = new Date(String(dayBounds.finish));
  const future = sameDayFuture.toISOString();
  const past = sameDayPast.toISOString();
  if (sameDayPast < now && sameDayFuture > now) {
    await a`update games set date=${todayEt},tip_off_utc=${past}::timestamptz where id=200`;
    const todayUpdate = {...tipUpdate,expectedIdentity:{...tipUpdate.expectedIdentity,date:todayEt},
      scheduledTip:{...tipUpdate.scheduledTip,expectedTipOffUtc:past,tipOffUtc:future}};
    assert.equal((await writeGameStatus(dbA,todayUpdate)).written,false,"a stored tip that has passed cannot move automatically");
    await a`update games set tip_off_utc=${future}::timestamptz where id=200`;
    assert.equal((await writeGameStatus(dbA,{...todayUpdate,scheduledTip:{...todayUpdate.scheduledTip,expectedTipOffUtc:future,tipOffUtc:past}})).written,false,"a provider tip in the past cannot be adopted");
    const nearTip = new Date(Date.now()+700).toISOString();
    await a`update games set tip_off_utc=${nearTip}::timestamptz where id=200`;
    await a.unsafe(`create function delay_tip_test() returns trigger language plpgsql as $$begin perform pg_sleep(0.9);return null;end$$`);
    await a.unsafe(`create trigger delay_tip before delete on fatigue_scores for each statement execute function delay_tip_test()`);
    await assert.rejects(writeGameStatus(dbA,{...todayUpdate,scheduledTip:{...todayUpdate.scheduledTip,expectedTipOffUtc:nearTip}}),/tip crossed/);
    assert.equal(new Date(String((await a`select tip_off_utc::text as tip from games where id=200`)[0].tip)).toISOString(),nearTip);
    assert.equal((await a`select count(*)::int n from fatigue_scores where game_id=200`)[0].n,2);
    await a`drop trigger delay_tip on fatigue_scores`;
    pass("same-date past-tip guards and old tip crossing during invalidation preserve the original tip and fatigue");
  }
  await a`update games set date=${tipDate},tip_off_utc=${oldTip} where id=200`;
  const raced = await Promise.all([writeGameStatus(dbA,tipUpdate),writeGameStatus(dbB,{...tipUpdate,scheduledTip:undefined,status:"postponed"})]);
  assert.equal((await a`select status from games where id=200`)[0].status,"postponed");
  assert.ok(raced[1].written);
  pass("concurrent tip correction and hold preserve authoritative hold under shared ordered locks");
  console.log(`${passed} PostgreSQL lifecycle contracts passed`);
} finally {
  await queryClient?.end();
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
  await a.end();await b.end();await poolA.end();await poolB.end();
  await admin.unsafe(`drop schema if exists ${name} cascade`);await admin.end();
}

}
main().catch(error => {console.error(error);process.exitCode=1;});
