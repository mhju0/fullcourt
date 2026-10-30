import {
  getCompletedGamesStamp,
  getCompletedGamesWithFatigue,
  getCompletedGamesWithFatigueCoverage,
  getIncompleteRegularSeasonSeasons,
  getIncompleteRegularSeasonSeasonsStamp,
  searchRegularSeasonGames,
} from "@/lib/db/queries";
import {
  buildHistoricalBacktest,
  buildHistoricalGameSearch,
  gapRangeByKey,
  type HistoricalGameEvidenceRow,
  type HistoricalGameSearchFilters,
  type HistoricalGameSearchOptions,
  type HistoricalGameSearchRow,
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

/**
 * The backtest is expensive and rarely different: it reads every final
 * regular-season game with fatigue on both sides — tens of thousands of rows,
 * no LIMIT — and reduces them in JS. Its interface hid that, so callers treated
 * it as a getter and asked for it once per surface.
 *
 * The rows are held once, behind the stamp that covers them, and every threshold is
 * built from that one read. Holding per-threshold answers instead meant each
 * new `seasonMinRA` from the query string re-ran the read (review, 2026-10-21). The pending
 * season set has its own stamp, so a season closing rebuilds the answer without re-reading
 * the games.
 */
const readCompletedRows = createStampedCache<"all", HistoricalGameEvidenceRow[]>({
  readStamp: getCompletedGamesStamp,
  maxAgeMs: ORIGIN_CACHE_MAX_AGE.inSeason,
  load: () => getCompletedGamesWithFatigue(),
  maxEntries: 1,
});

const readIncompleteSeasons = createStampedCache<"all", Set<string>>({
  readStamp: getIncompleteRegularSeasonSeasonsStamp,
  maxAgeMs: ORIGIN_CACHE_MAX_AGE.inSeason,
  load: () => getIncompleteRegularSeasonSeasons(),
  maxEntries: 1,
});

/** Built answers per held read; bounded because the threshold arrives from a query string. */
const MAX_CACHED_THRESHOLDS = 16;
const builtBacktests = new WeakMap<
  HistoricalGameEvidenceRow[],
  WeakMap<Set<string>, Map<number, AnalysisResponse>>
>();

export async function getHistoricalBacktest(seasonMinRA: number): Promise<AnalysisResponse> {
  const rows = await readCompletedRows("all");
  // Sequential: one connection in production (pool.ts).
  const incompleteSeasons = await readIncompleteSeasons("all");
  let byPending = builtBacktests.get(rows);
  if (!byPending) builtBacktests.set(rows, (byPending = new WeakMap()));
  let byThreshold = byPending.get(incompleteSeasons);
  if (!byThreshold) byPending.set(incompleteSeasons, (byThreshold = new Map()));
  const hit = byThreshold.get(seasonMinRA);
  if (hit) return hit;
  if (byThreshold.size >= MAX_CACHED_THRESHOLDS) byThreshold.clear();
  const built = buildHistoricalBacktest(rows, seasonMinRA, incompleteSeasons);
  byThreshold.set(seasonMinRA, built);
  return built;
}

/** Coverage includes neutral sites, which the home-court venue baseline excludes. */
export async function getHistoricalEvidenceCoverage() {
  return getCompletedGamesWithFatigueCoverage();
}

/**
 * The explorer's rows per SQL filter, behind the same stamp as the backtest's population.
 * Paging, result, side and exact gap bounds are applied in memory, so they share one read.
 * Bounded because team, season and threshold arrive from a query string.
 */
const readSearchRows = createStampedCache<string, HistoricalGameSearchRow[]>({
  readStamp: () => getCompletedGamesStamp(),
  maxAgeMs: ORIGIN_CACHE_MAX_AGE.inSeason,
  load: (key) => searchRegularSeasonGames(JSON.parse(key) as HistoricalGameSearchFilters),
  maxEntries: 32,
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
  const filters: HistoricalGameSearchFilters = {
    minRA: floor > 0 ? floor : undefined,
    team: request.team,
    season: request.season,
  };
  const rows = await readSearchRows(JSON.stringify(filters));
  return buildHistoricalGameSearch(rows, request);
}
