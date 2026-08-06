import { z } from "zod";
import { jsonRoute, seasonParam } from "@/lib/api-route";
import { getPlayoffSeriesWithPredictions } from "@/lib/db/queries";
import { currentDisplaySeason } from "@/lib/nba-season";
import { buildPlayoffBracket } from "@/lib/playoff-bracket";
import type { PlayoffsResponse } from "@/types";

export const runtime = "nodejs";

/** DB-backed; do not prerender at build (avoids requiring `DATABASE_URL` during `next build`). */
export const dynamic = "force-dynamic";

export const GET = jsonRoute(
  "api/playoffs",
  z.object({ season: seasonParam.optional() }),
  async ({ season = currentDisplaySeason() }): Promise<PlayoffsResponse> =>
    buildPlayoffBracket(season, await getPlayoffSeriesWithPredictions(season))
);
