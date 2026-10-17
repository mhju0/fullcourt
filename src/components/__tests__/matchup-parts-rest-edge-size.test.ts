import { describe, expect, it } from "vitest";
import {
  LARGE_REST_EDGE_THRESHOLD,
  MEDIUM_REST_EDGE_THRESHOLD,
  REST_EDGE_LABEL,
  restEdgeRates,
  restEdgeSize,
} from "@/components/matchup-parts";
import { BACKTEST_THRESHOLDS, classifyRestAdvantage } from "@/lib/rest-advantage-evidence";

/**
 * The board marks two sizes, medium (3 to 5) and large (5+), and only for the rested team at
 * home off a neutral site. A rested visitor is left blank at any gap, because those teams lose
 * more than they win at every size (D-96, D-101).
 */
describe("rest edge size", () => {
  // classifyRestAdvantage(home, away): a lower home fatigue score means the home team is fresher.
  const homeFresher = (gap: number) => classifyRestAdvantage(0, gap);
  const awayFresher = (gap: number) => classifyRestAdvantage(gap, 0);

  it("marks medium from 3 and large from 5, and nothing below 3", () => {
    expect(restEdgeSize(homeFresher(2.99), null)).toBeNull();
    expect(restEdgeSize(homeFresher(3), null)).toBe("medium");
    expect(restEdgeSize(homeFresher(4.99), null)).toBe("medium");
    expect(restEdgeSize(homeFresher(5), null)).toBe("large");
    expect(restEdgeSize(homeFresher(9.4), null)).toBe("large");
  });

  it("never marks a rested visitor, a neutral site, or a game with no fatigue pair", () => {
    expect(restEdgeSize(awayFresher(6), null)).toBeNull();
    expect(restEdgeSize(homeFresher(6), "Mexico City")).toBeNull();
    expect(restEdgeSize(null, null)).toBeNull();
  });

  it("sits on published backtest buckets, so the board guide can quote both rates", () => {
    expect(BACKTEST_THRESHOLDS).toContain(MEDIUM_REST_EDGE_THRESHOLD);
    expect(BACKTEST_THRESHOLDS).toContain(LARGE_REST_EDGE_THRESHOLD);
  });

  it("names each size on its badge and never says big", () => {
    expect(REST_EDGE_LABEL).toEqual({ medium: "MEDIUM REST EDGE", large: "LARGE REST EDGE" });
  });
});

describe("restEdgeRates", () => {
  const thresholds = [
    { threshold: 2, games: 20000, restedTeamWins: 12100, winPct: 60.5 },
    { threshold: 3, games: 10463, restedTeamWins: 6604, winPct: 63.1 },
    { threshold: 5, games: 3756, restedTeamWins: 2452, winPct: 65.3 },
    { threshold: 7, games: 1080, restedTeamWins: 712, winPct: 65.9 },
  ];

  it("reads medium as the 3+ bucket less the 5+ one, so the two sizes never share a game", () => {
    expect(restEdgeRates(thresholds)).toEqual({
      medium: { games: 6707, winPct: 61.9 },
      large: { games: 3756, winPct: 65.3 },
    });
  });

  it("returns null for a size whose buckets are missing or empty, never a rate off no games", () => {
    expect(restEdgeRates(thresholds.filter((t) => t.threshold !== 5))).toEqual({ medium: null, large: null });
    expect(restEdgeRates(thresholds.filter((t) => t.threshold !== 3)).medium).toBeNull();
    expect(restEdgeRates([
      { threshold: 3, games: 0, restedTeamWins: 0, winPct: 0 },
      { threshold: 5, games: 0, restedTeamWins: 0, winPct: 0 },
    ])).toEqual({ medium: null, large: null });
  });
});
