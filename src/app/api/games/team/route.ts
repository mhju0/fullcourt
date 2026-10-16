import { z } from "zod";
import { browsableSeasonParam, jsonRoute, seasonCachePolicy } from "@/lib/api-route";
import { getTeamSeasonSchedule } from "@/lib/db/queries";
import { CURRENT_TEAM_ABBREVIATIONS } from "@/lib/team-history";

/**
 * One team's season for the Games page's By team view. Browsable seasons, like the board's
 * calendar, so a released schedule can be read before it is played. The season in progress gets
 * the short in-season policy: last night's final must reach the list.
 */
export const GET = jsonRoute(
  "api/games/team",
  z.object({
    season: browsableSeasonParam,
    team: z
      .string()
      .transform((s) => s.toUpperCase())
      .refine((s) => CURRENT_TEAM_ABBREVIATIONS.includes(s), { message: "Unknown team" }),
  }),
  ({ season, team }) => getTeamSeasonSchedule(season, team),
  ({ season }) => seasonCachePolicy(season)
);
