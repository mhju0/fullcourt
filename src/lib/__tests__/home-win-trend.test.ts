import { describe, expect, it } from "vitest";
import { buildHomeWinTrend } from "../home-win-trend";
import type { AnalysisResponse } from "@/types";

type Season = AnalysisResponse["seasonWinRates"][number];
const season = (year: number, homeGames = 100, homeWins = 60): Season => ({
  season: `${year}-${String(year + 1).slice(-2)}`, homeGames, homeWins,
  homeBaselinePct: Math.round(homeWins / homeGames * 1000) / 10,
  latestEvidenceDate: `${year + 1}-04-15`, games: 0, restedTeamWins: 0, winPct: 0, isComplete: true,
});

describe("completed-season home win trend", () => {
  it("pools actual game counts rather than averaging annual percentages", () => {
    const rows = [season(2015), season(2016), season(2017), season(2018), season(2019, 1000, 500)];
    const trend = buildHomeWinTrend(rows);
    expect(trend.slice(0, 4).map(row => row.rollingHomeWinPct)).toEqual([null, null, null, null]);
    expect(trend[4].rollingHomeWinPct).toBeCloseTo(740 / 1400 * 100);
    expect(trend[4].rollingHomeWinPct).not.toBe(58);
    expect(trend[4].homeWinPct).toBe(50);
  });

  it("breaks missing calendar years and resumes after five consecutive complete seasons", () => {
    const rows = [2015, 2016, 2018, 2019, 2020, 2021, 2022].map(year => season(year));
    const trend = buildHomeWinTrend(rows);
    expect(trend.find(row => row.season === "2017-18")).toMatchObject({homeWinPct: null, rollingHomeWinPct: null});
    expect(trend.slice(0, -1).every(row => row.rollingHomeWinPct === null)).toBe(true);
    expect(trend.at(-1)?.rollingHomeWinPct).toBe(60);
  });

  it("excludes incomplete and zero-game seasons while retaining eligible 2019-20 records", () => {
    const rows = Array.from({length: 7}, (_, i) => season(2017 + i));
    rows[4].isComplete = false;
    rows[6].homeGames = 0;
    const trend = buildHomeWinTrend(rows);
    expect(trend[2].homeWinPct).toBe(60);
    expect(trend[4].homeWinPct).toBeNull();
    expect(trend[6].homeWinPct).toBeNull();
    expect(trend.every(row => row.rollingHomeWinPct === null)).toBe(true);
  });

  it("sorts without mutating inputs and handles empty or short histories", () => {
    expect(buildHomeWinTrend([])).toEqual([]);
    const rows = [season(2022), season(2021)];
    expect(buildHomeWinTrend(rows).map(row => row.season)).toEqual(["2021-22", "2022-23"]);
    expect(rows[0].season).toBe("2022-23");
    expect(buildHomeWinTrend(rows).every(row => row.rollingHomeWinPct === null)).toBe(true);
  });
});
