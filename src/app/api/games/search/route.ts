import { z } from "zod";
import { CACHE, jsonRoute, minRAParam, seasonParam } from "@/lib/api-route";
import { searchHistoricalGameEvidence } from "@/lib/rest-advantage-evidence-server";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * The one heavy read route that had no cache policy (audit, 2026-09-01), for no reason that
 * applied to it: it reads the same settled backtest population `/api/analysis` does, through
 * the same `searchRegularSeasonGames`, and forty-one seasons of it move only when the pipeline
 * runs. So it takes `/api/analysis`'s claim, `historical`.
 *
 * It matters more here than there. The route fetches the whole matching population and
 * paginates it **in memory** (`rest-advantage-evidence.ts`), so a deep page costs exactly what
 * the first page costs — measured 0.58s for `page=999999` against 0.55s for `page=1`, over
 * 39,016 rows to return 20. Nothing absorbed a repeat of that. The in-memory pagination itself
 * is left alone deliberately: changing the query shape on a published route is a bigger claim
 * than a cache header, and latency is not a problem today.
 */
export const GET = jsonRoute(
  "api/games/search",
  z.object({
    minRA: minRAParam,
    team: z.string().regex(/^[A-Z]{2,3}$/, "Team must be a 2-3 letter abbreviation").optional(),
    season: seasonParam.optional(),
    result: z.enum(["all", "correct", "incorrect"]).default("all"),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  }),
  searchHistoricalGameEvidence,
  CACHE.historical
);
