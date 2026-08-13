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

  /**
   * The boundary is not exactly locatable, and the docs claimed it was until 2026-08-13.
   *
   * `differential` is a floating-point subtraction of two fatigue scores, so a gap that reads as
   * `0.50` in decimal can compute just below `0.5` and fall on the neutral side — which drops the
   * game from the published evidence entirely, not merely from a label. The cases above pass only
   * because their literals happen to be exactly representable; this one is the same gap and is
   * classified the other way.
   *
   * Pinned rather than fixed, matching the RA ≥ N threshold boundary left alone for the same
   * reason: rounding at the comparison would move a handful of games across every published
   * denominator to buy precision the metric does not have. This test exists so the behaviour is
   * a recorded decision rather than a surprise, and so "about 0.5" stays the honest wording.
   */
  it("puts a gap of nominally 0.5 on the neutral side when the float lands short", () => {
    expect(4.35 - 3.85).toBeLessThan(0.5);
    expect(classifyRestAdvantage(3.85, 4.35).advantageTeam).toBe("neutral");

    // The same nominal gap, from operands that subtract exactly, is a call. Both are 0.5 to a
    // reader; only one is 0.5 to the comparison.
    expect(classifyRestAdvantage(5, 5.5).advantageTeam).toBe("home");
  });
});

/**
 * The venue baseline is the number every published rate is now stated against, so what it
 * counts is load-bearing. It is deliberately the WIDEST population in the payload — every
 * scored game, including the neutral ones the headline drops and the road-rested ones it does
 * not publish. A baseline computed on the same games as the numerator would already carry the
 * effect it exists to subtract.
 */
describe("buildHistoricalBacktest — venue baseline", () => {
  /** home rested + home won · home rested + home lost · NEUTRAL + home won · away rested + away won */
  const MIXED = [
    { date: "2024-01-02", season: "2023-24", homeScore: 110, awayScore: 100, homeFatigueScore: "5", awayFatigueScore: "7" },
    { date: "2024-01-03", season: "2023-24", homeScore: 100, awayScore: 110, homeFatigueScore: "5", awayFatigueScore: "7" },
    { date: "2024-01-04", season: "2023-24", homeScore: 100, awayScore: 90, homeFatigueScore: "5", awayFatigueScore: "5.2" },
    { date: "2024-01-05", season: "2023-24", homeScore: 90, awayScore: 100, homeFatigueScore: "7", awayFatigueScore: "5" },
  ] as const;

  it("counts every scored game, including the neutral ones the headline drops", () => {
    const result = buildHistoricalBacktest([...MIXED]);

    // 4 scored games; the headline counts only the 1 that is home-rested AND decided.
    expect(result.venueBaseline.games).toBe(4);
    expect(result.totalGames).toBe(2);
  });

  it("counts home wins irrespective of which side was rested", () => {
    const result = buildHistoricalBacktest([...MIXED]);

    // Home won games 1 and 3 — one home-rested, one neutral.
    expect(result.venueBaseline.homeWins).toBe(2);
    expect(result.venueBaseline.homeWinPct).toBe(50);
  });

  it("derives the road rate from counts, not by subtracting the rounded home rate", () => {
    // 3 games, home won 1: home 33.3%, road 66.7%. Subtracting gives 66.7 here too, so the
    // guard that matters is the identity — both must come from the same counts.
    const result = buildHistoricalBacktest([...MIXED].slice(0, 3));

    expect(result.venueBaseline.homeWinPct + result.venueBaseline.roadWinPct).toBeCloseTo(100, 1);
    expect(result.venueBaseline.roadWinPct).toBe(
      Math.round(((result.venueBaseline.games - result.venueBaseline.homeWins) /
        result.venueBaseline.games) * 1000) / 10
    );
  });

  it("gives each season its own baseline, because home court is not stable across eras", () => {
    const result = buildHistoricalBacktest([
      // 1987-88: home wins both.
      { date: "1988-01-02", season: "1987-88", homeScore: 110, awayScore: 100, homeFatigueScore: "5", awayFatigueScore: "7" },
      { date: "1988-01-03", season: "1987-88", homeScore: 110, awayScore: 100, homeFatigueScore: "5", awayFatigueScore: "5.2" },
      // 2023-24: home splits.
      { date: "2024-01-02", season: "2023-24", homeScore: 110, awayScore: 100, homeFatigueScore: "5", awayFatigueScore: "7" },
      { date: "2024-01-03", season: "2023-24", homeScore: 100, awayScore: 110, homeFatigueScore: "5", awayFatigueScore: "5.2" },
    ]);

    const byName = new Map(result.seasonWinRates.map((s) => [s.season, s]));
    expect(byName.get("1987-88")?.homeBaselinePct).toBe(100);
    expect(byName.get("2023-24")?.homeBaselinePct).toBe(50);
  });

  it("keeps each season's baseline on all its games, not only its published ones", () => {
    const result = buildHistoricalBacktest([
      // Published: home rested, home won.
      { date: "2024-01-02", season: "2023-24", homeScore: 110, awayScore: 100, homeFatigueScore: "5", awayFatigueScore: "7" },
      // Not published (neutral), and the home team lost it.
      { date: "2024-01-03", season: "2023-24", homeScore: 100, awayScore: 110, homeFatigueScore: "5", awayFatigueScore: "5.2" },
    ]);

    const season = result.seasonWinRates[0];
    // The published rate sees 1 game at 100%. The baseline sees both, at 50%.
    expect(season.games).toBe(1);
    expect(season.winPct).toBe(100);
    expect(season.homeBaselinePct).toBe(50);
  });

  it("answers 0 rather than dividing by zero on an empty population", () => {
    const result = buildHistoricalBacktest([]);

    expect(result.venueBaseline).toEqual({
      games: 0,
      homeWins: 0,
      homeWinPct: 0,
      roadWinPct: 0,
    });
  });
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
