import { z } from "zod";
import { jsonRoute, minRAParam, seasonParam } from "@/lib/api-route";
import { getUpcomingGamesWithRA } from "@/lib/db/queries";
import { currentDisplaySeason } from "@/lib/nba-season";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = jsonRoute(
  "api/games/upcoming",
  z.object({ minRA: minRAParam, season: seasonParam.optional() }),
  ({ minRA, season }) => getUpcomingGamesWithRA(season ?? currentDisplaySeason(), minRA)
);
