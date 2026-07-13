import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../games/upcoming/route";
import { getUpcomingGamesWithRA } from "@/lib/db/queries";

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

  it.each(["?season=2099-00", "?season=2025-26&minRA=-1", "?season=2025-26&minRA=all"])(
    "returns 400 without querying for invalid parameters: %s",
    async (search) => {
      const res = await GET(req(search));

      expect(res.status).toBe(400);
      expect(mockGetUpcoming).not.toHaveBeenCalled();
      const body = (await res.json()) as { data: unknown[]; error: string };
      expect(body.data).toEqual([]);
      expect(body.error.length).toBeGreaterThan(0);
    }
  );
});
