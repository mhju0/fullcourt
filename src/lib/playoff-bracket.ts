/**
 * The Playoff Predictions payload: series grouped into a bracket, and how each
 * prediction method scored against the series that have resolved.
 *
 * This lived inside `app/api/playoffs/route.ts`, which made an HTTP request the only
 * way to reach it — the round labels, the bracket grouping and the accuracy rounding
 * were unexported, so the one test that covered them had to build a `NextRequest` and
 * read JSON back out to assert on a percentage. Every sibling module already had this
 * shape: a pure builder in `src/lib` and a route reduced to schema plus operation.
 *
 * Read-only and side-effect free: it is handed rows and returns the response.
 */

import type {
  PlayoffMethodSummary,
  PlayoffRoundGroup,
  PlayoffSeriesWithPredictions,
  PlayoffsResponse,
} from "@/types";

const ROUND_LABELS: Record<number, string> = {
  1: "First Round",
  2: "Conference Semifinals",
  3: "Conference Finals",
  4: "Finals",
};

type PredictionMethodKey = "fullInsample" | "walkForwardOos";

/**
 * How a method scored, over the series it can be scored on at all.
 *
 * A series counts only when it has resolved *and* the method predicted it. Both
 * exclusions are load-bearing: an unresolved series has no answer to be right about,
 * and a series the method never predicted is not a miss. Counting either as wrong
 * would report a walk-forward model as inaccurate for the seasons it was not yet
 * trained to predict.
 */
function methodSummary(
  series: readonly PlayoffSeriesWithPredictions[],
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
    // One decimal place, and 0 rather than NaN when nothing is eligible — a method with
    // nothing to score reads as 0.0% on the page, never as an empty cell.
    accuracy:
      eligible.length > 0
        ? Math.round((predictedCorrect / eligible.length) * 1000) / 10
        : 0,
  };
}

/**
 * Groups series into round buckets for bracket rendering.
 *
 * Order within a bucket is the order given, so callers must pass series already sorted
 * (round asc, conference asc) — `getPlayoffSeriesWithPredictions` does. Buckets are
 * sorted by round here regardless, so a round that appears late still renders in place.
 */
function groupByRound(
  series: readonly PlayoffSeriesWithPredictions[]
): PlayoffRoundGroup[] {
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

/** The complete Playoff Predictions response for one season's series. */
export function buildPlayoffBracket(
  season: string,
  series: readonly PlayoffSeriesWithPredictions[]
): PlayoffsResponse {
  return {
    season,
    rounds: groupByRound(series),
    summary: {
      fullInsample: methodSummary(series, "fullInsample"),
      walkForwardOos: methodSummary(series, "walkForwardOos"),
    },
  };
}
