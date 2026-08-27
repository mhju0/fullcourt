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
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
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
import type { DataAsOf } from "@/lib/data-as-of";
import { isProjectedFatigue } from "@/lib/fatigue-provenance";
import type { DisparityGameRow } from "@/lib/schedule-disparity";
import type { SeasonReportRow } from "@/lib/season-report";
import { ABNORMAL_STRETCHES } from "@/lib/season-regime";
import {
  formatEasternDateKey,
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
    .orderBy(fatigueScores.gameId, fatigueScores.teamId, desc(fatigueScores.computedAt))
    .as(alias);
}

/**
 * Same rows as `latestFatigueSubquery`, one index seek per game/side instead of
 * deduplicating the whole `fatigue_scores` table. `computed_at DESC` is the only
 * tie-break — do not add a secondary sort key, or the two stop agreeing.
 */
function latestFatigueLateral(
  teamIdColumn: typeof games.homeTeamId | typeof games.awayTeamId,
  subqueryAlias: string
) {
  return db
    .select(FATIGUE_COLUMNS)
    .from(fatigueScores)
    .where(and(eq(fatigueScores.gameId, games.id), eq(fatigueScores.teamId, teamIdColumn)))
    .orderBy(desc(fatigueScores.computedAt))
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
 * - `getTeamGameCountsInDaysBefore` and `computeIs4In6Map` — they count physical schedule load,
 *   not publishable rows, and must stay consistent with `fatigue-recent-games.ts`, which is also
 *   unfiltered. Filtering one side would put two contradictory density figures on the same card.
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
    // The pre-LATERAL query had no ORDER BY, but its plan happened to emit rows in
    // away-team-id order and the home page renders cards in array order. Pin that
    // order so the rewrite is response-identical. A team plays at most one game per
    // date, so away_team_id is a unique sort key here.
    .orderBy(asc(games.awayTeamId));
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
 * One scalar answers "is this game's fatigue projected?" for every game in the season — see
 * `src/lib/fatigue-provenance.ts` for why that reduction is sound. Cheap: `games_date_idx` and
 * `games_status_idx` both exist, and it reads one row.
 */
export async function getFirstUnplayedDate(season: string): Promise<string | null> {
  const [row] = await db
    .select({ first: min(games.date) })
    .from(games)
    .where(publishableGames(and(eq(games.season, season), ne(games.status, "final"))));

  return row?.first ? String(row.first) : null;
}

async function toGameResponses(rows: GameFatigueJoinRow[]): Promise<GameResponse[]> {
  if (rows.length === 0) return [];

  const date = String(rows[0].date);
  const teamIds = rows.flatMap((r) => [r.homeTeamId, r.awayTeamId]);
  // Every row here shares one date, so it shares one season, so one scalar covers them all.
  const [is4In6Map, games30Map, firstUnplayed] = await Promise.all([
    computeIs4In6Map(date, teamIds),
    getTeamGameCountsInDaysBefore(date, teamIds, 30),
    getFirstUnplayedDate(String(rows[0].season)),
  ]);
  const projectedFatigue = isProjectedFatigue(date, firstUnplayed);

  return rows.map((row) => ({
    ...mapJoinedRowToGameResponse(row, is4In6Map, games30Map),
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
 * Everything about one game except its fatigue provenance, which is a property of the season's
 * progress rather than of the row — `toGameResponses` adds it, and the `Omit` is what stops a
 * future caller assembling a `GameResponse` without deciding the question.
 */
function mapJoinedRowToGameResponse(
  row: GameFatigueJoinRow,
  is4In6Map: Map<number, boolean>,
  games30Map: Map<number, number>
): Omit<GameResponse, "projectedFatigue"> {
  const homeFatigueData = buildFatigueInfo(
    readFatigueSide(row, "home"),
    {
      gamesInLast30Days: games30Map.get(row.homeTeamId) ?? 0,
      is4In6: is4In6Map.get(row.homeTeamId) ?? false,
      roadTripConsecutiveAway: row.homeRoadTripConsecutiveAway ?? 0,
      hasTimeZoneDisplacement: row.homeHasTimeZoneDisplacement ?? false,
    },
    {
      side: "home",
      homeTeamCity: row.homeTeamCity,
      homeAltitudeFlag: row.homeTeamAltitude,
    }
  );

  const awayFatigueData = buildFatigueInfo(
    readFatigueSide(row, "away"),
    {
      gamesInLast30Days: games30Map.get(row.awayTeamId) ?? 0,
      is4In6: is4In6Map.get(row.awayTeamId) ?? false,
      roadTripConsecutiveAway: row.awayRoadTripConsecutiveAway ?? 0,
      hasTimeZoneDisplacement: row.awayHasTimeZoneDisplacement ?? false,
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

/**
 * A cheap stand-in for "has the backtest input changed?".
 *
 * The backtest reads every final regular-season game, so its answer can only move when one
 * more game goes final or a score is corrected. Reading this costs one aggregate over an
 * index scan rather than ~46k joined rows.
 *
 * **The third term is the score correction, and it was missing until 2026-08-27.** The stamp
 * was `count@maxDate`, and its docblock claimed both causes "show up in this pair" — they do
 * not. A corrected score on a game that is already final moves neither term, and
 * `diffScoreboard` writes exactly that: it refuses a status *downgrade*
 * (`src/lib/espn-scoreboard.ts`) and writes everything else, corrections included. In season
 * the next night's games move the count and mask it; a correction to a season's last games
 * has nothing behind it, so the held backtest survived until October. Found by rehearsing the
 * 2026-27 boundary rather than by anything going wrong.
 *
 * `home * 1000 + away` rather than a plain sum, so that a correction which swaps the two
 * scores still moves the term. It is a checksum and not a hash: two corrections that offset
 * exactly would hide each other. That is a far narrower hole than the one it closes, and
 * closing it completely needs an `updated_at` column, which is a schema change.
 *
 * Filtered by the same rule as the query it stands in for. It counted 88 bubble games the
 * backtest never reads, which did not make the stamp wrong — only a description of a different
 * population than the one it keys.
 */
export async function getCompletedGamesStamp(): Promise<string> {
  const { finalGames, latestFinalDate, scoreChecksum } = await readFinalGamesFacts();

  return `${finalGames}@${latestFinalDate ?? "none"}#${scoreChecksum}`;
}

/**
 * The one read behind both the stamp above and the published figure below.
 *
 * Kept as a single function rather than two queries for the reason the delegation always
 * existed: the key and the figure must describe one population, and two queries can drift.
 * The stamp needs a term the page must never print, so the split is here — at what each
 * caller takes from the row — instead of at the database.
 */
async function readFinalGamesFacts(): Promise<DataAsOf & { scoreChecksum: string }> {
  const [row] = await db
    .select({
      finals: count(),
      latest: max(games.date),
      checksum: sql<string>`coalesce(sum(${games.homeScore}::bigint * 1000 + ${games.awayScore}), 0)::text`,
    })
    .from(games)
    .where(publishableGames(eq(games.status, "final")));

  return {
    finalGames: Number(row?.finals ?? 0),
    latestFinalDate: row?.latest ? String(row.latest) : null,
    scoreChecksum: String(row?.checksum ?? "0"),
  };
}

/**
 * The same read as the stamp above, as a value a page can publish.
 *
 * Split out on 2026-08-18 for the "as of" surface stamp (docs/UIUX_CHECKLIST.md §5). The
 * stamp string is a cache key — `"46201@2026-04-13"` — and parsing a cache key back into a
 * date to print it would make the display depend on a format nothing promises to keep. One
 * query, two readers: the key is built from this, so the figure a page shows and the key
 * that held it can never describe different populations.
 */
export async function getDataAsOf(): Promise<DataAsOf> {
  const { finalGames, latestFinalDate } = await readFinalGamesFacts();

  return { finalGames, latestFinalDate };
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
  const dRest = daysSinceLastGame;
  const is3In4Approx =
    g7 >= 3 && dRest !== null && dRest <= 2;

  const altitudePenalty = fatigue.altitudeMultiplier > 1.0;
  const altitudeArenaLabel =
    ctx.side === "away" && altitudePenalty && ctx.homeAltitudeFlag
      ? `${ctx.homeTeamCity} (altitude)`
      : null;

  return {
    score,
    isBackToBack: isBackToBack ?? false,
    is3In4: is3In4Approx,
    travelDistanceMiles: fatigue.travelDistanceMiles,
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

  // ET, not server-local: games.date stores ET dates and this runs on Vercel (UTC).
  const todayStr = formatEasternDateKey();

  const conditions = [
    publishableGames(),
    eq(games.season, season),
    eq(games.status, "scheduled"),
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
    projectedFatigue: isProjectedFatigue(String(r.date), firstUnplayed),
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

// ─── Schedule Disparity query ───────────────────────────────────

/**
 * One season's regular-season games with both sides' latest fatigue score, for Schedule
 * Disparity. Rest days are NOT selected here: the module derives them from the game dates
 * themselves, because `fatigue_scores.days_since_last_game` goes stale when games are inserted
 * into a published schedule. See docs/adr/0001-derive-rest-days-from-games.md.
 *
 * Unplayed games are included on purpose — the module reports on schedules before they are
 * played — so both fatigue scores are nullable.
 *
 * `publishableGames` is a no-op here in practice: 2019-20 is the only abnormal stretch and
 * Schedule Edge already withholds that season as truncated. It applies anyway, so the module
 * does not depend on a second rule staying in place to get the first one right.
 */
export async function getRegularSeasonScheduleForDisparity(
  season: string
): Promise<DisparityGameRow[]> {
  const homeFatigue = latestFatigueSubquery("home_fatigue_disparity");
  const awayFatigue = latestFatigueSubquery("away_fatigue_disparity");

  const rows = await db
    .select({
      date: games.date,
      status: games.status,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      homeFatigueScore: homeFatigue.score,
      awayFatigueScore: awayFatigue.score,
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
    .where(publishableGames(eq(games.season, season)))
    .orderBy(asc(games.date), asc(games.id));

  return rows.map((r) => ({
    date: String(r.date),
    status: String(r.status),
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

/**
 * A cheap stand-in for "has this season's report changed?".
 *
 * Deliberately not `getCompletedGamesStamp`, which counts only final games. That stamp is
 * exact for the backtest, whose inputs are only final games, and wrong for a reader that
 * also reads scheduled ones: from the 1 October season-list rollover until opening night
 * roughly three weeks later, nothing is final, so a freshly-seeded schedule never moved it
 * and `/season` served `0 / 0` off a cache that could not invalidate.
 *
 * Four components, because four different things change the report. The row count moves when a
 * season is seeded, the final count as it is played, the latest date when a game is rescheduled,
 * and the checksum when a score is corrected on a game that was already final — which moves none
 * of the other three. See `getCompletedGamesStamp` for why that last one is not hypothetical.
 *
 * A game going *live* deliberately moves nothing. `buildSeasonReport` and
 * `computeScheduleDisparity` both treat a live game as incomplete even when it already carries
 * both scores, so the held value is still the right answer and rebuilding it would be waste.
 *
 * Same population as `getSeasonReportRows` below — a stamp that keys a different set of rows
 * than the query it stands in for is the bug this replaces.
 */
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

  return (
    `${row?.scheduled ?? 0}/${Number(row?.finals ?? 0)}` +
    `@${row?.latest ?? "none"}#${row?.checksum ?? "0"}`
  );
}

/**
 * Every regular-season game in one season with both sides' latest fatigue row.
 *
 * LEFT joins and no status filter, unlike `getCompletedGamesWithFatigue`: the progress
 * tile needs a count of the season's scheduled games, so this reads every one of them.
 * `status` is still selected below — completion is decided once, in the reducer
 * (`buildSeasonReport`), so the same rule that says a game without a score or without
 * both fatigue sides contributes to no aggregate also says a `live` game does not, even
 * with both scores already populated. `publishableGames` still applies — the 2019-20
 * bubble is not games anyone travelled to.
 */
export async function getSeasonReportRows(season: string): Promise<SeasonReportRow[]> {
  const homeFatigue = latestFatigueLateral(games.homeTeamId, "home_fatigue_season_report");
  const awayFatigue = latestFatigueLateral(games.awayTeamId, "away_fatigue_season_report");

  const rows = await db
    .select({
      gameId: games.id,
      date: games.date,
      status: games.status,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
      homeFatigueScore: homeFatigue.score,
      homeTravelDistanceMiles: homeFatigue.travelDistanceMiles,
      homeIsBackToBack: homeFatigue.isBackToBack,
      homeIsThreeInFour: homeFatigue.isThreeInFour,
      homeHasTimeZoneDisplacement: homeFatigue.hasTimeZoneDisplacement,
      awayFatigueScore: awayFatigue.score,
      awayTravelDistanceMiles: awayFatigue.travelDistanceMiles,
      awayIsBackToBack: awayFatigue.isBackToBack,
      awayIsThreeInFour: awayFatigue.isThreeInFour,
      awayHasTimeZoneDisplacement: awayFatigue.hasTimeZoneDisplacement,
    })
    .from(games)
    .leftJoinLateral(homeFatigue, sql`true`)
    .leftJoinLateral(awayFatigue, sql`true`)
    .where(publishableGames(eq(games.season, season)))
    // Date-ascending is a contract, not a convenience: the reducer dates its fatigue
    // calendar from the first row it accepts.
    .orderBy(asc(games.date), asc(games.id));

  return rows.map((r) => ({
    gameId: Number(r.gameId),
    date: String(r.date),
    status: String(r.status),
    homeTeamId: Number(r.homeTeamId),
    awayTeamId: Number(r.awayTeamId),
    homeScore: r.homeScore === null ? null : Number(r.homeScore),
    awayScore: r.awayScore === null ? null : Number(r.awayScore),
    home:
      r.homeFatigueScore === null
        ? null
        : {
            fatigueScore: String(r.homeFatigueScore),
            travelDistanceMiles: String(r.homeTravelDistanceMiles),
            isBackToBack: Boolean(r.homeIsBackToBack),
            isThreeInFour: Boolean(r.homeIsThreeInFour),
            hasTimeZoneDisplacement: Boolean(r.homeHasTimeZoneDisplacement),
          },
    away:
      r.awayFatigueScore === null
        ? null
        : {
            fatigueScore: String(r.awayFatigueScore),
            travelDistanceMiles: String(r.awayTravelDistanceMiles),
            isBackToBack: Boolean(r.awayIsBackToBack),
            isThreeInFour: Boolean(r.awayIsThreeInFour),
            hasTimeZoneDisplacement: Boolean(r.awayHasTimeZoneDisplacement),
          },
  }));
}
