import { PLAYOFF_MODEL_VERSION } from "@/lib/playoff-model-version";
import { isHeldGame, WORKLOAD_STATUSES } from "@/lib/game-status";
import { format, parseISO, subDays } from "date-fns";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  max,
  min,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "./index";
import { slateOrder } from "./slate-order";
import { compareUpcomingTipOff } from "@/lib/upcoming-rest-edges";
import { hasNotTipped } from "@/lib/game-phase";
import {
  fatigueScores,
  games,
  playoffSeries,
  playoffSeriesPredictions,
  predictions,
  teams,
} from "./schema";
import type { DataAsOf } from "@/lib/data-as-of";
import { neutralVenueCoordinates } from "@/lib/neutral-venues";
import { isProjectedFatigue } from "@/lib/fatigue-provenance";
import type { DisparityGameRow } from "@/lib/schedule-disparity";
import type { SeasonReportRow } from "@/lib/season-report";
import { travelLegKey } from "@/lib/season-travel";
import { publishedSeasonTravelLegs } from "@/lib/season-report-travel";
import { ABNORMAL_STRETCHES } from "@/lib/season-regime";
import { daysOffBeforeGame } from "@/lib/days-off";
import {
  formatEasternDateKey,
  formatEasternTipTime,
  monthCalendarBounds,
} from "@/lib/nba-season";
import {
  classifyRestAdvantage,
  NEUTRAL_REST_ADVANTAGE_THRESHOLD,
  type HistoricalGameEvidenceRow,
  type HistoricalGameSearchFilters,
  type HistoricalGameSearchRow,
} from "@/lib/rest-advantage-evidence";
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
  TeamScheduleGame,
  UpcomingGameWithRA,
} from "@/types";

/**
 * The fatigue columns every read selects. Written once: the DISTINCT ON and the
 * correlated LATERAL below must return the same shape or they are not
 * interchangeable.
 */
const FATIGUE_COLUMNS = {
  gameId: fatigueScores.gameId,
  teamId: fatigueScores.teamId,
  score: fatigueScores.score,
  isBackToBack: fatigueScores.isBackToBack,
  isThreeInFour: fatigueScores.isThreeInFour,
  gamesInLast7Days: fatigueScores.gamesInLast7Days,
  travelDistanceMiles: fatigueScores.travelDistanceMiles,
  altitudeMultiplier: fatigueScores.altitudeMultiplier,
  daysSinceLastGame: fatigueScores.daysSinceLastGame,
  isOvertimePenalty: fatigueScores.isOvertimePenalty,
  roadTripConsecutiveAway: fatigueScores.roadTripConsecutiveAway,
  hasTimeZoneDisplacement: fatigueScores.hasTimeZoneDisplacement,
};

/** One fatigue row per (game, team), preferring the most recently computed. */
function latestFatigueSubquery(alias: string) {
  return db
    .selectDistinctOn([fatigueScores.gameId, fatigueScores.teamId], FATIGUE_COLUMNS)
    .from(fatigueScores)
    .orderBy(fatigueScores.gameId, fatigueScores.teamId, desc(fatigueScores.computedAt), desc(fatigueScores.id))
    .as(alias);
}

/**
 * Same rows as `latestFatigueSubquery`, one index seek per game/side instead of
 * deduplicating the whole `fatigue_scores` table. Both helpers use id DESC to
 * choose deterministically when two revisions share computed_at.
 */
function latestFatigueLateral(
  teamIdColumn: typeof games.homeTeamId | typeof games.awayTeamId,
  subqueryAlias: string
) {
  return db
    .select(FATIGUE_COLUMNS)
    .from(fatigueScores)
    .where(and(eq(fatigueScores.gameId, games.id), eq(fatigueScores.teamId, teamIdColumn)))
    .orderBy(desc(fatigueScores.computedAt), desc(fatigueScores.id))
    .limit(1)
    .as(subqueryAlias);
}

/**
 * The season-regime policy in SQL: exclude games inside a named abnormal stretch, and nothing
 * else. Correlated per row, so it works on queries spanning many seasons.
 *
 * Replaced an "October 1 to April 30" window that reached the right answer for the 2019-20
 * bubble by coincidence and the wrong one for two shifted seasons — it dropped 135 real
 * 2020-21 games and 44 from 1998-99, with no mis-tagged playoff rows anywhere in the data to
 * justify the cost. `game_type = 'regular'` already does the job that window was nominally for.
 *
 * With an empty stretch list this is `true`, which is the correct no-op.
 */
const gameIsNormallyPlayed =
  ABNORMAL_STRETCHES.length === 0
    ? sql`true`
    : sql.join(
        ABNORMAL_STRETCHES.map(
          (stretch) =>
            sql`NOT (${games.season} = ${stretch.season} AND ${games.date} BETWEEN ${stretch.from} AND ${stretch.to})`
        ),
        sql` AND `
      );

/**
 * The two predicates every reader that *publishes* a game row must apply: regular season, and
 * not inside an abnormal stretch. Extra conditions compose on top.
 *
 * This exists because the rule was previously hand-written at each call site and four readers
 * had quietly omitted it — including `getGameById`, which served a 2019-20 Orlando bubble game
 * carrying a rest advantage. ADR-0004 moves *season* exclusions out to the module that objects;
 * abnormal stretches are its one universal rule, and this is where it lives.
 *
 * Deliberately NOT applied by:
 * - `getTeamGameCountsInDaysBefore` and `computeScheduleDensityMap` — they count physical schedule load,
 *   not publishable rows, and must stay consistent with `fatigue-recent-games.ts`, which is also
 *   unfiltered. Filtering one side would put two contradictory density figures on the same card.
 * - `getFirstUnplayedDate` — projection provenance follows unplayed physical workload, including
 *   Cup/play-in context that is not a published regular-season target.
 * - `getShotQualityGrid` — reads `shot_grid`, never joins `games`. Shot Value keeps the bubble on
 *   purpose (docs/SHOT_QUALITY_DESIGN.md): court geometry does not care that nobody flew there.
 */
function publishableGames(...extra: (SQL | undefined)[]): SQL | undefined {
  return and(eq(games.gameType, "regular"), gameIsNormallyPlayed, ...extra);
}

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
        inArray(games.status, [...WORKLOAD_STATUSES]),
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

/**
 * Counts prior games plus the selected game in an exact calendar window.
 *
 * Prior games count whether or not they have been played, which is what the stored fatigue row
 * was scored against: with a finals-only filter every date still ahead read "no 3-in-4" beside a
 * score that had charged for one.
 */
async function computeScheduleDensityMap(
  gameDate: string,
  teamIds: number[],
  nights: number,
  minimumGames: number
): Promise<Map<number, boolean>> {
  const unique = [...new Set(teamIds)];
  const counts = new Map(unique.map((id) => [id, 0]));
  if (unique.length === 0) return new Map();

  const start = format(subDays(parseISO(gameDate), nights - 1), "yyyy-MM-dd");
  const rows = await db
    .select({
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
    })
    .from(games)
    .where(
      and(
        or(inArray(games.homeTeamId, unique), inArray(games.awayTeamId, unique)),
        inArray(games.status, [...WORKLOAD_STATUSES]),
        gte(games.date, start),
        lte(games.date, gameDate)
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

  return new Map(unique.map((id) => [id, (counts.get(id) ?? 0) >= minimumGames]));
}

/**
 * The one game-with-fatigue read. Both public entry points — a date's slate and a
 * single game — differ only in their `where`, so they share this projection
 * rather than keeping two column lists that have to be held equal by hand.
 */
function selectGamesWithFatigue(where: SQL | undefined) {
  const homeTeam = alias(teams, "home_team");
  const awayTeam = alias(teams, "away_team");
  const homeFatigue = latestFatigueLateral(games.homeTeamId, "home_fatigue_latest");
  const awayFatigue = latestFatigueLateral(games.awayTeamId, "away_fatigue_latest");

  return db
    .select({
      // Game
      id: games.id,
      externalId: games.externalId,
      date: games.date,
      season: games.season,
      status: games.status,
      tipOffUtc: games.tipOffUtc,
      // Schedule metadata asks for the first stored regular game, including excluded regimes.
      // It does not publish a new game row or infer an opener from a missing fatigue row.
      homeSeasonOpener: sql<boolean>`not exists (
        select 1 from games opener_schedule
        where opener_schedule.season = ${games.season} and opener_schedule.game_type = 'regular'
          and opener_schedule.status in (${sql.join(WORKLOAD_STATUSES.map(status => sql`${status}`), sql`, `)})
          and (opener_schedule.home_team_id = ${games.homeTeamId} or opener_schedule.away_team_id = ${games.homeTeamId})
          and (opener_schedule.date < ${games.date} or (opener_schedule.date = ${games.date} and opener_schedule.id < ${games.id}))
      )`,
      awaySeasonOpener: sql<boolean>`not exists (
        select 1 from games opener_schedule
        where opener_schedule.season = ${games.season} and opener_schedule.game_type = 'regular'
          and opener_schedule.status in (${sql.join(WORKLOAD_STATUSES.map(status => sql`${status}`), sql`, `)})
          and (opener_schedule.home_team_id = ${games.awayTeamId} or opener_schedule.away_team_id = ${games.awayTeamId})
          and (opener_schedule.date < ${games.date} or (opener_schedule.date = ${games.date} and opener_schedule.id < ${games.id}))
      )`,
      neutralSite: games.neutralSite,
      neutralVenueCity: games.neutralVenueCity,
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
      homeHasTimeZoneDisplacement: homeFatigue.hasTimeZoneDisplacement,
      // Away fatigue
      awayFatigueScore: awayFatigue.score,
      awayIsBackToBack: awayFatigue.isBackToBack,
      awayGamesInLast7Days: awayFatigue.gamesInLast7Days,
      awayTravelDistanceMiles: awayFatigue.travelDistanceMiles,
      awayAltitudeMultiplier: awayFatigue.altitudeMultiplier,
      awayDaysSinceLastGame: awayFatigue.daysSinceLastGame,
      awayIsOvertimePenalty: awayFatigue.isOvertimePenalty,
      awayRoadTripConsecutiveAway: awayFatigue.roadTripConsecutiveAway,
      awayHasTimeZoneDisplacement: awayFatigue.hasTimeZoneDisplacement,
    })
    .from(games)
    .innerJoin(homeTeam, eq(games.homeTeamId, homeTeam.id))
    .innerJoin(awayTeam, eq(games.awayTeamId, awayTeam.id))
    .leftJoinLateral(homeFatigue, sql`true`)
    .leftJoinLateral(awayFatigue, sql`true`)
    .where(where)
    .orderBy(...slateOrder());
}

/** Derived, not re-declared: a third copy of the column list could drift from the query. */
type GameFatigueJoinRow = Awaited<ReturnType<typeof selectGamesWithFatigue>>[number];

/**
 * Attaches the two schedule-density figures the projection cannot join and maps
 * to the response shape.
 *
 * Precondition: every row shares one game date — both callers query a single
 * date — so the density lookups run once rather than per row.
 */
/**
 * The ET date of a season's earliest game that has not been played, or null when none remain.
 *
 * All physical game types count: an unplayed Cup final can project the next regular fixture.
 * One scalar answers "is this game's fatigue projected?" for every game in the season — see
 * `src/lib/fatigue-provenance.ts` for why that reduction is sound. Cheap: `games_date_idx` and
 * `games_status_idx` both exist, and it reads one row.
 */
export async function getFirstUnplayedDate(season: string): Promise<string | null> {
  const [row] = await db
    .select({ first: min(games.date) })
    .from(games)
    .where(and(eq(games.season, season), inArray(games.status, ["scheduled", "live"])));

  return row?.first ? String(row.first) : null;
}

async function toGameResponses(rows: GameFatigueJoinRow[]): Promise<GameResponse[]> {
  if (rows.length === 0) return [];

  const date = String(rows[0].date);
  const teamIds = rows.flatMap((r) => [r.homeTeamId, r.awayTeamId]);
  // Every row here shares one date, so it shares one season, so one scalar covers them all.
  const [is4In6Map, is3In4Map, games30Map, firstUnplayed] = await Promise.all([
    computeScheduleDensityMap(date, teamIds, 6, 4),
    computeScheduleDensityMap(date, teamIds, 4, 3),
    getTeamGameCountsInDaysBefore(date, teamIds, 30),
    getFirstUnplayedDate(String(rows[0].season)),
  ]);
  const projectedFatigue = isProjectedFatigue(date, firstUnplayed);

  return rows.map((row) => ({
    ...mapJoinedRowToGameResponse(row, is4In6Map, is3In4Map, games30Map),
    projectedFatigue,
  }));
}

/**
 * Returns all games scheduled for a given date (YYYY-MM-DD), with full team
 * info and pre-computed fatigue scores for both sides.
 *
 * Regime-filtered like every other reader. Each row here carries a rest advantage, and that
 * number is the fatigue model speaking — publishing one for a game the same model calls
 * abnormal would have the site contradict its own methodology page, which says the bubble is
 * excluded because there is no travel to measure.
 */
export async function getGamesByDate(date: string): Promise<GameResponse[]> {
  const rows = await selectGamesWithFatigue(publishableGames(eq(games.date, date)));
  return toGameResponses(rows);
}

/**
 * One team's regular season, every game the board would publish, in slate order.
 *
 * The board's own reader filtered to one team, so a game shows the same rest advantage on both
 * pages. Only the two scores are read from each fatigue row: the schedule shows the gap, not the
 * flags, and the density flags would cost a lookup per date.
 */
export async function getTeamSeasonSchedule(
  season: string,
  abbreviation: string
): Promise<TeamScheduleGame[]> {
  const [team] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.abbreviation, abbreviation));
  if (!team) return [];

  const [rows, firstUnplayed] = await Promise.all([
    selectGamesWithFatigue(
      publishableGames(
        eq(games.season, season),
        or(eq(games.homeTeamId, team.id), eq(games.awayTeamId, team.id))
      )
    ),
    getFirstUnplayedDate(season),
  ]);

  return rows.map((row) => {
    const isHome = row.homeTeamId === team.id;
    const home = readFatigueSide(row, "home").score;
    const away = readFatigueSide(row, "away").score;
    const date = String(row.date);
    return {
      id: row.id,
      date,
      tipOffEt: formatEasternTipTime(row.tipOffUtc),
      tipOffUtc: row.tipOffUtc ? new Date(row.tipOffUtc).toISOString() : null,
      status: row.status,
      isHome,
      neutralCity: row.neutralSite ? row.neutralVenueCity : null,
      opponent: isHome
        ? { id: row.awayTeamId, name: row.awayTeamName, abbreviation: row.awayTeamAbbreviation, city: row.awayTeamCity }
        : { id: row.homeTeamId, name: row.homeTeamName, abbreviation: row.homeTeamAbbreviation, city: row.homeTeamCity },
      teamScore: isHome ? row.homeScore : row.awayScore,
      opponentScore: isHome ? row.awayScore : row.homeScore,
      restAdvantage: isHeldGame(row.status) || home === null || away === null ? null : classifyRestAdvantage(home, away),
      projectedFatigue: isProjectedFatigue(date, firstUnplayed),
    };
  });
}

/**
 * Everything about one game except its fatigue provenance, which is a property of the season's
 * progress rather than of the row — `toGameResponses` adds it, and the `Omit` is what stops a
 * future caller assembling a `GameResponse` without deciding the question.
 */
function mapJoinedRowToGameResponse(
  row: GameFatigueJoinRow,
  is4In6Map: Map<number, boolean>,
  is3In4Map: Map<number, boolean>,
  games30Map: Map<number, number>
): Omit<GameResponse, "projectedFatigue"> {
  const homeFatigueData = buildFatigueInfo(
    readFatigueSide(row, "home"),
    {
      gamesInLast30Days: games30Map.get(row.homeTeamId) ?? 0,
      is4In6: is4In6Map.get(row.homeTeamId) ?? false,
      is3In4: is3In4Map.get(row.homeTeamId) ?? false,
      roadTripConsecutiveAway: row.homeRoadTripConsecutiveAway ?? 0,
      hasTimeZoneDisplacement: row.homeHasTimeZoneDisplacement ?? false,
    },
    {
      side: "home",
      homeTeamCity: row.homeTeamCity,
      homeAltitudeFlag: row.homeTeamAltitude,
      neutralCity: row.neutralSite ? row.neutralVenueCity : null,
    }
  );

  const awayFatigueData = buildFatigueInfo(
    readFatigueSide(row, "away"),
    {
      gamesInLast30Days: games30Map.get(row.awayTeamId) ?? 0,
      is4In6: is4In6Map.get(row.awayTeamId) ?? false,
      is3In4: is3In4Map.get(row.awayTeamId) ?? false,
      roadTripConsecutiveAway: row.awayRoadTripConsecutiveAway ?? 0,
      hasTimeZoneDisplacement: row.awayHasTimeZoneDisplacement ?? false,
    },
    {
      side: "away",
      homeTeamCity: row.homeTeamCity,
      homeAltitudeFlag: row.homeTeamAltitude,
      neutralCity: row.neutralSite ? row.neutralVenueCity : null,
    }
  );

  const held = isHeldGame(row.status);
  const restAdvantage = held ? null : buildRestAdvantage(homeFatigueData, awayFatigueData);

  return {
    id: row.id,
    externalId: row.externalId,
    date: String(row.date),
    season: row.season,
    status: row.status,
    seasonOpeners: { home: row.homeSeasonOpener, away: row.awaySeasonOpener },
    tipOffEt: formatEasternTipTime(row.tipOffUtc),
    tipOffUtc: row.tipOffUtc ? new Date(row.tipOffUtc).toISOString() : null,
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
    homeScore: row.status === "final" ? row.homeScore : null,
    awayScore: row.status === "final" ? row.awayScore : null,
    homeFatigue: held ? null : homeFatigueData,
    awayFatigue: held ? null : awayFatigueData,
    restAdvantage,
    neutralCity: row.neutralSite ? row.neutralVenueCity : null,
  };
}

/**
 * Single regular-season game by primary key (for detail modal / deep links).
 *
 * Regime-filtered: this row carries a rest advantage, so serving a bubble game here would
 * publish a number the fatigue model refuses to compute. Reachable in two clicks before the
 * filter was added — the recent-results strip below linked straight into it.
 */
export async function getGameById(id: number): Promise<GameResponse | null> {
  const rows = await selectGamesWithFatigue(publishableGames(eq(games.id, id)));
  return (await toGameResponses(rows))[0] ?? null;
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
      publishableGames(
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
  // No season-wide date window: `games.season` already scopes the rows, and clipping them to an
  // October-April calendar on top of it only ever removed real games. It hid all 135 of
  // 2020-21's May games, which ran to the 16th, and every 2019-20 game from July onward.
  const window = month === undefined ? null : monthCalendarBounds(season, month);

  const rows = await db
    .select({
      date: games.date,
      gameCount: sql<number>`cast(count(*) as integer)`,
    })
    .from(games)
    .where(
      publishableGames(
        eq(games.season, season),
        window ? gte(games.date, window.from) : undefined,
        window ? lte(games.date, window.to) : undefined
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

/** A bounded-lived freshness fingerprint; superseded revisions may conservatively evict it. */
async function readCompletedInputFingerprint(scope: SQL | undefined): Promise<string> {
  const gameInputs = db.select({
    input: sql<string>`row('game'::text,
      ${games.id}, ${games.date}, ${games.season}, ${games.homeTeamId}, ${games.awayTeamId},
      ${games.status}, ${games.homeScore}, ${games.awayScore}, ${games.neutralSite}
    )::text`.as("input"),
    kind: sql<string>`'game'`.as("kind"),
  }).from(games).where(scope);
  const fatigueInputs = db.select({
    input: sql<string>`row('fatigue'::text,
      ${fatigueScores.gameId}, ${fatigueScores.teamId}, ${fatigueScores.id},
      ${fatigueScores.computedAt}, ${fatigueScores.score}
    )::text`.as("input"),
    kind: sql<string>`'fatigue'`.as("kind"),
  }).from(games)
    .innerJoin(fatigueScores, and(eq(fatigueScores.gameId, games.id),
      or(eq(fatigueScores.teamId, games.homeTeamId), eq(fatigueScores.teamId, games.awayTeamId))))
    .where(scope);
  const inputs = gameInputs.unionAll(fatigueInputs).as("completed_stamp_inputs");
  const [row] = await db.select({
    games: sql<string>`(count(*) filter (where ${inputs.kind} = 'game'))::text`,
    fatigue: sql<string>`(count(*) filter (where ${inputs.kind} = 'fatigue'))::text`,
    first: sql<string>`coalesce(bit_xor(hashtextextended(${inputs.input}, 0)), 0)::text`,
    second: sql<string>`coalesce(bit_xor(hashtextextended(${inputs.input}, 1)), 0)::text`,
  }).from(inputs);
  return row ? `${row.games}:${row.fatigue}:${row.first}:${row.second}` : "0:0:0:0";
}

/** Ordered loader inputs, including explicit missing sides and deterministic latest revisions. */
async function readGameInputDigest(scope: SQL | undefined, physicalContext = false): Promise<string> {
  if (!physicalContext) return readCompletedInputFingerprint(scope);
  const latest = db
    .selectDistinctOn([fatigueScores.gameId, fatigueScores.teamId], {
      gameId: fatigueScores.gameId,
      teamId: fatigueScores.teamId,
      score: fatigueScores.score,
      revisionId: fatigueScores.id,
      computedAt: fatigueScores.computedAt,
      contextFields: (physicalContext ? sql`row(${fatigueScores}.*)::text` : sql`null`).as("context_fields"),
    })
    .from(fatigueScores)
    .where(physicalContext ? inArray(fatigueScores.gameId, db.select({ id: games.id }).from(games).where(scope)) : undefined)
    .orderBy(fatigueScores.gameId, fatigueScores.teamId, desc(fatigueScores.computedAt), desc(fatigueScores.id))
    .as("input_stamp_latest");
  const homeTeam = alias(teams, "input_stamp_home_team");
  const awayTeam = alias(teams, "input_stamp_away_team");
  const home = sql`${latest.teamId} = ${games.homeTeamId}`;
  const away = sql`${latest.teamId} = ${games.awayTeamId}`;
  const context = physicalContext ? sql`row(
    ${games.gameType}, ${games.tipOffUtc}, ${games.overtimePeriods}, ${games.neutralVenueCity},
    ${homeTeam.abbreviation}, ${homeTeam.latitude}, ${homeTeam.longitude}, ${homeTeam.altitudeFlag},
    ${awayTeam.abbreviation}, ${awayTeam.latitude}, ${awayTeam.longitude}, ${awayTeam.altitudeFlag},
    max(${sql.identifier("input_stamp_latest")}.${sql.identifier("context_fields")}) filter (where ${home}),
    max(${sql.identifier("input_stamp_latest")}.${sql.identifier("context_fields")}) filter (where ${away})
  )::text` : sql`null`;
  const paired = db
    .select({ gameId: games.id, input: sql<string>`row(
      ${games.id}, ${games.date}, ${games.season}, ${games.homeTeamId}, ${games.awayTeamId},
      ${games.status}, ${games.homeScore}, ${games.awayScore}, ${games.neutralSite},
      coalesce((max(${latest.revisionId}) filter (where ${home}))::text, 'missing'),
      max(${latest.computedAt}) filter (where ${home}), max(${latest.score}) filter (where ${home}),
      coalesce((max(${latest.revisionId}) filter (where ${away}))::text, 'missing'),
      max(${latest.computedAt}) filter (where ${away}), max(${latest.score}) filter (where ${away}),
      ${context}
    )::text`.as("input") })
    .from(games)
    .leftJoin(latest, and(eq(latest.gameId, games.id), or(eq(latest.teamId, games.homeTeamId), eq(latest.teamId, games.awayTeamId))))
    .leftJoin(homeTeam, eq(homeTeam.id, games.homeTeamId))
    .leftJoin(awayTeam, eq(awayTeam.id, games.awayTeamId))
    .where(scope)
    .groupBy(games.id, ...(physicalContext ? [homeTeam.id, awayTeam.id] : []))
    .as("input_stamp_paired");
  const [row] = await db
    .select({ digest: sql<string>`md5(coalesce(string_agg(${paired.input}, E'\\n' order by ${paired.gameId}), ''))` })
    .from(paired);
  return row?.digest ?? "empty";
}

/** The completed loader's cache key includes content corrections and lost/recovered fatigue. */
export async function getCompletedGamesStamp(): Promise<string> {
  return `completed-v3:${await readGameInputDigest(publishableGames(
    eq(games.status, "final"), isNotNull(games.homeScore), isNotNull(games.awayScore)
  ))}`;
}

/** The public date/count remain a cheap game aggregate, independent of cache revision hashing. */
async function readFinalGamesFacts(): Promise<DataAsOf> {
  const [row] = await db
    .select({ finals: count(), latest: max(games.date) })
    .from(games)
    .where(publishableGames(eq(games.status, "final")));
  return {
    finalGames: Number(row?.finals ?? 0),
    latestFinalDate: row?.latest ? String(row.latest) : null,
  };
}

/** Latest final ET date and game count for the published AS OF line. */
export async function getDataAsOf(): Promise<DataAsOf> {
  return readFinalGamesFacts();
}

/** Published regular-season schedule coverage, independent of game completion. */
export async function getPublishedScheduleCoverage(): Promise<{
  games: number;
  firstDate: string | null;
  lastDate: string | null;
}> {
  const [row] = await db
    .select({ total: count(), first: min(games.date), last: max(games.date) })
    .from(games)
    .where(publishableGames());

  return {
    games: Number(row?.total ?? 0),
    firstDate: row?.first ? String(row.first) : null,
    lastDate: row?.last ? String(row.last) : null,
  };
}

/**
 * Returns all final games that have fatigue scores computed for both teams.
 * Only the fields needed for analysis are selected to keep the payload lean.
 */
export async function getCompletedGamesWithFatigue(): Promise<HistoricalGameEvidenceRow[]> {
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
      neutralSite: games.neutralSite,
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
      publishableGames(
        eq(games.status, "final"),
        isNotNull(games.homeScore),
        isNotNull(games.awayScore)
      )
    );
}

/**
 * Seasons with at least one published regular-season game that has not reached final status.
 *
 * The historical chart uses this data state instead of guessing from the season label or the
 * calendar. It also avoids treating a partially assigned NBA Cup schedule as complete merely
 * because the current row count is below an assumed full-season total.
 */
export async function getIncompleteRegularSeasonSeasons(): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ season: games.season })
    .from(games)
    .where(publishableGames(inArray(games.status, ["scheduled", "live", "postponed"])));

  return new Set(rows.map((row) => String(row.season)));
}

/** Cache-key form of the pending-season state used by the historical study. */
export async function getIncompleteRegularSeasonSeasonsStamp(): Promise<string> {
  return [...(await getIncompleteRegularSeasonSeasons())].sort().join(",");
}

// ─── Game search query ────────────────────────────────────────────

/**
 * Returns final regular-season games matching the given filters, newest first.
 * Result filtering (correct/incorrect) and pagination are done by the caller
 * after computing restedTeamWon in JavaScript.
 */
export async function searchRegularSeasonGames(
  filters: HistoricalGameSearchFilters
): Promise<HistoricalGameSearchRow[]> {
  const homeTeam = alias(teams, "home_team");
  const awayTeam = alias(teams, "away_team");
  const homeFatigue = latestFatigueSubquery("home_fatigue_latest");
  const awayFatigue = latestFatigueSubquery("away_fatigue_latest");

  // Build conditions array — always filter to publishable final games
  const conditions = [
    publishableGames(),
    eq(games.status, "final"),
    isNotNull(games.homeScore),
    isNotNull(games.awayScore),
    // The search route always discards neutral games (|rest advantage| < 0.5).
    // Exclude them in SQL so an unfiltered search doesn't scan+join ~all ~46k
    // regular games only to drop half of them in JS. A higher minRA below raises
    // this floor further.
    sql`abs(cast(${awayFatigue.score} as numeric) - cast(${homeFatigue.score} as numeric)) >= ${NEUTRAL_REST_ADVANTAGE_THRESHOLD}`,
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
      neutralSite: games.neutralSite,
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
  neutralCity: string | null;
};

type FatigueScheduleExtras = {
  is3In4: boolean;
  gamesInLast30Days: number;
  is4In6: boolean;
  roadTripConsecutiveAway: number;
  hasTimeZoneDisplacement: boolean;
};

/**
 * One side's fatigue columns, already numeric.
 *
 * `decimal` columns arrive from postgres as strings. Reading them into this
 * shape is the only place that stops being true, so nothing downstream —
 * including this file — parses a fatigue figure again.
 */
type FatigueSideValues = {
  score: number | null;
  isBackToBack: boolean | null;
  gamesInLast7Days: number | null;
  daysSinceLastGame: number | null;
  travelDistanceMiles: number;
  altitudeMultiplier: number;
  isOvertimePenalty: boolean | null;
};

function readFatigueSide(row: GameFatigueJoinRow, side: "home" | "away"): FatigueSideValues {
  const f = side === "home"
    ? {
        score: row.homeFatigueScore,
        isBackToBack: row.homeIsBackToBack,
        gamesInLast7Days: row.homeGamesInLast7Days,
        daysSinceLastGame: row.homeDaysSinceLastGame,
        travelDistanceMiles: row.homeTravelDistanceMiles,
        altitudeMultiplier: row.homeAltitudeMultiplier,
        isOvertimePenalty: row.homeIsOvertimePenalty,
      }
    : {
        score: row.awayFatigueScore,
        isBackToBack: row.awayIsBackToBack,
        gamesInLast7Days: row.awayGamesInLast7Days,
        daysSinceLastGame: row.awayDaysSinceLastGame,
        travelDistanceMiles: row.awayTravelDistanceMiles,
        altitudeMultiplier: row.awayAltitudeMultiplier,
        isOvertimePenalty: row.awayIsOvertimePenalty,
      };

  return {
    ...f,
    score: f.score === null ? null : parseFloat(f.score),
    travelDistanceMiles: parseFloat(f.travelDistanceMiles ?? "0"),
    altitudeMultiplier: parseFloat(f.altitudeMultiplier ?? "1"),
  };
}

/** Builds a FatigueInfo object from one side's columns, or null if that side has no fatigue row. */
function buildFatigueInfo(
  fatigue: FatigueSideValues,
  extras: FatigueScheduleExtras,
  ctx: FatigueInfoContext
): FatigueInfo | null {
  const { score, isBackToBack, gamesInLast7Days, daysSinceLastGame, isOvertimePenalty } = fatigue;
  if (score === null) return null;

  const g7 = gamesInLast7Days ?? 0;

  // Tonight's venue only. The venue test also keeps rows stored before the carryover was
  // removed (multiplier 1.06 the game after a visit) from raising the flag.
  const neutral = neutralVenueCoordinates(ctx.neutralCity);
  const atAltitude = neutral ? neutral.altitude : ctx.side === "away" && ctx.homeAltitudeFlag;
  const altitudePenalty = fatigue.altitudeMultiplier > 1.0 && atAltitude;
  const altitudeArenaLabel = altitudePenalty
    ? `${ctx.neutralCity ?? ctx.homeTeamCity} (altitude)`
    : null;

  return {
    score,
    isBackToBack: isBackToBack ?? false,
    is3In4: extras.is3In4,
    travelDistanceMiles: fatigue.travelDistanceMiles,
    altitudePenalty,
    altitudeArenaLabel,
    daysRest: daysOffBeforeGame(daysSinceLastGame),
    gamesInLast7Days: g7,
    gamesInLast30Days: extras.gamesInLast30Days,
    is4In6: extras.is4In6,
    isOvertimePenalty: isOvertimePenalty ?? false,
    // Zero only for a host in its own arena. At a neutral site the host is on the road too,
    // and the model counts tonight in its streak.
    roadTripConsecutiveAway:
      ctx.side === "home" && ctx.neutralCity === null ? 0 : extras.roadTripConsecutiveAway,
    hasTimeZoneDisplacement: extras.hasTimeZoneDisplacement,
  };
}

/** Calculates rest advantage from the two teams' fatigue data. */
function buildRestAdvantage(
  home: FatigueInfo | null,
  away: FatigueInfo | null
): RestAdvantage | null {
  if (home === null || away === null) return null;
  return classifyRestAdvantage(home.score, away.score);
}

// ─── Upcoming games with rest advantage ─────────────────────────

/**
 * Scheduled regular-season games for the given season with open predictions,
 * optionally filtered to |RA differential| >= minRA. Returns upcoming games only
 * (on or after today's date). A bounded result defaults to strongest first;
 * `soonest` orders the full qualifying set by tip-off before applying the limit.
 */
export async function getUpcomingGamesWithRA(
  season: string,
  minRA: number,
  limit?: number,
  order: "strongest" | "soonest" = "strongest"
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

  // ET, not server-local: games.date stores ET dates and this runs on Vercel (UTC).
  const todayStr = formatEasternDateKey();

  const conditions = [
    publishableGames(),
    eq(games.season, season),
    eq(games.status, "scheduled"),
    eq(latestOpen.predictedAdvantageTeamId, games.homeTeamId),
    eq(games.neutralSite, false),
    gte(games.date, todayStr),
  ];

  if (minRA > 0) {
    conditions.push(
      sql`abs(cast(${latestOpen.differential} as numeric)) >= ${minRA}`
    );
  }

  const firstUnplayed = await getFirstUnplayedDate(season);

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
      tipOffUtc: games.tipOffUtc,
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

  // A game stays `scheduled` until its final is written, so the status alone would list a
  // game that is being played as still ahead.
  const now = Date.now();
  const candidates = rows.filter((r) => r.homeFatigueScore !== null && r.awayFatigueScore !== null && hasNotTipped(r.tipOffUtc, now));
  const ordered = order === "soonest"
    ? candidates.sort(compareUpcomingTipOff)
    : limit === undefined ? candidates : candidates.sort((a, b) =>
      Math.abs(Number(b.differential)) - Math.abs(Number(a.differential)) ||
      String(a.date).localeCompare(String(b.date)) || a.gameId - b.gameId
    );
  const selected = limit === undefined ? ordered : ordered.slice(0, limit);
  return selected.map((r) => ({
    gameId: r.gameId,
    date: String(r.date),
    season: r.season,
    tipOffUtc: r.tipOffUtc ? new Date(r.tipOffUtc).toISOString() : null,
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
    projectedFatigue: isProjectedFatigue(String(r.date), firstUnplayed),
  }));
}

// ─── Playoff Predictor: series + predictions ────────────────────

type PlayoffPredictionMethodKey = "full_insample" | "walk_forward_oos";

/** The selected data revision only; historical versions remain stored for audit. */
function latestPlayoffPredictionSubquery(subqueryAlias: string, method: PlayoffPredictionMethodKey) {
  return db
    .selectDistinctOn([playoffSeriesPredictions.seriesId], {
      seriesId: playoffSeriesPredictions.seriesId,
      predictedHomeCourtWinProb: playoffSeriesPredictions.predictedHomeCourtWinProb,
      predictedWinnerTeamId: playoffSeriesPredictions.predictedWinnerTeamId,
      modelVersion: playoffSeriesPredictions.modelVersion,
    })
    .from(playoffSeriesPredictions)
    .where(and(eq(playoffSeriesPredictions.predictionMethod, method), eq(playoffSeriesPredictions.modelVersion, PLAYOFF_MODEL_VERSION)))
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
  priorGrindDiff: string | null;
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

function mapRowToPlayoffSeriesWithPredictions(
  row: PlayoffSeriesJoinRow,
  priorGames: Map<string, PriorRoundSeries>
): PlayoffSeriesWithPredictions {
  const homeCourtPrior = priorGames.get(`${row.round}:${row.homeCourtTeamId}`) ?? null;
  const opponentPrior = priorGames.get(`${row.round}:${row.opponentTeamId}`) ?? null;

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
    priorGrindDiff: row.priorGrindDiff !== null ? parseFloat(row.priorGrindDiff) : null,
    homeCourtPriorGames: homeCourtPrior?.games ?? null,
    opponentPriorGames: opponentPrior?.games ?? null,
    homeCourtPriorIsBestOf7: homeCourtPrior?.isBestOf7 ?? null,
    opponentPriorIsBestOf7: opponentPrior?.isBestOf7 ?? null,
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

/** A team's previous-round series: how long it ran, and the format it ran under. */
type PriorRoundSeries = { games: number; isBestOf7: boolean };

/**
 * Each team's round-before series, keyed by `${round}:${teamId}`, for one season.
 *
 * A separate small query rather than a lateral join: "the series in round N−1 that this team
 * appeared in" is a lookup over the same season's rows, and the season's row count is 15, so
 * resolving it in memory is both clearer and cheaper than expressing it in SQL.
 *
 * The format travels with the game count because a count alone cannot be read: five games is
 * the full distance in a best-of-5 and an early close in a best-of-7, and Round 1 was
 * best-of-5 through 2001-02.
 */
async function priorRoundGamesBySeason(season: string): Promise<Map<string, PriorRoundSeries>> {
  const rows = await db
    .select({
      round: playoffSeries.round,
      isBestOf7: playoffSeries.isBestOf7,
      homeCourtTeamId: playoffSeries.homeCourtTeamId,
      opponentTeamId: playoffSeries.opponentTeamId,
      homeCourtWins: playoffSeries.homeCourtWins,
      opponentWins: playoffSeries.opponentWins,
    })
    .from(playoffSeries)
    .where(eq(playoffSeries.season, season));

  const out = new Map<string, PriorRoundSeries>();
  for (const r of rows) {
    if (r.homeCourtWins === null || r.opponentWins === null) continue;
    const prior: PriorRoundSeries = {
      games: r.homeCourtWins + r.opponentWins,
      isBestOf7: r.isBestOf7,
    };
    // Keyed by the round the value is consumed IN, i.e. one after the round it was played in.
    out.set(`${r.round + 1}:${r.homeCourtTeamId}`, prior);
    out.set(`${r.round + 1}:${r.opponentTeamId}`, prior);
  }
  return out;
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
      priorGrindDiff: playoffSeries.priorGrindDiff,
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

  const priorGames = await priorRoundGamesBySeason(season);
  return rows.map((row) => mapRowToPlayoffSeriesWithPredictions(row, priorGames));
}

/** Newest season that can render a bracket, derived from the publication table itself. */
export async function getLatestPublishedPlayoffSeason(): Promise<string | null> {
  const [row] = await db
    .select({ latest: max(playoffSeries.season) })
    .from(playoffSeries);

  return row?.latest ? String(row.latest) : null;
}

// ─── Shot Quality: Expected Shot Value (xeFG%) surface ──────────
//
// Reads the league-grain shot_grid cells (team_id IS NULL) joined to the two
// shot_value_surface model versions (SQ-5). These tables are intentionally NOT in
// schema.ts (it lags the live schema), so this reads via raw SQL through the app driver.
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
  `)).rows as unknown as ShotQualityGridRow[];

  return rows.map(mapShotQualityRow);
}

/**
 * Newest season with a league grid and both surfaces needed by the comparison view.
 * `shot_grid` and `shot_value_surface` deliberately remain raw SQL tables in this app.
 */
export async function getLatestPublishedShotQualitySeason(beforeSeason?: string): Promise<string | null> {
  const rows = (await db.execute(sql`
    SELECT max(g.season) AS latest
    FROM shot_grid g
    WHERE g.team_id IS NULL
      AND ${beforeSeason ? sql`g.season < ${beforeSeason}` : sql`true`}
      AND EXISTS (
        SELECT 1 FROM shot_value_surface s
        WHERE s.season = g.season
          AND s.cell_x = g.cell_x
          AND s.cell_y = g.cell_y
          AND s.model_version = ${SHOT_MODEL_GBM}
      )
      AND EXISTS (
        SELECT 1 FROM shot_value_surface s
        WHERE s.season = g.season
          AND s.cell_x = g.cell_x
          AND s.cell_y = g.cell_y
          AND s.model_version = ${SHOT_MODEL_BASELINE}
      )
  `)).rows as unknown as { latest: string | null }[];

  return rows[0]?.latest ? String(rows[0].latest) : null;
}

// ─── Schedule Disparity query ───────────────────────────────────

/**
 * One season's published regular-season targets and physical workload context, with latest
 * fatigue scores for Schedule Disparity. Rest days are NOT selected here: the module derives them from the game dates
 * themselves, because `fatigue_scores.days_since_last_game` goes stale when games are inserted
 * into a published schedule. See docs/adr/0001-derive-rest-days-from-games.md.
 *
 * Unplayed games are included on purpose — the module reports on schedules before they are
 * played — so both fatigue scores are nullable.
 *
 * `publishableGames` marks the target population; every other season row is workload context.
 * Schedule Edge still withholds 2019-20 as truncated, independently of its physical history.
 */
export async function getRegularSeasonScheduleForDisparity(
  season: string
): Promise<DisparityGameRow[]> {
  const homeFatigue = latestFatigueSubquery("home_fatigue_disparity");
  const awayFatigue = latestFatigueSubquery("away_fatigue_disparity");

  const rows = await db
    .select({
      date: games.date,
      published: sql<boolean>`${publishableGames(eq(games.season, season))}`,
      status: games.status,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      homeFatigueScore: homeFatigue.score,
      awayFatigueScore: awayFatigue.score,
      neutralSite: games.neutralSite,
    })
    .from(games)
    .leftJoin(
      homeFatigue,
      and(eq(homeFatigue.gameId, games.id), eq(homeFatigue.teamId, games.homeTeamId))
    )
    .leftJoin(
      awayFatigue,
      and(eq(awayFatigue.gameId, games.id), eq(awayFatigue.teamId, games.awayTeamId))
    )
    .where(eq(games.season, season))
    .orderBy(asc(games.date), asc(games.id));

  return rows.map((r) => ({
    date: String(r.date),
    contextOnly: !r.published,
    status: String(r.status),
    neutralSite: Boolean(r.neutralSite),
    homeTeamId: Number(r.homeTeamId),
    awayTeamId: Number(r.awayTeamId),
    homeFatigueScore: r.homeFatigueScore === null ? null : String(r.homeFatigueScore),
    awayFatigueScore: r.awayFatigueScore === null ? null : String(r.awayFatigueScore),
  }));
}

/** Identifying fields for every team, so disparity rows can be labelled without a second join. */
export async function getTeamDirectory(): Promise<
  { id: number; abbreviation: string; name: string }[]
> {
  const rows = await db
    .select({ id: teams.id, abbreviation: teams.abbreviation, name: teams.name })
    .from(teams);

  return rows.map((r) => ({
    id: Number(r.id),
    abbreviation: String(r.abbreviation),
    name: String(r.name),
  }));
}

// ─── Season Report query ─────────────────────────────────────────

/** Published coverage plus all-season physical context consumed by calendar and Mileage readers. */
export async function getSeasonGamesStamp(season: string): Promise<string> {
  const [row] = await db
    .select({
      scheduled: count(),
      finals: sql<number>`count(*) filter (where ${games.status} = 'final')`,
      latest: max(games.date),
      checksum: sql<string>`coalesce(sum(${games.homeScore}::bigint * 1000 + ${games.awayScore}), 0)::text`,
    })
    .from(games)
    .where(publishableGames(eq(games.season, season)));
  const context = await readGameInputDigest(eq(games.season, season), true);
  return `${row?.scheduled ?? 0}/${Number(row?.finals ?? 0)}` +
    `@${row?.latest ?? "none"}#${row?.checksum ?? "0"}~context-v2:${context}`;
}

/**
 * Every published regular-season target with fatigue and travel through all physical context.
 *
 * LEFT joins and no status filter, unlike `getCompletedGamesWithFatigue`: the progress
 * tile needs a count of the season's scheduled games, so this reads every one of them.
 * `status` is still selected below — completion is decided once, in the reducer
 * (`buildSeasonReport`), so the same rule that says a game without a score or without
 * both fatigue sides contributes to no aggregate also says a `live` game does not, even
 * with both scores already populated. `publishableGames` marks the returned targets while
 * all season rows remain available to locate intervening physical travel.
 */
export async function getSeasonReportRows(season: string): Promise<SeasonReportRow[]> {
  const homeFatigue = latestFatigueLateral(games.homeTeamId, "home_fatigue_season_report");
  const awayFatigue = latestFatigueLateral(games.awayTeamId, "away_fatigue_season_report");
  const homeTeam = alias(teams, "home_team_season_report");
  const awayTeam = alias(teams, "away_team_season_report");

  const rows = await db
    .select({
      gameId: games.id,
      published: sql<boolean>`${publishableGames(eq(games.season, season))}`,
      date: games.date,
      status: games.status,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
      homeAbbr: homeTeam.abbreviation,
      homeLat: homeTeam.latitude,
      homeLon: homeTeam.longitude,
      awayAbbr: awayTeam.abbreviation,
      awayLat: awayTeam.latitude,
      awayLon: awayTeam.longitude,
      neutralSite: games.neutralSite,
      neutralVenueCity: games.neutralVenueCity,
      homeFatigueScore: homeFatigue.score,
      homeIsBackToBack: homeFatigue.isBackToBack,
      homeIsThreeInFour: homeFatigue.isThreeInFour,
      homeHasTimeZoneDisplacement: homeFatigue.hasTimeZoneDisplacement,
      awayFatigueScore: awayFatigue.score,
      awayIsBackToBack: awayFatigue.isBackToBack,
      awayIsThreeInFour: awayFatigue.isThreeInFour,
      awayHasTimeZoneDisplacement: awayFatigue.hasTimeZoneDisplacement,
    })
    .from(games)
    .innerJoin(homeTeam, eq(games.homeTeamId, homeTeam.id))
    .innerJoin(awayTeam, eq(games.awayTeamId, awayTeam.id))
    .leftJoinLateral(homeFatigue, sql`true`)
    .leftJoinLateral(awayFatigue, sql`true`)
    .where(eq(games.season, season))
    // Date-ascending is a contract, not a convenience: the reducer dates its fatigue
    // calendar from the first row it accepts.
    .orderBy(asc(games.date), asc(games.id));

  // Physical context supplies Cup/play-in waypoints without becoming report targets. A target's
  // assigned mileage may include several legs since its previous published appearance.
  const publishedRows = rows.filter(row => row.published);
  const legs = publishedSeasonTravelLegs(
    rows.filter(row => !isHeldGame(row.status)).map((r) => ({
      gameId: Number(r.gameId),
      date: String(r.date),
      homeTeamId: Number(r.homeTeamId),
      awayTeamId: Number(r.awayTeamId),
      homeAbbr: r.homeAbbr,
      awayAbbr: r.awayAbbr,
      homeLat: r.homeLat,
      homeLon: r.homeLon,
      homeAltitude: false,
      awayLat: r.awayLat,
      awayLon: r.awayLon,
      awayAltitude: false,
      overtimePeriods: 0,
      neutralSite: r.neutralSite,
      neutralVenueCity: r.neutralVenueCity,
    })),
    new Set(publishedRows.map(row => Number(row.gameId)))
  );
  const legMiles = (gameId: number, teamId: number) => legs.get(travelLegKey(gameId, teamId)) ?? 0;

  return publishedRows.map((r) => ({
    gameId: Number(r.gameId),
    date: String(r.date),
    status: String(r.status),
    homeTeamId: Number(r.homeTeamId),
    awayTeamId: Number(r.awayTeamId),
    homeScore: r.homeScore === null ? null : Number(r.homeScore),
    awayScore: r.awayScore === null ? null : Number(r.awayScore),
    neutralSite: Boolean(r.neutralSite),
    home:
      r.homeFatigueScore === null
        ? null
        : {
            fatigueScore: String(r.homeFatigueScore),
            travelLegMiles: legMiles(Number(r.gameId), Number(r.homeTeamId)),
            isBackToBack: Boolean(r.homeIsBackToBack),
            isThreeInFour: Boolean(r.homeIsThreeInFour),
            hasTimeZoneDisplacement: Boolean(r.homeHasTimeZoneDisplacement),
          },
    away:
      r.awayFatigueScore === null
        ? null
        : {
            fatigueScore: String(r.awayFatigueScore),
            travelLegMiles: legMiles(Number(r.gameId), Number(r.awayTeamId)),
            isBackToBack: Boolean(r.awayIsBackToBack),
            isThreeInFour: Boolean(r.awayIsThreeInFour),
            hasTimeZoneDisplacement: Boolean(r.awayHasTimeZoneDisplacement),
          },
  }));
}
