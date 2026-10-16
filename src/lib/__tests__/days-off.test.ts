import { describe, expect, it } from "vitest";
import { daysOffBeforeGame, formatDaysOff } from "@/lib/days-off";

describe("daysOffBeforeGame", () => {
  it("reads a back-to-back as zero days off, not one", () => {
    // Friday then Saturday: one calendar day apart, no day without a game between.
    expect(daysOffBeforeGame(1)).toBe(0);
  });

  it("counts the full days between two games", () => {
    expect(daysOffBeforeGame(2)).toBe(1);
    expect(daysOffBeforeGame(4)).toBe(3);
  });

  it("keeps a season opener unmeasured", () => {
    expect(daysOffBeforeGame(null)).toBeNull();
  });
});

describe("formatDaysOff", () => {
  it("writes the unit out, singular only for one", () => {
    expect(formatDaysOff(0)).toBe("0 days");
    expect(formatDaysOff(1)).toBe("1 day");
    expect(formatDaysOff(2)).toBe("2 days");
  });

  it("prints the em dash for an opener", () => {
    expect(formatDaysOff(null)).toBe("—");
  });
});
