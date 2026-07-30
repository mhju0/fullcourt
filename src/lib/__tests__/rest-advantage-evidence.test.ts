import { describe, expect, it } from "vitest";
import {
  buildHistoricalGameSearch,
  buildHistoricalBacktest,
  classifyRestAdvantage,
} from "@/lib/rest-advantage-evidence";

describe("classifyRestAdvantage", () => {
  it.each([
    { home: 5, away: 5.49, expected: "neutral" },
    { home: 5, away: 5.5, expected: "home" },
    { home: 5.5, away: 5, expected: "away" },
  ] as const)(
    "classifies the neutral/no-call boundary for home=$home away=$away",
    ({ home, away, expected }) => {
      expect(classifyRestAdvantage(home, away).advantageTeam).toBe(expected);
    }
  );
});

describe("buildHistoricalBacktest", () => {
  it("aggregates decisive games through the canonical neutral/no-call boundary", () => {
    const result = buildHistoricalBacktest([
      {
        date: "2024-01-02",
        season: "2023-24",
        homeScore: 110,
        awayScore: 100,
        homeFatigueScore: "5",
        awayFatigueScore: "5.5",
      },
      {
        date: "2024-01-03",
        season: "2023-24",
        homeScore: 100,
        awayScore: 110,
        homeFatigueScore: "5.5",
        awayFatigueScore: "5",
      },
      {
        date: "2024-01-04",
        season: "2023-24",
        homeScore: 100,
        awayScore: 90,
        homeFatigueScore: "5",
        awayFatigueScore: "5.49",
      },
      {
        date: "2024-02-01",
        season: "2023-24",
        homeScore: 95,
        awayScore: 105,
        homeFatigueScore: "4",
        awayFatigueScore: "6",
      },
    ]);

    expect(result).toMatchObject({
      totalGames: 3,
      overallWins: 2,
      overallWinRate: 66.7,
      thresholds: [
        { threshold: 2, games: 1, restedTeamWins: 0, winPct: 0 },
        { threshold: 3, games: 0, restedTeamWins: 0, winPct: 0 },
        { threshold: 5, games: 0, restedTeamWins: 0, winPct: 0 },
        { threshold: 7, games: 0, restedTeamWins: 0, winPct: 0 },
      ],
      homeAwayBreakdown: {
        homeTeamMoreRested: { games: 2, restedTeamWins: 1, winPct: 50 },
        awayTeamMoreRested: { games: 1, restedTeamWins: 1, winPct: 100 },
      },
    });
  });
});

describe("buildHistoricalGameSearch", () => {
  it("filters outcomes and paginates only decisive games", () => {
    const rows = [
      {
        id: 10,
        date: "2024-02-03",
        season: "2023-24",
        homeTeamAbbr: "BOS",
        awayTeamAbbr: "NYK",
        homeScore: 110,
        awayScore: 100,
        homeFatigueScore: "5",
        awayFatigueScore: "5.5",
      },
      {
        id: 9,
        date: "2024-02-02",
        season: "2023-24",
        homeTeamAbbr: "LAL",
        awayTeamAbbr: "DEN",
        homeScore: 100,
        awayScore: 110,
        homeFatigueScore: "5.5",
        awayFatigueScore: "5",
      },
      {
        id: 8,
        date: "2024-02-01",
        season: "2023-24",
        homeTeamAbbr: "MIA",
        awayTeamAbbr: "ORL",
        homeScore: 105,
        awayScore: 100,
        homeFatigueScore: "5",
        awayFatigueScore: "5.49",
      },
    ];

    expect(
      buildHistoricalGameSearch(rows, {
        result: "correct",
        page: 1,
        limit: 1,
      })
    ).toEqual({
      games: [
        expect.objectContaining({
          gameId: 10,
          restAdvantageDifferential: 0.5,
          advantageTeam: "home",
          restedTeamWon: true,
        }),
      ],
      total: 2,
      page: 1,
      limit: 1,
    });
  });
});

/**
 * The venue-controlled swing exists because `overallWinRate` conflates rest with home-court
 * advantage. These fixtures make the two separable on purpose: the home side wins every
 * game it is rested for and loses every game the visitor is rested for, so the swing is a
 * clean 100pp while the blended rested-team rate is also 100% — only the *baseline* tells
 * you the venue effect is doing work.
 */
describe("buildHistoricalBacktest — venue-controlled rest effect", () => {
  const game = (
    season: string,
    homeScore: number,
    awayScore: number,
    homeFatigueScore: string,
    awayFatigueScore: string
  ) => ({ date: `${season.slice(0, 4)}-01-02`, season, homeScore, awayScore, homeFatigueScore, awayFatigueScore });

  it("splits home win rate by which side was rested, and reports the difference", () => {
    const result = buildHistoricalBacktest([
      // home rested (away more fatigued), home wins
      game("2023-24", 110, 100, "5", "7"),
      game("2023-24", 110, 100, "5", "7"),
      // away rested (home more fatigued), home loses
      game("2023-24", 100, 110, "7", "5"),
      // too close to call — counts in the baseline only
      game("2023-24", 100, 110, "5", "5.2"),
    ]);

    const v = result.venueControlled;
    expect(v.games).toBe(4); // baseline includes the no-call game
    expect(v.baselineHomeWinRate).toBe(50); // 2 of 4
    expect(v.homeRestedGames).toBe(2);
    expect(v.homeRestedHomeWinRate).toBe(100);
    expect(v.awayRestedGames).toBe(1);
    expect(v.awayRestedHomeWinRate).toBe(0);
    expect(v.swingPp).toBe(100);
  });

  it("buckets the same figure by era and drops eras with no games", () => {
    const result = buildHistoricalBacktest([
      game("1988-89", 110, 100, "5", "7"),
      game("1988-89", 100, 110, "7", "5"),
      game("2023-24", 110, 100, "5", "7"),
    ]);

    const labels = result.venueControlledByEra.map((e) => e.label);
    expect(labels).toEqual(["1985–1994", "2015–present"]);
    expect(result.venueControlledByEra[0]!.games).toBe(2);
    expect(result.venueControlledByEra[1]!.games).toBe(1);
  });

  it("reports a zero swing rather than dividing by zero when one side never appears", () => {
    const result = buildHistoricalBacktest([game("2023-24", 110, 100, "5", "7")]);
    expect(result.venueControlled.awayRestedGames).toBe(0);
    expect(result.venueControlled.swingPp).toBe(0);
  });
});
