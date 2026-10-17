import { describe, expect, it } from "vitest";
import { LARGE_REST_EDGE_THRESHOLD, MEDIUM_REST_EDGE_THRESHOLD } from "@/components/matchup-parts";
import {
  GAP_RANGES,
  NEUTRAL_REST_ADVANTAGE_THRESHOLD,
  buildHistoricalBacktest,
  gapRangeSpan,
  groupSeasonsIntoEras,
  inGapRange,
} from "@/lib/rest-advantage-evidence";

/** A home win (or loss) with the home team fresher by `gap`, in `season`. */
const game = (season: string, gap: number, homeWon = true, neutralSite = false) => ({
  date: `${season.slice(0, 4)}-12-01`,
  season,
  homeScore: homeWon ? 110 : 100,
  awayScore: homeWon ? 100 : 110,
  homeFatigueScore: "0",
  awayFatigueScore: String(gap),
  neutralSite,
});

describe("GAP_RANGES (D-102)", () => {
  it("draws the same lines as the board's badges, so every tab names a game the same way", () => {
    expect(GAP_RANGES.map((range) => range.min)).toEqual([
      NEUTRAL_REST_ADVANTAGE_THRESHOLD,
      MEDIUM_REST_EDGE_THRESHOLD,
      LARGE_REST_EDGE_THRESHOLD,
    ]);
  });

  it("puts every decidable gap in exactly one range and nothing below the call line in any", () => {
    for (let hundredths = 0; hundredths <= 1200; hundredths += 1) {
      const gap = hundredths / 100;
      const hits = GAP_RANGES.filter((range) => inGapRange(gap, range)).length;
      expect(hits).toBe(gap >= NEUTRAL_REST_ADVANTAGE_THRESHOLD ? 1 : 0);
    }
  });

  it("reads a negative differential by its size, as a rested visitor's gap", () => {
    expect(inGapRange(-4, GAP_RANGES[1])).toBe(true);
  });

  it("prints each span the way the labels do", () => {
    expect(GAP_RANGES.map(gapRangeSpan)).toEqual(["0.5–3", "3–5", "5+"]);
  });
});

describe("the backtest's gap ranges", () => {
  it("splits the called games so the three ranges add up to the headline count", () => {
    const rows = [
      game("2024-25", 1), game("2024-25", 2.99, false),
      game("2024-25", 3), game("2024-25", 4.99),
      game("2024-25", 5), game("2024-25", 9, false),
      game("2024-25", 0.4),
    ];
    const result = buildHistoricalBacktest(rows);

    expect(result.gapRanges.map(({ key, games, restedTeamWins }) => ({ key, games, restedTeamWins }))).toEqual([
      { key: "small", games: 2, restedTeamWins: 1 },
      { key: "medium", games: 2, restedTeamWins: 2 },
      { key: "large", games: 2, restedTeamWins: 1 },
    ]);
    expect(result.gapRanges.reduce((sum, range) => sum + range.games, 0)).toBe(result.totalGames);
  });

  it("leaves rested visitors and neutral sites out, as the headline does", () => {
    const visitor = { ...game("2024-25", 0), homeFatigueScore: "6", awayFatigueScore: "0" };
    const result = buildHistoricalBacktest([visitor, game("2024-25", 6, true, true)]);

    expect(result.gapRanges.every((range) => range.games === 0)).toBe(true);
  });
});

describe("eras", () => {
  const seasons = (first: number, count: number) =>
    Array.from({ length: count }, (_, i) => `${first + i}-${String((first + i + 1) % 100).padStart(2, "0")}`);

  it("counts back from the newest season, so the latest era is always a full five", () => {
    const eras = groupSeasonsIntoEras(seasons(2010, 11));
    expect(eras.map((era) => era.length)).toEqual([6, 5]);
    expect(eras[1]).toEqual(seasons(2016, 5));
  });

  it("folds a short remainder into the oldest era rather than drawing a one-season bar", () => {
    expect(groupSeasonsIntoEras(seasons(2000, 12)).map((era) => era.length)).toEqual([7, 5]);
    expect(groupSeasonsIntoEras(seasons(2000, 3)).map((era) => era.length)).toEqual([3]);
    expect(groupSeasonsIntoEras([])).toEqual([]);
  });

  it("leaves the season in progress out, so the newest era does not move nightly", () => {
    const rows = [...seasons(2020, 6).map((season) => game(season, 6))];
    const result = buildHistoricalBacktest(rows, 0, new Set(["2025-26"]));

    expect(result.eras).toHaveLength(1);
    expect(result.eras[0]).toMatchObject({ firstSeason: "2020-21", lastSeason: "2024-25", seasonCount: 5 });
  });

  it("reads each era's ranges against that era's own home win rate", () => {
    const rows = [
      ...seasons(2015, 5).flatMap((season) => [game(season, 6), game(season, 0, false)]),
    ];
    const [era] = buildHistoricalBacktest(rows).eras;

    expect(era.homeGames).toBe(10);
    expect(era.homeWinPct).toBe(50);
    expect(era.ranges.find((range) => range.key === "large")).toMatchObject({ games: 5, winPct: 100 });
  });
});
