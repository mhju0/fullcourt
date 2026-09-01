import { z } from "zod";
import { CACHE, jsonRoute, minRAParam, seasonParam } from "@/lib/api-route";
import { searchHistoricalGameEvidence } from "@/lib/rest-advantage-evidence-server";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * The one heavy read route that had no cache policy at all (audit, 2026-09-01), for no reason
 * that applied to it. The route fetches the whole matching population and paginates it **in
 * memory** (`rest-advantage-evidence.ts`), so a deep page costs exactly what the first page
 * costs — measured 0.58s for `page=999999` against 0.55s for `page=1`, over ~39,000 rows to
 * return 20. Nothing absorbed a repeat of that. The in-memory pagination itself is left alone
 * deliberately: changing the query shape on a published route is a bigger claim than a cache
 * header, and latency is not a problem today.
 *
 * **`inSeason`, not `historical`, and the distinction is the ordering.** The first draft took
 * `/api/analysis`'s policy on the grounds that both read the same settled backtest population
 * through `searchRegularSeasonGames`. Same population, different exposure: `/api/analysis`
 * returns a forty-one-season aggregate, where last night is invisible inside ~39,000 games,
 * while this route is `orderBy(desc(games.date))` and paginated — so page 1 **is** last night,
 * and `seasonParam` accepts the season in progress once it has a final game. An hour of
 * `s-maxage` plus a day of `stale-while-revalidate` would leave the explorer opening on a list
 * that is missing the most recent slate. That is the same test `/api/games/dates` and
 * `/api/season-report` applied when they chose `inSeason` over `historical` — drift is judged
 * against what the surface shows, not against the size of the table behind it.
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
  CACHE.inSeason
);
