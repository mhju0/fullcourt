import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../games/team/route";
import { CACHE } from "@/lib/api-route";
import { getTeamSeasonSchedule } from "@/lib/db/queries";
import { currentDisplaySeason, NBA_SEASONS } from "@/lib/nba-season";

vi.mock("@/lib/db/queries", () => ({
  getTeamSeasonSchedule: vi.fn(),
}));

const mockSchedule = vi.mocked(getTeamSeasonSchedule);

function req(url: string): NextRequest {
  return { nextUrl: new URL(url, "http://localhost") } as NextRequest;
}

describe("GET /api/games/team", () => {
  beforeEach(() => {
    mockSchedule.mockReset();
    mockSchedule.mockResolvedValue([]);
  });

  it("rejects a missing or unknown team without reading the database", async () => {
    for (const query of ["season=2024-25", "season=2024-25&team=XYZ", "season=2024-25&team=SEA"]) {
      const res = await GET(req(`http://localhost/api/games/team?${query}`));
      expect(res.status, query).toBe(400);
    }
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("rejects a season the site does not browse", async () => {
    const res = await GET(req("http://localhost/api/games/team?season=2099-00&team=HOU"));
    expect(res.status).toBe(400);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("reads the team by its upper-case abbreviation", async () => {
    const res = await GET(req("http://localhost/api/games/team?season=2024-25&team=hou"));
    expect(res.status).toBe(200);
    expect(mockSchedule).toHaveBeenCalledWith("2024-25", "HOU");
  });

  it("caches a finished season for an hour and the current one for a minute", async () => {
    const past = await GET(req("http://localhost/api/games/team?season=2015-16&team=HOU"));
    expect(past.headers.get("Cache-Control")).toBe(CACHE.historical);
    const current = currentDisplaySeason();
    if (NBA_SEASONS.includes(current)) {
      const now = await GET(req(`http://localhost/api/games/team?season=${current}&team=HOU`));
      expect(now.headers.get("Cache-Control")).toBe(CACHE.inSeason);
    }
  });
});
