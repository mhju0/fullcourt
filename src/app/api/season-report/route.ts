import { z } from "zod";
import { browsableSeasonParam, CACHE, jsonRoute } from "@/lib/api-route";
import { NBA_SEASONS } from "@/lib/nba-season";
import { getSeasonReport } from "@/lib/season-report-server";

export const runtime = "nodejs";

/** DB-backed; do not prerender at build (avoids requiring `DATABASE_URL` during `next build`). */
export const dynamic = "force-dynamic";

/** Stated rather than inherited: Hobby defaults to 10s and caps at 60s. Worst observed cold
 *  read was 4.6s, so this is headroom for a slow refresh, not a budget to grow into. */
export const maxDuration = 30;

// Accept released-but-unplayed seasons, while defaulting to the latest data season.
// Schedule Edge also consumes this response's workload fields; the source-basis label
// distinguishes published-calendar workload from completed-game measurements.
const seasonSchema = browsableSeasonParam.default(
  () => NBA_SEASONS[NBA_SEASONS.length - 1]
);

// `inSeason`: this defaults to the newest season with data, and reports progress through it —
// games played, record so far — so an hour of edge drift would be visible on the page.
export const GET = jsonRoute(
  "api/season-report",
  z.object({ season: seasonSchema }),
  ({ season }) => getSeasonReport(season),
  CACHE.inSeason
);
