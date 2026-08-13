import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../analysis/route";
import { CACHE } from "@/lib/api-route";
import { getCompletedGamesStamp, getCompletedGamesWithFatigue } from "@/lib/db/queries";
import type { AnalysisResponse } from "@/types";

vi.mock("@/lib/db/queries", () => ({
  getCompletedGamesWithFatigue: vi.fn(),
  getCompletedGamesStamp: vi.fn(),
}));

const mockGetCompleted = vi.mocked(getCompletedGamesWithFatigue);
const mockStamp = vi.mocked(getCompletedGamesStamp);

/** A distinct stamp per case, so the backtest cache never answers one case from another's rows. */
let stampSeq = 0;

/** Build final games with fatigue strings. `away - home` = rest-advantage differential. */
function row(
  date: string,
  homeFatigue: number,
  awayFatigue: number,
  homeScore: number,
  awayScore: number
) {
  return {
    date,
    season: "2023-24",
    homeFatigueScore: String(homeFatigue),
    awayFatigueScore: String(awayFatigue),
    homeScore,
    awayScore,
  };
}

function makeReq(search = "") {
  return new NextRequest(`http://localhost/api/analysis${search}`);
}

describe("GET /api/analysis", () => {
  beforeEach(() => {
    mockGetCompleted.mockReset();
    mockStamp.mockReset();
    mockStamp.mockResolvedValue(`stamp-${++stampSeq}`);
  });

  it.each(["?seasonMinRA=banana", "?seasonMinRA=-1", "?seasonMinRA=Infinity"])(
    "returns 400 without querying for invalid parameters: %s",
    async (search) => {
      const res = await GET(makeReq(search));

      expect(res.status).toBe(400);
      expect(mockGetCompleted).not.toHaveBeenCalled();
      const body = (await res.json()) as { error: string };
      expect(body.error.length).toBeGreaterThan(0);
    }
  );

  it("returns 200 with the expected analysis payload shape", async () => {
    mockGetCompleted.mockResolvedValueOnce([
      row("2024-01-02", 4, 9, 110, 100),
      row("2024-01-03", 6, 2, 98, 102),
      row("2024-01-04", 3, 8, 105, 99),
      row("2024-01-05", 5, 5.2, 101, 103),
      row("2024-01-06", 1, 9, 112, 104),
      row("2024-01-07", 2, 10, 106, 95),
      row("2024-01-08", 7, 1, 97, 108),
      row("2024-01-09", 4, 11, 120, 115),
      row("2024-01-10", 3, 12, 88, 92),
      row("2024-01-11", 8, 2, 99, 102),
    ]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: AnalysisResponse;
      error: string | null;
    };

    expect(body.error).toBeNull();
    const d = body.data;

    expect(typeof d.totalGames).toBe("number");
    expect(typeof d.overallWins).toBe("number");
    expect(typeof d.overallWinRate).toBe("number");
    expect(Array.isArray(d.thresholds)).toBe(true);
    expect(d.homeAwayBreakdown).toMatchObject({
      homeTeamMoreRested: expect.objectContaining({
        games: expect.any(Number),
        winPct: expect.any(Number),
      }),
      awayTeamMoreRested: expect.objectContaining({
        games: expect.any(Number),
        winPct: expect.any(Number),
      }),
    });
    expect(Array.isArray(d.seasonWinRates)).toBe(true);
  });

  it("surfaces percentages between 0 and 100 everywhere", async () => {
    mockGetCompleted.mockResolvedValueOnce([
      row("2024-02-01", 2, 8, 100, 90),
      row("2024-02-02", 7, 1, 95, 99),
      row("2024-02-03", 3, 9, 108, 102),
    ]);

    const res = await GET(makeReq());
    const body = (await res.json()) as { data: AnalysisResponse; error: string | null };
    expect(body.error).toBeNull();
    const d = body.data;

    const pcts: number[] = [d.overallWinRate];
    for (const t of d.thresholds) {
      pcts.push(t.winPct);
    }
    pcts.push(d.homeAwayBreakdown.homeTeamMoreRested.winPct);
    pcts.push(d.homeAwayBreakdown.awayTeamMoreRested.winPct);

    for (const p of pcts) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
  });

  it("orders thresholds 2, 3, 5, 7 and keeps bucket game counts descending", async () => {
    mockGetCompleted.mockResolvedValueOnce([
      row("2024-03-01", 1, 8, 105, 98),
      row("2024-03-02", 2, 9, 110, 102),
      row("2024-03-03", 0, 10, 95, 88),
      row("2024-03-04", 3, 11, 118, 112),
      row("2024-03-05", 4, 12, 100, 99),
      row("2024-03-06", 1, 7, 102, 98),
      row("2024-03-07", 2, 8, 99, 97),
      row("2024-03-08", 5, 13, 121, 115),
    ]);

    const res = await GET(makeReq());
    const body = (await res.json()) as { data: AnalysisResponse; error: string | null };
    expect(body.error).toBeNull();

    const thresholds = body.data.thresholds.map((t) => t.threshold);
    expect(thresholds).toEqual([2, 3, 5, 7]);

    const counts = body.data.thresholds.map((t) => t.games);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i - 1]).toBeGreaterThanOrEqual(counts[i]);
    }
  });

  it("excludes rested-visitor games from every rate, however large their rest edge", async () => {
    mockGetCompleted.mockResolvedValueOnce([
      // home rested by 8, home won → called, and a hit.
      { ...row("2017-01-01", 1, 9, 110, 100), season: "2016-17" },
      // visitor rested by 8 and won → a big edge, and not called.
      { ...row("2017-01-02", 10, 2, 100, 108), season: "2016-17" },
      // visitor rested by 8 and lost → also not called. Neither outcome is scored.
      { ...row("2017-01-03", 10, 2, 108, 100), season: "2016-17" },
      // home rested by 6.9 → called, but under the 7 threshold.
      { ...row("2017-01-04", 4, 10.9, 100, 90), season: "2016-17" },
    ]);

    const res = await GET(makeReq("?seasonMinRA=7"));
    const body = (await res.json()) as { data: AnalysisResponse; error: string | null };

    expect(body.error).toBeNull();

    // Only the first game is both called and over the threshold. The two rested-visitor games
    // are dropped whichever way they went, which is the whole point: a rule that declined
    // those picks cannot bank the one that happened to win.
    expect(body.data.thresholds.find((t) => t.threshold === 7)).toMatchObject({
      games: 1,
      restedTeamWins: 1,
    });
    // The season's own home baseline stays on all four games — home won three of them — while
    // the published rate sees only the one game that is both called and over the threshold.
    // The two populations are meant to diverge; that divergence is what the frame subtracts.
    expect(body.data.seasonWinRates).toEqual([
      {
        season: "2016-17",
        games: 1,
        restedTeamWins: 1,
        winPct: 100,
        homeBaselinePct: 75,
      },
    ]);

    // The evidence for declining them is still published, and still counts all three.
    expect(body.data.homeAwayBreakdown).toMatchObject({
      homeTeamMoreRested: { games: 2 },
      awayTeamMoreRested: { games: 2, restedTeamWins: 1 },
    });
  });

  // Pins which policy this route asks for. `api-route.test.ts` proves the header mechanism, but
  // nothing proved any route still requests one — a deleted policy failed no test.
  it("lets the edge hold the backtest, which only a pipeline run can move", async () => {
    mockGetCompleted.mockResolvedValueOnce([row("2024-01-02", 4, 9, 110, 100)]);

    const res = await GET(makeReq());
    expect(res.headers.get("cache-control")).toBe(CACHE.historical);
  });
});
