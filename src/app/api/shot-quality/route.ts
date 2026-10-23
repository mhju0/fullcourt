import { z } from "zod";
import { CACHE, jsonRoute, seasonParam } from "@/lib/api-route";
import {
  getLatestPublishedShotQualitySeason,
  getShotQualityGrid,
} from "@/lib/db/queries";
import { getCurrentShotQualitySnapshot, parseCurrentShotQualityArtifact, shotQualityPublication } from "@/lib/shot-quality-publication";
import { defaultNbaSeason } from "@/lib/nba-season";
import { readDailyDataset } from "@/lib/daily-publication-server";
import { PublicApiError } from "@/lib/api-errors";
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
    season: seasonParam.optional(),
    /** An optional display hint; the grid itself is model-agnostic. */
    model: z.enum(["gbm-v1", "baseline-zone-v1"]).default(DEFAULT_MODEL),
  }),
  async ({ season, model }): Promise<ShotQualityResponse> => {
    const daily = await readDailyDataset("shotQuality");
    const parsedSnapshot = parseCurrentShotQualityArtifact(daily.data);
    const candidate = parsedSnapshot ?? getCurrentShotQualitySnapshot();
    const snapshot = candidate?.season === defaultNbaSeason() ? candidate : null;
    const databaseLatest = await getLatestPublishedShotQualitySeason().catch(error => { if (snapshot) return null; throw error; });
    const latestPublishedSeason = [databaseLatest, snapshot?.season].filter((s): s is string => Boolean(s)).sort().at(-1);
    if (!latestPublishedSeason) {
      throw new PublicApiError("Expected shot value data is not available yet.", 503);
    }
    const selectedSeason = season ?? latestPublishedSeason;
    // Sequential: one connection in production (pool.ts).
    const selectedSnapshot = snapshot?.season === selectedSeason ? snapshot : null;
    const cells = selectedSnapshot?.cells ?? await getShotQualityGrid(selectedSeason);
    const previousPublishedSeason = await getLatestPublishedShotQualitySeason(latestPublishedSeason).catch(error => { if (selectedSnapshot) return null; throw error; });

    return {
      season: selectedSeason,
      latestPublishedSeason,
      previousPublishedSeason,
      activeModel: model,
      cells,
      meta: {
        cellCount: cells.length,
        totalFga: cells.reduce((sum, c) => sum + c.fga, 0),
        publication: { ...shotQualityPublication(cells, selectedSnapshot), checkedAt: daily.checkedAt, updateStatus: daily.data !== null && !parsedSnapshot ? "failed" : daily.status },
      },
    };
  },
  // A validated daily snapshot can publish raw attempts independently of historical surfaces.
  CACHE.inSeason
);
