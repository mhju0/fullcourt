import { describe, expect, it } from "vitest";
import { priorRoundGamesLabel } from "@/lib/playoff-rest-facts";

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
