import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: { execute: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/lib/db/queries", () => ({
  getDataAsOf: vi.fn().mockResolvedValue({ finalGames: 47_143, latestFinalDate: "2026-04-12" }),
  getPublishedScheduleCoverage: vi.fn().mockResolvedValue({ games: 1, firstDate: "2026-10-20", lastDate: "2026-10-20" }),
  getLatestPublishedPlayoffSeason: vi.fn().mockResolvedValue("2025-26"),
  getLatestPublishedShotQualitySeason: vi.fn().mockResolvedValue("2024-25"),
}));
vi.mock("@/lib/rest-advantage-evidence-server", () => ({
  getHistoricalEvidenceCoverage: vi.fn().mockResolvedValue({ games: 47_143, latestEvidenceDate: "2026-04-12" }),
}));
vi.mock("@/lib/player-rest-publication-server", () => ({
  loadPlayerRestPublication: vi.fn(async () => ({
    generated: "2026-10-29T16:54:50.509Z", seasons: [],
    refresh: { status: "published" },
  })),
}));
vi.mock("@/lib/officiating-publication-server", () => ({
  loadOfficiatingPublication: vi.fn(async () => ({
    seasons: [{ season: "2025-26", through: "2026-01-14", refreshedAt: "2026-01-15T03:17:59.999Z" }],
    publication: { status: "published" },
  })),
}));
vi.mock("@/lib/daily-publication-server", () => ({
  readDailyDatasetHistory: vi.fn(async () => [{ data: null, status: "failed" }]),
}));

import DataStatusPage from "@/app/data-status/page";
import { getHistoricalEvidenceCoverage } from "@/lib/rest-advantage-evidence-server";

describe("Data Status rendered model coverage", () => {
  it("uses Eastern minutes for publication evidence and retains operational failure status", async () => {
    const html = renderToStaticMarkup(await DataStatusPage()).replaceAll("\u00a0", " ");
    expect(html).toContain("Oct 29, 2026, 12:54 PM ET");
    expect(html).toContain("Jan 14, 2026, 10:17 PM ET");
    expect(html).not.toContain("2026-10-29T16:54:50.509Z");
    expect(html).toContain("Latest current-season check: failed");
  });

  it("renders the full fatigue population rather than the non-neutral venue baseline", async () => {
    const html = renderToStaticMarkup(await DataStatusPage());
    expect(html.replaceAll("\u00a0", " ")).toContain("47,143 final regular-season games with fatigue evidence, neutral sites included");
    expect(html).not.toContain("47,094 final regular-season games");
    expect(html).toContain("2026-04-12");
  });

  it("keeps a failed coverage read unavailable", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getHistoricalEvidenceCoverage).mockRejectedValueOnce(new Error("database timeout"));
    const html = renderToStaticMarkup(await DataStatusPage());
    expect(html).toContain("Unavailable");
    expect(html).not.toContain("games with fatigue evidence");
    errorLog.mockRestore();
  });
});
