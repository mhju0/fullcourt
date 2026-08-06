import { z } from "zod";
import { jsonRoute, minRAParam, seasonParam } from "@/lib/api-route";
import { searchHistoricalGameEvidence } from "@/lib/rest-advantage-evidence-server";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const GET = jsonRoute(
  "api/games/search",
  z.object({
    minRA: minRAParam,
    team: z.string().regex(/^[A-Z]{2,3}$/, "Team must be a 2-3 letter abbreviation").optional(),
    season: seasonParam.optional(),
    result: z.enum(["all", "correct", "incorrect"]).default("all"),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  }),
  searchHistoricalGameEvidence
);
