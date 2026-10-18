import { describe, expect, it } from "vitest";
import { historicalHomeFinding, scheduleHomeFinding, shootingHomeCoverage, type HomepageHistoricalEvidence } from "@/lib/home-findings";
import { gapRangeByKey } from "@/lib/rest-advantage-evidence";
import type { AnalysisResponse, ScheduleDisparityResponse, ScheduleDisparityTeam } from "@/types";

type Season = AnalysisResponse["seasonWinRates"][number];
function season(label: string, overrides: Partial<Season> = {}): Season {
  return {
    season: label, homeGames: 100, homeWins: 60,
    latestEvidenceDate: `${Number(label.slice(0, 4)) + 1}-04-13`,
    games: 20, restedTeamWins: 13, winPct: 65, homeBaselinePct: 60,
    isComplete: true, ...overrides,
  };
}
function history(baselineSeasons: Season[], largeGapSeasons = baselineSeasons): HomepageHistoricalEvidence {
  return { baselineSeasons, largeGapSeasons, minGap: gapRangeByKey("large").min };
}

function team(id: number, edge: number | null): ScheduleDisparityTeam {
  return { teamId: id, abbreviation: String(id), name: `Test team ${id}`, netEdgeGames: edge, netRestEdge: 100 - id } as ScheduleDisparityTeam;
}
function schedule(teams: ScheduleDisparityTeam[]): ScheduleDisparityResponse {
  return { season: "2024-25", teams, league: { measuredGames: 20 }, scheduledGames: 30, latestFinalDate: null, provisional: true } as ScheduleDisparityResponse;
}

describe("homepage evidence boundaries", () => {
  it("keeps a measured zero and uses the home baseline rather than 50 percent", () => {
    const rows = [season("2024-25", { homeWins: 65 }), season("2023-24", { homeWins: 65 })];
    expect(historicalHomeFinding(history(rows))).toMatchObject({
      edgePp: 0, baselinePct: 65, coverage: "2023-24 to 2024-25",
      seasonCount: 2, latestEvidenceDate: "2025-04-13",
    });
  });
  it("requires the explicit large-gap season population instead of all rested-home games", () => {
    const baseline = [season("2024-25", { games: 80, restedTeamWins: 48 })];
    const large = [season("2024-25")];
    expect(historicalHomeFinding(history(baseline, large))).toMatchObject({ minGap: 5, games: 20, winPct: 65 });
    expect(historicalHomeFinding({ ...history(baseline, large), minGap: 0 })).toBeNull();
  });
  it("uses exactly the latest ten completed baseline seasons, including a zero-large-gap season", () => {
    const completed = Array.from({ length: 11 }, (_, index) => season(`${2015 + index}-${String(2016 + index).slice(-2)}`));
    const ongoing = season("2026-27", { isComplete: false, homeGames: 1000, homeWins: 0 });
    const baseline = [ongoing, ...completed].reverse();
    const large = baseline.filter((row) => row.season !== "2025-26");
    expect(historicalHomeFinding(history(baseline, large))).toMatchObject({
      seasonCount: 10, coverage: "2016-17 to 2025-26", baselineGames: 1000,
      baselinePct: 60, games: 180, winPct: 65, edgePp: 5, latestEvidenceDate: "2026-04-13",
    });
  });
  it("pools raw wins and games before calculating rates and the difference", () => {
    const data = history(
      [season("2024-25", { homeGames: 11866, homeWins: 6671, homeBaselinePct: 56.2 })],
      [season("2024-25", { games: 555, restedTeamWins: 340, winPct: 61.3 })],
    );
    const finding = historicalHomeFinding(data)!;
    expect(finding.baselinePct).toBeCloseTo(56.219450531, 8);
    expect(finding.winPct).toBeCloseTo(61.261261261, 8);
    expect(finding.edgePp).toBeCloseTo(5.041810730, 8);
    expect(finding.edgePp.toFixed(1)).toBe("5.0");
  });
  it("withholds empty or incomplete populations instead of inventing zero or a period", () => {
    expect(historicalHomeFinding(history([]))).toBeNull();
    expect(historicalHomeFinding(history([season("2024-25")], []))).toBeNull();
    expect(historicalHomeFinding(history([season("2024-25", { homeGames: 0 })]))).toBeNull();
    expect(historicalHomeFinding(history([season("2024-25", { isComplete: false })]))).toBeNull();
  });
  it("preserves negative findings and never uses a date from outside the selected window", () => {
    const rows = [season("2024-25", { homeWins: 70 }), season("2025-26", { isComplete: false })];
    expect(historicalHomeFinding(history(rows))).toMatchObject({ edgePp: -5, latestEvidenceDate: "2025-04-13", seasonCount: 1 });
  });
  it("does not present calendar rest-day rankings as measured fatigue games", () => {
    expect(scheduleHomeFinding(schedule([team(1, null), team(2, null)]))).toMatchObject({ most: null, least: null });
  });
  it("excludes missing teams and labels ties while preserving measured zero", () => {
    expect(scheduleHomeFinding(schedule([team(1, null), team(2, 0), team(3, 4), team(4, 4)]))).toMatchObject({
      most: { value: 4, tied: true }, least: { value: 0, tied: false }, uniform: false,
    });
    expect(scheduleHomeFinding(schedule([team(1, 0), team(2, 0)]))?.uniform).toBe(true);
  });
  it("derives player coverage from the exported seasons", () => {
    expect(shootingHomeCoverage({ seasons: [] })).toBeNull();
    expect(shootingHomeCoverage({ seasons: [[0, 2025], [1, 1996], [2, 2024]] })).toBe("1996-97 to 2025-26");
  });
});
