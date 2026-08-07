import { z } from "zod";
import { CACHE, jsonRoute, seasonParam } from "@/lib/api-route";
import { getShotQualityGrid } from "@/lib/db/queries";
import type { ShotQualityModelVersion, ShotQualityResponse } from "@/types";

export const runtime = "nodejs";

/** DB-backed; do not prerender at build (avoids requiring `DATABASE_URL` during `next build`). */
export const dynamic = "force-dynamic";

/** Stated rather than inherited: Hobby defaults to 10s and caps at 60s. Worst observed cold
 *  read was 4.6s, so this is headroom for a slow refresh, not a budget to grow into. */
export const maxDuration = 30;

const DEFAULT_MODEL: ShotQualityModelVersion = "gbm-v1";

export const GET = jsonRoute(
  "api/shot-quality",
  z.object({
    season: seasonParam,
    /** An optional display hint; the grid itself is model-agnostic. */
    model: z.enum(["gbm-v1", "baseline-zone-v1"]).default(DEFAULT_MODEL),
  }),
  async ({ season, model }): Promise<ShotQualityResponse> => {
    const cells = await getShotQualityGrid(season);

    return {
      season,
      activeModel: model,
      cells,
      meta: {
        cellCount: cells.length,
        totalFga: cells.reduce((sum, c) => sum + c.fga, 0),
      },
    };
  },
  // The grid is rebuilt by the shot-quality pipeline, never by a game going final.
  CACHE.historical
);
