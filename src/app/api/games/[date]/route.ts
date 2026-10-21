import { z } from "zod";
import { jsonRoute } from "@/lib/api-route";
import { getGamesByDate } from "@/lib/db/queries";

export const GET = jsonRoute(
  "api/games",
  z.object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
      // A well-formed but impossible date (2024-13-45) would otherwise fail in Postgres as a 500.
      .refine((d) => {
        const t = Date.parse(`${d}T00:00:00Z`);
        return Number.isFinite(t) && new Date(t).toISOString().startsWith(d);
      }, "Date does not exist"),
  }),
  ({ date }) => getGamesByDate(date)
);
