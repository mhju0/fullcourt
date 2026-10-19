import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSeasonReadiness } from "@/lib/season-readiness-server";
import { GET } from "@/app/api/season-readiness/route";

vi.mock("@/lib/season-readiness-server", () => ({ getSeasonReadiness: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

describe("season readiness route", () => {
  it("returns only public readiness metadata and the normal short cache policy", async () => {
    vi.mocked(getSeasonReadiness).mockResolvedValue({ season: "2026-27", ready: false, expectedAfterDate: "2026-11-11" });
    const response = await GET(new NextRequest("http://localhost/api/season-readiness?season=2026-27"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { season: "2026-27", ready: false, expectedAfterDate: "2026-11-11" }, error: null });
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=60");
  });

  it("keeps a failed query distinct from awaiting data, uncached and retryable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(getSeasonReadiness).mockRejectedValue(new Error("database unavailable"));
    const response = await GET(new NextRequest("http://localhost/api/season-readiness?season=2026-27"));
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBeNull();
    expect((await response.json()).data).toBeNull();
  });

  it("validates the requested season before reading the database", async () => {
    vi.mocked(getSeasonReadiness).mockClear();
    const response = await GET(new NextRequest("http://localhost/api/season-readiness?season=1900-01"));
    expect(response.status).toBe(400);
    expect(getSeasonReadiness).not.toHaveBeenCalled();
  });
});
