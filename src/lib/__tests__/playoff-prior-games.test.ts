import { describe, expect, it } from "vitest";
import { grindLineLabels, priorRoundGamesLabel } from "@/lib/playoff-rest-facts";

describe("priorRoundGamesLabel", () => {
  it("names a sweep", () => {
    expect(priorRoundGamesLabel(4, true)).toBe("swept in 4");
  });

  it("names a best-of-five sweep", () => {
    expect(priorRoundGamesLabel(3, false)).toBe("swept in 3");
  });

  it("names an early close", () => {
    expect(priorRoundGamesLabel(5, true)).toBe("closed in 5");
  });

  it("names going the full distance in a best-of-seven", () => {
    expect(priorRoundGamesLabel(7, true)).toBe("survived a 7");
  });

  it("names going the full distance in a best-of-five", () => {
    expect(priorRoundGamesLabel(5, false)).toBe("survived a 5");
  });

  it("returns null in round 1, where there is no prior round", () => {
    expect(priorRoundGamesLabel(null, true)).toBeNull();
  });
});

describe("grindLineLabels", () => {
  it("reads a pre-2002-03 round-2 card under the PRIOR round's best-of-5 format", () => {
    // The regression. A 1995-96 conference semifinal is best-of-7, but the first round it
    // came out of was best-of-5: 3-2 in five games is the full distance, and 3-1 in four is
    // not a sweep. Labelling either with the CURRENT series' format inverts both readings.
    expect(
      grindLineLabels({
        homeCourtPriorGames: 5,
        opponentPriorGames: 4,
        homeCourtPriorIsBestOf7: false,
        opponentPriorIsBestOf7: false,
      })
    ).toEqual({ homeCourt: "survived a 5", opponent: "closed in 4" });
  });

  it("reads a modern round-2 card under best-of-7", () => {
    expect(
      grindLineLabels({
        homeCourtPriorGames: 5,
        opponentPriorGames: 4,
        homeCourtPriorIsBestOf7: true,
        opponentPriorIsBestOf7: true,
      })
    ).toEqual({ homeCourt: "closed in 5", opponent: "swept in 4" });
  });

  it("returns null in round 1, so the card emits no grind line at all", () => {
    expect(
      grindLineLabels({
        homeCourtPriorGames: null,
        opponentPriorGames: null,
        homeCourtPriorIsBestOf7: null,
        opponentPriorIsBestOf7: null,
      })
    ).toBeNull();
  });
});
