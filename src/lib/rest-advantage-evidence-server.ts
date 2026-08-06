import {
  getCompletedGamesStamp,
  getCompletedGamesWithFatigue,
  searchRegularSeasonGames,
} from "@/lib/db/queries";
import {
  buildHistoricalBacktest,
  buildHistoricalGameSearch,
  type HistoricalGameSearchOptions,
} from "@/lib/rest-advantage-evidence";
import { createStampedCache } from "@/lib/stamped-cache";
import type { AnalysisResponse, GameSearchResponse } from "@/types";

export type HistoricalGameSearchRequest = HistoricalGameSearchOptions & {
  minRA?: number;
  team?: string;
  season?: string;
};

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

const backtest = createStampedCache<number, AnalysisResponse>({
  readStamp: () => getCompletedGamesStamp(),
  load: async (seasonMinRA) =>
    buildHistoricalBacktest(await getCompletedGamesWithFatigue(), seasonMinRA),
  maxEntries: MAX_CACHED_THRESHOLDS,
});

/** Complete server-side historical backtest operation, including retrieval. */
export function getHistoricalBacktest(
  seasonMinRA: number
): Promise<AnalysisResponse> {
  return backtest(seasonMinRA);
}

/** Complete server-side game-explorer operation, including retrieval. */
export async function searchHistoricalGameEvidence(
  request: HistoricalGameSearchRequest
): Promise<GameSearchResponse> {
  const rows = await searchRegularSeasonGames({
    minRA: request.minRA,
    team: request.team,
    season: request.season,
  });
  return buildHistoricalGameSearch(rows, request);
}
