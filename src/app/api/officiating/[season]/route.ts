import { z } from "zod";
import { CACHE, jsonRoute } from "@/lib/api-route";
import type { ReviewGame } from "@/lib/officiating";
import data from "@/data/officiating.json";

const published = new Map(data.seasons.map((s) => [s.season, s.games as ReviewGame[]]));

/** One season's reviewed games. The file changes only with a deploy, so the edge may hold it. */
export const GET = jsonRoute(
  "api/officiating/[season]",
  z.object({ season: z.string().refine((s) => published.has(s), { message: "No published reports for this season" }) }),
  async ({ season }) => published.get(season)!,
  CACHE.historical
);
