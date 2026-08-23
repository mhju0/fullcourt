import { describe, expect, it } from "vitest";

import { computeScheduleDisparity, type DisparityGameRow } from "@/lib/schedule-disparity";
import { buildSeasonReport, type SeasonReportRow } from "@/lib/season-report";

/**
 * Schedule Edge and the Season Report publish the same per-team schedule value, computed by two
 * reducers over two row shapes. This runs both over ONE set of games and asserts they file every
 * game into the same rest-state bucket and price it to the same wins figure.
 *
 * Until 2026-08-23 that agreement was held by parallel construction alone — each side classified
 * games itself, with the same boundary and the same state mapping written twice and "the two must
 * never disagree" carried in comments. This is the test those comments were standing in for: if
 * either reducer's classification drifts, the two pages publish two different values for the same
 * team, and this fails naming the team.
 */

/** One game, stated once, rendered into each reducer's row shape below. */
interface FixtureGame {
  date: string;
  homeTeamId: number;
  awayTeamId: number;
  homeFatigue: string | null;
  awayFatigue: string | null;
}

const GAMES: FixtureGame[] = [
  // A clear home rest edge.
  { date: "2024-01-01", homeTeamId: 1, awayTeamId: 2, homeFatigue: "3.00", awayFatigue: "6.00" },
  // Exactly on the 0.5 boundary — a call, not neutral. The seam where two hand-rolled
  // comparisons would drift first.
  { date: "2024-01-03", homeTeamId: 2, awayTeamId: 3, homeFatigue: "5.00", awayFatigue: "5.50" },
  // Just under the boundary — neutral for both sides.
  { date: "2024-01-05", homeTeamId: 3, awayTeamId: 1, homeFatigue: "5.00", awayFatigue: "5.49" },
  // A clear road rest edge (the home side is the tired one).
  { date: "2024-01-07", homeTeamId: 1, awayTeamId: 3, homeFatigue: "6.00", awayFatigue: "4.00" },
  // Missing one fatigue score: absent from every bucket in both reducers, never "neutral".
  { date: "2024-01-09", homeTeamId: 2, awayTeamId: 1, homeFatigue: "5.00", awayFatigue: null },
];

const disparityRows: DisparityGameRow[] = GAMES.map((g) => ({
  date: g.date,
  status: "final",
  homeTeamId: g.homeTeamId,
  awayTeamId: g.awayTeamId,
  homeFatigueScore: g.homeFatigue,
  awayFatigueScore: g.awayFatigue,
}));

const side = (fatigue: string) => ({
  fatigueScore: fatigue,
  travelDistanceMiles: "0",
  isBackToBack: false,
  isThreeInFour: false,
  hasTimeZoneDisplacement: false,
});

const seasonRows: SeasonReportRow[] = GAMES.map((g, i) => ({
  gameId: i + 1,
  date: g.date,
  status: "final",
  homeTeamId: g.homeTeamId,
  awayTeamId: g.awayTeamId,
  homeScore: 100,
  awayScore: 90,
  home: g.homeFatigue === null ? null : side(g.homeFatigue),
  away: g.awayFatigue === null ? null : side(g.awayFatigue),
}));

describe("Schedule Edge and the Season Report price the same games identically", () => {
  const disparity = computeScheduleDisparity("2023-24", disparityRows);
  const report = buildSeasonReport("2023-24", seasonRows);

  it("files every game into the same rest-state buckets for every team", () => {
    for (const reportTeam of report.teams) {
      const disparityTeam = disparity.teams.find((t) => t.teamId === reportTeam.teamId);
      expect(disparityTeam, `team ${reportTeam.teamId} missing from Schedule Edge`).toBeDefined();
      expect(disparityTeam!.restStates, `team ${reportTeam.teamId} rest states diverge`).toEqual(
        reportTeam.restStates
      );
    }
  });

  it("publishes the same schedule value in wins for every team", () => {
    for (const reportTeam of report.teams) {
      const disparityTeam = disparity.teams.find((t) => t.teamId === reportTeam.teamId)!;
      expect(
        disparityTeam.scheduleValueWins,
        `team ${reportTeam.teamId} priced differently on the two pages`
      ).toBe(reportTeam.scheduleValueWins);
    }
  });

  it("actually classified something on each side of the boundary", () => {
    // Guards the fixture, not the code: if every game landed neutral the two tests above would
    // pass while comparing nothing.
    const states = report.teams.map((t) => t.restStates);
    expect(states.some((s) => s.restedHome > 0)).toBe(true);
    expect(states.some((s) => s.tiredHome > 0)).toBe(true);
    expect(states.some((s) => s.neutralHome > 0)).toBe(true);
  });
});
