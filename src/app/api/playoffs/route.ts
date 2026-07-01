import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPublicApiErrorMessage } from "@/lib/api-errors";
import { getPlayoffSeriesWithPredictions } from "@/lib/db/queries";
import { NBA_SEASONS } from "@/lib/nba-season";
import type {
  ApiResponse,
  PlayoffMethodSummary,
  PlayoffRoundGroup,
  PlayoffSeriesWithPredictions,
  PlayoffsResponse,
} from "@/types";

export const runtime = "nodejs";

/** DB-backed; do not prerender at build (avoids requiring `DATABASE_URL` during `next build`). */
export const dynamic = "force-dynamic";

const DEFAULT_SEASON = "2025-26";

const SeasonSchema = z.string().refine((s) => NBA_SEASONS.includes(s), {
  message: "Invalid season",
});

const ROUND_LABELS: Record<number, string> = {
  1: "First Round",
  2: "Conference Semifinals",
  3: "Conference Finals",
  4: "Finals",
};

type PredictionMethodKey = "fullInsample" | "walkForwardOos";

function computeMethodSummary(
  series: PlayoffSeriesWithPredictions[],
  method: PredictionMethodKey
): PlayoffMethodSummary {
  const eligible = series.filter(
    (s) => s.seriesWinnerTeam !== null && s.predictions[method] !== null
  );
  const predictedCorrect = eligible.filter(
    (s) => s.predictions[method]?.predictedWinnerCorrect === true
  ).length;

  return {
    knownWinnerGames: eligible.length,
    predictedCorrect,
    accuracy:
      eligible.length > 0
        ? Math.round((predictedCorrect / eligible.length) * 1000) / 10
        : 0,
  };
}

/** Groups already-sorted (round asc, conference asc) series into round buckets for bracket rendering. */
function groupByRound(series: PlayoffSeriesWithPredictions[]): PlayoffRoundGroup[] {
  const byRound = new Map<number, PlayoffSeriesWithPredictions[]>();
  for (const s of series) {
    const bucket = byRound.get(s.round) ?? [];
    bucket.push(s);
    byRound.set(s.round, bucket);
  }

  return Array.from(byRound.entries())
    .sort(([a], [b]) => a - b)
    .map(([round, group]) => ({
      round,
      roundLabel: ROUND_LABELS[round] ?? `Round ${round}`,
      series: group,
    }));
}

export async function GET(
  req: NextRequest
): Promise<NextResponse<ApiResponse<PlayoffsResponse>>> {
  const rawSeason = req.nextUrl.searchParams.get("season");
  const parsed = SeasonSchema.safeParse(rawSeason ?? DEFAULT_SEASON);

  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid season";
    return NextResponse.json(
      { data: null as unknown as PlayoffsResponse, error: msg },
      { status: 400 }
    );
  }

  const season = parsed.data;

  try {
    const series = await getPlayoffSeriesWithPredictions(season);

    const response: PlayoffsResponse = {
      season,
      rounds: groupByRound(series),
      summary: {
        fullInsample: computeMethodSummary(series, "fullInsample"),
        walkForwardOos: computeMethodSummary(series, "walkForwardOos"),
      },
    };

    return NextResponse.json({ data: response, error: null });
  } catch (err) {
    console.error("[api/playoffs]", err);
    return NextResponse.json(
      {
        data: null as unknown as PlayoffsResponse,
        error: getPublicApiErrorMessage(err),
      },
      { status: 500 }
    );
  }
}
