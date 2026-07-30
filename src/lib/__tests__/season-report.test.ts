import { describe, expect, it } from "vitest";
import {
  buildSeasonReport,
  MIN_GAMES_FOR_INFERENCE,
  winRateBand,
  type SeasonReportRow,
  type SeasonReportSide,
} from "@/lib/season-report";

/** A fatigue side with everything neutral except the score, so a test states only what it means. */
function side(score: number, extra: Partial<SeasonReportSide> = {}): SeasonReportSide {
  return {
    fatigueScore: String(score),
    travelDistanceMiles: "0",
    isBackToBack: false,
    isThreeInFour: false,
    hasTimeZoneDisplacement: false,
    ...extra,
  };
}

/** Home team 1 beats away team 2 by 10, home the fresher side, unless overridden. */
function game(overrides: Partial<SeasonReportRow> & { gameId: number }): SeasonReportRow {
  return {
    date: "2025-10-21",
    homeTeamId: 1,
    awayTeamId: 2,
    homeScore: 100,
    awayScore: 90,
    home: side(1),
    away: side(4),
    ...overrides,
  };
}

describe("winRateBand", () => {
  it("returns the 95% Wald half-width in percentage points", () => {
    // p = 0.52, n = 100 → 1.96 * sqrt(0.52 * 0.48 / 100) = 0.0979
    expect(winRateBand(52, 100)).toBe(9.8);
  });

  it("is null with no games rather than NaN", () => {
    expect(winRateBand(0, 0)).toBeNull();
  });
});

describe("buildSeasonReport — the sign rule", () => {
  it("treats the lower fatigue score as the rested side and signs the margin from its view", () => {
    // home 1.0 vs away 4.0 → differential +3.0 → home is rested, and home won by 10.
    const report = buildSeasonReport("2025-26", [game({ gameId: 1 })]);

    expect(report.overall.games).toBe(1);
    expect(report.overall.restedTeamWins).toBe(1);
  });

  it("counts a rested loss as a loss, whichever side was rested", () => {
    // away 1.0 vs home 4.0 → away is rested, and away lost by 10.
    const report = buildSeasonReport("2025-26", [
      game({ gameId: 1, home: side(4), away: side(1) }),
    ]);

    expect(report.overall.games).toBe(1);
    expect(report.overall.restedTeamWins).toBe(0);
  });
});

describe("buildSeasonReport — what counts", () => {
  it("excludes games inside the neutral band from every rate", () => {
    const report = buildSeasonReport("2025-26", [
      game({ gameId: 1, home: side(1), away: side(1.4) }), // 0.4 → neutral
    ]);

    expect(report.completedGames).toBe(1);
    expect(report.overall.games).toBe(0);
    expect(report.overall.band).toBeNull();
  });

  it("excludes games missing a score or a fatigue side, but still counts them as scheduled", () => {
    const report = buildSeasonReport("2025-26", [
      game({ gameId: 1, homeScore: null, awayScore: null }),
      game({ gameId: 2, home: null }),
    ]);

    expect(report.scheduledGames).toBe(2);
    expect(report.completedGames).toBe(0);
    expect(report.overall.games).toBe(0);
  });

  it("splits the RA >= 2 tier out of the overall rate", () => {
    const report = buildSeasonReport("2025-26", [
      game({ gameId: 1, home: side(1), away: side(4) }), // 3.0 → both tiers
      game({ gameId: 2, home: side(1), away: side(2) }), // 1.0 → overall only
    ]);

    expect(report.overall.games).toBe(2);
    expect(report.atLeastTwo.games).toBe(1);
  });

  it("renders an empty season without throwing", () => {
    const report = buildSeasonReport("1998-99", []);

    expect(report.season).toBe("1998-99");
    expect(report.scheduledGames).toBe(0);
    expect(report.overall.games).toBe(0);
    expect(report.overall.winPct).toBe(0);
    expect(report.overall.band).toBeNull();
  });
});

describe("buildSeasonReport — MIN_GAMES_FOR_INFERENCE", () => {
  it("is the documented gate of 100 decidable games", () => {
    expect(MIN_GAMES_FOR_INFERENCE).toBe(100);
  });
});

import { buildHistoricalBacktest, type HistoricalGameEvidenceRow } from "@/lib/rest-advantage-evidence";

/** The same game, in the shape the /analysis reducer consumes. */
function toEvidenceRow(row: SeasonReportRow, season: string): HistoricalGameEvidenceRow {
  return {
    date: row.date,
    season,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    // Only called for rows both reducers accept, so the sides are present.
    homeFatigueScore: row.home!.fatigueScore,
    awayFatigueScore: row.away!.fatigueScore,
  };
}

describe("buildSeasonReport vs buildHistoricalBacktest", () => {
  it("reports the identical rest win rate for a season, so the two pages cannot drift", () => {
    // A spread of gaps and outcomes: neutral, sub-2, over-2, both sides rested, both results.
    const rows: SeasonReportRow[] = [
      game({ gameId: 1, home: side(1), away: side(5) }),                          // 4.0 home, HIT
      game({ gameId: 2, home: side(5), away: side(1) }),                          // 4.0 away, MISS
      game({ gameId: 3, home: side(1), away: side(1.2) }),                        // neutral
      game({ gameId: 4, home: side(2), away: side(3) }),                          // 1.0 home, HIT
      game({ gameId: 5, home: side(3), away: side(2), homeScore: 88, awayScore: 99 }), // 1.0 away, HIT
      game({ gameId: 6, home: side(1), away: side(9), homeScore: 90, awayScore: 100 }), // 8.0 home, MISS
    ];

    const report = buildSeasonReport("2024-25", rows);
    const backtest = buildHistoricalBacktest(rows.map((r) => toEvidenceRow(r, "2024-25")));
    const season = backtest.seasonWinRates.find((s) => s.season === "2024-25");

    expect(season).toBeDefined();
    expect(report.overall.games).toBe(season!.games);
    expect(report.overall.restedTeamWins).toBe(season!.restedTeamWins);
    expect(report.overall.winPct).toBe(season!.winPct);
  });

  it("matches the backtest's own RA >= 2 bucket", () => {
    const rows: SeasonReportRow[] = [
      game({ gameId: 1, home: side(1), away: side(5) }),
      game({ gameId: 2, home: side(2), away: side(3) }),
      game({ gameId: 3, home: side(1), away: side(9), homeScore: 90, awayScore: 100 }),
    ];

    const report = buildSeasonReport("2024-25", rows);
    const bucket = buildHistoricalBacktest(
      rows.map((r) => toEvidenceRow(r, "2024-25"))
    ).thresholds.find((t) => t.threshold === 2);

    expect(bucket).toBeDefined();
    expect(report.atLeastTwo.games).toBe(bucket!.games);
    expect(report.atLeastTwo.restedTeamWins).toBe(bucket!.restedTeamWins);
    expect(report.atLeastTwo.winPct).toBe(bucket!.winPct);
  });
});
