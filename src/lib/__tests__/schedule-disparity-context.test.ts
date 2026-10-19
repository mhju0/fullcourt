import { describe, expect, it } from "vitest";
import { computeScheduleDisparity, seasonRankability, type DisparityGameRow } from "@/lib/schedule-disparity";

const row = (date: string, home: number, away: number, contextOnly = false): DisparityGameRow => ({ date, status: "final", homeTeamId: home, awayTeamId: away, homeFatigueScore: "1", awayFatigueScore: "4", neutralSite: contextOnly, contextOnly });

describe("Schedule Edge physical context", () => {
  it("uses Cup workload for next regular rest/density while preserving counts, rankings and Worth targets", () => {
    const targets = [row("2023-12-01", 1, 2), row("2023-12-04", 1, 2)];
    const cup = row("2023-12-03", 1, 3, true);
    const normal = computeScheduleDisparity("2023-24", targets);
    const withCup = computeScheduleDisparity("2023-24", [targets[0], cup, targets[1]]);
    expect(seasonRankability([targets[0], cup, targets[1]])).toEqual(seasonRankability(targets));
    expect(withCup.scheduledGames).toBe(2);
    expect(withCup.missingFixtureGames).toBe(1228);
    expect(withCup.gamesPerTeamMin).toBe(2);
    expect(withCup.gamesPerTeamMax).toBe(2);
    expect(withCup.league.countedGames).toBe(1);
    expect(withCup.teams.map(t => t.teamId).sort()).toEqual([1, 2]);
    const host = withCup.teams.find(t => t.teamId === 1)!;
    expect(host.netRestEdge).toBe(-2);
    expect(host.backToBackEdge).toBe(-1);
    expect(host.threeInFourEdge).toBe(-1);
    expect(withCup.teams.map(t => [t.teamId, t.restStates, t.scheduleValueWins]).sort())
      .toEqual(normal.teams.map(t => [t.teamId, t.restStates, t.scheduleValueWins]).sort());
  });

  it("keeps a scheduled context game out of target progress but marks later fatigue projected", () => {
    const target = row("2023-12-04", 1, 2);
    const scheduledCup = { ...row("2023-12-03", 1, 2, true), status: "scheduled" };
    const result = computeScheduleDisparity("2023-24", [row("2023-12-01", 1, 2), scheduledCup, target]);
    expect(result.scheduledGames).toBe(2);
    expect(result.provisional).toBe(false);
    expect(result.league.projectedGames).toBe(1);
  });
});
