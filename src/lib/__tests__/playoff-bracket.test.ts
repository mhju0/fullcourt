/**
 * The bracket grouping and the accuracy summaries, tested through the one interface
 * that produces them.
 *
 * These assertions previously lived in `src/app/api/__tests__/playoffs.test.ts`, where
 * reaching a rounded percentage meant constructing a `NextRequest`, mocking a query and
 * parsing JSON back out. Nothing here needs any of that.
 */
import { describe, expect, it } from "vitest";
import { buildPlayoffBracket } from "@/lib/playoff-bracket";
import type { PlayoffSeriesWithPredictions } from "@/types";

function team(id: number, abbreviation: string, name: string) {
  return { id, abbreviation, name };
}

const BOS = team(1, "BOS", "Celtics");
const PHI = team(4, "PHI", "76ers");

function prediction(correct: boolean | null) {
  return {
    predictedHomeCourtWinProb: 0.7,
    predictedWinnerTeam: BOS,
    modelVersion: "logistic_unreg_v1",
    predictedWinnerCorrect: correct,
  };
}

function series(
  overrides: Partial<PlayoffSeriesWithPredictions> & { seriesId: number }
): PlayoffSeriesWithPredictions {
  return {
    season: "2025-26",
    round: 1,
    conference: "East",
    isBestOf7: true,
    homeCourtTeam: BOS,
    opponentTeam: PHI,
    homeCourtWins: 4,
    opponentWins: 2,
    seriesWinnerTeam: BOS,
    seedDiff: 3,
    winPctDiff: 0.1,
    entryRestDiff: 0,
    h2hDiff: 1,
    priorGrindDiff: 0,
    homeCourtPriorGames: null,
    opponentPriorGames: null,
    homeCourtPriorIsBestOf7: null,
    opponentPriorIsBestOf7: null,
    predictions: {
      fullInsample: prediction(true),
      walkForwardOos: prediction(true),
    },
    ...overrides,
  };
}

describe("buildPlayoffBracket — rounds", () => {
  it("groups series into rounds and names each one", () => {
    const result = buildPlayoffBracket("2025-26", [
      series({ seriesId: 1, round: 1 }),
      series({ seriesId: 2, round: 2, conference: null }),
    ]);

    expect(result.season).toBe("2025-26");
    expect(result.rounds.map((r) => r.round)).toEqual([1, 2]);
    expect(result.rounds.map((r) => r.roundLabel)).toEqual([
      "First Round",
      "Conference Semifinals",
    ]);
    expect(result.rounds[0].series).toHaveLength(1);
  });

  it("names rounds 3 and 4 for the bracket, not by number", () => {
    const result = buildPlayoffBracket("2025-26", [
      series({ seriesId: 1, round: 3 }),
      series({ seriesId: 2, round: 4, conference: null }),
    ]);

    expect(result.rounds.map((r) => r.roundLabel)).toEqual([
      "Conference Finals",
      "Finals",
    ]);
  });

  it("falls back to a numbered label for a round it has no name for", () => {
    const result = buildPlayoffBracket("2025-26", [series({ seriesId: 1, round: 0 })]);

    expect(result.rounds[0].roundLabel).toBe("Round 0");
  });

  it("orders rounds ascending even when the series arrive out of order", () => {
    const result = buildPlayoffBracket("2025-26", [
      series({ seriesId: 1, round: 4 }),
      series({ seriesId: 2, round: 1 }),
      series({ seriesId: 3, round: 2 }),
    ]);

    expect(result.rounds.map((r) => r.round)).toEqual([1, 2, 4]);
  });

  it("keeps the given order within a round, which is the query's conference sort", () => {
    const result = buildPlayoffBracket("2025-26", [
      series({ seriesId: 10, round: 1, conference: "East" }),
      series({ seriesId: 20, round: 1, conference: "West" }),
    ]);

    expect(result.rounds[0].series.map((s) => s.seriesId)).toEqual([10, 20]);
  });

  it("returns no rounds for a season with no series", () => {
    const result = buildPlayoffBracket("2026-27", []);

    expect(result.rounds).toEqual([]);
  });

  it("passes a series through without reshaping its predictions", () => {
    const result = buildPlayoffBracket("2025-26", [series({ seriesId: 1 })]);

    const s = result.rounds[0].series[0];
    expect(s.predictions.fullInsample?.predictedWinnerTeam.abbreviation).toBe("BOS");
    expect(s.predictions.walkForwardOos?.predictedWinnerTeam.abbreviation).toBe("BOS");
  });

  it("passes an absent prediction method through as null rather than fabricating one", () => {
    const result = buildPlayoffBracket("2025-26", [
      series({ seriesId: 1, predictions: { fullInsample: null, walkForwardOos: null } }),
    ]);

    const s = result.rounds[0].series[0];
    expect(s.predictions.fullInsample).toBeNull();
    expect(s.predictions.walkForwardOos).toBeNull();
  });
});

describe("buildPlayoffBracket — method accuracy", () => {
  it("scores only resolved series that the method actually predicted", () => {
    const result = buildPlayoffBracket("2025-26", [
      // Resolved, predicted, right.
      series({
        seriesId: 1,
        seriesWinnerTeam: BOS,
        predictions: { fullInsample: prediction(true), walkForwardOos: null },
      }),
      // Resolved, predicted, wrong.
      series({
        seriesId: 2,
        seriesWinnerTeam: PHI,
        predictions: { fullInsample: prediction(false), walkForwardOos: null },
      }),
      // Not yet resolved — no answer to be right about.
      series({
        seriesId: 3,
        seriesWinnerTeam: null,
        homeCourtWins: 2,
        opponentWins: 1,
        predictions: { fullInsample: prediction(null), walkForwardOos: null },
      }),
      // Resolved, never predicted — not a miss.
      series({
        seriesId: 4,
        seriesWinnerTeam: BOS,
        predictions: { fullInsample: null, walkForwardOos: null },
      }),
    ]);

    expect(result.summary.fullInsample).toEqual({
      knownWinnerGames: 2,
      predictedCorrect: 1,
      accuracy: 50,
    });
    expect(result.summary.walkForwardOos).toEqual({
      knownWinnerGames: 0,
      predictedCorrect: 0,
      accuracy: 0,
    });
  });

  it("reports accuracy to one decimal place", () => {
    // 2 of 3 is 66.666…%, which must not reach the page as 66.66666666666667.
    const result = buildPlayoffBracket("2025-26", [
      series({ seriesId: 1, predictions: { fullInsample: prediction(true), walkForwardOos: null } }),
      series({ seriesId: 2, predictions: { fullInsample: prediction(true), walkForwardOos: null } }),
      series({ seriesId: 3, predictions: { fullInsample: prediction(false), walkForwardOos: null } }),
    ]);

    expect(result.summary.fullInsample.accuracy).toBe(66.7);
  });

  it("reports 0 rather than NaN when a method has nothing to score", () => {
    const result = buildPlayoffBracket("2026-27", []);

    expect(result.summary.fullInsample.accuracy).toBe(0);
    expect(Number.isNaN(result.summary.fullInsample.accuracy)).toBe(false);
  });

  it("scores each method against its own eligible set", () => {
    const result = buildPlayoffBracket("2025-26", [
      series({
        seriesId: 1,
        seriesWinnerTeam: BOS,
        predictions: { fullInsample: prediction(true), walkForwardOos: prediction(false) },
      }),
    ]);

    expect(result.summary.fullInsample.accuracy).toBe(100);
    expect(result.summary.walkForwardOos.accuracy).toBe(0);
    expect(result.summary.walkForwardOos.knownWinnerGames).toBe(1);
  });
});
