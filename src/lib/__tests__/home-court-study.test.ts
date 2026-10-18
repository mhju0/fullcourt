import { describe, expect, it } from "vitest";

import {
  homeCourtEraSummary,
  buildHomeCourtStudy,
  homeCourtChartSegments,
  homeCourtTickIndices,
  restedHomeGap,
  type HomeCourtSeason,
} from "@/lib/home-court-study";
import type { HistoricalGameEvidenceRow } from "@/lib/rest-advantage-evidence";

function season(
  label: string,
  homeWins: number,
  homeGames: number,
  restedWins: number,
  restedGames: number,
  isComplete = true
): HomeCourtSeason {
  return {
    season: label,
    homeGames,
    homeWins,
    latestEvidenceDate: `${label.slice(0, 4)}-04-15`,
    games: restedGames,
    restedTeamWins: restedWins,
    winPct: restedGames ? Math.round((restedWins / restedGames) * 1000) / 10 : 0,
    homeBaselinePct: Math.round((homeWins / homeGames) * 1000) / 10,
    isComplete,
  };
}

describe("restedHomeGap", () => {
  /**
   * The gap sits beside the two rates it compares, so it is their difference as printed.
   * Computed from counts it read +0.1 in 1987-88 and 1997-98 beside two identical rates.
   */
  it("is the difference of the two printed rates, so equal rates read zero", () => {
    // 1987-88: rested at home 67.9%, home 67.9%; from counts the gap was +0.1.
    const row = season("1987-88", 640, 943, 373, 549);
    expect(row.winPct).toBe(row.homeBaselinePct);
    expect(restedHomeGap(row)).toBe(0);
  });

  it("matches the printed rates where counts disagree by a tenth", () => {
    // 2024-25: 56.3% against 54.4%; from counts the gap was 1.8.
    const row = season("2024-25", 667, 1225, 358, 636);
    expect(restedHomeGap(row)).toBe(1.9);
  });

  it("withholds the rest comparison below 100 games", () => {
    expect(restedHomeGap(season("2026-27", 30, 50, 39, 99, false))).toBeNull();
  });
});

describe("homeCourtTickIndices", () => {
  it("caps labels and includes both endpoints", () => {
    const ticks = homeCourtTickIndices(41);
    expect(ticks).toHaveLength(6);
    expect(ticks[0]).toBe(0);
    expect(ticks.at(-1)).toBe(40);
  });
});

describe("homeCourtEraSummary", () => {
  it("uses completed seasons only and pools game counts", () => {
    const rows = Array.from({ length: 11 }, (_, index) =>
      season(`${2000 + index}-${String(1 + index).padStart(2, "0")}`, 60 - index, 100, 60, 100, index !== 10)
    );
    const summary = homeCourtEraSummary(rows, 2)!;
    expect(summary.first).toMatchObject({ from: "2000-01", to: "2001-02", wins: 119, games: 200 });
    expect(summary.latest).toMatchObject({ from: "2008-09", to: "2009-10", wins: 103, games: 200 });
  });
});

describe("buildHomeCourtStudy", () => {
  const game = (overrides: Partial<HistoricalGameEvidenceRow> = {}): HistoricalGameEvidenceRow => ({
    season: "2024-25", date: "2025-04-13", homeScore: 110, awayScore: 100,
    homeFatigueScore: "0", awayFatigueScore: "5", neutralSite: false, ...overrides,
  });

  it("uses canonical gap and venue rules, raw wins/counts and one annual population", () => {
    const { seasonWinRates: rows } = buildHomeCourtStudy([
      game({ season: "2023-24", date: "2024-04-13", awayFatigueScore: "1" }),
      game(), game({ homeScore: 90 }),
      game({ homeFatigueScore: "1.10", awayFatigueScore: "6.10", homeScore: 90 }),
      game({ awayFatigueScore: "4.99" }),
      game({ homeFatigueScore: "5", awayFatigueScore: "0" }),
      game({ neutralSite: true }), game({ homeScore: null }),
    ], new Set(["2024-25"]));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ season: "2023-24", games: 1, largeRestGap: { games: 0, restedTeamWins: 0, winPct: null } });
    expect(rows[1]).toMatchObject({ season: "2024-25", homeGames: 5, homeWins: 3, games: 4,
      isComplete: false, largeRestGap: { games: 3, restedTeamWins: 1 } });
    expect(rows[1].largeRestGap.winPct).toBe((1 / 3) * 100);
  });

  it("preserves genuine zero and 100 percent observations while an absent sample stays null", () => {
    const { seasonWinRates: rows } = buildHomeCourtStudy([
      game({ season: "2022-23", homeScore: 90 }),
      game({ season: "2023-24", awayFatigueScore: "1" }), game(),
    ]);
    expect(rows.map((row) => row.largeRestGap.winPct)).toEqual([0, null, 100]);
  });
});

describe("homeCourtChartSegments", () => {
  it("breaks paths at missing observations without losing legitimate zero values", () => {
    expect(homeCourtChartSegments([0, 50, null, 100, null, 25, 75])).toEqual([
      [{ index: 0, rate: 0 }, { index: 1, rate: 50 }],
      [{ index: 5, rate: 25 }, { index: 6, rate: 75 }],
    ]);
    expect(homeCourtChartSegments([null, 100, null])).toEqual([]);
  });
});
