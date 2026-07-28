import { z } from "zod";
import { PublicApiError } from "@/lib/api-errors";
import { jsonRoute } from "@/lib/api-route";
import { getGameDetailById } from "@/lib/db/queries";

export const GET = jsonRoute(
  "api/game/[id]",
  z.object({ id: z.coerce.number({ error: "Invalid game id" }).int().positive() }),
  async ({ id }) => {
    const detail = await getGameDetailById(id);
    if (!detail) throw new PublicApiError("Game not found", 404);
    return detail;
  }
);
