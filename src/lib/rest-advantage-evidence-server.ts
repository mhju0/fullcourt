import {
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

/** Complete server-side historical backtest operation, including retrieval. */
export async function getHistoricalBacktest(
  seasonMinRA: number
): Promise<AnalysisResponse> {
  const rows = await getCompletedGamesWithFatigue();
  return buildHistoricalBacktest(rows, seasonMinRA);
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
