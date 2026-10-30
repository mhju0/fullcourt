/**
 * Pins the backtest cache: the expensive read must not repeat while the input is
 * unchanged, and must repeat as soon as a game goes final.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCompletedGamesStamp,
  getCompletedGamesWithFatigue,
  getCompletedGamesWithFatigueCoverage,
  getIncompleteRegularSeasonSeasons,
  getIncompleteRegularSeasonSeasonsStamp,
  searchRegularSeasonGames,
} from "@/lib/db/queries";
import type { HistoricalGameEvidenceRow } from "@/lib/rest-advantage-evidence";

vi.mock("@/lib/db/queries", () => ({
  getCompletedGamesStamp: vi.fn(),
  getCompletedGamesWithFatigue: vi.fn(),
  getCompletedGamesWithFatigueCoverage: vi.fn(),
  getIncompleteRegularSeasonSeasons: vi.fn(),
  getIncompleteRegularSeasonSeasonsStamp: vi.fn(),
  searchRegularSeasonGames: vi.fn(),
}));

const mockStamp = vi.mocked(getCompletedGamesStamp);
const mockRows = vi.mocked(getCompletedGamesWithFatigue);
const mockCoverage = vi.mocked(getCompletedGamesWithFatigueCoverage);
const mockIncomplete = vi.mocked(getIncompleteRegularSeasonSeasons);
const mockIncompleteStamp = vi.mocked(getIncompleteRegularSeasonSeasonsStamp);
const mockSearch = vi.mocked(searchRegularSeasonGames);

const ROWS: HistoricalGameEvidenceRow[] = [
  {
    date: "2024-12-25",
    season: "2024-25",
    homeScore: 110,
    awayScore: 100,
    homeFatigueScore: "2.0",
    awayFatigueScore: "9.0",
    neutralSite: false,
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
    mockIncomplete.mockReset();
    mockIncomplete.mockResolvedValue(new Set());
    mockIncompleteStamp.mockResolvedValue("");
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

  it("rebuilds without re-reading the games when a season becomes pending or complete", async () => {
    mockStamp.mockResolvedValue("1230@2025-04-13");
    mockIncompleteStamp
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("2026-27");
    mockIncomplete
      .mockResolvedValueOnce(new Set())
      .mockResolvedValueOnce(new Set(["2026-27"]));
    const { getHistoricalBacktest } = await loadModule();

    const before = await getHistoricalBacktest(0);
    const after = await getHistoricalBacktest(0);

    expect(mockIncomplete).toHaveBeenCalledTimes(2);
    expect(mockRows).toHaveBeenCalledTimes(1);
    expect(after).not.toBe(before);
  });

  it("caches per threshold rather than serving one threshold's answer for another", async () => {
    mockStamp.mockResolvedValue("1230@2025-04-13");
    const { getHistoricalBacktest } = await loadModule();

    const all = await getHistoricalBacktest(0);
    const filtered = await getHistoricalBacktest(5);

    expect(filtered).not.toBe(all);
    expect(await getHistoricalBacktest(5)).toBe(filtered);
  });

  it("reads the games once however many thresholds the query string asks for", async () => {
    // Every new threshold used to re-run the heaviest read in the app (review, 2026-10-21).
    mockStamp.mockResolvedValue("1230@2025-04-13");
    const { getHistoricalBacktest } = await loadModule();

    for (let i = 0; i < 40; i++) await getHistoricalBacktest(i / 100);

    expect(mockRows).toHaveBeenCalledTimes(1);
  });

  it("reads coverage directly without loading or fingerprinting the historical rows", async () => {
    mockStamp.mockResolvedValue("1230@2025-04-13");
    mockCoverage.mockResolvedValue({ games: 47_143, latestEvidenceDate: "2026-04-12" });
    const { getHistoricalBacktest, getHistoricalEvidenceCoverage } = await loadModule();

    expect(await getHistoricalEvidenceCoverage()).toEqual({ games: 47_143, latestEvidenceDate: "2026-04-12" });
    expect(mockCoverage).toHaveBeenCalledOnce();
    expect(mockRows).not.toHaveBeenCalled();
    expect(mockStamp).not.toHaveBeenCalled();

    await getHistoricalBacktest(0);
    expect(mockRows).toHaveBeenCalledTimes(1);
    expect(mockStamp).toHaveBeenCalledOnce();
  });
});

/**
 * The explorer splits one request into the half that narrows rows in SQL and the half
 * that shapes the page. Both halves used to be decided at the route: it translated a
 * `minRA` of 0 into "no floor" before calling, which put a rule about what
 * rest-advantage values mean into a file whose job is parsing a query string.
 */
describe("searchHistoricalGameEvidence", () => {
  beforeEach(() => {
    mockSearch.mockReset();
    mockSearch.mockResolvedValue([]);
  });

  const REQUEST = { result: "all", page: 1, limit: 20 } as const;

  it("reads a threshold of 0 as no floor, not as a threshold of zero", async () => {
    // `minRAParam` defaults to 0, and the query already discards neutral games below the
    // neutral cutoff — so `>= 0` and no floor return the same rows either way.
    const { searchHistoricalGameEvidence } = await loadModule();

    await searchHistoricalGameEvidence({ ...REQUEST, minRA: 0 });

    expect(mockSearch).toHaveBeenCalledWith({
      minRA: undefined,
      team: undefined,
      season: undefined,
    });
  });

  it("passes a real threshold through", async () => {
    const { searchHistoricalGameEvidence } = await loadModule();

    await searchHistoricalGameEvidence({
      ...REQUEST,
      minRA: 5,
      team: "SEA",
      season: "1995-96",
    });

    expect(mockSearch).toHaveBeenCalledWith({
      minRA: 5,
      team: "SEA",
      season: "1995-96",
    });
  });

  it("keeps the paging half out of the query", async () => {
    const { searchHistoricalGameEvidence } = await loadModule();

    await searchHistoricalGameEvidence({
      result: "correct",
      page: 3,
      limit: 50,
      minRA: 2,
    });

    expect(mockSearch).toHaveBeenCalledWith({
      minRA: 2,
      team: undefined,
      season: undefined,
    });
  });

  it("narrows the query to just under a gap range's floor, leaving the exact bounds to the rows", async () => {
    // The SQL compares unrounded scores, and 2.996 rounds to 3.00 (D-87), so it must arrive.
    const { searchHistoricalGameEvidence } = await loadModule();

    await searchHistoricalGameEvidence({ ...REQUEST, gap: "medium", side: "home" });

    expect(mockSearch).toHaveBeenCalledWith({ minRA: 2.99, team: undefined, season: undefined });
  });

  it("reads the rows once across pages, results and sides of the same filters", async () => {
    // Paging is in memory, so each page used to cost the whole population (review, 2026-10-21).
    mockStamp.mockResolvedValue("1230@2025-04-13");
    const { searchHistoricalGameEvidence } = await loadModule();

    for (let page = 1; page <= 5; page++) {
      await searchHistoricalGameEvidence({ ...REQUEST, page });
      await searchHistoricalGameEvidence({ ...REQUEST, page, result: "correct", side: "home" });
    }

    expect(mockSearch).toHaveBeenCalledTimes(1);
  });

  it("re-reads the rows when a game goes final", async () => {
    mockStamp.mockResolvedValueOnce("1230@2025-04-13").mockResolvedValueOnce("1231@2025-04-14");
    const { searchHistoricalGameEvidence } = await loadModule();

    await searchHistoricalGameEvidence(REQUEST);
    await searchHistoricalGameEvidence(REQUEST);

    expect(mockSearch).toHaveBeenCalledTimes(2);
  });

  it("carries the paging half into the response", async () => {
    const { searchHistoricalGameEvidence } = await loadModule();

    const response = await searchHistoricalGameEvidence({
      result: "correct",
      page: 3,
      limit: 50,
    });

    expect(response).toMatchObject({ page: 3, limit: 50 });
  });
});

describe("getHistoricalEvidenceCoverage", () => {
  it("reads corrected aggregate coverage without consulting the historical row cache", async () => {
    mockRows.mockReset();
    mockStamp.mockReset();
    mockCoverage.mockReset();
    mockCoverage.mockResolvedValueOnce({ games: 2, latestEvidenceDate: "2025-01-01" })
      .mockResolvedValueOnce({ games: 1, latestEvidenceDate: "2024-12-25" });
    const { getHistoricalEvidenceCoverage } = await loadModule();
    const first = await getHistoricalEvidenceCoverage();
    expect(first).toEqual({ games: 2, latestEvidenceDate: "2025-01-01" });
    expect(await getHistoricalEvidenceCoverage()).toEqual({ games: 1, latestEvidenceDate: "2024-12-25" });
    expect(mockCoverage).toHaveBeenCalledTimes(2);
    expect(mockRows).not.toHaveBeenCalled();
    expect(mockStamp).not.toHaveBeenCalled();
  });
});
