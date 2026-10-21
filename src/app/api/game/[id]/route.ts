import { z } from "zod";
import { PublicApiError } from "@/lib/api-errors";
import { jsonRoute } from "@/lib/api-route";
import { getGameDetailById } from "@/lib/db/queries";

export const GET = jsonRoute(
  "api/game/[id]",
  // games.id is int4: a larger id would fail in Postgres as a 500 rather than a 400.
  z.object({ id: z.coerce.number({ error: "Invalid game id" }).int().positive().max(2_147_483_647) }),
  async ({ id }) => {
    const detail = await getGameDetailById(id);
    if (!detail) throw new PublicApiError("Game not found", 404);
    return detail;
  }
);
