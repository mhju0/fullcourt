import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../shot-quality/route";
import {
  getLatestPublishedShotQualitySeason,
  getShotQualityGrid,
} from "@/lib/db/queries";

vi.mock("@/lib/db/queries", () => ({
  getLatestPublishedShotQualitySeason: vi.fn(),
  getShotQualityGrid: vi.fn(),
}));

const latest = vi.mocked(getLatestPublishedShotQualitySeason);
const grid = vi.mocked(getShotQualityGrid);
const request = (query = "") => new NextRequest(`http://localhost/api/shot-quality${query}`);

describe("GET /api/shot-quality", () => {
  beforeEach(() => {
    latest.mockReset();
    grid.mockReset();
    latest.mockResolvedValue("2025-26");
    grid.mockResolvedValue([]);
  });

  it("uses the latest usable publication for a bare request", async () => {
    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(grid).toHaveBeenCalledWith("2025-26");
    expect(body.data).toMatchObject({ season: "2025-26", latestPublishedSeason: "2025-26" });
  });

  it("keeps an explicit valid season even when it has no publication", async () => {
    const res = await GET(request("?season=2024-25"));
    const body = await res.json();

    expect(grid).toHaveBeenCalledWith("2024-25");
    expect(body.data).toMatchObject({ season: "2024-25", latestPublishedSeason: "2025-26", cells: [] });
  });

  it("returns a safe unavailable response when publication discovery is empty", async () => {
    latest.mockResolvedValueOnce(null);

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toBe("Expected shot value data is not available yet.");
    expect(grid).not.toHaveBeenCalled();
  });
});
