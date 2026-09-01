import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../games/search/route";
import { CACHE } from "@/lib/api-route";
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
    const body = (await res.json()) as { data: null; error: string };
    // No fabricated page/limit: a client that ignores `error` must not read this as "0 results".
    expect(body.data).toBeNull();
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

  // `jsonRoute`'s own tests prove the header mechanism; nothing proved this route asks for it,
  // which is how it stayed uncached through the 2026-08-07 pass and the 2026-08-14 audit alike.
  // `historical` and not `inSeason`: this is the settled backtest population, the same rows
  // `/api/analysis` serves under the same claim, and they move only when the pipeline runs.
  it("lets the edge hold a search over settled seasons", async () => {
    mockSearchGames.mockResolvedValueOnce([]);

    const res = await GET(req("?season=1995-96"));
    expect(res.headers.get("cache-control")).toBe(CACHE.historical);
  });
});
