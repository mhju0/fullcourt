import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPublicApiErrorMessage } from "@/lib/api-errors";
import { getCompletedGamesWithFatigue } from "@/lib/db/queries";
import { buildHistoricalBacktest } from "@/lib/rest-advantage-evidence";
import type { AnalysisResponse, ApiResponse } from "@/types";

export const runtime = "nodejs";

/** DB-backed; do not prerender at build (avoids requiring `DATABASE_URL` during `next build`). */
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  seasonMinRA: z.coerce.number().finite().min(0).default(0),
});

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<AnalysisResponse>>> {
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    seasonMinRA: searchParams.get("seasonMinRA") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        data: null as unknown as AnalysisResponse,
        error: parsed.error.issues[0]?.message ?? "Invalid analysis parameters",
      },
      { status: 400 }
    );
  }

  const { seasonMinRA } = parsed.data;

  try {
    const rows = await getCompletedGamesWithFatigue();
    const response = buildHistoricalBacktest(rows, seasonMinRA);

    return NextResponse.json({ data: response, error: null });
  } catch (err) {
    console.error("[api/analysis]", err);
    return NextResponse.json(
      {
        data: null as unknown as AnalysisResponse,
        error: getPublicApiErrorMessage(err),
      },
      { status: 500 }
    );
  }
}
