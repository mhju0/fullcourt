import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCompletedGamesStamp, getCompletedGamesWithFatigue,
  getIncompleteRegularSeasonSeasons, getIncompleteRegularSeasonSeasonsStamp,
} from "@/lib/db/queries";

vi.mock("@/lib/db/queries", () => ({
  getCompletedGamesStamp: vi.fn(), getCompletedGamesWithFatigue: vi.fn(),
  getIncompleteRegularSeasonSeasons: vi.fn(), getIncompleteRegularSeasonSeasonsStamp: vi.fn(),
}));

describe("getHomeCourtStudy", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.mocked(getCompletedGamesStamp).mockResolvedValue("finals");
    vi.mocked(getIncompleteRegularSeasonSeasonsStamp).mockResolvedValue("pending");
    vi.mocked(getCompletedGamesWithFatigue).mockResolvedValue([{
      date: "2025-04-13", season: "2024-25", homeScore: 110, awayScore: 100,
      homeFatigueScore: "0", awayFatigueScore: "5", neutralSite: false,
    }]);
    vi.mocked(getIncompleteRegularSeasonSeasons).mockResolvedValue(new Set());
  });

  it("loads both annual series from one shared read and reuses the stamped result", async () => {
    const { getHomeCourtStudy } = await import("@/lib/home-court-study-server");
    const first = await getHomeCourtStudy();
    expect(await getHomeCourtStudy()).toBe(first);
    expect(getCompletedGamesWithFatigue).toHaveBeenCalledOnce();
    expect(getIncompleteRegularSeasonSeasons).toHaveBeenCalledOnce();
    expect(first.seasonWinRates[0]).toMatchObject({ games: 1, largeRestGap: { games: 1, winPct: 100 } });
  });

  it("invalidates both series when finals or season completion changes", async () => {
    const { getHomeCourtStudy } = await import("@/lib/home-court-study-server");
    await getHomeCourtStudy();
    vi.mocked(getCompletedGamesStamp).mockResolvedValue("new-final");
    await getHomeCourtStudy();
    vi.mocked(getIncompleteRegularSeasonSeasonsStamp).mockResolvedValue("new-pending");
    vi.mocked(getIncompleteRegularSeasonSeasons).mockResolvedValue(new Set(["2024-25"]));
    expect((await getHomeCourtStudy()).seasonWinRates[0].isComplete).toBe(false);
    expect(getCompletedGamesWithFatigue).toHaveBeenCalledTimes(3);
  });

  it("discards a failed read so a later request can recover", async () => {
    const { getHomeCourtStudy } = await import("@/lib/home-court-study-server");
    vi.mocked(getCompletedGamesWithFatigue).mockRejectedValueOnce(new Error("database unavailable"));
    await expect(getHomeCourtStudy()).rejects.toThrow("database unavailable");
    expect((await getHomeCourtStudy()).seasonWinRates).toHaveLength(1);
    expect(getCompletedGamesWithFatigue).toHaveBeenCalledTimes(2);
  });
});
