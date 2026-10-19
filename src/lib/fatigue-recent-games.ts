import { WORKLOAD_STATUSES } from "@/lib/game-status";
import { format, parseISO, subDays } from "date-fns";
import { and, asc, eq, gte, inArray, lt, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { alias } from "drizzle-orm/pg-core";
import type * as Schema from "./db/schema";
import { games, teams } from "./db/schema";
import type { RecentGame } from "./fatigue";
import { resolvePhysicalVenue } from "./physical-venue";

type AppDb = NodePgDatabase<typeof Schema>;

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
  tipOffUtc?: Date | null;
  homeScore?: number | null;
  awayScore?: number | null;
  neutralSite?: boolean;
  neutralVenueCity?: string | null;
}

/**
 * What a prior game is allowed to be.
 *
 * `"played"` is the default: a prior game counts only once it is `final`, because its rest,
 * travel and overtime are then facts. It is right for a game that has itself been played, such
 * as a historical backfill, and wrong for one still ahead, where it silently drops every game
 * between the last final and tip-off. The nightly job used it until 2026-10-11.
 *
 * `"scheduled"` additionally accepts games that have not been played, and is how a published
 * schedule is projected forward before its season starts. It is not a looser version of the
 * same question — it answers a different one: *if this schedule is played as published, what
 * does the fatigue look like?* Every input the model takes is schedule-derived (rest days,
 * travel legs, back-to-back, density windows, altitude, time-zone displacement) **except two**,
 * which are results and are therefore neutralised rather than guessed:
 *
 *   overtimePeriods → 0     (no prior-game OT penalty)
 *   pointMargin     → null  (no blowout discount)
 *
 * A projected row is not marked in the database. It does not need to be: a fatigue row belongs
 * to a game, and a game that is not `final` has not been played, so `games.status` already
 * carries the distinction at every read site. Adding a column would create a second source of
 * truth that could disagree with the first.
 */
export type PriorGameBasis = "played" | "scheduled";

import { FATIGUE_RECENT_LOOKBACK_DAYS } from "./fatigue";

/**
 * Loads a team's prior games in the fatigue lookback window (see `FATIGUE_RECENT_LOOKBACK_DAYS`)
 * before `gameDateStr`, ordered oldest → newest.
 */
export async function fetchRecentGamesForTeam(
  db: AppDb,
  teamId: number,
  gameDateStr: string,
  basis: PriorGameBasis = "played"
): Promise<RecentGame[]> {
  const windowStart = format(
    subDays(parseISO(gameDateStr), FATIGUE_RECENT_LOOKBACK_DAYS),
    "yyyy-MM-dd"
  );
  const homeTeamAlias = alias(teams, "home_team");
  const awayTeamAlias = alias(teams, "away_team");

  const rows: (PriorGameRow & { status: string })[] = await db
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
      tipOffUtc: games.tipOffUtc,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
      neutralSite: games.neutralSite,
      neutralVenueCity: games.neutralVenueCity,
      status: games.status,
    })
    .from(games)
    .innerJoin(homeTeamAlias, eq(games.homeTeamId, homeTeamAlias.id))
    .innerJoin(awayTeamAlias, eq(games.awayTeamId, awayTeamAlias.id))
    .where(
      and(
        or(eq(games.homeTeamId, teamId), eq(games.awayTeamId, teamId)),
        basis === "played"
          ? eq(games.status, "final")
          : inArray(games.status, [...WORKLOAD_STATUSES]),
        gte(games.date, windowStart),
        lt(games.date, gameDateStr)
      )
    )
    .orderBy(asc(games.date));

  return rows.map((row) => rowToRecentGame(neutralizeIfUnplayed(row), teamId));
}

/**
 * Strip the two result-derived inputs from a prior game that has not been played.
 *
 * Done explicitly rather than left to column defaults. An unplayed row happens to carry
 * `overtime_periods = 0` and null scores today, but that is a default, not a promise — and a
 * `live` row can carry a real partial score, which would otherwise feed a blowout discount off
 * a game that is not over. Everything else on the row is schedule-derived and survives intact.
 */
export function neutralizeIfUnplayed<T extends PriorGameRow & { status: string }>(
  row: T
): T {
  if (row.status === "final") return row;
  return { ...row, overtimePeriods: 0, homeScore: null, awayScore: null };
}

export function rowToRecentGame(row: PriorGameRow, teamId: number): RecentGame {
  const date = String(row.date);
  const resolved = resolvePhysicalVenue({
    date,
    homeTeam: { abbreviation: row.homeAbbr, latitude: Number(row.homeLat), longitude: Number(row.homeLon), altitude: row.homeAltitude },
    awayTeam: { abbreviation: row.awayAbbr, latitude: Number(row.awayLat), longitude: Number(row.awayLon), altitude: row.awayAltitude },
    neutralSite: row.neutralSite,
    neutralVenueCity: row.neutralVenueCity,
  });
  const home = resolved.homeBase;
  const away = resolved.awayBase;

  const isHomeSide = row.homeTeamId === teamId;
  const self = isHomeSide ? home : away;
  const opponent = isHomeSide ? away : home;

  return {
    date,
    isHome: isHomeSide && resolved.homeCourt,
    teamLat: self.latitude,
    teamLon: self.longitude,
    opponentLat: opponent.latitude,
    opponentLon: opponent.longitude,
    overtimePeriods: row.overtimePeriods,
    tipOffUtc: row.tipOffUtc ?? null,
    pointMargin:
      row.homeScore != null && row.awayScore != null
        ? Math.abs(row.homeScore - row.awayScore)
        : null,
    venueLat: resolved.venue.latitude,
    venueLon: resolved.venue.longitude,
  };
}
