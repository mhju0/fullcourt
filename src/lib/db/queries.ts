import { format, parseISO, subDays } from "date-fns";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "./index";
import {
  fatigueScores,
  games,
  playoffSeries,
  playoffSeriesPredictions,
  predictions,
  teams,
} from "./schema";
import {
  intersectDateBounds,
  monthCalendarBounds,
  regularSeasonDateBounds,
} from "@/lib/nba-season";
import type {
  FatigueInfo,
  GameDateCount,
  GameDetailResponse,
  GameResponse,
  PlayoffSeriesPredictionMethod,
  PlayoffSeriesWithPredictions,
  PlayoffTeamRef,
  RestAdvantage,
  ShotQualityCell,
  ShotQualityModelValues,
  TeamRecentResultGame,
  UpcomingGameWithRA,
} from "@/types";

const NEUTRAL_THRESHOLD = 0.5;

/** One fatigue row per (game, team), preferring the most recently computed. */
function latestFatigueSubquery(alias: string) {
  return db
    .selectDistinctOn(
      [fatigueScores.gameId, fatigueScores.teamId],
      {
        gameId: fatigueScores.gameId,
        teamId: fatigueScores.teamId,
        score: fatigueScores.score,
        isBackToBack: fatigueScores.isBackToBack,
        gamesInLast7Days: fatigueScores.gamesInLast7Days,
        travelDistanceMiles: fatigueScores.travelDistanceMiles,
        altitudeMultiplier: fatigueScores.altitudeMultiplier,
        daysSinceLastGame: fatigueScores.daysSinceLastGame,
        isOvertimePenalty: fatigueScores.isOvertimePenalty,
        roadTripConsecutiveAway: fatigueScores.roadTripConsecutiveAway,
        hasCoastToCoastRoadSwing: fatigueScores.hasCoastToCoastRoadSwing,
      }
    )
    .from(fatigueScores)
    .orderBy(fatigueScores.gameId, fatigueScores.teamId, desc(fatigueScores.computedAt))
    .as(alias);
}

/**
 * NBA regular-season calendar window (Oct 1 → Apr 30) for the season label on each row.
 * Excludes May/June playoff dates that may be mis-tagged as regular in source data.
 */
const gameDateWithinRegularSeasonCalendar = sql`
  ${games.date} >= to_date(left(${games.season}, 4) || '-10-01', 'YYYY-MM-DD')
  AND ${games.date} <= to_date((left(${games.season}, 4)::integer + 1)::text || '-04-30', 'YYYY-MM-DD')
`;

async function getTeamGameCountsInDaysBefore(
  gameDateYmd: string,
  teamIds: number[],
  days: number
): Promise<Map<number, number>> {
  const unique = [...new Set(teamIds)];
  const out = new Map(unique.map((id) => [id, 0]));
  if (unique.length === 0) return out;

  const tip = parseISO(gameDateYmd);
  const start = format(subDays(tip, days), "yyyy-MM-dd");

  const rows = await db
    .select({
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
    })
    .from(games)
    .where(
      and(
        or(inArray(games.homeTeamId, unique), inArray(games.awayTeamId, unique)),
        eq(games.status, "final"),
        gte(games.date, start),
        lt(games.date, gameDateYmd)
      )
    );

  for (const row of rows) {
    if (out.has(row.homeTeamId)) {
      out.set(row.homeTeamId, (out.get(row.homeTeamId) ?? 0) + 1);
    }
    if (out.has(row.awayTeamId)) {
      out.set(row.awayTeamId, (out.get(row.awayTeamId) ?? 0) + 1);
    }
  }

  return out;
}

/** True when the team plays its 4th+ game in a rolling 6-day window ending on `gameDate`. */
async function computeIs4In6Map(
  gameDate: string,
  teamIds: number[]
): Promise<Map<number, boolean>> {
  const unique = [...new Set(teamIds)];
  const counts = new Map(unique.map((id) => [id, 0]));
  if (unique.length === 0) return new Map();

  const start = format(subDays(parseISO(gameDate), 5), "yyyy-MM-dd");
  const rows = await db
    .select({
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
    })
    .from(games)
    .where(
      and(
        or(inArray(games.homeTeamId, unique), inArray(games.awayTeamId, unique)),
        gte(games.date, start),
        lte(games.date, gameDate),
        or(
          eq(games.date, gameDate),
          and(lt(games.date, gameDate), eq(games.status, "final"))
        )
      )
    );

  for (const row of rows) {
    if (counts.has(row.homeTeamId)) {
      counts.set(row.homeTeamId, (counts.get(row.homeTeamId) ?? 0) + 1);
    }
    if (counts.has(row.awayTeamId)) {
      counts.set(row.awayTeamId, (counts.get(row.awayTeamId) ?? 0) + 1);
    }
  }

  return new Map(unique.map((id) => [id, (counts.get(id) ?? 0) >= 4]));
}

/**
 * Returns all games scheduled for a given date (YYYY-MM-DD), with full team
 * info and pre-computed fatigue scores for both sides.
 */
export async function getGamesByDate(date: string): Promise<GameResponse[]> {
  const homeTeam = alias(teams, "home_team");
  const awayTeam = alias(teams, "away_team");
  // Correlated LATERAL replacement for latestFatigueSubquery: one index seek per
  // game/side instead of deduplicating the whole fatigue_scores table. Must stay
  // result-identical to DISTINCT ON (game_id, team_id) ... ORDER BY computed_at DESC:
  // same 11 columns, LEFT join (fatigue-less game → null side), and computed_at DESC
  // as the only tie-break — do not add a secondary sort key.
  const latestFatigueLateral = (
    teamIdColumn: typeof games.homeTeamId | typeof games.awayTeamId,
    subqueryAlias: string
  ) =>
    db
      .select({
        gameId: fatigueScores.gameId,
        teamId: fatigueScores.teamId,
        score: fatigueScores.score,
        isBackToBack: fatigueScores.isBackToBack,
        gamesInLast7Days: fatigueScores.gamesInLast7Days,
        travelDistanceMiles: fatigueScores.travelDistanceMiles,
        altitudeMultiplier: fatigueScores.altitudeMultiplier,
        daysSinceLastGame: fatigueScores.daysSinceLastGame,
        isOvertimePenalty: fatigueScores.isOvertimePenalty,
        roadTripConsecutiveAway: fatigueScores.roadTripConsecutiveAway,
        hasCoastToCoastRoadSwing: fatigueScores.hasCoastToCoastRoadSwing,
      })
      .from(fatigueScores)
      .where(
        and(eq(fatigueScores.gameId, games.id), eq(fatigueScores.teamId, teamIdColumn))
      )
      .orderBy(desc(fatigueScores.computedAt))
      .limit(1)
      .as(subqueryAlias);
  const homeFatigue = latestFatigueLateral(games.homeTeamId, "home_fatigue_latest");
  const awayFatigue = latestFatigueLateral(games.awayTeamId, "away_fatigue_latest");

  const rows = await db
    .select({
      // Game
      id: games.id,
      externalId: games.externalId,
      date: games.date,
      season: games.season,
      status: games.status,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      // Home team
      homeTeamName: homeTeam.name,
      homeTeamAbbreviation: homeTeam.abbreviation,
      homeTeamCity: homeTeam.city,
      homeTeamAltitude: homeTeam.altitudeFlag,
      // Away team
      awayTeamName: awayTeam.name,
      awayTeamAbbreviation: awayTeam.abbreviation,
      awayTeamCity: awayTeam.city,
      // Home fatigue
      homeFatigueScore: homeFatigue.score,
      homeIsBackToBack: homeFatigue.isBackToBack,
      homeGamesInLast7Days: homeFatigue.gamesInLast7Days,
      homeTravelDistanceMiles: homeFatigue.travelDistanceMiles,
      homeAltitudeMultiplier: homeFatigue.altitudeMultiplier,
      homeDaysSinceLastGame: homeFatigue.daysSinceLastGame,
      homeIsOvertimePenalty: homeFatigue.isOvertimePenalty,
      homeRoadTripConsecutiveAway: homeFatigue.roadTripConsecutiveAway,
      homeHasCoastToCoastRoadSwing: homeFatigue.hasCoastToCoastRoadSwing,
      // Away fatigue
      awayFatigueScore: awayFatigue.score,
      awayIsBackToBack: awayFatigue.isBackToBack,
      awayGamesInLast7Days: awayFatigue.gamesInLast7Days,
      awayTravelDistanceMiles: awayFatigue.travelDistanceMiles,
      awayAltitudeMultiplier: awayFatigue.altitudeMultiplier,
      awayDaysSinceLastGame: awayFatigue.daysSinceLastGame,
      awayIsOvertimePenalty: awayFatigue.isOvertimePenalty,
      awayRoadTripConsecutiveAway: awayFatigue.roadTripConsecutiveAway,
      awayHasCoastToCoastRoadSwing: awayFatigue.hasCoastToCoastRoadSwing,
    })
    .from(games)
    .innerJoin(homeTeam, eq(games.homeTeamId, homeTeam.id))
    .innerJoin(awayTeam, eq(games.awayTeamId, awayTeam.id))
    .leftJoinLateral(homeFatigue, sql`true`)
    .leftJoinLateral(awayFatigue, sql`true`)
    .where(and(eq(games.date, date), eq(games.gameType, "regular")))
    // The pre-LATERAL query had no ORDER BY, but its plan happened to emit rows in
    // away-team-id order and the home page renders cards in array order. Pin that
    // order so the rewrite is response-identical. A team plays at most one game per
    // date, so away_team_id is a unique sort key here.
    .orderBy(asc(games.awayTeamId));

  const teamIds = rows.flatMap((r) => [r.homeTeamId, r.awayTeamId]);
  const [is4In6Map, games30Map] = await Promise.all([
    computeIs4In6Map(date, teamIds),
    getTeamGameCountsInDaysBefore(date, teamIds, 30),
  ]);

  return rows.map((row) =>
    mapJoinedRowToGameResponse(row, is4In6Map, games30Map)
  );
}

/** Shared row shape from getGamesByDate / getGameById joins. */
type GameFatigueJoinRow = {
  id: number;
  externalId: string;
  date: string;
  season: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  homeTeamAbbreviation: string;
  homeTeamCity: string;
  homeTeamAltitude: boolean;
  awayTeamName: string;
  awayTeamAbbreviation: string;
  awayTeamCity: string;
  homeFatigueScore: string | null;
  homeIsBackToBack: boolean | null;
  homeGamesInLast7Days: number | null;
  homeTravelDistanceMiles: string | null;
  homeAltitudeMultiplier: string | null;
  homeDaysSinceLastGame: number | null;
  homeIsOvertimePenalty: boolean | null;
  homeRoadTripConsecutiveAway: number | null;
  homeHasCoastToCoastRoadSwing: boolean | null;
  awayFatigueScore: string | null;
  awayIsBackToBack: boolean | null;
  awayGamesInLast7Days: number | null;
  awayTravelDistanceMiles: string | null;
  awayAltitudeMultiplier: string | null;
  awayDaysSinceLastGame: number | null;
  awayIsOvertimePenalty: boolean | null;
  awayRoadTripConsecutiveAway: number | null;
  awayHasCoastToCoastRoadSwing: boolean | null;
};

function mapJoinedRowToGameResponse(
  row: GameFatigueJoinRow,
  is4In6Map: Map<number, boolean>,
  games30Map: Map<number, number>
): GameResponse {
  const homeFatigueData = buildFatigueInfo(
    row.homeFatigueScore,
    row.homeIsBackToBack,
    row.homeGamesInLast7Days,
    row.homeDaysSinceLastGame,
    row.homeTravelDistanceMiles,
    row.homeAltitudeMultiplier,
    row.homeIsOvertimePenalty,
    {
      gamesInLast30Days: games30Map.get(row.homeTeamId) ?? 0,
      is4In6: is4In6Map.get(row.homeTeamId) ?? false,
      roadTripConsecutiveAway: row.homeRoadTripConsecutiveAway ?? 0,
      hasCoastToCoastRoadSwing: row.homeHasCoastToCoastRoadSwing ?? false,
    },
    {
      side: "home",
      homeTeamCity: row.homeTeamCity,
      homeAltitudeFlag: row.homeTeamAltitude,
    }
  );

  const awayFatigueData = buildFatigueInfo(
    row.awayFatigueScore,
    row.awayIsBackToBack,
    row.awayGamesInLast7Days,
    row.awayDaysSinceLastGame,
    row.awayTravelDistanceMiles,
    row.awayAltitudeMultiplier,
    row.awayIsOvertimePenalty,
    {
      gamesInLast30Days: games30Map.get(row.awayTeamId) ?? 0,
      is4In6: is4In6Map.get(row.awayTeamId) ?? false,
      roadTripConsecutiveAway: row.awayRoadTripConsecutiveAway ?? 0,
      hasCoastToCoastRoadSwing: row.awayHasCoastToCoastRoadSwing ?? false,
    },
    {
      side: "away",
      homeTeamCity: row.homeTeamCity,
      homeAltitudeFlag: row.homeTeamAltitude,
    }
  );

  const restAdvantage = buildRestAdvantage(homeFatigueData, awayFatigueData);

  return {
    id: row.id,
    externalId: row.externalId,
    date: String(row.date),
    season: row.season,
    status: row.status,
    homeTeam: {
      id: row.homeTeamId,
      name: row.homeTeamName,
      abbreviation: row.homeTeamAbbreviation,
      city: row.homeTeamCity,
    },
    awayTeam: {
      id: row.awayTeamId,
      name: row.awayTeamName,
      abbreviation: row.awayTeamAbbreviation,
      city: row.awayTeamCity,
    },
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    homeFatigue: homeFatigueData,
    awayFatigue: awayFatigueData,
    restAdvantage,
  };
}

/**
 * Single regular-season game by primary key (for detail modal / deep links).
 */
export async function getGameById(id: number): Promise<GameResponse | null> {
  const homeTeam = alias(teams, "home_team");
  const awayTeam = alias(teams, "away_team");
  const homeFatigue = latestFatigueSubquery("home_fatigue_latest");
  const awayFatigue = latestFatigueSubquery("away_fatigue_latest");

  const rows = await db
    .select({
      id: games.id,
      externalId: games.externalId,
      date: games.date,
      season: games.season,
      status: games.status,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      homeTeamName: homeTeam.name,
      homeTeamAbbreviation: homeTeam.abbreviation,
      homeTeamCity: homeTeam.city,
      homeTeamAltitude: homeTeam.altitudeFlag,
      awayTeamName: awayTeam.name,
      awayTeamAbbreviation: awayTeam.abbreviation,
      awayTeamCity: awayTeam.city,
      homeFatigueScore: homeFatigue.score,
      homeIsBackToBack: homeFatigue.isBackToBack,
      homeGamesInLast7Days: homeFatigue.gamesInLast7Days,
      homeTravelDistanceMiles: homeFatigue.travelDistanceMiles,
      homeAltitudeMultiplier: homeFatigue.altitudeMultiplier,
      homeDaysSinceLastGame: homeFatigue.daysSinceLastGame,
      homeIsOvertimePenalty: homeFatigue.isOvertimePenalty,
      homeRoadTripConsecutiveAway: homeFatigue.roadTripConsecutiveAway,
      homeHasCoastToCoastRoadSwing: homeFatigue.hasCoastToCoastRoadSwing,
      awayFatigueScore: awayFatigue.score,
      awayIsBackToBack: awayFatigue.isBackToBack,
      awayGamesInLast7Days: awayFatigue.gamesInLast7Days,
      awayTravelDistanceMiles: awayFatigue.travelDistanceMiles,
      awayAltitudeMultiplier: awayFatigue.altitudeMultiplier,
      awayDaysSinceLastGame: awayFatigue.daysSinceLastGame,
      awayIsOvertimePenalty: awayFatigue.isOvertimePenalty,
      awayRoadTripConsecutiveAway: awayFatigue.roadTripConsecutiveAway,
      awayHasCoastToCoastRoadSwing: awayFatigue.hasCoastToCoastRoadSwing,
    })
    .from(games)
    .innerJoin(homeTeam, eq(games.homeTeamId, homeTeam.id))
    .innerJoin(awayTeam, eq(games.awayTeamId, awayTeam.id))
    .leftJoin(
      homeFatigue,
      and(eq(homeFatigue.gameId, games.id), eq(homeFatigue.teamId, games.homeTeamId))
    )
    .leftJoin(
      awayFatigue,
      and(eq(awayFatigue.gameId, games.id), eq(awayFatigue.teamId, games.awayTeamId))
    )
    .where(and(eq(games.id, id), eq(games.gameType, "regular")))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const dateStr = String(row.date);
  const teamIds = [row.homeTeamId, row.awayTeamId];
  const [is4In6Map, games30Map] = await Promise.all([
    computeIs4In6Map(dateStr, teamIds),
    getTeamGameCountsInDaysBefore(dateStr, teamIds, 30),
  ]);

  return mapJoinedRowToGameResponse(row, is4In6Map, games30Map);
}

/**
 * Last 5 final games for `teamId` before `beforeDateYmd` (exclusive), most recent first.
 */
export async function getTeamRecentFinalResults(
  teamId: number,
  beforeDateYmd: string
): Promise<TeamRecentResultGame[]> {
  const homeT = alias(teams, "rh");
  const awayT = alias(teams, "ra");

  const rows = await db
    .select({
      gameId: games.id,
      date: games.date,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      homeAbbr: homeT.abbreviation,
      awayAbbr: awayT.abbreviation,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
    })
    .from(games)
    .innerJoin(homeT, eq(games.homeTeamId, homeT.id))
    .innerJoin(awayT, eq(games.awayTeamId, awayT.id))
    .where(
      and(
        eq(games.gameType, "regular"),
        eq(games.status, "final"),
        isNotNull(games.homeScore),
        isNotNull(games.awayScore),
        lt(games.date, beforeDateYmd),
        or(eq(games.homeTeamId, teamId), eq(games.awayTeamId, teamId))
      )
    )
    .orderBy(desc(games.date))
    .limit(5);

  return rows.map((r) => {
    const isHome = r.homeTeamId === teamId;
    const hs = r.homeScore as number;
    const as = r.awayScore as number;
    const teamScore = isHome ? hs : as;
    const opponentScore = isHome ? as : hs;
    const opponentAbbreviation = isHome ? r.awayAbbr : r.homeAbbr;
    const won = teamScore > opponentScore;
    return {
      gameId: r.gameId,
      date: String(r.date),
      opponentAbbreviation,
      isHome,
      teamScore,
      opponentScore,
      won,
    };
  });
}

export async function getGameDetailById(id: number): Promise<GameDetailResponse | null> {
  const game = await getGameById(id);
  if (!game) return null;

  const [homeRecentWeek, awayRecentWeek] = await Promise.all([
    getTeamRecentFinalResults(game.homeTeam.id, game.date),
    getTeamRecentFinalResults(game.awayTeam.id, game.date),
  ]);

  return { game, homeRecentWeek, awayRecentWeek };
}

/**
 * Returns each calendar date in the season (optionally filtered to one month)
 * with a count of regular-season games on that date.
 */
export async function getRegularSeasonGameDatesWithCounts(
  season: string,
  month?: number
): Promise<GameDateCount[]> {
  const seasonBounds = regularSeasonDateBounds(season);
  const window =
    month === undefined
      ? seasonBounds
      : intersectDateBounds(seasonBounds, monthCalendarBounds(season, month));
  if (!window) {
    return [];
  }

  const rows = await db
    .select({
      date: games.date,
      gameCount: sql<number>`cast(count(*) as integer)`,
    })
    .from(games)
    .where(
      and(
        eq(games.season, season),
        eq(games.gameType, "regular"),
        gte(games.date, window.from),
        lte(games.date, window.to)
      )
    )
    .groupBy(games.date)
    .orderBy(asc(games.date));

  return rows.map((r) => ({
    date: String(r.date),
    gameCount: Number(r.gameCount),
  }));
}

// ─── Analysis query ─────────────────────────────────────────────

type CompletedGameRow = {
  date: string;
  season: string;
  homeScore: number | null;
  awayScore: number | null;
  homeFatigueScore: string;
  awayFatigueScore: string;
};

/**
 * Returns all final games that have fatigue scores computed for both teams.
 * Only the fields needed for analysis are selected to keep the payload lean.
 */
export async function getCompletedGamesWithFatigue(): Promise<CompletedGameRow[]> {
  const homeFatigue = latestFatigueSubquery("home_fatigue_latest");
  const awayFatigue = latestFatigueSubquery("away_fatigue_latest");

  return db
    .select({
      date: games.date,
      season: games.season,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
      homeFatigueScore: homeFatigue.score,
      awayFatigueScore: awayFatigue.score,
    })
    .from(games)
    .innerJoin(
      homeFatigue,
      and(eq(homeFatigue.gameId, games.id), eq(homeFatigue.teamId, games.homeTeamId))
    )
    .innerJoin(
      awayFatigue,
      and(eq(awayFatigue.gameId, games.id), eq(awayFatigue.teamId, games.awayTeamId))
    )
    .where(
      and(
        eq(games.status, "final"),
        eq(games.gameType, "regular"),
        isNotNull(games.homeScore),
        isNotNull(games.awayScore),
        gameDateWithinRegularSeasonCalendar
      )
    );
}

// ─── Game search query ────────────────────────────────────────────

type SearchFilters = {
  minRA?: number;
  team?: string;   // team abbreviation — either home or away
  season?: string; // "YYYY-YY"
};

type SearchRow = {
  id: number;
  date: string;
  season: string;
  homeTeamAbbr: string;
  awayTeamAbbr: string;
  homeScore: number | null;
  awayScore: number | null;
  homeFatigueScore: string;
  awayFatigueScore: string;
};

/**
 * Returns final regular-season games matching the given filters, newest first.
 * Result filtering (correct/incorrect) and pagination are done by the caller
 * after computing restedTeamWon in JavaScript.
 */
export async function searchRegularSeasonGames(filters: SearchFilters): Promise<SearchRow[]> {
  const homeTeam = alias(teams, "home_team");
  const awayTeam = alias(teams, "away_team");
  const homeFatigue = latestFatigueSubquery("home_fatigue_latest");
  const awayFatigue = latestFatigueSubquery("away_fatigue_latest");

  // Build conditions array — always filter to regular season final games
  const conditions = [
    eq(games.status, "final"),
    eq(games.gameType, "regular"),
    isNotNull(games.homeScore),
    isNotNull(games.awayScore),
    gameDateWithinRegularSeasonCalendar,
  ];

  if (filters.season) {
    conditions.push(eq(games.season, filters.season));
  }

  if (filters.team) {
    // TypeScript requires a non-nullable assertion; `or` can return undefined when given no args
    const teamCond = or(
      eq(homeTeam.abbreviation, filters.team),
      eq(awayTeam.abbreviation, filters.team)
    );
    if (teamCond) conditions.push(teamCond);
  }

  if (filters.minRA && filters.minRA > 0) {
    conditions.push(
      sql`abs(cast(${awayFatigue.score} as numeric) - cast(${homeFatigue.score} as numeric)) >= ${filters.minRA}`
    );
  }

  return db
    .select({
      id: games.id,
      date: games.date,
      season: games.season,
      homeTeamAbbr: homeTeam.abbreviation,
      awayTeamAbbr: awayTeam.abbreviation,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
      homeFatigueScore: homeFatigue.score,
      awayFatigueScore: awayFatigue.score,
    })
    .from(games)
    .innerJoin(homeTeam, eq(games.homeTeamId, homeTeam.id))
    .innerJoin(awayTeam, eq(games.awayTeamId, awayTeam.id))
    .innerJoin(
      homeFatigue,
      and(eq(homeFatigue.gameId, games.id), eq(homeFatigue.teamId, games.homeTeamId))
    )
    .innerJoin(
      awayFatigue,
      and(eq(awayFatigue.gameId, games.id), eq(awayFatigue.teamId, games.awayTeamId))
    )
    .where(and(...conditions))
    .orderBy(desc(games.date));
}

// ─── Private helpers ─────────────────────────────────────────────

type FatigueInfoContext = {
  side: "home" | "away";
  homeTeamCity: string;
  homeAltitudeFlag: boolean;
};

type FatigueScheduleExtras = {
  gamesInLast30Days: number;
  is4In6: boolean;
  roadTripConsecutiveAway: number;
  hasCoastToCoastRoadSwing: boolean;
};

/** Builds a FatigueInfo object from raw DB columns, or returns null if no fatigue data exists. */
function buildFatigueInfo(
  score: string | null,
  isBackToBack: boolean | null,
  gamesInLast7Days: number | null,
  daysSinceLastGame: number | null,
  travelDistanceMiles: string | null,
  altitudeMultiplier: string | null,
  isOvertimePenalty: boolean | null,
  extras: FatigueScheduleExtras,
  ctx: FatigueInfoContext
): FatigueInfo | null {
  if (score === null) return null;

  const g7 = gamesInLast7Days ?? 0;
  const dRest = daysSinceLastGame;
  const is3In4Approx =
    g7 >= 3 && dRest !== null && dRest <= 2;

  const altitudePenalty = parseFloat(altitudeMultiplier ?? "1") > 1.0;
  const altitudeArenaLabel =
    ctx.side === "away" && altitudePenalty && ctx.homeAltitudeFlag
      ? `${ctx.homeTeamCity} (altitude)`
      : null;

  return {
    score: parseFloat(score),
    isBackToBack: isBackToBack ?? false,
    is3In4: is3In4Approx,
    travelDistanceMiles: parseFloat(travelDistanceMiles ?? "0"),
    altitudePenalty,
    altitudeArenaLabel,
    daysRest: daysSinceLastGame,
    gamesInLast7Days: g7,
    gamesInLast30Days: extras.gamesInLast30Days,
    is4In6: extras.is4In6,
    isOvertimePenalty: isOvertimePenalty ?? false,
    // Road-trip streak is only shown for the visiting team (type contract).
    roadTripConsecutiveAway:
      ctx.side === "home" ? 0 : extras.roadTripConsecutiveAway,
    hasCoastToCoastRoadSwing: extras.hasCoastToCoastRoadSwing,
  };
}

/** Calculates rest advantage from the two teams' fatigue data. */
function buildRestAdvantage(
  home: FatigueInfo | null,
  away: FatigueInfo | null
): RestAdvantage | null {
  if (home === null || away === null) return null;

  const differential = away.score - home.score;
  let advantageTeam: RestAdvantage["advantageTeam"];

  if (differential > NEUTRAL_THRESHOLD) {
    advantageTeam = "home";
  } else if (differential < -NEUTRAL_THRESHOLD) {
    advantageTeam = "away";
  } else {
    advantageTeam = "neutral";
  }

  return { differential, advantageTeam };
}

// ─── Upcoming games with rest advantage ─────────────────────────

/**
 * Scheduled regular-season games for the given season with open predictions,
 * optionally filtered to |RA differential| >= minRA. Returns upcoming games only
 * (on or after today's date), sorted by date ascending.
 */
export async function getUpcomingGamesWithRA(
  season: string,
  minRA: number
): Promise<UpcomingGameWithRA[]> {
  const homeTeam = alias(teams, "ht");
  const awayTeam = alias(teams, "at");
  const predictedTeam = alias(teams, "pt");
  const homeFatigue = latestFatigueSubquery("home_fatigue_upcoming_h");
  const awayFatigue = latestFatigueSubquery("home_fatigue_upcoming_a");

  const latestOpen = db
    .selectDistinctOn([predictions.gameId], {
      gameId: predictions.gameId,
      predictedAdvantageTeamId: predictions.predictedAdvantageTeamId,
      differential: predictions.restAdvantageDifferential,
    })
    .from(predictions)
    .where(isNull(predictions.actualWinnerId))
    .orderBy(predictions.gameId, desc(predictions.createdAt))
    .as("latest_open_pred_upcoming");

  const todayStr = format(new Date(), "yyyy-MM-dd");

  const conditions = [
    eq(games.season, season),
    eq(games.gameType, "regular"),
    eq(games.status, "scheduled"),
    gte(games.date, todayStr),
    gameDateWithinRegularSeasonCalendar,
  ];

  if (minRA > 0) {
    conditions.push(
      sql`abs(cast(${latestOpen.differential} as numeric)) >= ${minRA}`
    );
  }

  const rows = await db
    .select({
      gameId: games.id,
      date: games.date,
      season: games.season,
      homeTeamId: homeTeam.id,
      homeTeamAbbreviation: homeTeam.abbreviation,
      homeTeamName: homeTeam.name,
      homeTeamCity: homeTeam.city,
      awayTeamId: awayTeam.id,
      awayTeamAbbreviation: awayTeam.abbreviation,
      awayTeamName: awayTeam.name,
      awayTeamCity: awayTeam.city,
      predictedTeamAbbreviation: predictedTeam.abbreviation,
      differential: latestOpen.differential,
      homeFatigueScore: homeFatigue.score,
      awayFatigueScore: awayFatigue.score,
    })
    .from(latestOpen)
    .innerJoin(games, eq(games.id, latestOpen.gameId))
    .innerJoin(homeTeam, eq(games.homeTeamId, homeTeam.id))
    .innerJoin(awayTeam, eq(games.awayTeamId, awayTeam.id))
    .innerJoin(predictedTeam, eq(latestOpen.predictedAdvantageTeamId, predictedTeam.id))
    .leftJoin(
      homeFatigue,
      and(eq(homeFatigue.gameId, games.id), eq(homeFatigue.teamId, games.homeTeamId))
    )
    .leftJoin(
      awayFatigue,
      and(eq(awayFatigue.gameId, games.id), eq(awayFatigue.teamId, games.awayTeamId))
    )
    .where(and(...conditions))
    .orderBy(asc(games.date), asc(games.id));

  return rows.map((r) => ({
    gameId: r.gameId,
    date: String(r.date),
    season: r.season,
    homeTeam: {
      id: r.homeTeamId,
      abbreviation: r.homeTeamAbbreviation,
      name: r.homeTeamName,
      city: r.homeTeamCity,
    },
    awayTeam: {
      id: r.awayTeamId,
      abbreviation: r.awayTeamAbbreviation,
      name: r.awayTeamName,
      city: r.awayTeamCity,
    },
    homeFatigueScore: r.homeFatigueScore !== null ? parseFloat(String(r.homeFatigueScore)) : null,
    awayFatigueScore: r.awayFatigueScore !== null ? parseFloat(String(r.awayFatigueScore)) : null,
    restAdvantageDifferential: parseFloat(String(r.differential)),
    predictedAdvantageAbbreviation: r.predictedTeamAbbreviation,
  }));
}

// ─── Playoff Predictor: series + predictions ────────────────────

type PlayoffPredictionMethodKey = "full_insample" | "walk_forward_oos";

/** Latest prediction row per series for a given method (future-proofs against multiple model versions). */
function latestPlayoffPredictionSubquery(subqueryAlias: string, method: PlayoffPredictionMethodKey) {
  return db
    .selectDistinctOn([playoffSeriesPredictions.seriesId], {
      seriesId: playoffSeriesPredictions.seriesId,
      predictedHomeCourtWinProb: playoffSeriesPredictions.predictedHomeCourtWinProb,
      predictedWinnerTeamId: playoffSeriesPredictions.predictedWinnerTeamId,
      modelVersion: playoffSeriesPredictions.modelVersion,
    })
    .from(playoffSeriesPredictions)
    .where(eq(playoffSeriesPredictions.predictionMethod, method))
    .orderBy(playoffSeriesPredictions.seriesId, desc(playoffSeriesPredictions.createdAt))
    .as(subqueryAlias);
}

type PlayoffSeriesJoinRow = {
  seriesId: number;
  season: string;
  round: number;
  conference: string | null;
  isBestOf7: boolean;
  homeCourtTeamId: number;
  homeCourtTeamAbbr: string;
  homeCourtTeamName: string;
  opponentTeamId: number;
  opponentTeamAbbr: string;
  opponentTeamName: string;
  homeCourtWins: number | null;
  opponentWins: number | null;
  seriesWinnerTeamId: number | null;
  seriesWinnerTeamAbbr: string | null;
  seriesWinnerTeamName: string | null;
  seedDiff: string | null;
  winPctDiff: string | null;
  entryRestDiff: string | null;
  h2hDiff: string | null;
  fullInsampleProb: string | null;
  fullInsampleWinnerTeamId: number | null;
  fullInsampleWinnerAbbr: string | null;
  fullInsampleWinnerName: string | null;
  fullInsampleModelVersion: string | null;
  walkForwardProb: string | null;
  walkForwardWinnerTeamId: number | null;
  walkForwardWinnerAbbr: string | null;
  walkForwardWinnerName: string | null;
  walkForwardModelVersion: string | null;
};

function buildPredictionMethodResult(
  prob: string | null,
  winnerTeamId: number | null,
  winnerAbbr: string | null,
  winnerName: string | null,
  modelVersion: string | null,
  seriesWinnerTeamId: number | null
): PlayoffSeriesPredictionMethod | null {
  if (prob === null || winnerTeamId === null || winnerAbbr === null || winnerName === null || modelVersion === null) {
    return null;
  }

  return {
    predictedHomeCourtWinProb: parseFloat(prob),
    predictedWinnerTeam: { id: winnerTeamId, abbreviation: winnerAbbr, name: winnerName },
    modelVersion,
    predictedWinnerCorrect:
      seriesWinnerTeamId === null ? null : winnerTeamId === seriesWinnerTeamId,
  };
}

function mapRowToPlayoffSeriesWithPredictions(row: PlayoffSeriesJoinRow): PlayoffSeriesWithPredictions {
  const seriesWinnerTeam: PlayoffTeamRef | null =
    row.seriesWinnerTeamId !== null && row.seriesWinnerTeamAbbr !== null && row.seriesWinnerTeamName !== null
      ? { id: row.seriesWinnerTeamId, abbreviation: row.seriesWinnerTeamAbbr, name: row.seriesWinnerTeamName }
      : null;

  return {
    seriesId: row.seriesId,
    season: row.season,
    round: row.round,
    conference: row.conference,
    isBestOf7: row.isBestOf7,
    homeCourtTeam: {
      id: row.homeCourtTeamId,
      abbreviation: row.homeCourtTeamAbbr,
      name: row.homeCourtTeamName,
    },
    opponentTeam: {
      id: row.opponentTeamId,
      abbreviation: row.opponentTeamAbbr,
      name: row.opponentTeamName,
    },
    homeCourtWins: row.homeCourtWins,
    opponentWins: row.opponentWins,
    seriesWinnerTeam,
    seedDiff: row.seedDiff !== null ? parseFloat(row.seedDiff) : null,
    winPctDiff: row.winPctDiff !== null ? parseFloat(row.winPctDiff) : null,
    entryRestDiff: row.entryRestDiff !== null ? parseFloat(row.entryRestDiff) : null,
    h2hDiff: row.h2hDiff !== null ? parseFloat(row.h2hDiff) : null,
    predictions: {
      fullInsample: buildPredictionMethodResult(
        row.fullInsampleProb,
        row.fullInsampleWinnerTeamId,
        row.fullInsampleWinnerAbbr,
        row.fullInsampleWinnerName,
        row.fullInsampleModelVersion,
        row.seriesWinnerTeamId
      ),
      walkForwardOos: buildPredictionMethodResult(
        row.walkForwardProb,
        row.walkForwardWinnerTeamId,
        row.walkForwardWinnerAbbr,
        row.walkForwardWinnerName,
        row.walkForwardModelVersion,
        row.seriesWinnerTeamId
      ),
    },
  };
}

/**
 * Playoff series for a season, joined to both prediction methods (full_insample,
 * walk_forward_oos) and to team rows for home-court, opponent, and (resolved) series
 * winner. Ordered by round then conference for stable bracket rendering.
 */
export async function getPlayoffSeriesWithPredictions(
  season: string
): Promise<PlayoffSeriesWithPredictions[]> {
  const homeCourtTeam = alias(teams, "ps_home_court_team");
  const opponentTeam = alias(teams, "ps_opponent_team");
  const winnerTeam = alias(teams, "ps_winner_team");
  const fullInsamplePredictedTeam = alias(teams, "ps_full_insample_pred_team");
  const walkForwardPredictedTeam = alias(teams, "ps_walk_forward_pred_team");

  const fullInsample = latestPlayoffPredictionSubquery("ps_full_insample_latest", "full_insample");
  const walkForward = latestPlayoffPredictionSubquery("ps_walk_forward_latest", "walk_forward_oos");

  const rows = await db
    .select({
      seriesId: playoffSeries.id,
      season: playoffSeries.season,
      round: playoffSeries.round,
      conference: playoffSeries.conference,
      isBestOf7: playoffSeries.isBestOf7,
      homeCourtTeamId: playoffSeries.homeCourtTeamId,
      homeCourtTeamAbbr: homeCourtTeam.abbreviation,
      homeCourtTeamName: homeCourtTeam.name,
      opponentTeamId: playoffSeries.opponentTeamId,
      opponentTeamAbbr: opponentTeam.abbreviation,
      opponentTeamName: opponentTeam.name,
      homeCourtWins: playoffSeries.homeCourtWins,
      opponentWins: playoffSeries.opponentWins,
      seriesWinnerTeamId: playoffSeries.seriesWinnerTeamId,
      seriesWinnerTeamAbbr: winnerTeam.abbreviation,
      seriesWinnerTeamName: winnerTeam.name,
      seedDiff: playoffSeries.seedDiff,
      winPctDiff: playoffSeries.winPctDiff,
      entryRestDiff: playoffSeries.entryRestDiff,
      h2hDiff: playoffSeries.h2hDiff,
      fullInsampleProb: fullInsample.predictedHomeCourtWinProb,
      fullInsampleWinnerTeamId: fullInsample.predictedWinnerTeamId,
      fullInsampleWinnerAbbr: fullInsamplePredictedTeam.abbreviation,
      fullInsampleWinnerName: fullInsamplePredictedTeam.name,
      fullInsampleModelVersion: fullInsample.modelVersion,
      walkForwardProb: walkForward.predictedHomeCourtWinProb,
      walkForwardWinnerTeamId: walkForward.predictedWinnerTeamId,
      walkForwardWinnerAbbr: walkForwardPredictedTeam.abbreviation,
      walkForwardWinnerName: walkForwardPredictedTeam.name,
      walkForwardModelVersion: walkForward.modelVersion,
    })
    .from(playoffSeries)
    .innerJoin(homeCourtTeam, eq(playoffSeries.homeCourtTeamId, homeCourtTeam.id))
    .innerJoin(opponentTeam, eq(playoffSeries.opponentTeamId, opponentTeam.id))
    .leftJoin(winnerTeam, eq(playoffSeries.seriesWinnerTeamId, winnerTeam.id))
    .leftJoin(fullInsample, eq(fullInsample.seriesId, playoffSeries.id))
    .leftJoin(
      fullInsamplePredictedTeam,
      eq(fullInsample.predictedWinnerTeamId, fullInsamplePredictedTeam.id)
    )
    .leftJoin(walkForward, eq(walkForward.seriesId, playoffSeries.id))
    .leftJoin(
      walkForwardPredictedTeam,
      eq(walkForward.predictedWinnerTeamId, walkForwardPredictedTeam.id)
    )
    .where(eq(playoffSeries.season, season))
    .orderBy(asc(playoffSeries.round), asc(playoffSeries.conference), asc(playoffSeries.id));

  return rows.map(mapRowToPlayoffSeriesWithPredictions);
}

// ─── Shot Quality: Expected Shot Value (xeFG%) surface ──────────
//
// Reads the league-grain shot_grid cells (team_id IS NULL) joined to the two
// shot_value_surface model versions (SQ-5). These tables are intentionally NOT in
// schema.ts (it lags the live schema), so this reads via raw SQL through postgres-js.
// SELECT-only; never mutates either table.

/** Model versions written to shot_value_surface (must match scripts/sq5_write_surface.py). */
const SHOT_MODEL_GBM = "gbm-v1";
const SHOT_MODEL_BASELINE = "baseline-zone-v1";

/** Raw row shape returned by the getShotQualityGrid SELECT (numeric columns arrive as strings). */
type ShotQualityGridRow = {
  cell_x: number | string;
  cell_y: number | string;
  zone_basic: string | null;
  zone_range: string | null;
  zone_area: string | null;
  fga: number | string;
  fgm: number | string;
  fg3a: number | string;
  fg3m: number | string;
  gbm_p_make: string | null;
  gbm_expected_efg: string | null;
  gbm_xpps: string | null;
  base_p_make: string | null;
  base_expected_efg: string | null;
  base_xpps: string | null;
};

/** Builds a model-values triplet, or null when the surface has no row for this cell/model. */
function buildShotModelValues(
  pMake: string | null,
  expectedEfg: string | null,
  xpps: string | null
): ShotQualityModelValues | null {
  if (pMake === null || expectedEfg === null || xpps === null) return null;
  return {
    pMake: parseFloat(pMake),
    expectedEfg: parseFloat(expectedEfg),
    xpps: parseFloat(xpps),
  };
}

function mapShotQualityRow(row: ShotQualityGridRow): ShotQualityCell {
  return {
    cellX: Number(row.cell_x),
    cellY: Number(row.cell_y),
    zoneBasic: row.zone_basic,
    zoneRange: row.zone_range,
    zoneArea: row.zone_area,
    fga: Number(row.fga),
    fgm: Number(row.fgm),
    fg3a: Number(row.fg3a),
    fg3m: Number(row.fg3m),
    gbm: buildShotModelValues(row.gbm_p_make, row.gbm_expected_efg, row.gbm_xpps),
    baseline: buildShotModelValues(row.base_p_make, row.base_expected_efg, row.base_xpps),
  };
}

/**
 * League-grain expected-shot-value grid for a season: every shot_grid cell with
 * team_id IS NULL, LEFT JOINed to both model surfaces (gbm-v1, baseline-zone-v1) on
 * (season, cell_x, cell_y, model_version). A cell whose surface row is absent for a
 * model gets a null sub-object. Returns [] when the season has no league cells (not an error).
 */
export async function getShotQualityGrid(season: string): Promise<ShotQualityCell[]> {
  const rows = (await db.execute(sql`
    SELECT
      g.cell_x          AS cell_x,
      g.cell_y          AS cell_y,
      g.zone_basic      AS zone_basic,
      g.zone_range      AS zone_range,
      g.zone_area       AS zone_area,
      g.fga             AS fga,
      g.fgm             AS fgm,
      g.fg3a            AS fg3a,
      g.fg3m            AS fg3m,
      gbm.p_make        AS gbm_p_make,
      gbm.expected_efg  AS gbm_expected_efg,
      gbm.xpps          AS gbm_xpps,
      base.p_make       AS base_p_make,
      base.expected_efg AS base_expected_efg,
      base.xpps         AS base_xpps
    FROM shot_grid g
    LEFT JOIN shot_value_surface gbm
      ON gbm.season = g.season
      AND gbm.cell_x = g.cell_x
      AND gbm.cell_y = g.cell_y
      AND gbm.model_version = ${SHOT_MODEL_GBM}
    LEFT JOIN shot_value_surface base
      ON base.season = g.season
      AND base.cell_x = g.cell_x
      AND base.cell_y = g.cell_y
      AND base.model_version = ${SHOT_MODEL_BASELINE}
    WHERE g.team_id IS NULL AND g.season = ${season}
    ORDER BY g.cell_x, g.cell_y
  `)) as unknown as ShotQualityGridRow[];

  return rows.map(mapShotQualityRow);
}
