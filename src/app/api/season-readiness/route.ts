import { z } from "zod";
import { browsableSeasonParam, CACHE, jsonRoute } from "@/lib/api-route";
import { getSeasonReadiness } from "@/lib/season-readiness-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const GET = jsonRoute(
  "api/season-readiness",
  z.object({ season: browsableSeasonParam }),
  ({ season }) => getSeasonReadiness(season),
  CACHE.inSeason,
);
