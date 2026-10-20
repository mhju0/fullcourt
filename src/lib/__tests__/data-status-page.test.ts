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

import DataStatusPage from "@/app/data-status/page";
import { getHistoricalEvidenceCoverage } from "@/lib/rest-advantage-evidence-server";

describe("Data Status rendered model coverage", () => {
  it("renders the full fatigue population rather than the non-neutral venue baseline", async () => {
    const html = renderToStaticMarkup(await DataStatusPage());
    expect(html.replaceAll("\u00a0", " ")).toContain("47,143 final games with fatigue evidence");
    expect(html).not.toContain("47,094 final games with fatigue evidence");
    expect(html).toContain("2026-04-12");
  });

  it("keeps a failed coverage read unavailable", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getHistoricalEvidenceCoverage).mockRejectedValueOnce(new Error("database timeout"));
    const html = renderToStaticMarkup(await DataStatusPage());
    expect(html).toContain("Unavailable");
    expect(html).not.toContain("final games with fatigue evidence");
    errorLog.mockRestore();
  });
});
