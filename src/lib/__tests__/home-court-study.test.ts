import { describe, expect, it } from "vitest";

import {
  homeCourtEraSummary,
  homeCourtTickIndices,
  restedHomeGap,
  type HomeCourtSeason,
} from "@/lib/home-court-study";

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
  it("uses source counts instead of subtracting already-rounded rates", () => {
    const row = season("2024-25", 2, 3, 2, 3);
    row.homeBaselinePct = 66.7;
    row.winPct = 66.6;
    row.games = 100;
    row.restedTeamWins = 67;
    expect(restedHomeGap(row)).toBe(0.3);
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
