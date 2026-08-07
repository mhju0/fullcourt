import { z } from "zod";
import { CACHE, jsonRoute, minRAParam } from "@/lib/api-route";
import { getHistoricalBacktest } from "@/lib/rest-advantage-evidence-server";

export const runtime = "nodejs";

/** DB-backed; do not prerender at build (avoids requiring `DATABASE_URL` during `next build`). */
export const dynamic = "force-dynamic";

// The heaviest read in the app — every final game with fatigue on both sides, no LIMIT — for a
// payload of about 4 KB. Forty-one seasons of it move only when the pipeline runs.
export const GET = jsonRoute(
  "api/analysis",
  z.object({ seasonMinRA: minRAParam }),
  ({ seasonMinRA }) => getHistoricalBacktest(seasonMinRA),
  CACHE.historical
);
