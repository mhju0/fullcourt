import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPublicApiErrorMessage } from "@/lib/api-errors";
import { getUpcomingGamesWithRA } from "@/lib/db/queries";
import { currentDisplaySeason, NBA_SEASONS } from "@/lib/nba-season";
import type { ApiResponse, UpcomingGameWithRA } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  minRA: z.coerce.number().finite().min(0).default(0),
  season: z.string().refine((value) => NBA_SEASONS.includes(value), {
    message: "Invalid season",
  }),
});

export async function GET(
  req: NextRequest
): Promise<NextResponse<ApiResponse<UpcomingGameWithRA[]>>> {
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    minRA: searchParams.get("minRA") ?? undefined,
    season: searchParams.get("season") ?? currentDisplaySeason(),
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        data: [],
        error: parsed.error.issues[0]?.message ?? "Invalid upcoming-game parameters",
      },
      { status: 400 }
    );
  }

  const { minRA, season } = parsed.data;

  try {
    const games = await getUpcomingGamesWithRA(season, minRA);
    return NextResponse.json({ data: games, error: null });
  } catch (err) {
    console.error("[api/games/upcoming]", err);
    return NextResponse.json(
      { data: [], error: getPublicApiErrorMessage(err) },
      { status: 500 }
    );
  }
}
