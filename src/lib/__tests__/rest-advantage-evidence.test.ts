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

    // The boundary has two parts, and the fixture exercises both. Game three is NEUTRAL at
    // 0.49 and has never counted. Game two is DECIDABLE — the visitor is the rested side and
    // went on to win — but is NO-CALL, because the site stopped picking rested road teams.
    //
    // So the headline counts games one and four only, and it counts one of them as a loss:
    // a rule that declined its road picks and then quietly kept their wins would be scoring
    // itself on games it never called.
    expect(result).toMatchObject({
      totalGames: 2,
      overallWins: 1,
      overallWinRate: 50,
      thresholds: [
        { threshold: 2, games: 1, restedTeamWins: 0, winPct: 0 },
        { threshold: 3, games: 0, restedTeamWins: 0, winPct: 0 },
        { threshold: 5, games: 0, restedTeamWins: 0, winPct: 0 },
        { threshold: 7, games: 0, restedTeamWins: 0, winPct: 0 },
      ],
      // Unchanged, and deliberately so: the breakdown is the evidence for declining the road
      // half, so it has to keep reporting that half. The away row is the argument, not a
      // second headline.
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
