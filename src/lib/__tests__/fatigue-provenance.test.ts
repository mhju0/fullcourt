import { describe, expect, it } from "vitest";
import { isProjectedFatigue } from "@/lib/fatigue-provenance";

describe("isProjectedFatigue", () => {
  it("calls nothing projected once a season is complete", () => {
    expect(isProjectedFatigue("2026-01-14", null)).toBe(false);
    expect(isProjectedFatigue("2025-10-21", null)).toBe(false);
  });

  describe("a season that has not started", () => {
    const openingNight = "2026-10-20";

    it("does not call opening night projected — nobody has played, so nobody is more rested", () => {
      // The model's opener branch reports a genuine 0 here, not an absence of measurement.
      expect(isProjectedFatigue("2026-10-20", openingNight)).toBe(false);
    });

    it("calls every later game projected", () => {
      expect(isProjectedFatigue("2026-10-21", openingNight)).toBe(true);
      expect(isProjectedFatigue("2027-01-14", openingNight)).toBe(true);
      expect(isProjectedFatigue("2027-04-11", openingNight)).toBe(true);
    });
  });

  describe("mid-season", () => {
    const today = "2027-01-14";

    it("does not call tonight's game projected — all of its priors are played", () => {
      // The case that makes 'has this game been played' the wrong rule: tonight has not been
      // played, but nothing its fatigue rests on is still open.
      expect(isProjectedFatigue(today, today)).toBe(false);
    });

    it("does not call a completed game projected", () => {
      expect(isProjectedFatigue("2026-12-25", today)).toBe(false);
      expect(isProjectedFatigue("2026-10-20", today)).toBe(false);
    });

    it("calls tomorrow and beyond projected", () => {
      expect(isProjectedFatigue("2027-01-15", today)).toBe(true);
      expect(isProjectedFatigue("2027-04-11", today)).toBe(true);
    });
  });

  it("compares ET date keys lexically, which is the same as chronologically", () => {
    // Guards the ISO-key assumption the whole rule rests on.
    expect(isProjectedFatigue("2027-01-02", "2026-12-31")).toBe(true);
    expect(isProjectedFatigue("2026-12-31", "2027-01-02")).toBe(false);
  });
});
