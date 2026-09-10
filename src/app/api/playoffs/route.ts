import { z } from "zod";
import { CACHE, jsonRoute, seasonParam } from "@/lib/api-route";
import {
  getLatestPublishedPlayoffSeason,
  getPlayoffSeriesWithPredictions,
} from "@/lib/db/queries";
import { PublicApiError } from "@/lib/api-errors";
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
  async ({ season }): Promise<PlayoffsResponse> => {
    const latestPublishedSeason = await getLatestPublishedPlayoffSeason();
    if (!latestPublishedSeason) {
      throw new PublicApiError("Playoff data is not available yet.", 503);
    }
    const selectedSeason = season ?? latestPublishedSeason;
    return {
      ...buildPlayoffBracket(
        selectedSeason,
        await getPlayoffSeriesWithPredictions(selectedSeason)
      ),
      latestPublishedSeason,
    };
  },
  CACHE.inSeason
);
