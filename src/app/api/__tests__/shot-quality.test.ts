import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const history = vi.hoisted(() => [] as unknown[]);
vi.mock("@/lib/daily-publication-server", () => ({ readDailyDatasetHistory: vi.fn(async () => history.length ? history : [daily]) }));

const latest = vi.mocked(getLatestPublishedShotQualitySeason);
const grid = vi.mocked(getShotQualityGrid);
const request = (query = "") => new NextRequest(`http://localhost/api/shot-quality${query}`);

afterEach(() => vi.useRealTimers());
function snapshotArtifact(season: string, day: string) {
  return { schemaVersion: 1, snapshot: { season, generatedAt: `${day}T12:00:00Z`, source: {
    provider: "NBA Stats ShotChartDetail", url: "https://stats.nba.com/stats/shotchartdetail", fetchedAt: `${day}T12:00:00Z`, firstGameDate: day, lastGameDate: day,
    gameIds: [`002${season.slice(2, 4)}00001`], shotCount: 2, droppedNoLocation: 0, droppedOutsideHalfCourt: 0,
  }, cells: [{ cellX: 0, cellY: 0, zoneBasic: null, zoneRange: null, zoneArea: null, fga: 2, fgm: 1, fg3a: 0, fg3m: 0, gbm: null, baseline: null }] } };
}

describe("GET /api/shot-quality", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T12:00:00Z"));
    history.length = 0;
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

  it("retains the previous raw season after calendar rollover while the database trails", async () => {
    vi.setSystemTime(new Date("2027-10-23T12:00:00Z"));
    daily.data = snapshotArtifact("2026-27", "2026-10-22");
    const body = await (await GET(request())).json();
    expect(body.data).toMatchObject({ season: "2026-27", latestPublishedSeason: "2026-27", previousPublishedSeason: "2025-26" });
    expect(body.data.meta.publication.source).toBe("nba-stats-snapshot");
    expect(body.data.meta.totalFga).toBe(2);
  });

  it("keeps an archived raw season readable after the next raw season publishes", async () => {
    vi.setSystemTime(new Date("2027-10-23T12:00:00Z"));
    history.push({ ...daily, data: snapshotArtifact("2026-27", "2026-10-22") });
    daily.data = snapshotArtifact("2027-28", "2027-10-22");
    history.push(daily);
    const defaultBody = await (await GET(request())).json();
    expect(defaultBody.data).toMatchObject({ season: "2027-28", previousPublishedSeason: "2026-27" });
    const archivedBody = await (await GET(request("?season=2026-27"))).json();
    expect(archivedBody.data).toMatchObject({ season: "2026-27", latestPublishedSeason: "2027-28" });
    expect(archivedBody.data.meta.publication.source).toBe("nba-stats-snapshot");
    expect(archivedBody.data.cells[0].gbm).toBeNull();
  });

  it("prefers a historical verified database surface without mixing raw snapshot counts", async () => {
    vi.setSystemTime(new Date("2027-10-23T12:00:00Z"));
    const raw = snapshotArtifact("2026-27", "2026-10-22");
    daily.data = raw;
    const model = { pMake: .5, expectedEfg: .5, xpps: 1 };
    grid.mockResolvedValue([{ ...raw.snapshot.cells[0], fga: 999, baseline: model, gbm: model }]);
    const body = await (await GET(request("?season=2026-27"))).json();
    expect(body.data.meta.publication.source).toBe("database");
    expect(body.data.meta.totalFga).toBe(999);
    expect(body.data.meta.publication.generatedAt).toBeNull();
  });

  it("rejects a future-season raw snapshot", async () => {
    daily.data = snapshotArtifact("2027-28", "2027-10-22");
    const body = await (await GET(request())).json();
    expect(body.data.season).toBe("2025-26");
  });

  it("rejects a valid payload attached to a different archived season reference", async () => {
    history.push({ ...daily, season: "2025-26", data: snapshotArtifact("2026-27", "2026-10-22") });
    const body = await (await GET(request())).json();
    expect(body.data.season).toBe("2025-26");
    expect(body.data.meta.publication.updateStatus).toBe("failed");
  });

  it("keeps a failed selected archive distinct from a healthy current publication", async () => {
    history.push({ ...daily, season: "2025-26", data: null, status: "failed", checkedAt: "2026-10-20T12:00:00Z" });
    history.push({ ...daily, season: "2026-27", data: snapshotArtifact("2026-27", "2026-10-22"), status: "published", checkedAt: "2026-10-23T12:00:00Z" });
    const older = await (await GET(request("?season=2025-26"))).json();
    expect(older.data.cells).toEqual([]);
    expect(older.data.meta.publication).toMatchObject({ updateStatus: "failed", checkedAt: "2026-10-20T12:00:00Z" });
    const current = await (await GET(request())).json();
    expect(current.data.meta.publication).toMatchObject({ updateStatus: "published", checkedAt: "2026-10-23T12:00:00Z" });
  });

  it("retains verified historical database data while warning about its failed archive", async () => {
    history.push({ ...daily, season: "2025-26", data: null, status: "failed", checkedAt: "2026-10-20T12:00:00Z" });
    history.push({ ...daily, season: "2026-27", data: snapshotArtifact("2026-27", "2026-10-22"), status: "published", checkedAt: "2026-10-23T12:00:00Z" });
    const model = { pMake: .5, expectedEfg: .5, xpps: 1 };
    grid.mockResolvedValue([{ ...snapshotArtifact("2025-26", "2025-10-22").snapshot.cells[0], fga: 999, baseline: model, gbm: model }]);
    const older = await (await GET(request("?season=2025-26"))).json();
    expect(older.data.meta).toMatchObject({ totalFga: 999, publication: { source: "database", updateStatus: "failed", checkedAt: "2026-10-20T12:00:00Z" } });
  });

  it("does not attach another season's successful check to an untracked database season", async () => {
    history.push({ ...daily, season: "2026-27", data: snapshotArtifact("2026-27", "2026-10-22"), status: "published", checkedAt: "2026-10-23T12:00:00Z" });
    const older = await (await GET(request("?season=2025-26"))).json();
    expect(older.data.meta.publication).toMatchObject({ updateStatus: "bundled", checkedAt: null });
  });

  it("keeps an empty provider check on the active season without attaching it to historical results", async () => {
    history.push({ ...daily, data: null, status: "unavailable", checkedAt: "2026-10-23T12:00:00Z" });
    const current = await (await GET(request("?season=2026-27"))).json();
    expect(current.data.meta.publication).toMatchObject({ updateStatus: "unavailable", checkedAt: "2026-10-23T12:00:00Z" });
    const older = await (await GET(request("?season=2025-26"))).json();
    expect(older.data.meta.publication).toMatchObject({ updateStatus: "bundled", checkedAt: null });
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
