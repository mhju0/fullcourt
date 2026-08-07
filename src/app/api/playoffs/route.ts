import { z } from "zod";
import { CACHE, jsonRoute, seasonParam } from "@/lib/api-route";
import { getPlayoffSeriesWithPredictions } from "@/lib/db/queries";
import { currentDisplaySeason } from "@/lib/nba-season";
import { buildPlayoffBracket } from "@/lib/playoff-bracket";
import type { PlayoffsResponse } from "@/types";

export const runtime = "nodejs";

/** DB-backed; do not prerender at build (avoids requiring `DATABASE_URL` during `next build`). */
export const dynamic = "force-dynamic";

/** Stated rather than inherited: Hobby defaults to 10s and caps at 60s. Worst observed cold
 *  read was 4.6s, so this is headroom for a slow refresh, not a budget to grow into. */
export const maxDuration = 30;

// `inSeason`: defaults to the current season, and a bracket moves game by game while a series
// is live. An hour of edge drift would show a series at the wrong count.
export const GET = jsonRoute(
  "api/playoffs",
  z.object({ season: seasonParam.optional() }),
  async ({ season = currentDisplaySeason() }): Promise<PlayoffsResponse> =>
    buildPlayoffBracket(season, await getPlayoffSeriesWithPredictions(season)),
  CACHE.inSeason
);
