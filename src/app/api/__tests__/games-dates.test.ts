import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../games/dates/route";
import { CACHE } from "@/lib/api-route";
import { getRegularSeasonGameDatesWithCounts } from "@/lib/db/queries";
import { NBA_SEASONS, nextSeasonLabel } from "@/lib/nba-season";
import type { GameDateCount } from "@/types";

vi.mock("@/lib/db/queries", () => ({
  getRegularSeasonGameDatesWithCounts: vi.fn(),
}));

// browsableSeasons() reads the real ET clock, so its result changes with the month. Pin it to
// the Aug-Sep behavior (data seasons + one upcoming) so this file tests the route's contract
// rather than the calendar. The upcoming-season rule itself is tested in nba-season.test.ts.
vi.mock("@/lib/nba-season", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nba-season")>();
  const upcoming = actual.nextSeasonLabel(actual.NBA_SEASONS[actual.NBA_SEASONS.length - 1]);
  return {
    ...actual,
    browsableSeasons: () => [...actual.NBA_SEASONS, upcoming],
  };
});

const UPCOMING_SEASON = nextSeasonLabel(NBA_SEASONS[NBA_SEASONS.length - 1]);

const mockGetDates = vi.mocked(getRegularSeasonGameDatesWithCounts);

function req(url: string): NextRequest {
  return { nextUrl: new URL(url, "http://localhost") } as NextRequest;
}

describe("GET /api/games/dates", () => {
  beforeEach(() => {
    mockGetDates.mockReset();
  });

  it("returns 400 when season is missing", async () => {
    const res = await GET(req("http://localhost/api/games/dates?month=3"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { data: GameDateCount[] | null; error: string };
    expect(body.data).toBeNull();
    expect(body.error.length).toBeGreaterThan(0);
    expect(mockGetDates).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid season label", async () => {
    const res = await GET(req("http://localhost/api/games/dates?season=2099-00"));
    expect(res.status).toBe(400);
    expect(mockGetDates).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid month", async () => {
    const res = await GET(req("http://localhost/api/games/dates?season=2024-25&month=13"));
    expect(res.status).toBe(400);
    expect(mockGetDates).not.toHaveBeenCalled();
  });

  it("calls query with season only when month omitted", async () => {
    const sample: GameDateCount[] = [{ date: "2024-10-22", gameCount: 2 }];
    mockGetDates.mockResolvedValueOnce(sample);

    const res = await GET(req("http://localhost/api/games/dates?season=2024-25"));
    expect(res.status).toBe(200);
    expect(mockGetDates).toHaveBeenCalledWith("2024-25", undefined);
    const body = (await res.json()) as { data: GameDateCount[]; error: null };
    expect(body.error).toBeNull();
    expect(body.data).toEqual(sample);
  });

  it("passes numeric month to the query", async () => {
    mockGetDates.mockResolvedValueOnce([]);

    const res = await GET(req("http://localhost/api/games/dates?season=2024-25&month=3"));
    expect(res.status).toBe(200);
    expect(mockGetDates).toHaveBeenCalledWith("2024-25", 3);
  });

  // `jsonRoute`'s own tests prove the header mechanism; nothing proved this route asks for it.
  // Deleting the policy from the route left the whole suite green, which is how it went
  // uncached through the 2026-08-07 pass in the first place.
  it("lets the edge hold the date index, which carries no live score", async () => {
    mockGetDates.mockResolvedValueOnce([{ date: "2024-10-22", gameCount: 2 }]);

    const res = await GET(req("http://localhost/api/games/dates?season=2024-25"));
    expect(res.headers.get("cache-control")).toBe(CACHE.inSeason);
  });
});

describe("GET /api/games/dates — upcoming season", () => {
  beforeEach(() => {
    mockGetDates.mockReset();
  });

  it("serves a released schedule whose season has no results yet", async () => {
    // This is the whole reason the route validates against browsableSeasons rather than
    // NBA_SEASONS: on schedule-release day the calendar exists and the games do not, and
    // `seasonParam` would answer 400 for the season the board now opens on.
    const sample: GameDateCount[] = [{ date: "2026-10-20", gameCount: 3 }];
    mockGetDates.mockResolvedValue(sample);

    const res = await GET(
      req(`http://localhost/api/games/dates?season=${UPCOMING_SEASON}`)
    );

    expect(res.status).toBe(200);
    expect(mockGetDates).toHaveBeenCalledWith(UPCOMING_SEASON, undefined);
    const body = (await res.json()) as { data: GameDateCount[]; error: string | null };
    expect(body.data).toEqual(sample);
  });

  it("still refuses a season beyond the browsable window", async () => {
    const res = await GET(
      req(`http://localhost/api/games/dates?season=${nextSeasonLabel(UPCOMING_SEASON)}`)
    );

    expect(res.status).toBe(400);
    expect(mockGetDates).not.toHaveBeenCalled();
  });
});
