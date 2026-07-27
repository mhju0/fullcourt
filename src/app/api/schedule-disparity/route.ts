import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPublicApiErrorMessage } from "@/lib/api-errors";
import { NBA_SEASONS } from "@/lib/nba-season";
import { getScheduleDisparity } from "@/lib/schedule-disparity-server";
import type { ApiResponse, ScheduleDisparityResponse } from "@/types";

export const runtime = "nodejs";

/** DB-backed; do not prerender at build (avoids requiring `DATABASE_URL` during `next build`). */
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  season: z
    .string()
    .refine((s) => NBA_SEASONS.includes(s), { message: "Unknown season" })
    .default(NBA_SEASONS[NBA_SEASONS.length - 1]),
});

export async function GET(
  req: NextRequest
): Promise<NextResponse<ApiResponse<ScheduleDisparityResponse>>> {
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    season: searchParams.get("season") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        data: null as unknown as ScheduleDisparityResponse,
        error: parsed.error.issues[0]?.message ?? "Invalid schedule-disparity parameters",
      },
      { status: 400 }
    );
  }

  try {
    const response = await getScheduleDisparity(parsed.data.season);

    return NextResponse.json({ data: response, error: null });
  } catch (err) {
    console.error("[api/schedule-disparity]", err);
    return NextResponse.json(
      {
        data: null as unknown as ScheduleDisparityResponse,
        error: getPublicApiErrorMessage(err),
      },
      { status: 500 }
    );
  }
}
