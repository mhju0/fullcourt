import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../games/upcoming/route";
import { getUpcomingGamesWithRA } from "@/lib/db/queries";
import { CACHE } from "@/lib/api-route";

vi.mock("@/lib/db/queries", () => ({
  getUpcomingGamesWithRA: vi.fn(),
}));

const mockGetUpcoming = vi.mocked(getUpcomingGamesWithRA);

function req(search = "") {
  return new NextRequest(`http://localhost/api/games/upcoming${search}`);
}

describe("GET /api/games/upcoming", () => {
  beforeEach(() => {
    mockGetUpcoming.mockReset();
  });

  it("passes a valid season and threshold to the query", async () => {
    mockGetUpcoming.mockResolvedValueOnce([]);

    const res = await GET(req("?season=2025-26&minRA=3"));

    expect(res.status).toBe(200);
    expect(mockGetUpcoming).toHaveBeenCalledWith("2025-26", 3);
    expect(await res.json()).toEqual({ data: [], error: null });
  });

  it("lets the edge hold an answer for a minute, like the other in-season reads", async () => {
    mockGetUpcoming.mockResolvedValueOnce([]);
    const res = await GET(req("?season=2026-27"));
    expect(res.headers.get("cache-control")).toBe(CACHE.inSeason);
  });

  it("passes the bounded reserve only when explicitly requested", async () => {
    mockGetUpcoming.mockResolvedValueOnce([]);
    const res = await GET(req("?season=2025-26&limit=6"));
    expect(res.status).toBe(200);
    expect(mockGetUpcoming).toHaveBeenCalledWith("2025-26", 0, 6);
  });

  it("requests chronological selection before limiting the large-gap reserve", async () => {
    mockGetUpcoming.mockResolvedValueOnce([]);
    const res = await GET(req("?season=2026-27&minRA=5&order=soonest&limit=6"));
    expect(res.status).toBe(200);
    expect(mockGetUpcoming).toHaveBeenCalledWith("2026-27", 5, 6, "soonest");
  });

  it.each(["?season=2099-00", "?season=2025-26&minRA=-1", "?season=2025-26&minRA=all", "?limit=0", "?limit=2", "?limit=31", "?limit=3.5", "?limit=no", "?order=random"])(
    "returns 400 without querying for invalid parameters: %s",
    async (search) => {
      const res = await GET(req(search));

      expect(res.status).toBe(400);
      expect(mockGetUpcoming).not.toHaveBeenCalled();
      const body = (await res.json()) as { data: unknown[] | null; error: string };
      expect(body.data).toBeNull();
      expect(body.error.length).toBeGreaterThan(0);
    }
  );
});
