import { z } from "zod";
import { CACHE, jsonRoute } from "@/lib/api-route";
import { getPublishedSeasonReportSeasons } from "@/lib/db/queries";
import type { SeasonReportPublication } from "@/lib/result-season";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const GET = jsonRoute(
  "api/season-report-publication",
  z.object({}),
  async (): Promise<SeasonReportPublication> => ({ seasons: await getPublishedSeasonReportSeasons() }),
  CACHE.inSeason,
);
