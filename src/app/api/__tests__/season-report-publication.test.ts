import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/season-report-publication/route";
import { getPublishedSeasonReportSeasons } from "@/lib/db/queries";

vi.mock("@/lib/db/queries", () => ({ getPublishedSeasonReportSeasons: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

describe("season report publication discovery", () => {
  it("exposes actual publication gaps without fabricating a prior year", async () => {
    vi.mocked(getPublishedSeasonReportSeasons).mockResolvedValue(["2022-23", "2024-25"]);
    const response = await GET(new NextRequest("http://localhost/api/season-report-publication"));
    expect(await response.json()).toEqual({ data: { seasons: ["2022-23", "2024-25"] }, error: null });
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=60");
  });
  it("preserves empty coverage", async () => {
    vi.mocked(getPublishedSeasonReportSeasons).mockResolvedValue([]);
    const response = await GET(new NextRequest("http://localhost/api/season-report-publication"));
    expect((await response.json()).data.seasons).toEqual([]);
  });
  it("keeps discovery failures separate and uncached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(getPublishedSeasonReportSeasons).mockRejectedValue(new Error("database unavailable"));
    const response = await GET(new NextRequest("http://localhost/api/season-report-publication"));
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBeNull();
    expect((await response.json()).data).toBeNull();
  });
});
