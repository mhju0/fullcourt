import { z } from "zod";
import { browsableSeasonParam, CACHE, jsonRoute, minRAParam } from "@/lib/api-route";
import { getUpcomingGamesWithRA } from "@/lib/db/queries";
import { defaultNbaSeason } from "@/lib/nba-season";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = jsonRoute(
  "api/games/upcoming",
  // `browsableSeasonParam`, not `seasonParam`: a released-but-unplayed season is exactly the
  // one whose games are upcoming, and `seasonParam` validates against NBA_SEASONS, which by
  // design excludes it until October. Evaluated per request — see api-route.ts.
  z.object({ minRA: minRAParam, season: browsableSeasonParam.optional(), limit: z.coerce.number().int().min(3).max(30).optional(), order: z.enum(["strongest", "soonest"]).optional() }),
  ({ minRA, season, limit, order }) => order !== undefined
    ? getUpcomingGamesWithRA(season ?? defaultNbaSeason(), minRA, limit, order)
    : limit === undefined
    ? getUpcomingGamesWithRA(season ?? defaultNbaSeason(), minRA)
    : getUpcomingGamesWithRA(season ?? defaultNbaSeason(), minRA, limit),
  // Not a live-score read: it changes when the nightly job rescores or a game tips, so a minute
  // at the edge only delays a game dropping off the list.
  CACHE.inSeason
);
