import type postgres from "postgres";
import { planHistoricalSeed, type ExistingSeedRow, type HistoricalSeedRow } from "./seed-season-contract";

export async function seedHistoricalRows(sql: postgres.Sql, rows: readonly HistoricalSeedRow[], options: { dryRun?: boolean; chunkSize?: number } = {}): Promise<number> {
  const chunkSize = options.chunkSize ?? 400;
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1) throw new Error("Invalid seed chunk size");
  planHistoricalSeed(rows, []);
  const ids = [...new Set(rows.map(game => game.externalId))];
  const dates = [...new Set(rows.map(game => game.date))];
  return sql.begin(async tx => {
    await tx`set local lock_timeout = '5s'`;
    await tx`set local statement_timeout = '30s'`;
    // The fixture has no unique constraint, so row locks cannot exclude a concurrent insert.
    await tx`lock table games in share row exclusive mode`;
    const existing = await tx<ExistingSeedRow[]>`
      select external_id as "externalId", date::text as date, season, game_type as "gameType",
        home_team_id as "homeTeamId", away_team_id as "awayTeamId",
        home_score as "homeScore", away_score as "awayScore", status
      from games where external_id in ${tx(ids)} or date in ${tx(dates)}`;
    const inserts = planHistoricalSeed(rows, existing);
    if (options.dryRun) return inserts.length;
    let written = 0;
    for (let i = 0; i < inserts.length; i += chunkSize) {
      const chunk = inserts.slice(i, i + chunkSize);
      const result = await tx`
        insert into games ${tx(chunk.map(game => ({
          external_id: game.externalId, date: game.date, season: game.season,
          game_type: game.gameType, home_team_id: game.homeTeamId, away_team_id: game.awayTeamId,
          home_score: game.homeScore, away_score: game.awayScore, status: "final",
          overtime_periods: game.overtimePeriods, neutral_site: game.neutralSite,
          neutral_venue_city: game.neutralVenueCity, tip_off_utc: game.tipOffUtc,
        })))}`;
      if (result.count !== chunk.length) throw new Error("Seed row count changed; transaction rolled back");
      written += result.count;
    }
    return written;
  }) as Promise<number>;
}
