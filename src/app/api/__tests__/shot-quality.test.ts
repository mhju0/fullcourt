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

const daily = vi.hoisted(() => ({ data: null as unknown, status: "bundled", checkedAt: null, publishedAt: null, hash: null }));
vi.mock("@/lib/daily-publication-server", () => ({ readDailyDataset: vi.fn(async () => daily) }));

const latest = vi.mocked(getLatestPublishedShotQualitySeason);
const grid = vi.mocked(getShotQualityGrid);
const request = (query = "") => new NextRequest(`http://localhost/api/shot-quality${query}`);

describe("GET /api/shot-quality", () => {
  beforeEach(() => {
    daily.data = null;
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

  it("discovers the genuinely previous publication rather than subtracting a calendar year", async () => {
    latest.mockResolvedValueOnce("2026-27").mockResolvedValueOnce("2024-25");
    const res = await GET(request());
    const body = await res.json();
    expect(latest).toHaveBeenNthCalledWith(2, "2026-27");
    expect(body.data.previousPublishedSeason).toBe("2024-25");
    expect(grid).toHaveBeenCalledWith("2026-27");
  });

  it("reports no previous publication without inventing a fallback", async () => {
    latest.mockResolvedValueOnce("2026-27").mockResolvedValueOnce(null);
    const res = await GET(request());
    expect((await res.json()).data.previousPublishedSeason).toBeNull();
  });

  it("serves validated current raw shots without requiring a database surface", async () => {
    const cell = { cellX: 0, cellY: 0, zoneBasic: "Restricted Area", zoneRange: "Less Than 8 ft.", zoneArea: "Center(C)", fga: 2, fgm: 1, fg3a: 0, fg3m: 0, gbm: null, baseline: null };
    daily.data = { schemaVersion: 1, snapshot: { season: "2026-27", generatedAt: "2026-10-22T12:00:00Z", source: {
      provider: "NBA Stats ShotChartDetail", url: "https://stats.nba.com/stats/shotchartdetail?Season=2026-27", fetchedAt: "2026-10-22T12:00:00Z", firstGameDate: "2026-10-21", lastGameDate: "2026-10-21", gameIds: ["0022600001"], shotCount: 2, droppedNoLocation: 0, droppedOutsideHalfCourt: 0,
    }, cells: [cell] } };
    latest.mockRejectedValue(new Error("database unavailable"));
    const response = await GET(request("?season=2026-27"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(grid).not.toHaveBeenCalled();
    expect(body.data.cells).toEqual([cell]);
    expect(body.data.meta.publication.models["gbm-v1"]).toMatchObject({ ready: false, coveredCells: 0, totalCells: 1 });
    expect(body.data.meta.publication.gameCount).toBe(1);
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
