import { z } from "zod";
import { CACHE, jsonRoute } from "@/lib/api-route";
import { browsableSeasons } from "@/lib/nba-season";
import { defaultRankableSeason, rankableSeasons } from "@/lib/schedule-disparity";
import { getScheduleDisparity } from "@/lib/schedule-disparity-server";

export const runtime = "nodejs";

/** DB-backed; do not prerender at build (avoids requiring `DATABASE_URL` during `next build`). */
export const dynamic = "force-dynamic";

/** Stated rather than inherited: Hobby defaults to 10s and caps at 60s. Worst observed cold
 *  read was 4.6s, so this is headroom for a slow refresh, not a budget to grow into. */
export const maxDuration = 30;

// Deliberately not `seasonParam`: validation uses the browsable list so an upcoming schedule can
// be requested before its season starts, narrowed to the rankable ones because this module ranks
// teams within a season and a truncated season cannot be ranked. The default stays the newest
// season with data, so a bare request never lands on an empty upcoming season.
const RANKABLE = () => rankableSeasons(browsableSeasons());
const seasonSchema = z
  .string()
  .refine((s) => RANKABLE().includes(s), { message: "Unknown season" })
  .default(defaultRankableSeason());

// `historical`, not `inSeason`, because the season list is narrowed to the rankable ones: a
// truncated season cannot be ranked, so this never serves a season still in progress.
export const GET = jsonRoute(
  "api/schedule-disparity",
  z.object({ season: seasonSchema }),
  ({ season }) => getScheduleDisparity(season),
  CACHE.historical
);
