import { describe, expect, it } from "vitest";
import { historicalHomeFinding, scheduleHomeFinding, shootingHomeCoverage } from "@/lib/home-findings";
import type { AnalysisResponse, ScheduleDisparityResponse, ScheduleDisparityTeam } from "@/types";

const historical: AnalysisResponse = {
  totalGames: 60, overallWins: 39, overallWinRate: 65,
  homeAwayBreakdown: { homeTeamMoreRested: { games: 60, restedTeamWins: 39, winPct: 65 }, awayTeamMoreRested: { games: 10, restedTeamWins: 4, winPct: 40 } },
  thresholds: [{ threshold: 7, games: 20, restedTeamWins: 13, winPct: 65 }],
  venueBaseline: { games: 100, homeWins: 65, homeWinPct: 65, roadWinPct: 35 },
  seasonWinRates: [{ season: "2024-25", games: 20, restedTeamWins: 13, winPct: 65, homeBaselinePct: 65 }, { season: "2023-24", games: 40, restedTeamWins: 26, winPct: 65, homeBaselinePct: 65 }],
};

function team(id: number, edge: number | null): ScheduleDisparityTeam {
  return { teamId: id, abbreviation: String(id), name: `Test team ${id}`, netEdgeGames: edge, netRestEdge: 100 - id } as ScheduleDisparityTeam;
}
function schedule(teams: ScheduleDisparityTeam[]): ScheduleDisparityResponse {
  return { season: "2024-25", teams, league: { measuredGames: 20 }, scheduledGames: 30, latestFinalDate: null, provisional: true } as ScheduleDisparityResponse;
}

describe("homepage evidence boundaries", () => {
  it("keeps a measured zero and uses the home baseline rather than 50 percent", () => {
    expect(historicalHomeFinding(historical)).toMatchObject({ edgePp: 0, baselinePct: 65, coverage: "2023-24 to 2024-25" });
  });
  it("withholds missing or empty headline populations rather than inventing zero", () => {
    expect(historicalHomeFinding({ ...historical, thresholds: [] })).toBeNull();
    expect(historicalHomeFinding({ ...historical, venueBaseline: { ...historical.venueBaseline, games: 0 } })).toBeNull();
  });
  it("preserves negative findings", () => {
    expect(historicalHomeFinding({ ...historical, venueBaseline: { ...historical.venueBaseline, homeWinPct: 70 } })?.edgePp).toBe(-5);
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
