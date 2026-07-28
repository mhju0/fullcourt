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
 * The result is held here until a game goes final. Entries are per `seasonMinRA`
 * because that is the only input; the map is bounded because that input arrives
 * from a query string.
 */
const MAX_CACHED_THRESHOLDS = 16;
let cache: { stamp: string; byMinRA: Map<number, AnalysisResponse> } | null = null;

/** Complete server-side historical backtest operation, including retrieval. */
export async function getHistoricalBacktest(
  seasonMinRA: number
): Promise<AnalysisResponse> {
  const stamp = await getCompletedGamesStamp();
  if (cache === null || cache.stamp !== stamp) {
    cache = { stamp, byMinRA: new Map() };
  }

  const hit = cache.byMinRA.get(seasonMinRA);
  if (hit !== undefined) return hit;

  const rows = await getCompletedGamesWithFatigue();
  const response = buildHistoricalBacktest(rows, seasonMinRA);

  if (cache.byMinRA.size >= MAX_CACHED_THRESHOLDS) cache.byMinRA.clear();
  cache.byMinRA.set(seasonMinRA, response);

  return response;
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
