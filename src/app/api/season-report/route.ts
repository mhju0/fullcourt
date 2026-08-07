import { z } from "zod";
import { CACHE, jsonRoute, seasonParam } from "@/lib/api-route";
import { NBA_SEASONS } from "@/lib/nba-season";
import { getSeasonReport } from "@/lib/season-report-server";

export const runtime = "nodejs";

/** DB-backed; do not prerender at build (avoids requiring `DATABASE_URL` during `next build`). */
export const dynamic = "force-dynamic";

/** Stated rather than inherited: Hobby defaults to 10s and caps at 60s. Worst observed cold
 *  read was 4.6s, so this is headroom for a slow refresh, not a budget to grow into. */
export const maxDuration = 30;

// The shared season rule, not the browsable list: this page reports games that were played,
// so an upcoming season with no games is not a valid request. Defaults to the newest season
// with data, which is the current one by construction — NBA_SEASONS is derived from the ET date.
const seasonSchema = seasonParam.default(NBA_SEASONS[NBA_SEASONS.length - 1]);

// `inSeason`: this defaults to the newest season with data, and reports progress through it —
// games played, record so far — so an hour of edge drift would be visible on the page.
export const GET = jsonRoute(
  "api/season-report",
  z.object({ season: seasonSchema }),
  ({ season }) => getSeasonReport(season),
  CACHE.inSeason
);
