import { z } from "zod";
import { CACHE, jsonRoute, minRAParam } from "@/lib/api-route";
import { getHistoricalBacktest } from "@/lib/rest-advantage-evidence-server";

export const runtime = "nodejs";

/** DB-backed; do not prerender at build (avoids requiring `DATABASE_URL` during `next build`). */
export const dynamic = "force-dynamic";

/** Stated rather than inherited: Hobby defaults to 10s and caps at 60s. Worst observed cold
 *  read was 4.6s, so this is headroom for a slow refresh, not a budget to grow into. */
export const maxDuration = 30;

// The heaviest read in the app — every final game with fatigue on both sides, no LIMIT — for a
// payload of about 4 KB. Forty-one seasons of it move only when the pipeline runs.
export const GET = jsonRoute(
  "api/analysis",
  z.object({ seasonMinRA: minRAParam }),
  ({ seasonMinRA }) => getHistoricalBacktest(seasonMinRA),
  CACHE.historical
);
