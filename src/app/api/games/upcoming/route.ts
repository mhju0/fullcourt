import { z } from "zod";
import { browsableSeasonParam, jsonRoute, minRAParam } from "@/lib/api-route";
import { getUpcomingGamesWithRA } from "@/lib/db/queries";
import { defaultNbaSeason } from "@/lib/nba-season";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = jsonRoute(
  "api/games/upcoming",
  // `browsableSeasonParam`, not `seasonParam`: a released-but-unplayed season is exactly the
  // one whose games are upcoming, and `seasonParam` validates against NBA_SEASONS, which by
  // design excludes it until October. Evaluated per request — see api-route.ts.
  z.object({ minRA: minRAParam, season: browsableSeasonParam.optional() }),
  ({ minRA, season }) => getUpcomingGamesWithRA(season ?? defaultNbaSeason(), minRA)
);
