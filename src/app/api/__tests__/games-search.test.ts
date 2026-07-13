import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../games/search/route";
import { searchRegularSeasonGames } from "@/lib/db/queries";

vi.mock("@/lib/db/queries", () => ({
  searchRegularSeasonGames: vi.fn(),
}));

const mockSearchGames = vi.mocked(searchRegularSeasonGames);

function req(search = "") {
  return new NextRequest(`http://localhost/api/games/search${search}`);
}

describe("GET /api/games/search", () => {
  beforeEach(() => {
    mockSearchGames.mockReset();
  });

  it("returns defaults for an unfiltered search", async () => {
    mockSearchGames.mockResolvedValueOnce([]);

    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(mockSearchGames).toHaveBeenCalledWith({
      minRA: undefined,
      team: undefined,
      season: undefined,
    });
    expect(await res.json()).toEqual({
      data: { games: [], total: 0, page: 1, limit: 20 },
      error: null,
    });
  });

  it.each([
    "?page=banana",
    "?limit=101",
    "?minRA=-1",
    "?result=maybe",
    "?season=2099-00",
    "?team=Boston",
  ])("returns 400 without querying for invalid parameters: %s", async (search) => {
    const res = await GET(req(search));

    expect(res.status).toBe(400);
    expect(mockSearchGames).not.toHaveBeenCalled();
    const body = (await res.json()) as { data: { page: number; limit: number }; error: string };
    expect(body.data).toMatchObject({ page: 1, limit: 20 });
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("passes validated filters to the query", async () => {
    mockSearchGames.mockResolvedValueOnce([]);

    const res = await GET(
      req("?minRA=5&team=SEA&season=1995-96&result=correct&page=2&limit=50")
    );

    expect(res.status).toBe(200);
    expect(mockSearchGames).toHaveBeenCalledWith({
      minRA: 5,
      team: "SEA",
      season: "1995-96",
    });
    const body = (await res.json()) as { data: { page: number; limit: number } };
    expect(body.data).toMatchObject({ page: 2, limit: 50 });
  });
});
