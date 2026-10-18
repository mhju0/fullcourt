import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getCompletedGamesStamp,
  getCompletedGamesWithFatigue,
  getIncompleteRegularSeasonSeasons,
  getIncompleteRegularSeasonSeasonsStamp,
} from "@/lib/db/queries";
import { historicalHomeFinding } from "@/lib/home-findings";
import type { HistoricalGameEvidenceRow } from "@/lib/rest-advantage-evidence";
import { getScheduleDisparity } from "@/lib/schedule-disparity-server";

vi.mock("@/lib/db/queries", () => ({
  getCompletedGamesStamp: vi.fn(),
  getCompletedGamesWithFatigue: vi.fn(),
  getIncompleteRegularSeasonSeasons: vi.fn(),
  getIncompleteRegularSeasonSeasonsStamp: vi.fn(),
}));
vi.mock("@/lib/schedule-disparity-server", () => ({ getScheduleDisparity: vi.fn() }));
vi.mock("@/lib/schedule-disparity", () => ({ defaultRankableSeason: vi.fn(() => "2025-26") }));

const mockRows = vi.mocked(getCompletedGamesWithFatigue);
const mockIncomplete = vi.mocked(getIncompleteRegularSeasonSeasons);
const mockCompletionStamp = vi.mocked(getIncompleteRegularSeasonSeasonsStamp);
const mockSchedule = vi.mocked(getScheduleDisparity);

function game(overrides: Partial<HistoricalGameEvidenceRow> = {}): HistoricalGameEvidenceRow {
  return {
    date: "2025-04-13", season: "2024-25", homeScore: 110, awayScore: 100,
    homeFatigueScore: "0", awayFatigueScore: "5", neutralSite: false, ...overrides,
  };
}

async function subject() {
  return (await import("@/lib/home-findings-server")).loadHomepageDatabaseEvidence;
}

describe("loadHomepageDatabaseEvidence", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.mocked(getCompletedGamesStamp).mockResolvedValue("finals");
    mockCompletionStamp.mockResolvedValue("pending");
    mockRows.mockResolvedValue([game()]);
    mockIncomplete.mockResolvedValue(new Set());
    mockSchedule.mockResolvedValue({ marker: "schedule" } as never);
  });

  it("finishes the historical reads before the schedule and reads the full population once", async () => {
    let releaseRows!: (value: HistoricalGameEvidenceRow[]) => void;
    mockRows.mockReturnValueOnce(new Promise((resolve) => { releaseRows = resolve; }));
    const load = await subject();
    const pending = load();
    await vi.waitFor(() => expect(mockRows).toHaveBeenCalledOnce());
    expect(mockIncomplete).not.toHaveBeenCalled();
    expect(mockSchedule).not.toHaveBeenCalled();

    releaseRows([game()]);
    const result = await pending;
    expect(result.history.minGap).toBe(5);
    expect(result.schedule).toEqual({ marker: "schedule" });
    expect(mockIncomplete).toHaveBeenCalledOnce();
    expect(mockSchedule).toHaveBeenCalledWith("2025-26");
    await load();
    expect(mockRows).toHaveBeenCalledOnce();
  });

  it("uses the existing neutral, visitor, rounded-gap and completion rules for both populations", async () => {
    mockRows.mockResolvedValue([
      game(),
      game({ awayFatigueScore: "4.99", homeScore: 90 }),
      game({ homeFatigueScore: "5", awayFatigueScore: "0" }),
      game({ neutralSite: true }),
      game({ date: "2026-04-13", season: "2025-26", awayFatigueScore: "0" }),
      game({ date: "2026-10-21", season: "2026-27" }),
    ]);
    mockIncomplete.mockResolvedValue(new Set(["2026-27"]));
    const { history } = await (await subject())();
    expect(history.largeGapSeasons.map((row) => row.season)).not.toContain("2025-26");
    expect(historicalHomeFinding(history)).toMatchObject({
      seasonCount: 2, coverage: "2024-25 to 2025-26", games: 1,
      baselineGames: 4, baselinePct: 75, winPct: 100, edgePp: 25,
      latestEvidenceDate: "2026-04-13",
    });
  });

  it("invalidates held completion state even when final rows have not changed", async () => {
    const load = await subject();
    expect(historicalHomeFinding((await load()).history)).not.toBeNull();
    mockCompletionStamp.mockResolvedValue("new-pending");
    mockIncomplete.mockResolvedValue(new Set(["2024-25"]));
    expect(historicalHomeFinding((await load()).history)).toBeNull();
    expect(mockRows).toHaveBeenCalledTimes(2);
  });

  it("preserves historical evidence when an unequal schedule is withheld", async () => {
    const { PublicApiError } = await import("@/lib/api-errors");
    mockSchedule.mockRejectedValueOnce(new PublicApiError("Withheld", 422));
    const result = await (await subject())();
    expect(result.schedule).toBeNull();
    expect(historicalHomeFinding(result.history)).not.toBeNull();
  });

  it("propagates database and unexpected schedule failures", async () => {
    const load = await subject();
    mockRows.mockRejectedValueOnce(new Error("history failed"));
    await expect(load()).rejects.toThrow("history failed");
    expect(mockSchedule).not.toHaveBeenCalled();
    mockSchedule.mockRejectedValueOnce(new Error("schedule failed"));
    await expect(load()).rejects.toThrow("schedule failed");
  });
});
