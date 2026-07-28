import { z } from "zod";
import { jsonRoute, seasonParam } from "@/lib/api-route";
import { getPlayoffSeriesWithPredictions } from "@/lib/db/queries";
import { currentDisplaySeason } from "@/lib/nba-season";
import type {
  PlayoffMethodSummary,
  PlayoffRoundGroup,
  PlayoffSeriesWithPredictions,
  PlayoffsResponse,
} from "@/types";

export const runtime = "nodejs";

/** DB-backed; do not prerender at build (avoids requiring `DATABASE_URL` during `next build`). */
export const dynamic = "force-dynamic";

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

export const GET = jsonRoute(
  "api/playoffs",
  z.object({ season: seasonParam.optional() }),
  async ({ season = currentDisplaySeason() }): Promise<PlayoffsResponse> => {
    const series = await getPlayoffSeriesWithPredictions(season);

    return {
      season,
      rounds: groupByRound(series),
      summary: {
        fullInsample: computeMethodSummary(series, "fullInsample"),
        walkForwardOos: computeMethodSummary(series, "walkForwardOos"),
      },
    };
  }
);
