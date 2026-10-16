import { describe, expect, it } from "vitest";
import { BIG_REST_EDGE_THRESHOLD, isBigRestEdge } from "@/components/matchup-parts";
import { BACKTEST_THRESHOLDS, classifyRestAdvantage } from "@/lib/rest-advantage-evidence";

/**
 * The BIG REST EDGE badge marks only the games the backtest's 3+ bucket counts: the rested team
 * at home, off a neutral site, by at least the threshold. A rested visitor is left blank at any
 * gap, because those teams lose more than they win (D-96).
 */
describe("BIG REST EDGE", () => {
  // classifyRestAdvantage(home, away): a lower home fatigue score means the home team is fresher.
  const homeFresher = (gap: number) => classifyRestAdvantage(0, gap);
  const awayFresher = (gap: number) => classifyRestAdvantage(gap, 0);

  it("marks a rested home team at the threshold and not just below it", () => {
    expect(isBigRestEdge(homeFresher(3), null)).toBe(true);
    expect(isBigRestEdge(homeFresher(6.4), null)).toBe(true);
    expect(isBigRestEdge(homeFresher(2.99), null)).toBe(false);
  });

  it("never marks a rested visitor, a neutral site, or a game with no fatigue pair", () => {
    expect(isBigRestEdge(awayFresher(4), null)).toBe(false);
    expect(isBigRestEdge(homeFresher(4), "Mexico City")).toBe(false);
    expect(isBigRestEdge(null, null)).toBe(false);
  });

  it("sits on a published backtest bucket, so the board guide can quote its rate", () => {
    expect(BACKTEST_THRESHOLDS).toContain(BIG_REST_EDGE_THRESHOLD);
  });
});
