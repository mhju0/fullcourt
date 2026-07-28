import { z } from "zod";
import { jsonRoute } from "@/lib/api-route";
import { getGamesByDate } from "@/lib/db/queries";

export const GET = jsonRoute(
  "api/games",
  z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  }),
  ({ date }) => getGamesByDate(date)
);
