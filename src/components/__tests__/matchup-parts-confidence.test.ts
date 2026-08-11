import { describe, expect, it } from "vitest";
import { getConfidence } from "@/components/matchup-parts";
import { formatRestAdvantageDisplay } from "@/lib/rest-advantage-display";
import { classifyRestAdvantage } from "@/lib/rest-advantage-evidence";

/**
 * `RestAdvPanel` renders the rest-advantage verdict and the confidence badge inside the
 * same panel, so the two must never disagree: if the canonical classifier calls the game
 * for a team, the badge must not simultaneously label the matchup NEUTRAL.
 *
 * This discriminates. Before the fix the confidence tiers started at MED_CONF_THRESHOLD
 * (1.0) while `classifyRestAdvantage` calls a game at 0.5, so every gap in [0.5, 1.0)
 * rendered "BOS 0.7" directly above a "NEUTRAL" badge. Reverting `getConfidence` to drop
 * its NEUTRAL_REST_ADVANTAGE_THRESHOLD branch fails the first case below with ten
 * contradicting differentials.
 */
describe("matchup card confidence tiers", () => {
  // -3.0 … 3.0 in 0.1 steps, built from integers to avoid accumulating float drift.
  const differentials = Array.from({ length: 61 }, (_, i) => (i - 30) / 10);

  it("never labels a called game NEUTRAL", () => {
    const contradictions = differentials.filter((d) => {
      const restAdvantage = classifyRestAdvantage(0, d);
      const display = formatRestAdvantageDisplay(restAdvantage, "HOME", "AWAY");
      return (
        display.kind === "team" &&
        getConfidence(restAdvantage.differential) === "neutral"
      );
    });

    expect(contradictions).toEqual([]);
  });

  it("still labels a genuinely uncalled game NEUTRAL", () => {
    const restAdvantage = classifyRestAdvantage(0, 0.3);

    expect(formatRestAdvantageDisplay(restAdvantage, "HOME", "AWAY").kind).toBe(
      "neutral",
    );
    expect(getConfidence(restAdvantage.differential)).toBe("neutral");
  });

  it("tiers by magnitude above the call threshold", () => {
    expect(getConfidence(0.5)).toBe("low");
    expect(getConfidence(0.9)).toBe("low");
    expect(getConfidence(1.0)).toBe("med");
    expect(getConfidence(2.0)).toBe("high");
    expect(getConfidence(-2.4)).toBe("high");
    expect(getConfidence(null)).toBe("none");
  });
});
