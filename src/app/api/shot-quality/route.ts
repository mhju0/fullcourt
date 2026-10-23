import { z } from "zod";
import { CACHE, jsonRoute, seasonParam } from "@/lib/api-route";
import {
  getLatestPublishedShotQualitySeason,
  getShotQualityGrid,
} from "@/lib/db/queries";
import { getCurrentShotQualitySnapshot, parseCurrentShotQualityArtifact, shotQualityPublication } from "@/lib/shot-quality-publication";
import { currentDisplaySeason } from "@/lib/nba-season";
import type { DailyDatasetResult } from "@/lib/daily-publication";
import { readDailyDatasetHistory } from "@/lib/daily-publication-server";
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
    const history = await readDailyDatasetHistory("shotQuality");
    const daily = history.at(-1);
    const currentSeason = currentDisplaySeason();
    const parsePublication = (item: DailyDatasetResult) => {
      const snapshot = parseCurrentShotQualityArtifact(item.data);
      return snapshot && (!item.season || item.season === snapshot.season) && snapshot.season <= currentSeason ? snapshot : null;
    };
    const snapshots = new Map<string, NonNullable<ReturnType<typeof parseCurrentShotQualityArtifact>>>();
    for (const candidate of [getCurrentShotQualitySnapshot(), ...history.map(parsePublication)]) {
      if (!candidate || candidate.season > currentSeason) continue;
      const previous = snapshots.get(candidate.season);
      if (!previous || Date.parse(candidate.generatedAt) > Date.parse(previous.generatedAt)) snapshots.set(candidate.season, candidate);
    }
    const databaseLatest = await getLatestPublishedShotQualitySeason().catch(error => { if (snapshots.size) return null; throw error; });
    const latestPublishedSeason = [databaseLatest, ...snapshots.keys()].filter((s): s is string => Boolean(s)).sort().at(-1);
    if (!latestPublishedSeason) {
      throw new PublicApiError("Expected shot value data is not available yet.", 503);
    }
    const selectedSeason = season ?? latestPublishedSeason;
    let selectedSnapshot = snapshots.get(selectedSeason) ?? null;
    // Historical models take precedence only as a complete, unmixed database publication.
    let cells = selectedSnapshot?.cells ?? [];
    if (!selectedSnapshot || selectedSeason < currentSeason) {
      const databaseCells = await getShotQualityGrid(selectedSeason).catch(error => { if (selectedSnapshot) return []; throw error; });
      const coverage = shotQualityPublication(databaseCells).models;
      if (!selectedSnapshot || Object.values(coverage).some(model => model.ready)) {
        selectedSnapshot = null;
        cells = databaseCells;
      }
    }
    const databasePrevious = await getLatestPublishedShotQualitySeason(latestPublishedSeason).catch(error => { if (snapshots.size) return null; throw error; });
    const previousPublishedSeason = [databasePrevious, ...[...snapshots.keys()].filter(s => s < latestPublishedSeason)]
      .filter((s): s is string => Boolean(s)).sort().at(-1) ?? null;

    return {
      season: selectedSeason,
      latestPublishedSeason,
      previousPublishedSeason,
      activeModel: model,
      cells,
      meta: {
        cellCount: cells.length,
        totalFga: cells.reduce((sum, c) => sum + c.fga, 0),
        publication: { ...shotQualityPublication(cells, selectedSnapshot), checkedAt: daily?.checkedAt ?? null, updateStatus: daily?.data != null && !parsePublication(daily) ? "failed" : daily?.status ?? "bundled" },
      },
    };
  },
  // A validated daily snapshot can publish raw attempts independently of historical surfaces.
  CACHE.inSeason
);
