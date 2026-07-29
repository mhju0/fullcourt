import { format, parseISO, subDays } from "date-fns";
import { and, asc, eq, gte, lt, or } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { alias } from "drizzle-orm/pg-core";
import type * as Schema from "./db/schema";
import { games, teams } from "./db/schema";
import type { RecentGame } from "./fatigue";
import { neutralVenueCoordinates } from "./neutral-venues";
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
  neutralSite?: boolean;
  neutralVenueCity?: string | null;
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
      neutralSite: games.neutralSite,
      neutralVenueCity: games.neutralVenueCity,
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
  // A neutral-site game is an away game for BOTH teams: neither slept at home, and
  // the travel leg has to depart from and arrive at the real venue, not an arena
  // nobody visited. Unknown city → null → today's behaviour (home team's arena).
  const neutral = row.neutralSite
    ? neutralVenueCoordinates(row.neutralVenueCity)
    : null;
  const venue = neutral
    ? { venueLat: neutral.latitude, venueLon: neutral.longitude }
    : {};

  // Which side the subject team is on is a fact about the fixture; whether that counts
  // as "home" is a separate question the neutral flag can override. Keeping them apart
  // is what lets the nominal home team of a Paris game be scored as a road team.
  const isHomeSide = row.homeTeamId === teamId;
  const self = isHomeSide ? home : away;
  const opponent = isHomeSide ? away : home;

  return {
    date,
    teamId,
    opponentTeamId: isHomeSide ? row.awayTeamId : row.homeTeamId,
    isHome: isHomeSide && !neutral,
    teamLat: self.latitude,
    teamLon: self.longitude,
    opponentLat: opponent.latitude,
    opponentLon: opponent.longitude,
    opponentAltitudeFlag: isHomeSide ? row.awayAltitude : row.homeAltitude,
    overtimePeriods: row.overtimePeriods,
    ...venue,
  };
}
