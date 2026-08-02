import { describe, expect, it } from "vitest";
import {
  buildSeasonReport,
  MIN_GAMES_FOR_INFERENCE,
  winRateBand,
  type SeasonReportRate,
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
    status: "final",
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

  it("counts a rested loss as a loss", () => {
    // home 1.0 vs away 4.0 → home is rested, and home lost by 10.
    const report = buildSeasonReport("2025-26", [
      game({ gameId: 1, homeScore: 90, awayScore: 100 }),
    ]);

    expect(report.overall.games).toBe(1);
    expect(report.overall.restedTeamWins).toBe(0);
  });

  it("does not count a game at all when the rested side is the visitor", () => {
    // away 1.0 vs home 4.0 → the visitor is the fresher side, which the site no longer calls.
    // It is excluded from the totals rather than counted as a loss: the model made no
    // prediction here, so scoring itself on the outcome either way would be dishonest.
    // `isCalledSide` is the single source of that boundary, shared with /analysis.
    const restedVisitorWon = buildSeasonReport("2025-26", [
      game({ gameId: 1, home: side(4), away: side(1), homeScore: 90, awayScore: 100 }),
    ]);
    const restedVisitorLost = buildSeasonReport("2025-26", [
      game({ gameId: 1, home: side(4), away: side(1) }),
    ]);

    for (const report of [restedVisitorWon, restedVisitorLost]) {
      expect(report.overall.games).toBe(0);
      expect(report.overall.restedTeamWins).toBe(0);
      // Still a completed game — it counts as played, and its schedule burden still counts.
      expect(report.completedGames).toBe(1);
    }
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

  it("excludes a live game even with both scores and both fatigue sides already populated", () => {
    // A game at 24-19 in the first quarter: status "live", both scores written by the cron,
    // both pre-game fatigue rows already exist, and the rest gap is decidable. Only `status`
    // stops it from being scored as a HIT or MISS.
    const report = buildSeasonReport("2025-26", [
      game({ gameId: 1, status: "live", homeScore: 24, awayScore: 19, home: side(1), away: side(4) }),
    ]);

    expect(report.scheduledGames).toBe(1);
    expect(report.completedGames).toBe(0);
    expect(report.overall.games).toBe(0);
    expect(report.overall.restedTeamWins).toBe(0);
    expect(report.teams).toEqual([]);
    expect(report.loudestCalls).toEqual([]);
    expect(report.weeks).toEqual([]);
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

describe("buildSeasonReport — rest edge conversion", () => {
  it("scores each team against its own tired record, not the league's", () => {
    const rows: SeasonReportRow[] = [
      // Team 1 rested and wins twice.
      game({ gameId: 1, homeTeamId: 1, awayTeamId: 2, home: side(1), away: side(4) }),
      game({ gameId: 2, homeTeamId: 1, awayTeamId: 3, home: side(1), away: side(4) }),
      // Team 1 tired and loses twice (it is away, and away loses 90-100).
      game({ gameId: 3, homeTeamId: 2, awayTeamId: 1, home: side(1), away: side(4) }),
      game({ gameId: 4, homeTeamId: 3, awayTeamId: 1, home: side(1), away: side(4) }),
    ];

    const team1 = buildSeasonReport("2025-26", rows).teams.find((t) => t.teamId === 1);

    expect(team1).toMatchObject({
      restedGames: 2,
      restedWins: 2,
      restedWinPct: 100,
      tiredGames: 2,
      tiredWins: 0,
      tiredWinPct: 0,
      swing: 100,
    });
  });

  it("leaves swing null when a team has no games on one side of the split", () => {
    const rows: SeasonReportRow[] = [
      game({ gameId: 1, homeTeamId: 1, awayTeamId: 2, home: side(1), away: side(4) }),
    ];

    const teams = buildSeasonReport("2025-26", rows).teams;

    expect(teams.find((t) => t.teamId === 1)).toMatchObject({ tiredGames: 0, swing: null });
    expect(teams.find((t) => t.teamId === 2)).toMatchObject({ restedGames: 0, swing: null });
  });

  it("sorts by swing descending, nulls last, tie-broken on teamId", () => {
    const rows: SeasonReportRow[] = [
      // Home is the fresher side and home always wins here, so whoever is home is
      // rested-and-won and whoever is away is tired-and-lost. Teams 3 and 4 each get
      // one of each → swing +100 both.
      game({ gameId: 1, homeTeamId: 3, awayTeamId: 4, home: side(1), away: side(4) }),
      game({ gameId: 2, homeTeamId: 4, awayTeamId: 3, home: side(1), away: side(4) }),
      // Home is the fresher side again, but here home LOSES, so whoever is home is
      // rested-and-lost and whoever is away is tired-and-won. Teams 5 and 6 each get one of
      // each → swing −100 both.
      //
      // Built this way rather than by making the visitor the fresher side, which is how it
      // used to read: those games are no longer called at all, so they would leave both teams
      // with an empty arm and a null swing instead of the negative one this test needs.
      game({
        gameId: 3,
        homeTeamId: 6,
        awayTeamId: 5,
        home: side(1),
        away: side(4),
        homeScore: 90,
        awayScore: 100,
      }),
      game({
        gameId: 4,
        homeTeamId: 5,
        awayTeamId: 6,
        home: side(1),
        away: side(4),
        homeScore: 90,
        awayScore: 100,
      }),
    ];

    const teams = buildSeasonReport("2025-26", rows).teams;

    // +100 pair first in teamId order, then the −100 pair in teamId order.
    expect(teams.map((t) => t.teamId)).toEqual([3, 4, 5, 6]);
    expect(teams.map((t) => t.swing)).toEqual([100, 100, -100, -100]);
  });

  it("puts every null swing after every scored one, whatever the teamIds", () => {
    const rows: SeasonReportRow[] = [
      // Team 1 is the fresher side here and wins → rested 1-0.
      game({ gameId: 1, homeTeamId: 1, awayTeamId: 9, home: side(1), away: side(4) }),
      // Team 1 is the tireder side here and loses → tired 0-1. Team 2 only ever rests.
      game({ gameId: 2, homeTeamId: 2, awayTeamId: 1, home: side(1), away: side(4) }),
    ];

    const teams = buildSeasonReport("2025-26", rows).teams;

    // Team 1 has both arms (+100); teams 2 and 9 have one arm each, so they trail in teamId order.
    expect(teams.map((t) => t.teamId)).toEqual([1, 2, 9]);
    expect(teams.map((t) => t.swing)).toEqual([100, null, null]);
  });
});

describe("buildSeasonReport — schedule tax", () => {
  it("counts schedule facts on every completed game, including neutral ones", () => {
    const rows: SeasonReportRow[] = [
      game({
        gameId: 1,
        homeTeamId: 1,
        awayTeamId: 2,
        // Neutral, so this game contributes to no rate at all.
        home: side(1, { travelDistanceMiles: "500.4", isBackToBack: true }),
        away: side(1.2, { travelDistanceMiles: "1200.6", isThreeInFour: true, hasTimeZoneDisplacement: true }),
      }),
    ];

    const teams = buildSeasonReport("2025-26", rows).teams;

    expect(teams.find((t) => t.teamId === 1)).toMatchObject({
      restedGames: 0,
      tiredGames: 0,
      travelMiles: 500,
      backToBacks: 1,
      threeInFours: 0,
      jetLagGames: 0,
    });
    expect(teams.find((t) => t.teamId === 2)).toMatchObject({
      travelMiles: 1201,
      backToBacks: 0,
      threeInFours: 1,
      jetLagGames: 1,
    });
  });

  it("ignores games without a final score, so future travel is not counted as flown", () => {
    const rows: SeasonReportRow[] = [
      game({
        gameId: 1,
        homeTeamId: 1,
        homeScore: null,
        awayScore: null,
        home: side(1, { travelDistanceMiles: "999" }),
      }),
    ];

    expect(buildSeasonReport("2025-26", rows).teams).toEqual([]);
  });
});

import { allSeasonNormExcluding, seasonReportVerdict } from "@/lib/season-report";

describe("buildSeasonReport — loudest calls", () => {
  it("ranks by rest advantage rather than margin, and signs the margin from the rested side", () => {
    const rows: SeasonReportRow[] = [
      // Small gap, huge margin. Must NOT outrank the game below.
      game({ gameId: 1, home: side(1), away: side(2), homeScore: 140, awayScore: 90 }),
      // Big gap, small margin, and the rested side lost.
      game({ gameId: 2, home: side(1), away: side(9), homeScore: 98, awayScore: 100 }),
    ];

    const calls = buildSeasonReport("2025-26", rows).loudestCalls;

    expect(calls.map((c) => c.gameId)).toEqual([2, 1]);
    expect(calls[0]).toMatchObject({
      restAdvantage: 8,
      advantageTeam: "home",
      restedTeamWon: false,
      restedMargin: -2,
    });
    expect(calls[1]).toMatchObject({ restedTeamWon: true, restedMargin: 50 });
  });

  it("keeps at most ten, tie-broken on date then gameId", () => {
    const rows: SeasonReportRow[] = Array.from({ length: 12 }, (_, i) =>
      game({ gameId: 100 - i, date: "2025-11-02", home: side(1), away: side(4) })
    );

    const calls = buildSeasonReport("2025-26", rows).loudestCalls;

    expect(calls).toHaveLength(10);
    // Every gap is identical, so the tie-break decides: ascending gameId.
    expect(calls.map((c) => c.gameId)).toEqual([89, 90, 91, 92, 93, 94, 95, 96, 97, 98]);
  });

  it("excludes neutral games — a call the model never made is not a loud one", () => {
    const rows: SeasonReportRow[] = [game({ gameId: 1, home: side(1), away: side(1.2) })];

    expect(buildSeasonReport("2025-26", rows).loudestCalls).toEqual([]);
  });
});

describe("buildSeasonReport — fatigue calendar", () => {
  it("buckets into seven-day weeks counted from the season's first game", () => {
    const rows: SeasonReportRow[] = [
      game({ gameId: 1, date: "2025-10-21", home: side(2), away: side(4) }), // week 1
      game({ gameId: 2, date: "2025-10-27", home: side(3), away: side(3) }), // week 1 (day 6)
      game({ gameId: 3, date: "2025-10-28", home: side(6), away: side(8) }), // week 2 (day 7)
    ];

    const weeks = buildSeasonReport("2025-26", rows).weeks;

    expect(weeks).toEqual([
      { week: 1, startDate: "2025-10-21", games: 2, avgFatigue: 3 },
      { week: 2, startDate: "2025-10-28", games: 1, avgFatigue: 7 },
    ]);
  });

  it("averages across both sides of every completed game, decidable or not", () => {
    const rows: SeasonReportRow[] = [
      game({ gameId: 1, date: "2025-10-21", home: side(1), away: side(1.2) }), // neutral
    ];

    expect(buildSeasonReport("2025-26", rows).weeks).toEqual([
      { week: 1, startDate: "2025-10-21", games: 1, avgFatigue: 1.1 },
    ]);
  });

  it("has no weeks at all for a season with nothing completed", () => {
    expect(buildSeasonReport("2025-26", []).weeks).toEqual([]);
  });
});

describe("allSeasonNormExcluding", () => {
  it("drops the displayed season so it is not compared against itself", () => {
    const norm = allSeasonNormExcluding(
      [
        { season: "2024-25", games: 100, restedTeamWins: 60 },
        { season: "2025-26", games: 100, restedTeamWins: 40 },
      ],
      "2025-26"
    );

    expect(norm).toBe(60);
  });

  it("pools games rather than averaging season rates", () => {
    // 90 of 200 = 45%. Averaging the two rates would give 50%.
    const norm = allSeasonNormExcluding(
      [
        { season: "2023-24", games: 100, restedTeamWins: 80 },
        { season: "2024-25", games: 100, restedTeamWins: 10 },
      ],
      "2025-26"
    );

    expect(norm).toBe(45);
  });

  it("is null when the displayed season is the only one", () => {
    expect(
      allSeasonNormExcluding([{ season: "2025-26", games: 100, restedTeamWins: 50 }], "2025-26")
    ).toBeNull();
  });
});

describe("seasonReportVerdict", () => {
  const rateOf = (wins: number, games: number): SeasonReportRate => ({
    games,
    restedTeamWins: wins,
    winPct: Math.round((wins / games) * 1000) / 10,
    band: winRateBand(wins, games),
  });

  it("is too early below the gate, however far the rate sits from the norm", () => {
    expect(seasonReportVerdict(rateOf(99, 99), 55.6)).toEqual({ kind: "tooEarly", games: 99 });
  });

  it("reports noNorm, not tooEarly, when the sample is sufficient but the baseline failed to load", () => {
    expect(seasonReportVerdict(rateOf(500, 1000), null)).toEqual({ kind: "noNorm" });
  });

  it("still reports tooEarly for a thin sample even when the norm is also unavailable", () => {
    expect(seasonReportVerdict(rateOf(40, 99), null)).toEqual({ kind: "tooEarly", games: 99 });
  });

  it("is in line when the gap falls inside the band", () => {
    // 52% of 940 → band 3.2, so a 54.0 norm is 2.0 away and inside it.
    const verdict = seasonReportVerdict(rateOf(489, 940), 54);

    expect(verdict.kind).toBe("inLine");
  });

  it("is below when the norm sits outside the band above the rate", () => {
    const verdict = seasonReportVerdict(rateOf(489, 940), 55.6);

    expect(verdict).toMatchObject({ kind: "below", norm: 55.6, band: 3.2 });
  });

  it("is above when the rate clears the norm by more than the band", () => {
    const verdict = seasonReportVerdict(rateOf(600, 940), 55.6);

    expect(verdict.kind).toBe("above");
  });
});
