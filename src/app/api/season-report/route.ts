import { z } from "zod";
import { jsonRoute, seasonParam } from "@/lib/api-route";
import { NBA_SEASONS } from "@/lib/nba-season";
import { getSeasonReport } from "@/lib/season-report-server";

export const runtime = "nodejs";

/** DB-backed; do not prerender at build (avoids requiring `DATABASE_URL` during `next build`). */
export const dynamic = "force-dynamic";

// The shared season rule, not the browsable list: this page reports games that were played,
// so an upcoming season with no games is not a valid request. Defaults to the newest season
// with data, which is the current one by construction — NBA_SEASONS is derived from the ET date.
const seasonSchema = seasonParam.default(NBA_SEASONS[NBA_SEASONS.length - 1]);

export const GET = jsonRoute(
  "api/season-report",
  z.object({ season: seasonSchema }),
  ({ season }) => getSeasonReport(season)
);
