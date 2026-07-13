import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPublicApiErrorMessage } from "@/lib/api-errors";
import { searchRegularSeasonGames } from "@/lib/db/queries";
import { NBA_SEASONS } from "@/lib/nba-season";
import type { ApiResponse, GameSearchResponse, GameSearchResult } from "@/types";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const NEUTRAL_THRESHOLD = 0.5;

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
    const rows = await searchRegularSeasonGames({
      minRA: minRA > 0 ? minRA : undefined,
      team,
      season,
    });

    // Compute rest advantage and outcome for each row
    const allResults: GameSearchResult[] = rows
      .filter((row) => row.homeScore !== null && row.awayScore !== null)
      .flatMap((row) => {
        const homeFatigue = parseFloat(row.homeFatigueScore);
        const awayFatigue = parseFloat(row.awayFatigueScore);
        const diff = awayFatigue - homeFatigue; // positive → home is more rested

        // Exclude neutral games
        if (Math.abs(diff) < NEUTRAL_THRESHOLD) return [];

        const advantageTeam: "home" | "away" = diff >= 0 ? "home" : "away";
        const homeWon = (row.homeScore as number) > (row.awayScore as number);
        const restedTeamWon = advantageTeam === "home" ? homeWon : !homeWon;

        return [
          {
            gameId: row.id,
            date: row.date,
            season: row.season,
            homeTeamAbbreviation: row.homeTeamAbbr,
            awayTeamAbbreviation: row.awayTeamAbbr,
            homeScore: row.homeScore as number,
            awayScore: row.awayScore as number,
            homeFatigueScore: homeFatigue,
            awayFatigueScore: awayFatigue,
            restAdvantageDifferential: Math.round(Math.abs(diff) * 100) / 100,
            advantageTeam,
            restedTeamWon,
          } satisfies GameSearchResult,
        ];
      });

    // Filter by outcome
    const filtered =
      result === "correct"
        ? allResults.filter((r) => r.restedTeamWon)
        : result === "incorrect"
          ? allResults.filter((r) => !r.restedTeamWon)
          : allResults;

    // Paginate
    const total = filtered.length;
    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    return NextResponse.json({
      data: { games: paginated, total, page, limit },
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
