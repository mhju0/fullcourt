import {
  getCompletedGamesStamp,
  getCompletedGamesWithFatigue,
  getIncompleteRegularSeasonSeasons,
  getIncompleteRegularSeasonSeasonsStamp,
  searchRegularSeasonGames,
} from "@/lib/db/queries";
import {
  buildHistoricalBacktest,
  buildHistoricalGameSearch,
  gapRangeByKey,
  type HistoricalGameSearchFilters,
  type HistoricalGameSearchOptions,
} from "@/lib/rest-advantage-evidence";
import { createStampedCache, ORIGIN_CACHE_MAX_AGE } from "@/lib/stamped-cache";
import type { AnalysisResponse, GameSearchResponse } from "@/types";

/**
 * Everything a reader asked of the game explorer: what to narrow to, and how to page it.
 *
 * One type rather than two arguments, because the caller is a route handing over a
 * validated query string and has no reason to know which half reaches SQL. Splitting them
 * is this module's job.
 */
export type HistoricalGameSearchRequest = HistoricalGameSearchFilters &
  HistoricalGameSearchOptions;

async function getHistoricalBacktestStamp(): Promise<string> {
  const completed = await getCompletedGamesStamp();
  const incomplete = await getIncompleteRegularSeasonSeasonsStamp();
  return `${completed}|pending=${incomplete}`;
}

/**
 * The backtest is expensive and rarely different: it reads every final
 * regular-season game with fatigue on both sides — tens of thousands of rows,
 * no LIMIT — and reduces them in JS. Its interface hid that, so callers treated
 * it as a getter and asked for it once per surface.
 *
 * The content/revision fingerprint detects corrections; max age also bounds cache lifetime.
 * `getCompletedGamesStamp` ignores the
 * key because the population does not depend on it — one stamp covers every
 * threshold. Entries are per `seasonMinRA` because that is the only input, and the
 * cache is bounded because that input arrives from a query string.
 */
const MAX_CACHED_THRESHOLDS = 16;

export const getHistoricalBacktest = createStampedCache<number, AnalysisResponse>({
  readStamp: getHistoricalBacktestStamp,
  maxAgeMs: ORIGIN_CACHE_MAX_AGE.inSeason,
  load: async (seasonMinRA) => {
    const rows = await getCompletedGamesWithFatigue();
    // Keep the cheap completion read sequential. Hosted production has one database connection
    // slot, so two reads in parallel can turn healthy queries into a timeout.
    const incompleteSeasons = await getIncompleteRegularSeasonSeasons();
    return buildHistoricalBacktest(rows, seasonMinRA, incompleteSeasons);
  },
  maxEntries: MAX_CACHED_THRESHOLDS,
});

/**
 * Complete server-side game-explorer operation, including retrieval.
 *
 * `minRA` of 0 is normalized to "no floor" here rather than at the route. It arrives as 0
 * because `minRAParam` defaults it there, and 0 is not a threshold a reader can mean — the
 * query already discards neutral games below `NEUTRAL_REST_ADVANTAGE_THRESHOLD`, so asking
 * for `>= 0` and asking for no floor return the same rows. The route was translating this
 * before calling, which put a rule about what rest-advantage values mean in a file whose
 * job is parsing a query string.
 */
export async function searchHistoricalGameEvidence(
  request: HistoricalGameSearchRequest
): Promise<GameSearchResponse> {
  // A gap range narrows the query to just under its floor: the SQL compares the unrounded
  // scores, and a gap of 2.996 rounds to 3.00 (D-87), so it must still arrive. The exact bounds
  // and the side are applied to the rounded gap in `buildHistoricalGameSearch`, as the backtest
  // counts them.
  const gapFloor = request.gap ? gapRangeByKey(request.gap).min - 0.01 : 0
  const floor = Math.max(request.minRA ?? 0, gapFloor)
  const rows = await searchRegularSeasonGames({
    minRA: floor > 0 ? floor : undefined,
    team: request.team,
    season: request.season,
  });
  return buildHistoricalGameSearch(rows, request);
}
