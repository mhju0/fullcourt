import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../playoffs/route";
import { getPlayoffSeriesWithPredictions } from "@/lib/db/queries";
import type { PlayoffsResponse, PlayoffSeriesWithPredictions } from "@/types";

vi.mock("@/lib/db/queries", () => ({
  getPlayoffSeriesWithPredictions: vi.fn(),
}));

const mockGetPlayoffSeries = vi.mocked(getPlayoffSeriesWithPredictions);

function team(id: number, abbreviation: string, name: string) {
  return { id, abbreviation, name };
}

function series(
  overrides: Partial<PlayoffSeriesWithPredictions> & { seriesId: number }
): PlayoffSeriesWithPredictions {
  return {
    season: "2025-26",
    round: 1,
    conference: "East",
    isBestOf7: true,
    homeCourtTeam: team(1, "BOS", "Celtics"),
    opponentTeam: team(4, "PHI", "76ers"),
    homeCourtWins: 4,
    opponentWins: 2,
    seriesWinnerTeam: team(1, "BOS", "Celtics"),
    seedDiff: 3,
    winPctDiff: 0.1,
    entryRestDiff: 0,
    h2hDiff: 1,
    predictions: {
      fullInsample: {
        predictedHomeCourtWinProb: 0.7,
        predictedWinnerTeam: team(1, "BOS", "Celtics"),
        modelVersion: "logistic_unreg_v1",
        predictedWinnerCorrect: true,
      },
      walkForwardOos: {
        predictedHomeCourtWinProb: 0.6,
        predictedWinnerTeam: team(1, "BOS", "Celtics"),
        modelVersion: "logistic_unreg_v1",
        predictedWinnerCorrect: true,
      },
    },
    ...overrides,
  };
}

function makeReq(search = "") {
  return new NextRequest(`http://localhost/api/playoffs${search}`);
}

describe("GET /api/playoffs", () => {
  beforeEach(() => {
    mockGetPlayoffSeries.mockReset();
  });

  it("returns 200 with the { data, error } envelope shape, grouped by round", async () => {
    mockGetPlayoffSeries.mockResolvedValueOnce([
      series({ seriesId: 1, round: 1 }),
      series({ seriesId: 2, round: 2, conference: null }),
    ]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: PlayoffsResponse;
      error: string | null;
    };

    expect(body.error).toBeNull();
    expect(body.data.season).toBe("2025-26");
    expect(Array.isArray(body.data.rounds)).toBe(true);
    expect(body.data.rounds.map((r) => r.round)).toEqual([1, 2]);
    expect(body.data.rounds[0].roundLabel).toBe("First Round");
    expect(body.data.rounds[1].roundLabel).toBe("Conference Semifinals");
    expect(body.data.rounds[0].series).toHaveLength(1);
  });

  it("defaults to season 2025-26 when the param is absent", async () => {
    mockGetPlayoffSeries.mockResolvedValueOnce([]);

    await GET(makeReq());

    expect(mockGetPlayoffSeries).toHaveBeenCalledWith("2025-26");
  });

  it("rejects an invalid season with a 400 and the envelope error shape", async () => {
    const res = await GET(makeReq("?season=1899-00"));
    expect(res.status).toBe(400);

    const body = (await res.json()) as { data: unknown; error: string | null };
    expect(body.error).toBeTruthy();
    expect(mockGetPlayoffSeries).not.toHaveBeenCalled();
  });

  it("surfaces both prediction methods for a series", async () => {
    mockGetPlayoffSeries.mockResolvedValueOnce([series({ seriesId: 1 })]);

    const res = await GET(makeReq());
    const body = (await res.json()) as { data: PlayoffsResponse };

    const s = body.data.rounds[0].series[0];
    expect(s.predictions.fullInsample).not.toBeNull();
    expect(s.predictions.walkForwardOos).not.toBeNull();
    expect(s.predictions.fullInsample?.predictedWinnerTeam.abbreviation).toBe("BOS");
    expect(s.predictions.walkForwardOos?.predictedWinnerTeam.abbreviation).toBe("BOS");
  });

  it("passes through an absent prediction method as null rather than fabricating a value", async () => {
    mockGetPlayoffSeries.mockResolvedValueOnce([
      series({ seriesId: 1, predictions: { fullInsample: null, walkForwardOos: null } }),
    ]);

    const res = await GET(makeReq());
    const body = (await res.json()) as { data: PlayoffsResponse };

    const s = body.data.rounds[0].series[0];
    expect(s.predictions.fullInsample).toBeNull();
    expect(s.predictions.walkForwardOos).toBeNull();
  });

  it("computes summary accuracy only over known-winner series with a non-null prediction", async () => {
    mockGetPlayoffSeries.mockResolvedValueOnce([
      // Correct fullInsample prediction, known winner — counts.
      series({
        seriesId: 1,
        seriesWinnerTeam: team(1, "BOS", "Celtics"),
        predictions: {
          fullInsample: {
            predictedHomeCourtWinProb: 0.7,
            predictedWinnerTeam: team(1, "BOS", "Celtics"),
            modelVersion: "logistic_unreg_v1",
            predictedWinnerCorrect: true,
          },
          walkForwardOos: null,
        },
      }),
      // Incorrect fullInsample prediction, known winner — counts as wrong.
      series({
        seriesId: 2,
        seriesWinnerTeam: team(4, "PHI", "76ers"),
        predictions: {
          fullInsample: {
            predictedHomeCourtWinProb: 0.7,
            predictedWinnerTeam: team(1, "BOS", "Celtics"),
            modelVersion: "logistic_unreg_v1",
            predictedWinnerCorrect: false,
          },
          walkForwardOos: null,
        },
      }),
      // Unknown winner (series not yet resolved) — excluded from accuracy entirely.
      series({
        seriesId: 3,
        seriesWinnerTeam: null,
        homeCourtWins: 2,
        opponentWins: 1,
        predictions: {
          fullInsample: {
            predictedHomeCourtWinProb: 0.7,
            predictedWinnerTeam: team(1, "BOS", "Celtics"),
            modelVersion: "logistic_unreg_v1",
            predictedWinnerCorrect: null,
          },
          walkForwardOos: null,
        },
      }),
      // Known winner but no fullInsample prediction — excluded from fullInsample accuracy.
      series({
        seriesId: 4,
        seriesWinnerTeam: team(1, "BOS", "Celtics"),
        predictions: { fullInsample: null, walkForwardOos: null },
      }),
    ]);

    const res = await GET(makeReq());
    const body = (await res.json()) as { data: PlayoffsResponse };

    expect(body.data.summary.fullInsample).toEqual({
      knownWinnerGames: 2,
      predictedCorrect: 1,
      accuracy: 50,
    });
    expect(body.data.summary.walkForwardOos).toEqual({
      knownWinnerGames: 0,
      predictedCorrect: 0,
      accuracy: 0,
    });
  });
});
