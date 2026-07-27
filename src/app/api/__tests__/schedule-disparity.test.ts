import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../schedule-disparity/route";
import { getScheduleDisparity } from "@/lib/schedule-disparity-server";
import { NBA_SEASONS, nextSeasonLabel } from "@/lib/nba-season";
import type { ScheduleDisparityResponse } from "@/types";

vi.mock("@/lib/schedule-disparity-server", () => ({
  getScheduleDisparity: vi.fn(),
}));

// browsableSeasons() reads the real ET clock, so its result changes with the month. Pin it to
// the Aug–Sep behavior (data seasons + one upcoming) so this file tests the route's contract
// rather than the calendar. The upcoming-season rule itself is tested in nba-season.test.ts.
vi.mock("@/lib/nba-season", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nba-season")>();
  const upcoming = actual.nextSeasonLabel(actual.NBA_SEASONS[actual.NBA_SEASONS.length - 1]);
  return {
    ...actual,
    browsableSeasons: () => [...actual.NBA_SEASONS, upcoming],
  };
});

const mockGet = vi.mocked(getScheduleDisparity);

const LATEST_SEASON = NBA_SEASONS[NBA_SEASONS.length - 1];

function payload(overrides: Partial<ScheduleDisparityResponse> = {}): ScheduleDisparityResponse {
  return {
    season: LATEST_SEASON,
    provisional: false,
    asOf: "2026-07-27",
    scheduledGames: 1230,
    gamesPerTeamMin: 82,
    gamesPerTeamMax: 82,
    teams: [
      {
        teamId: 1,
        abbreviation: "LAL",
        name: "Lakers",
        games: 81,
        netRestEdge: 12,
        netRestEdgeUncapped: 15,
        netFatigueEdge: 8.4,
        netFatigueEdgePerGame: 0.1,
        backToBackEdge: 3,
        threeInFourEdge: 2,
        fourInSixEdge: 1,
        gamesWithEdge: 30,
        gamesWithLargeEdge: 4,
      },
    ],
    league: {
      largestEdge: 12,
      largestDisadvantage: -14,
      delta: 26,
      gamesWithAnyEdge: 500,
      gamesWithLargeEdge: 60,
      countedGames: 1200,
    },
    ...overrides,
  };
}

function makeReq(search = "") {
  return new NextRequest(`http://localhost/api/schedule-disparity${search}`);
}

describe("GET /api/schedule-disparity", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("rejects an unknown season without querying", async () => {
    const res = await GET(makeReq("?season=1970-71"));

    expect(res.status).toBe(400);
    expect(mockGet).not.toHaveBeenCalled();
    const body = (await res.json()) as { error: string };
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("rejects a malformed season without querying", async () => {
    const res = await GET(makeReq("?season=banana"));

    expect(res.status).toBe(400);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("defaults to the latest supported season when none is given", async () => {
    mockGet.mockResolvedValueOnce(payload());

    const res = await GET(makeReq());

    expect(res.status).toBe(200);
    expect(mockGet).toHaveBeenCalledWith(LATEST_SEASON);
  });

  it("passes a valid season through", async () => {
    mockGet.mockResolvedValueOnce(payload({ season: "2015-16" }));

    const res = await GET(makeReq("?season=2015-16"));

    expect(res.status).toBe(200);
    expect(mockGet).toHaveBeenCalledWith("2015-16");
  });

  it("returns the payload under the { data, error } contract", async () => {
    mockGet.mockResolvedValueOnce(payload({ provisional: true, gamesPerTeamMax: 80 }));

    const res = await GET(makeReq());
    const body = (await res.json()) as { data: ScheduleDisparityResponse; error: string | null };

    expect(body.error).toBeNull();
    expect(body.data.provisional).toBe(true);
    expect(body.data.gamesPerTeamMax).toBe(80);
    expect(body.data.teams[0].netRestEdge).toBe(12);
  });

  it("returns 500 with a public message when the query throws", async () => {
    mockGet.mockRejectedValueOnce(new Error("DATABASE_URL is not set"));

    const res = await GET(makeReq());
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(body.error.length).toBeGreaterThan(0);
  });
});

describe("GET /api/schedule-disparity — upcoming seasons", () => {
  const UPCOMING = nextSeasonLabel(LATEST_SEASON);

  beforeEach(() => {
    mockGet.mockReset();
  });

  it("accepts an upcoming season that has no data yet", async () => {
    // Between schedule release and ingest this is the normal state, not an error: the module
    // exists to report on schedules before they are played.
    mockGet.mockResolvedValueOnce(
      payload({ season: UPCOMING, provisional: true, teams: [], gamesPerTeamMin: 0, gamesPerTeamMax: 0 })
    );

    const res = await GET(makeReq(`?season=${UPCOMING}`));

    expect(res.status).toBe(200);
    expect(mockGet).toHaveBeenCalledWith(UPCOMING);
  });

  it("still rejects a season beyond the browsable list", async () => {
    const twoAhead = nextSeasonLabel(UPCOMING);

    const res = await GET(makeReq(`?season=${twoAhead}`));

    expect(res.status).toBe(400);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("defaults to the newest season with data, never the empty upcoming one", async () => {
    mockGet.mockResolvedValueOnce(payload());

    await GET(makeReq());

    expect(mockGet).toHaveBeenCalledWith(LATEST_SEASON);
    expect(mockGet).not.toHaveBeenCalledWith(UPCOMING);
  });
});
