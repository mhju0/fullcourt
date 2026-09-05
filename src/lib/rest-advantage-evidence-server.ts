import {
  getCompletedGamesStamp,
  getCompletedGamesWithFatigue,
  searchRegularSeasonGames,
} from "@/lib/db/queries";
import {
  buildHistoricalBacktest,
  buildHistoricalGameSearch,
  type HistoricalGameSearchFilters,
  type HistoricalGameSearchOptions,
} from "@/lib/rest-advantage-evidence";
import { createStampedCache } from "@/lib/stamped-cache";
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

/**
 * The backtest is expensive and rarely different: it reads every final
 * regular-season game with fatigue on both sides — tens of thousands of rows,
 * no LIMIT — and reduces them in JS. Its interface hid that, so callers treated
 * it as a getter and asked for it once per surface.
 *
 * The result is held until a game goes final. `getCompletedGamesStamp` ignores the
 * key because the population does not depend on it — one stamp covers every
 * threshold. Entries are per `seasonMinRA` because that is the only input, and the
 * cache is bounded because that input arrives from a query string.
 */
const MAX_CACHED_THRESHOLDS = 16;

export const getHistoricalBacktest = createStampedCache<number, AnalysisResponse>({
  readStamp: getCompletedGamesStamp,
  load: async (seasonMinRA) =>
    buildHistoricalBacktest(await getCompletedGamesWithFatigue(), seasonMinRA),
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
  const rows = await searchRegularSeasonGames({
    minRA: request.minRA !== undefined && request.minRA > 0 ? request.minRA : undefined,
    team: request.team,
    season: request.season,
  });
  return buildHistoricalGameSearch(rows, request);
}
