import { z } from "zod";
import { jsonRoute } from "@/lib/api-route";
import { browsableSeasons, NBA_SEASONS } from "@/lib/nba-season";
import { getScheduleDisparity } from "@/lib/schedule-disparity-server";

export const runtime = "nodejs";

/** DB-backed; do not prerender at build (avoids requiring `DATABASE_URL` during `next build`). */
export const dynamic = "force-dynamic";

// Deliberately not `seasonParam`: validation uses the browsable list so an upcoming schedule can
// be requested before its season starts. The default stays the newest season with data, so a bare
// request never lands on an empty upcoming season.
const seasonSchema = z
  .string()
  .refine((s) => browsableSeasons().includes(s), { message: "Unknown season" })
  .default(NBA_SEASONS[NBA_SEASONS.length - 1]);

export const GET = jsonRoute(
  "api/schedule-disparity",
  z.object({ season: seasonSchema }),
  ({ season }) => getScheduleDisparity(season)
);
