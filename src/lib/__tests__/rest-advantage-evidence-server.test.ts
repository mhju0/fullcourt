/**
 * Pins the backtest cache: the expensive read must not repeat while the input is
 * unchanged, and must repeat as soon as a game goes final.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCompletedGamesStamp,
  getCompletedGamesWithFatigue,
} from "@/lib/db/queries";
import type { HistoricalGameEvidenceRow } from "@/lib/rest-advantage-evidence";

vi.mock("@/lib/db/queries", () => ({
  getCompletedGamesStamp: vi.fn(),
  getCompletedGamesWithFatigue: vi.fn(),
  searchRegularSeasonGames: vi.fn(),
}));

const mockStamp = vi.mocked(getCompletedGamesStamp);
const mockRows = vi.mocked(getCompletedGamesWithFatigue);

const ROWS: HistoricalGameEvidenceRow[] = [
  {
    date: "2024-12-25",
    season: "2024-25",
    homeScore: 110,
    awayScore: 100,
    homeFatigueScore: "2.0",
    awayFatigueScore: "9.0",
  },
];

/** Fresh module per test: the cache is module state. */
async function loadModule() {
  vi.resetModules();
  return import("@/lib/rest-advantage-evidence-server");
}

describe("getHistoricalBacktest", () => {
  beforeEach(() => {
    mockStamp.mockReset();
    mockRows.mockReset();
    mockRows.mockResolvedValue(ROWS);
  });

  it("reads the games once while the stamp is unchanged", async () => {
    mockStamp.mockResolvedValue("1230@2025-04-13");
    const { getHistoricalBacktest } = await loadModule();

    const first = await getHistoricalBacktest(0);
    const second = await getHistoricalBacktest(0);

    expect(mockRows).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(mockStamp).toHaveBeenCalledTimes(2);
  });

  it("re-reads when a game goes final", async () => {
    mockStamp
      .mockResolvedValueOnce("1230@2025-04-13")
      .mockResolvedValueOnce("1231@2025-04-14");
    const { getHistoricalBacktest } = await loadModule();

    await getHistoricalBacktest(0);
    await getHistoricalBacktest(0);

    expect(mockRows).toHaveBeenCalledTimes(2);
  });

  it("caches per threshold rather than serving one threshold's answer for another", async () => {
    mockStamp.mockResolvedValue("1230@2025-04-13");
    const { getHistoricalBacktest } = await loadModule();

    const all = await getHistoricalBacktest(0);
    const filtered = await getHistoricalBacktest(5);

    expect(mockRows).toHaveBeenCalledTimes(2);
    expect(filtered).not.toBe(all);
    expect(await getHistoricalBacktest(5)).toBe(filtered);
    expect(mockRows).toHaveBeenCalledTimes(2);
  });

  it("bounds the cache against arbitrary thresholds from the query string", async () => {
    mockStamp.mockResolvedValue("1230@2025-04-13");
    const { getHistoricalBacktest } = await loadModule();

    for (let i = 0; i < 20; i++) await getHistoricalBacktest(i);

    // 16 entries evicted wholesale at the cap, so the earliest is gone and re-reads.
    const callsBefore = mockRows.mock.calls.length;
    await getHistoricalBacktest(0);
    expect(mockRows.mock.calls.length).toBe(callsBefore + 1);
  });
});
