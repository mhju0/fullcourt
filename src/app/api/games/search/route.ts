import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPublicApiErrorMessage } from "@/lib/api-errors";
import { NBA_SEASONS } from "@/lib/nba-season";
import { searchHistoricalGameEvidence } from "@/lib/rest-advantage-evidence-server";
import type { ApiResponse, GameSearchResponse } from "@/types";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const QuerySchema = z.object({
  minRA: z.coerce.number().finite().min(0).default(0),
  team: z.string().regex(/^[A-Z]{2,3}$/, "Team must be a 2-3 letter abbreviation").optional(),
  season: z.string().refine((value) => NBA_SEASONS.includes(value), {
    message: "Invalid season",
  }).optional(),
  result: z.enum(["all", "correct", "incorrect"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
});

export async function GET(
  req: NextRequest
): Promise<NextResponse<ApiResponse<GameSearchResponse>>> {
  const { searchParams } = req.nextUrl;

  const parsed = QuerySchema.safeParse({
    minRA: searchParams.get("minRA") ?? undefined,
    team: searchParams.get("team") ?? undefined,
    season: searchParams.get("season") ?? undefined,
    result: searchParams.get("result") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        data: { games: [], total: 0, page: 1, limit: DEFAULT_LIMIT },
        error: parsed.error.issues[0]?.message ?? "Invalid search parameters",
      },
      { status: 400 }
    );
  }

  const { minRA, team, season, result, page, limit } = parsed.data;

  try {
    const data = await searchHistoricalGameEvidence({
      minRA: minRA > 0 ? minRA : undefined,
      team,
      season,
      result,
      page,
      limit,
    });

    return NextResponse.json({
      data,
      error: null,
    });
  } catch (err) {
    console.error("[api/games/search]", err);
    return NextResponse.json(
      {
        data: { games: [], total: 0, page, limit },
        error: getPublicApiErrorMessage(err),
      },
      { status: 500 }
    );
  }
}
