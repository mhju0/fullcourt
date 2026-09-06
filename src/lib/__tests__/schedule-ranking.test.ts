import { describe, expect, it } from "vitest";
import { rankScheduleTeams } from "@/lib/schedule-ranking";

const team = (teamId: number, netEdgeGames: number | null, netRestEdge = 0) => ({
  teamId, netEdgeGames, netRestEdge,
});

describe("Schedule Edge ranking", () => {
  it("keeps unmeasured teams below negative and zero measurements without ranking them", () => {
    const input = [team(4, null, 100), team(2, -3), team(3, 0), team(1, 2), team(5, null, -100)];
    const result = rankScheduleTeams(input);
    expect(result.basis).toBe("fatigue");
    expect(result.unit).toBe("games");
    expect(result.rows.map(({ team, value, rank }) => [team.teamId, value, rank])).toEqual([
      [1, 2, 1], [3, 0, 2], [2, -3, 3], [4, null, null], [5, null, null],
    ]);
    expect(result.most?.team.teamId).toBe(1);
    expect(result.least?.team.teamId).toBe(2);
    expect(result.spread).toBe(5);
    expect(input.map((t) => t.teamId)).toEqual([4, 2, 3, 1, 5]);
  });

  it("ranks everyone by net rest edge only when no team has a fatigue measurement", () => {
    const result = rankScheduleTeams([team(3, null, -2), team(2, null, 4), team(1, null, 4)]);
    expect(result.basis).toBe("rest");
    expect(result.unit).toBe("rest days");
    expect(result.rows.map(({ team, value, rank }) => [team.teamId, value, rank])).toEqual([
      [1, 4, 1], [2, 4, 2], [3, -2, 3],
    ]);
    expect(result.spread).toBe(6);
  });

  it("keeps team-id tie ordering and measured zero distinct from missing", () => {
    const result = rankScheduleTeams([team(3, 0), team(1, null), team(2, 0)]);
    expect(result.rows.map(({ team, rank }) => [team.teamId, rank])).toEqual([[2, 1], [3, 2], [1, null]]);
    expect(result.spread).toBe(0);
  });

  it("does not use an opener's priced schedule value as a fatigue measurement", () => {
    const pricedOpener = { ...team(1, null, 4), scheduleValueWins: 0.12 };
    const result = rankScheduleTeams([pricedOpener, { ...team(2, -1), scheduleValueWins: -0.12 }]);
    expect(result.rows[1]).toEqual({ team: pricedOpener, value: null, rank: null });
    expect(result.most?.team.teamId).toBe(2);
    expect(result.least?.team.teamId).toBe(2);
    expect(result.spread).toBe(0);
  });

  it("publishes no extremes or spread without teams", () => {
    const result = rankScheduleTeams([]);
    expect(result.rows).toEqual([]);
    expect(result.most).toBeUndefined();
    expect(result.least).toBeUndefined();
    expect(result.spread).toBeNull();
  });
});
