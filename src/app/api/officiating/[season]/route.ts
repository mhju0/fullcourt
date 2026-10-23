import { z } from "zod";
import { CACHE, jsonRoute } from "@/lib/api-route";
import { PublicApiError } from "@/lib/api-errors";
import { loadOfficiatingPublication } from "@/lib/officiating-publication-server";
import { defaultNbaSeason } from "@/lib/nba-season";

export const GET = jsonRoute(
  "api/officiating/[season]",
  z.object({ season: z.string().regex(/^20\d{2}-\d{2}$/).refine((season) => season >= "2014-15" && season <= defaultNbaSeason()), publication: z.string().regex(/^[a-f0-9]{64}$/).optional() }),
  async ({ season, publication }) => {
    const loaded = await loadOfficiatingPublication(publication);
    const row = loaded.seasons.find((s) => s.season === season);
    if (!row || (publication && row.publicationHash !== publication)) throw new PublicApiError("No published reports for this season", publication ? 404 : 400);
    return row.games.map((g) => row.publicationHash ? {
      ...g, detailUrl: `/api/officiating/report?publication=${row.publicationHash}&season=${season}&game=${g.id}&source=${g.sha256}`,
    } : g);
  },
  CACHE.inSeason,
);
