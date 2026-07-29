import { format, parseISO, subDays } from "date-fns";
import { and, asc, eq, gte, lt, or } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { alias } from "drizzle-orm/pg-core";
import type * as Schema from "./db/schema";
import { games, teams } from "./db/schema";
import type { RecentGame } from "./fatigue";
import { eraCoordinates } from "./team-era-coordinates";

type AppDb = PostgresJsDatabase<typeof Schema>;

export interface PriorGameRow {
  date: string;
  homeTeamId: number;
  awayTeamId: number;
  homeAbbr: string;
  awayAbbr: string;
  homeLat: string;
  homeLon: string;
  homeAltitude: boolean;
  awayLat: string;
  awayLon: string;
  awayAltitude: boolean;
  overtimePeriods: number;
}

import { FATIGUE_RECENT_LOOKBACK_DAYS } from "./fatigue";

/**
 * Loads a team's prior games in the fatigue lookback window (see `FATIGUE_RECENT_LOOKBACK_DAYS`)
 * before `gameDateStr`, ordered oldest → newest.
 */
export async function fetchRecentGamesForTeam(
  db: AppDb,
  teamId: number,
  gameDateStr: string
): Promise<RecentGame[]> {
  const windowStart = format(
    subDays(parseISO(gameDateStr), FATIGUE_RECENT_LOOKBACK_DAYS),
    "yyyy-MM-dd"
  );
  const homeTeamAlias = alias(teams, "home_team");
  const awayTeamAlias = alias(teams, "away_team");

  const rows: PriorGameRow[] = await db
    .select({
      date: games.date,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      homeAbbr: homeTeamAlias.abbreviation,
      awayAbbr: awayTeamAlias.abbreviation,
      homeLat: homeTeamAlias.latitude,
      homeLon: homeTeamAlias.longitude,
      homeAltitude: homeTeamAlias.altitudeFlag,
      awayLat: awayTeamAlias.latitude,
      awayLon: awayTeamAlias.longitude,
      awayAltitude: awayTeamAlias.altitudeFlag,
      overtimePeriods: games.overtimePeriods,
    })
    .from(games)
    .innerJoin(homeTeamAlias, eq(games.homeTeamId, homeTeamAlias.id))
    .innerJoin(awayTeamAlias, eq(games.awayTeamId, awayTeamAlias.id))
    .where(
      and(
        or(eq(games.homeTeamId, teamId), eq(games.awayTeamId, teamId)),
        eq(games.status, "final"),
        gte(games.date, windowStart),
        lt(games.date, gameDateStr)
      )
    )
    .orderBy(asc(games.date));

  return rows.map((row) => rowToRecentGame(row, teamId));
}

export function rowToRecentGame(row: PriorGameRow, teamId: number): RecentGame {
  const date = String(row.date);
  const home = eraCoordinates(
    row.homeAbbr,
    date,
    parseFloat(row.homeLat),
    parseFloat(row.homeLon)
  );
  const away = eraCoordinates(
    row.awayAbbr,
    date,
    parseFloat(row.awayLat),
    parseFloat(row.awayLon)
  );
  const isHome = row.homeTeamId === teamId;
  if (isHome) {
    return {
      date,
      teamId,
      opponentTeamId: row.awayTeamId,
      isHome: true,
      teamLat: home.latitude,
      teamLon: home.longitude,
      opponentLat: away.latitude,
      opponentLon: away.longitude,
      opponentAltitudeFlag: row.awayAltitude,
      overtimePeriods: row.overtimePeriods,
    };
  }
  return {
    date,
    teamId,
    opponentTeamId: row.homeTeamId,
    isHome: false,
    teamLat: away.latitude,
    teamLon: away.longitude,
    opponentLat: home.latitude,
    opponentLon: home.longitude,
    opponentAltitudeFlag: row.homeAltitude,
    overtimePeriods: row.overtimePeriods,
  };
}
