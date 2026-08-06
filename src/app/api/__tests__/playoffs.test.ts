/**
 * The route's own contract: which season it reads, what it rejects, and the envelope.
 *
 * The bracket grouping and the accuracy summaries moved to
 * `src/lib/__tests__/playoff-bracket.test.ts` with the module that computes them. What
 * stays here is what genuinely needs a request: param validation, the default season,
 * and that the response reaches the browser under `{ data, error }`.
 */
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
    priorGrindDiff: 0,
    homeCourtPriorGames: null,
    opponentPriorGames: null,
    homeCourtPriorIsBestOf7: null,
    opponentPriorIsBestOf7: null,
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

  it("returns 200 with the { data, error } envelope", async () => {
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
    expect(body.data.rounds.map((r) => r.round)).toEqual([1, 2]);
    expect(body.data.summary.fullInsample.knownWinnerGames).toBe(2);
  });

  it("defaults to season 2025-26 when the param is absent", async () => {
    mockGetPlayoffSeries.mockResolvedValueOnce([]);

    await GET(makeReq());

    expect(mockGetPlayoffSeries).toHaveBeenCalledWith("2025-26");
  });

  it("reads the season it was asked for", async () => {
    mockGetPlayoffSeries.mockResolvedValueOnce([]);

    await GET(makeReq("?season=2015-16"));

    expect(mockGetPlayoffSeries).toHaveBeenCalledWith("2015-16");
  });

  it("rejects an invalid season with a 400 and the envelope error shape", async () => {
    const res = await GET(makeReq("?season=1899-00"));
    expect(res.status).toBe(400);

    const body = (await res.json()) as { data: unknown; error: string | null };
    expect(body.error).toBeTruthy();
    expect(mockGetPlayoffSeries).not.toHaveBeenCalled();
  });

  it("returns 500 with a public message when the query throws", async () => {
    mockGetPlayoffSeries.mockRejectedValueOnce(new Error("DATABASE_URL is not set"));

    const res = await GET(makeReq());
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(body.error.length).toBeGreaterThan(0);
  });
});
