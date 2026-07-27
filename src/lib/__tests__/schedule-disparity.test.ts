import { describe, expect, it } from "vitest";
import {
  computeScheduleDisparity,
  REST_DAYS_CAP,
  restDaysBeforeGames,
  type DisparityGameRow,
} from "../schedule-disparity";
import { calculateFatigue, type RecentGame } from "../fatigue";

function game(
  date: string,
  homeTeamId: number,
  awayTeamId: number,
  opts: Partial<Pick<DisparityGameRow, "status" | "homeFatigueScore" | "awayFatigueScore">> = {}
): DisparityGameRow {
  return {
    date,
    homeTeamId,
    awayTeamId,
    status: opts.status ?? "final",
    homeFatigueScore: opts.homeFatigueScore ?? null,
    awayFatigueScore: opts.awayFatigueScore ?? null,
  };
}

/**
 * Hand-computed fixture. Team game dates:
 *   T1: 01-01, 01-02, 01-10   T2: 01-01, 01-03, 01-10   T3: 01-02, 01-03
 *
 * G1 and G2 are each an opener for at least one side, so neither is counted.
 * G3 is counted: T3 rests 1, T2 rests 2.
 * G4 is counted: T1 rests 8, T2 rests 7 — both above the cap, so the capped edge is 0 while
 * the uncapped edge is +1 to T1. That divergence is what makes the cap assertions discriminating.
 */
const FIXTURE: DisparityGameRow[] = [
  game("2024-01-01", 2, 1), // G1 — both openers
  game("2024-01-02", 3, 1), // G2 — T3's opener
  game("2024-01-03", 3, 2, { homeFatigueScore: "8", awayFatigueScore: "5" }), // G3
  game("2024-01-10", 1, 2, { homeFatigueScore: "4", awayFatigueScore: "6" }), // G4
];

function teamsById(games: DisparityGameRow[] = FIXTURE) {
  const result = computeScheduleDisparity("2023-24", games);
  return {
    result,
    byId: new Map(result.teams.map((t) => [t.teamId, t])),
  };
}

describe("restDaysBeforeGames", () => {
  it("returns null for the opener and calendar gaps thereafter", () => {
    expect(restDaysBeforeGames(["2024-01-01", "2024-01-02", "2024-01-10"])).toEqual([null, 1, 8]);
  });

  it("returns a single null for a one-game schedule", () => {
    expect(restDaysBeforeGames(["2024-01-01"])).toEqual([null]);
  });
});

describe("computeScheduleDisparity — counted games", () => {
  it("excludes a game when either side is playing its season opener", () => {
    const { result, byId } = teamsById();

    // Only G3 and G4 are counted, so T1 (G4), T2 (G3+G4), T3 (G3).
    expect(result.league.countedGames).toBe(2);
    expect(byId.get(1)!.games).toBe(1);
    expect(byId.get(2)!.games).toBe(2);
    expect(byId.get(3)!.games).toBe(1);
  });

  it("never counts a season's very first game for either side", () => {
    const onlyOpeners = [game("2024-01-01", 2, 1)];
    const result = computeScheduleDisparity("2023-24", onlyOpeners);

    expect(result.league.countedGames).toBe(0);
    expect(result.teams.every((t) => t.games === 0)).toBe(true);
  });

  it("gives a team no rest before its first game of the set it was handed", () => {
    // Callers pass exactly one season, so this is what keeps rest from spanning seasons.
    const { byId } = teamsById();
    expect(byId.get(3)!.games).toBe(1); // T3 played 01-02 and 01-03; only the latter counts.
  });
});

describe("computeScheduleDisparity — the rest cap", () => {
  it("caps each side before differencing, collapsing a long-rest mismatch to zero", () => {
    const { byId } = teamsById();

    // G4: T1 rests 8, T2 rests 7. Both clamp to 5, so the capped edge is 0.
    expect(byId.get(1)!.netRestEdge).toBe(0);
    expect(byId.get(1)!.netRestEdgeUncapped).toBe(1);
  });

  it("reports capped and uncapped totals that genuinely differ", () => {
    const { byId } = teamsById();
    const t2 = byId.get(2)!;

    // T2: G3 edge +1 (2 vs 1), G4 edge 0 capped / -1 uncapped.
    expect(t2.netRestEdge).toBe(1);
    expect(t2.netRestEdgeUncapped).toBe(0);
    expect(t2.netRestEdge).not.toBe(t2.netRestEdgeUncapped);
  });

  it("leaves sub-cap rest untouched", () => {
    const { byId } = teamsById();

    // G3 is entirely below the cap, so T3's capped and uncapped edges agree.
    expect(byId.get(3)!.netRestEdge).toBe(-1);
    expect(byId.get(3)!.netRestEdgeUncapped).toBe(-1);
  });

  it("clamps at exactly REST_DAYS_CAP", () => {
    const atCap = [
      game("2024-02-01", 1, 2), // openers for T1 and T2
      game("2024-02-09", 3, 2), // T3's opener, but sets T2's previous game
      // T1 rests 9 (clamped to REST_DAYS_CAP); T2 rests 1, well under it.
      game("2024-02-10", 1, 2),
    ];
    const { teams } = computeScheduleDisparity("2023-24", atCap);
    const t1 = teams.find((t) => t.teamId === 1)!;

    expect(t1.netRestEdge).toBe(REST_DAYS_CAP - 1);
    expect(t1.netRestEdgeUncapped).toBe(9 - 1);
  });
});

describe("computeScheduleDisparity — invariants", () => {
  it("nets to zero across the league, since every edge is one team's mirror of another's", () => {
    const { result } = teamsById();

    const capped = result.teams.reduce((sum, t) => sum + t.netRestEdge, 0);
    const uncapped = result.teams.reduce((sum, t) => sum + t.netRestEdgeUncapped, 0);
    expect(capped).toBe(0);
    expect(uncapped).toBe(0);
  });

  it("orders teams by net rest edge, most favored first", () => {
    const { result } = teamsById();
    expect(result.teams.map((t) => t.teamId)).toEqual([2, 1, 3]);
  });

  it("is independent of the order games arrive in", () => {
    const shuffled = [FIXTURE[3], FIXTURE[0], FIXTURE[2], FIXTURE[1]];
    expect(computeScheduleDisparity("2023-24", shuffled)).toEqual(
      computeScheduleDisparity("2023-24", FIXTURE)
    );
  });
});

describe("computeScheduleDisparity — league figures", () => {
  it("reports the spread between the most and least favored teams", () => {
    const { result } = teamsById();

    expect(result.league.largestEdge).toBe(1);
    expect(result.league.largestDisadvantage).toBe(-1);
    expect(result.league.delta).toBe(2);
  });

  it("counts only games where the capped edge is non-zero", () => {
    const { result } = teamsById();

    // G3 has an edge; G4's edge vanishes under the cap.
    expect(result.league.gamesWithAnyEdge).toBe(1);
    expect(result.league.gamesWithLargeEdge).toBe(0);
  });

  it("reports games scheduled per team, including uneven schedules", () => {
    const { result } = teamsById();

    expect(result.gamesPerTeamMin).toBe(2); // T3 played 2
    expect(result.gamesPerTeamMax).toBe(3); // T1 and T2 played 3
  });
});

describe("computeScheduleDisparity — provisional seasons", () => {
  it("is provisional when any game is not final", () => {
    const withScheduled = [...FIXTURE.slice(0, 3), game("2024-01-10", 1, 2, { status: "scheduled" })];
    expect(computeScheduleDisparity("2023-24", withScheduled).provisional).toBe(true);
  });

  it("is not provisional when every game is final", () => {
    expect(computeScheduleDisparity("2023-24", FIXTURE).provisional).toBe(false);
  });

  it("does not use a game count, so a short season is not misreported", () => {
    // A 3-game season, all final — stands in for the lockout seasons (50/66/72 games), which a
    // hardcoded 82 would mark provisional forever.
    const shortSeason = FIXTURE.slice(0, 3);
    expect(computeScheduleDisparity("2011-12", shortSeason).provisional).toBe(false);
  });

  it("treats a live game as provisional", () => {
    const live = [...FIXTURE.slice(0, 3), game("2024-01-10", 1, 2, { status: "live" })];
    expect(computeScheduleDisparity("2023-24", live).provisional).toBe(true);
  });
});

describe("computeScheduleDisparity — fatigue edge", () => {
  it("sums opponent-minus-own fatigue over counted games", () => {
    const { byId } = teamsById();

    // T2: G3 gives 8 − 5 = +3, G4 gives 4 − 6 = −2.
    expect(byId.get(2)!.netFatigueEdge).toBe(1);
    expect(byId.get(1)!.netFatigueEdge).toBe(2); // G4: 6 − 4
    expect(byId.get(3)!.netFatigueEdge).toBe(-3); // G3: 5 − 8
  });

  it("is null when no counted game has fatigue on both sides", () => {
    const unscored = FIXTURE.map((g) => ({
      ...g,
      homeFatigueScore: null,
      awayFatigueScore: null,
    }));
    const { teams } = computeScheduleDisparity("2023-24", unscored);

    expect(teams.every((t) => t.netFatigueEdge === null)).toBe(true);
  });

  it("skips a game scored on only one side rather than treating the gap as zero", () => {
    const halfScored = [
      game("2024-03-01", 1, 2),
      game("2024-03-03", 2, 1, { homeFatigueScore: "5", awayFatigueScore: null }),
    ];
    const { teams } = computeScheduleDisparity("2023-24", halfScored);

    expect(teams.every((t) => t.netFatigueEdge === null)).toBe(true);
  });
});

describe("computeScheduleDisparity — density differentials", () => {
  it("charges the back-to-back to the team on one day's rest, crediting its opponent", () => {
    const { byId } = teamsById();

    // G3: T3 rests 1 (back-to-back), T2 rests 2. Positive is favorable, so T2 gains.
    expect(byId.get(3)!.backToBackEdge).toBe(-1);
    expect(byId.get(2)!.backToBackEdge).toBe(1);
    expect(byId.get(1)!.backToBackEdge).toBe(0);
  });

  it("nets density edges to zero across the league, like the rest edge", () => {
    const { result } = teamsById();

    expect(result.teams.reduce((s, t) => s + t.backToBackEdge, 0)).toBe(0);
    expect(result.teams.reduce((s, t) => s + t.threeInFourEdge, 0)).toBe(0);
    expect(result.teams.reduce((s, t) => s + t.fourInSixEdge, 0)).toBe(0);
  });

  it("flags a game that is the third in four nights, not merely near one", () => {
    // T1 plays 03-01, 03-02, 03-04 — the last is its third night in four. T2 comes in rested
    // off 02-20, so the differential has a clear sign rather than cancelling.
    const dense = [
      game("2024-02-20", 2, 5),
      game("2024-03-01", 1, 6),
      game("2024-03-02", 1, 7),
      game("2024-03-04", 1, 2),
    ];
    const { teams } = computeScheduleDisparity("2023-24", dense);
    const t1 = teams.find((t) => t.teamId === 1)!;
    const t2 = teams.find((t) => t.teamId === 2)!;

    // Only 03-04 is counted for both sides; T1 is on its third night in four, T2 is not — so
    // the edge is negative for T1, who drew the harder assignment.
    expect(t1.threeInFourEdge).toBe(-1);
    expect(t2.threeInFourEdge).toBe(1);
  });

  it("does not flag a game merely because an earlier stretch was dense", () => {
    // T1's 03-01..03-03 stretch is a 3-in-4, but the 03-20 game is not itself short rest.
    const dense = [
      game("2024-03-01", 1, 2),
      game("2024-03-02", 1, 3),
      game("2024-03-03", 1, 4),
      game("2024-03-20", 1, 2),
    ];
    const { teams } = computeScheduleDisparity("2023-24", dense);
    const t1 = teams.find((t) => t.teamId === 1)!;

    // Only 03-20 is counted for both sides (03-02 and 03-03 face opponents playing openers),
    // and standing alone it is not short rest — so the earlier dense stretch contributes nothing.
    expect(t1.threeInFourEdge).toBe(0);
  });
});

/**
 * ADR 0001 pinning test: Schedule Disparity derives rest days from game dates rather than
 * reading `fatigue_scores.days_since_last_game`, which leaves two definitions of "rest" in the
 * codebase. This holds them equal. If it fails, one of them drifted.
 */
describe("rest days agree with the fatigue model", () => {
  const HOME = { lat: 34.043, lon: -118.267 };

  function recentGame(date: string): RecentGame {
    return {
      date,
      teamId: 1,
      opponentTeamId: 2,
      isHome: true,
      teamLat: HOME.lat,
      teamLon: HOME.lon,
      opponentLat: HOME.lat,
      opponentLon: HOME.lon,
      opponentAltitudeFlag: false,
      overtimePeriods: 0,
    };
  }

  it.each([
    ["2024-01-01", "2024-01-02"],
    ["2024-01-01", "2024-01-04"],
    ["2024-01-01", "2024-01-12"],
  ])("matches calculateFatigue's daysSinceLastGame for %s → %s", (prev, current) => {
    const fromFatigue = calculateFatigue(
      current,
      [recentGame(prev)],
      false,
      HOME.lat,
      HOME.lon,
      HOME.lat,
      HOME.lon,
      true
    ).daysSinceLastGame;

    const [, fromDisparity] = restDaysBeforeGames([prev, current]);

    expect(fromDisparity).toBe(fromFatigue);
  });
});
