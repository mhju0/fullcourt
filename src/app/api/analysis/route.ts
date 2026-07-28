import { z } from "zod";
import { jsonRoute, minRAParam } from "@/lib/api-route";
import { getHistoricalBacktest } from "@/lib/rest-advantage-evidence-server";

export const runtime = "nodejs";

/** DB-backed; do not prerender at build (avoids requiring `DATABASE_URL` during `next build`). */
export const dynamic = "force-dynamic";

export const GET = jsonRoute(
  "api/analysis",
  z.object({ seasonMinRA: minRAParam }),
  ({ seasonMinRA }) => getHistoricalBacktest(seasonMinRA)
);
