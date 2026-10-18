import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/home-court/route";
import { getHomeCourtStudy } from "@/lib/home-court-study-server";
import { CACHE } from "@/lib/api-route";

vi.mock("@/lib/home-court-study-server", () => ({ getHomeCourtStudy: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("GET /api/home-court", () => {
  it("returns the shared annual payload in the standard cached envelope", async () => {
    const data = { seasonWinRates: [] };
    vi.mocked(getHomeCourtStudy).mockResolvedValue(data);
    const response = await GET(new NextRequest("https://example.test/api/home-court"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(CACHE.inSeason);
    expect(await response.json()).toEqual({ data, error: null });
  });

  it("keeps database failures uncached and does not expose internal details", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getHomeCourtStudy).mockRejectedValue(new Error("private database details"));
    const response = await GET(new NextRequest("https://example.test/api/home-court"));
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBeNull();
    const body = await response.json();
    expect(body.data).toBeNull();
    expect(body.error).not.toContain("private");
  });
});
