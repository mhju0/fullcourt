import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../game/[id]/route";
import { getGameDetailById } from "@/lib/db/queries";

vi.mock("@/lib/db/queries", () => ({
  getGameDetailById: vi.fn(),
}));

const mockGetGameDetailById = vi.mocked(getGameDetailById);
const req = () => new NextRequest("http://localhost/api/game/x");

describe("GET /api/game/[id]", () => {
  beforeEach(() => {
    mockGetGameDetailById.mockReset();
  });

  it("returns 400 for an id Postgres cannot hold, without reading", async () => {
    // games.id is int4; a larger id reached the query and came back as a 500.
    for (const bad of ["abc", "0", "1.5", "2147483648", "99999999999999999999"]) {
      const res = await GET(req(), { params: Promise.resolve({ id: bad }) });
      expect(res.status).toBe(400);
    }
    expect(mockGetGameDetailById).not.toHaveBeenCalled();
  });

  it("returns 404 when the game does not exist", async () => {
    mockGetGameDetailById.mockResolvedValue(null);
    const res = await GET(req(), { params: Promise.resolve({ id: "2147483647" }) });

    expect(res.status).toBe(404);
    expect(mockGetGameDetailById).toHaveBeenCalledExactlyOnceWith(2147483647);
  });
});
