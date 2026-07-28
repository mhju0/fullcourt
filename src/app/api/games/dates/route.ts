import { z } from "zod";
import { jsonRoute, seasonParam } from "@/lib/api-route";
import { getRegularSeasonGameDatesWithCounts } from "@/lib/db/queries";

export const GET = jsonRoute(
  "api/games/dates",
  z.object({
    season: seasonParam,
    month: z.coerce.number().int().min(1).max(12).optional(),
  }),
  ({ season, month }) => getRegularSeasonGameDatesWithCounts(season, month)
);
