import { beforeEach, describe, expect, it, vi } from "vitest";

import { PublicApiError } from "@/lib/api-errors";
import { getHistoricalBacktest } from "@/lib/rest-advantage-evidence-server";
import { getScheduleDisparity } from "@/lib/schedule-disparity-server";

vi.mock("@/lib/rest-advantage-evidence-server", () => ({
  getHistoricalBacktest: vi.fn(),
}));
vi.mock("@/lib/schedule-disparity-server", () => ({
  getScheduleDisparity: vi.fn(),
}));
vi.mock("@/lib/schedule-disparity", () => ({
  defaultRankableSeason: vi.fn(() => "2025-26"),
}));

const mockHistory = vi.mocked(getHistoricalBacktest);
const mockSchedule = vi.mocked(getScheduleDisparity);

async function subject() {
  return (await import("@/lib/home-findings-server")).loadHomepageDatabaseEvidence;
}

describe("loadHomepageDatabaseEvidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finishes the historical read before starting the schedule read", async () => {
    let releaseHistory!: (value: { marker: string }) => void;
    mockHistory.mockReturnValueOnce(new Promise((resolve) => { releaseHistory = resolve; }) as never);
    mockSchedule.mockResolvedValueOnce({ marker: "schedule" } as never);
    const load = await subject();

    const pending = load();
    await Promise.resolve();
    expect(mockHistory).toHaveBeenCalledWith(0);
    expect(mockSchedule).not.toHaveBeenCalled();

    releaseHistory({ marker: "history" });
    await expect(pending).resolves.toEqual({
      history: { marker: "history" },
      schedule: { marker: "schedule" },
    });
    expect(mockSchedule).toHaveBeenCalledWith("2025-26");
  });

  it("preserves historical evidence when an unequal schedule is withheld", async () => {
    mockHistory.mockResolvedValueOnce({ marker: "history" } as never);
    mockSchedule.mockRejectedValueOnce(new PublicApiError("Withheld", 422));
    const load = await subject();

    await expect(load()).resolves.toEqual({
      history: { marker: "history" },
      schedule: null,
    });
  });
});
