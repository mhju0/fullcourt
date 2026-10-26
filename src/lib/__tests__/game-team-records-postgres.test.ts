import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { Client } from "pg";
import { gameTeamRecordsQuery } from "@/lib/db/game-team-records";

const url = process.env.TEAM_RECORDS_TEST_DATABASE_URL;
const client = url ? new Client({ connectionString: url }) : null;
const dialect = new PgDialect();

beforeAll(async () => {
  if (!client) return;
  await client.connect();
  await client.query("begin read only");
});
afterAll(async () => {
  if (!client) return;
  await client.query("rollback");
  await client.end();
});

describe.skipIf(!url)("basketball records, real PostgreSQL read-only CTE", () => {
  it("uses entering-game chronology and known results, with season and competition boundaries", async () => {
    const fixture = sql`with games(id, season, date, tip_off_utc, home_team_id, away_team_id, game_type, status, home_score, away_score) as (values
      (1, '2019-20', '2020-07-30'::date, '2020-07-30T18:00:00Z'::timestamptz, 1, 2, 'regular', 'final', 100, 90),
      (2, '2019-20', '2020-07-31'::date, '2020-07-31T18:00:00Z'::timestamptz, 1, 2, 'regular', 'final', 90, 100),
      (3, '2019-20', '2020-07-31'::date, '2020-07-31T20:00:00Z'::timestamptz, 1, 2, 'regular', 'final', 90, 100),
      (4, '2019-20', '2020-07-31'::date, '2020-07-31T19:00:00Z'::timestamptz, 1, 2, 'regular', 'final', 100, 90),
      (5, '2019-20', '2020-08-01'::date, null, 1, 2, 'regular', 'final', 100, 90),
      (6, '2019-20', '2020-08-01'::date, null, 1, 2, 'regular', 'scheduled', null, null),
      (7, '2019-20', '2020-08-02'::date, null, 1, 2, 'regular', 'scheduled', null, null),
      (8, '2019-20', '2020-07-29'::date, null, 1, 2, 'cup_final', 'final', 100, 90),
      (9, '2019-20', '2020-07-29'::date, null, 1, 2, 'playoff', 'final', 100, 90),
      (10, '2019-20', '2020-07-29'::date, null, 1, 2, 'preseason', 'final', 100, 90),
      (11, '2019-20', '2020-07-29'::date, null, 1, 2, 'regular', 'final', 100, 100),
      (12, '2019-20', '2020-07-29'::date, null, 1, 2, 'regular', 'final', 100, null),
      (13, '2019-20', '2020-07-29'::date, null, 1, 2, 'regular', 'live', 100, 90),
      (14, '2018-19', '2019-07-29'::date, null, 1, 2, 'regular', 'final', 100, 90),
      (15, '2020-21', '2020-12-22'::date, null, 1, 2, 'regular', 'scheduled', null, null),
      (16, '2019-20', '2020-08-03'::date, null, 1, 2, 'regular', 'final', 100, 90)
    )`;
    const targets = [
      { id: 1, date: "2020-07-30", tipOffUtc: new Date("2020-07-30T18:00:00Z") },
      { id: 3, date: "2020-07-31", tipOffUtc: new Date("2020-07-31T20:00:00Z") },
      { id: 4, date: "2020-07-31", tipOffUtc: new Date("2020-07-31T19:00:00Z") },
      { id: 6, date: "2020-08-01", tipOffUtc: null },
      { id: 7, date: "2020-08-02", tipOffUtc: null },
      { id: 15, date: "2020-12-22", tipOffUtc: null },
    ].map(target => ({ ...target, season: target.id === 15 ? "2020-21" : "2019-20", homeTeamId: 1, awayTeamId: 2 }));
    const query = dialect.sqlToQuery(sql`${fixture} ${gameTeamRecordsQuery(targets, new Date("2020-08-01T18:00:00Z"))}`);
    const result = await client!.query(query.sql, query.params);
    const home = new Map(result.rows.filter(row => row.side === "home").map(row => [row.game_id, { wins: row.wins, losses: row.losses }]));
    expect(home.get(1)).toEqual({ wins: 0, losses: 0 });
    expect(home.get(4)).toEqual({ wins: 1, losses: 1 });
    expect(home.get(3)).toEqual({ wins: 2, losses: 1 });
    expect(home.get(6)).toEqual({ wins: 3, losses: 2 });
    expect(home.get(7)).toEqual({ wins: 3, losses: 2 });
    expect(home.get(15)).toEqual({ wins: 0, losses: 0 });
    for (const row of result.rows.filter(row => row.side === "away")) {
      expect({ wins: row.wins, losses: row.losses }).toEqual({ wins: home.get(row.game_id)!.losses, losses: home.get(row.game_id)!.wins });
    }
    const capturedTarget = { ...targets[1], tipOffUtc: new Date("2020-07-31T18:30:00Z") };
    const capturedQuery = dialect.sqlToQuery(sql`${fixture} ${gameTeamRecordsQuery([capturedTarget], new Date("2020-08-01T18:00:00Z"))}`);
    const captured = await client!.query(capturedQuery.sql, capturedQuery.params);
    expect(captured.rows.find(row => row.side === "home")).toMatchObject({ wins: 1, losses: 1 });
    const delayedTarget = { ...targets[1], tipOffUtc: new Date("2020-07-31T21:00:00Z") };
    const delayedQuery = dialect.sqlToQuery(sql`${fixture} ${gameTeamRecordsQuery([delayedTarget], new Date("2020-08-01T18:00:00Z"))}`);
    const delayed = await client!.query(delayedQuery.sql, delayedQuery.params);
    expect(delayed.rows.find(row => row.side === "home")).toMatchObject({ wins: 2, losses: 1 });
  });
});
