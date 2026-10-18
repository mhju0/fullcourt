import { describe, expect, it } from "vitest";
import {
  cutToTenths,
  formatFatigueScore,
  formatRestAdvantageDisplay,
  formatRestAdvantageValue,
  homeWinRateWhenVisitorRested,
} from "@/lib/rest-advantage-display";
import { NEUTRAL_REST_ADVANTAGE_THRESHOLD } from "@/lib/rest-advantage-evidence";
import { LARGE_REST_EDGE_THRESHOLD, MEDIUM_REST_EDGE_THRESHOLD } from "@/components/matchup-parts";

describe("formatRestAdvantageDisplay", () => {
  it("labels the away team when the API marks away as advantaged", () => {
    expect(
      formatRestAdvantageDisplay(
        { differential: 3.2, advantageTeam: "away" },
        "BOS",
        "LAL"
      )
    ).toMatchObject({
      kind: "team",
      teamAbbreviation: "LAL",
      value: "3.2",
      text: "LAL 3.2",
    });
  });

  it("labels the home team when the API marks home as advantaged", () => {
    expect(
      formatRestAdvantageDisplay(
        { differential: -3.2, advantageTeam: "home" },
        "BOS",
        "LAL"
      )
    ).toMatchObject({
      kind: "team",
      teamAbbreviation: "BOS",
      value: "3.2",
      text: "BOS 3.2",
    });
  });

  it("cuts the gap to one decimal, so it never rounds across a line", () => {
    expect(
      formatRestAdvantageDisplay(
        { differential: 2.96, advantageTeam: "away" },
        "BOS",
        "LAL"
      )
    ).toMatchObject({
      value: "2.9",
      text: "LAL 2.9",
    });
  });

  // Every line is a tenth, so the cut figure sits on the same side of it as the raw value.
  // Rounding fails this at 0.46 ("0.5" beside EVEN) and 2.96 ("3.0" with no MEDIUM REST EDGE).
  it("prints a figure at or above each line exactly when the value is", () => {
    const hundredths = Array.from({ length: 1001 }, (_, i) => i / 100);
    for (const line of [NEUTRAL_REST_ADVANTAGE_THRESHOLD, MEDIUM_REST_EDGE_THRESHOLD, LARGE_REST_EDGE_THRESHOLD]) {
      const disagree = hundredths.filter((v) => (Number(formatRestAdvantageValue(v)) >= line) !== (v >= line));
      expect(disagree).toEqual([]);
    }
  });

  it("drops the hundredths without rounding and keeps exact tenths", () => {
    expect([3.11, 3.09, 3.0, 0.49, 0.5, 9.99, 0.3, 2.9, 0].map(formatRestAdvantageValue))
      .toEqual(["3.1", "3.0", "3.0", "0.4", "0.5", "9.9", "0.3", "2.9", "0.0"]);
    expect(formatFatigueScore(5.36)).toBe("5.3");
    expect(cutToTenths(-1.25)).toBe("-1.2");
  });

  it("separates a game it never measured from one it called level", () => {
    // A null rest advantage means no fatigue pair exists for the game, which is what every
    // fixture of a released-but-unplayed season looks like. Reporting it as `neutral` put
    // "EVEN 0.0" on the Games board for all 1,200 of them — a measurement never taken.
    const unmeasured = formatRestAdvantageDisplay(null, "BOS", "LAL");
    expect(unmeasured).toEqual({ kind: "unmeasured", text: "\u2014" });

    const level = formatRestAdvantageDisplay(
      { differential: 0.3, advantageTeam: "neutral" },
      "BOS",
      "LAL"
    );
    expect(level.kind).toBe("neutral");
    expect(level.kind).not.toBe(unmeasured.kind);
  });

  it("displays neutral text for neutral/no-call values", () => {
    expect(
      formatRestAdvantageDisplay(
        { differential: 0.3, advantageTeam: "neutral" },
        "BOS",
        "LAL"
      )
    ).toEqual({
      kind: "neutral",
      text: "NEUTRAL",
      projected: false,
    });
  });
});

/**
 * The games the model does not call, stated as the home team's win rather than the rested
 * visitor's loss. Same set, same counts — only the subject changes.
 */
describe("homeWinRateWhenVisitorRested", () => {
  it("reports the complement of the rested visitor's record", () => {
    expect(
      homeWinRateWhenVisitorRested({ games: 1000, restedTeamWins: 424, winPct: 42.4 })
    ).toBe(57.6);
  });

  /**
   * Derived from the counts, never as `100 − winPct`, and this fixture is the one that can
   * tell the difference.
   *
   * 66/160 is 41.25% and 94/160 is 58.75% — both land exactly on a rounding tie, and
   * `Math.round` takes both upward, so the two published halves come to 100.1. Subtracting
   * the stored `winPct` would give 58.7 where the counts give 58.8.
   */
  it("derives from the counts rather than subtracting a rounded percentage", () => {
    const split = { games: 160, restedTeamWins: 66, winPct: 41.3 };

    expect(homeWinRateWhenVisitorRested(split)).toBe(58.8);
    expect(homeWinRateWhenVisitorRested(split)).not.toBe(100 - split.winPct);
  });

  it("answers 0 for an empty set rather than dividing by zero", () => {
    expect(
      homeWinRateWhenVisitorRested({ games: 0, restedTeamWins: 0, winPct: 0 })
    ).toBe(0);
  });

  it("reports a clean sweep as 100", () => {
    expect(
      homeWinRateWhenVisitorRested({ games: 50, restedTeamWins: 0, winPct: 0 })
    ).toBe(100);
  });
});

describe("formatRestAdvantageDisplay — projected provenance", () => {
  const ra = { differential: 3.2, advantageTeam: "home" as const };

  it("defaults to measured, so no caller opts into a claim by omission", () => {
    const display = formatRestAdvantageDisplay(ra, "BOS", "LAL");
    expect(display.kind).toBe("team");
    expect(display.kind === "team" && display.projected).toBe(false);
  });

  it("carries the projected flag without changing the team or the figure", () => {
    const measured = formatRestAdvantageDisplay(ra, "BOS", "LAL", false);
    const projected = formatRestAdvantageDisplay(ra, "BOS", "LAL", true);

    expect(projected.kind === "team" && projected.projected).toBe(true);
    // Same reading, annotated — not a different reading.
    expect(projected.text).toBe(measured.text);
    expect(projected.kind === "team" && projected.teamAbbreviation).toBe("BOS");
    expect(projected.kind === "team" && projected.value).toBe("3.2");
  });

  it("labels a projected neutral too, because that is a different claim from a measured one", () => {
    // NEUTRAL is a statement about the *result* — measured, and the gap came out too small to
    // act on. A projected gap that is currently too small can still move. Seen on the board,
    // leaving this off showed some projected rows annotated and some not.
    const projectedNeutral = formatRestAdvantageDisplay(
      { differential: 0.1, advantageTeam: "neutral" },
      "BOS",
      "LAL",
      true
    );
    expect(projectedNeutral.kind).toBe("neutral");
    expect(projectedNeutral.kind === "neutral" && projectedNeutral.projected).toBe(true);

    const measuredNeutral = formatRestAdvantageDisplay(
      { differential: 0.1, advantageTeam: "neutral" },
      "BOS",
      "LAL"
    );
    expect(measuredNeutral.kind === "neutral" && measuredNeutral.projected).toBe(false);
  });

  it("takes no flag when there is no reading to attribute", () => {
    const display = formatRestAdvantageDisplay(null, "BOS", "LAL", true);
    expect(display.kind).toBe("unmeasured");
    expect("projected" in display).toBe(false);
  });
});
