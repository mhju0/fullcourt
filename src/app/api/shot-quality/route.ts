import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPublicApiErrorMessage } from "@/lib/api-errors";
import { getShotQualityGrid } from "@/lib/db/queries";
import { NBA_SEASONS } from "@/lib/nba-season";
import type {
  ApiResponse,
  ShotQualityModelVersion,
  ShotQualityResponse,
} from "@/types";

export const runtime = "nodejs";

/** DB-backed; do not prerender at build (avoids requiring `DATABASE_URL` during `next build`). */
export const dynamic = "force-dynamic";

const DEFAULT_MODEL: ShotQualityModelVersion = "gbm-v1";

/** `season` is required and must be a supported NBA season; `model` is an optional display hint. */
const QuerySchema = z.object({
  season: z.string().refine((s) => NBA_SEASONS.includes(s), {
    message: "Invalid season",
  }),
  model: z
    .enum(["gbm-v1", "baseline-zone-v1"])
    .optional()
    .default(DEFAULT_MODEL),
});

export async function GET(
  req: NextRequest
): Promise<NextResponse<ApiResponse<ShotQualityResponse>>> {
  const { searchParams } = req.nextUrl;
  const parsed = QuerySchema.safeParse({
    season: searchParams.get("season") ?? undefined,
    model: searchParams.get("model") ?? undefined,
  });

  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid request";
    return NextResponse.json(
      { data: null as unknown as ShotQualityResponse, error: msg },
      { status: 400 }
    );
  }

  const { season, model } = parsed.data;

  try {
    const cells = await getShotQualityGrid(season);

    const response: ShotQualityResponse = {
      season,
      activeModel: model,
      cells,
      meta: {
        cellCount: cells.length,
        totalFga: cells.reduce((sum, c) => sum + c.fga, 0),
      },
    };

    return NextResponse.json({ data: response, error: null });
  } catch (err) {
    console.error("[api/shot-quality]", err);
    return NextResponse.json(
      {
        data: null as unknown as ShotQualityResponse,
        error: getPublicApiErrorMessage(err),
      },
      { status: 500 }
    );
  }
}
