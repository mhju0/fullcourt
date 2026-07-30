import { describe, expect, it } from "vitest";
import { ABNORMAL_STRETCHES, isNormallyPlayed } from "@/lib/season-regime";

describe("season regime", () => {
  it("excludes the Orlando bubble", () => {
    expect(isNormallyPlayed("2019-20", "2020-08-05")).toBe(false);
    expect(isNormallyPlayed("2019-20", "2020-07-30")).toBe(false); // first bubble day
    expect(isNormallyPlayed("2019-20", "2020-10-11")).toBe(false); // last, inclusive
  });

  it("keeps the 2019-20 games played before the suspension", () => {
    expect(isNormallyPlayed("2019-20", "2019-10-22")).toBe(true);
    expect(isNormallyPlayed("2019-20", "2020-03-10")).toBe(true);
  });

  /**
   * The regression this module was written for. The previous rule was "the date must fall
   * between October 1 and April 30 of its season", which reached the right answer for the
   * bubble by coincidence and the wrong one for every season that did not run October to
   * April — silently dropping 135 real 2020-21 games and 44 from 1998-99.
   */
  it("keeps seasons whose calendar does not run October to April", () => {
    expect(isNormallyPlayed("2020-21", "2021-05-16")).toBe(true); // last day of that regular season
    expect(isNormallyPlayed("2020-21", "2020-12-22")).toBe(true); // it started in December
    expect(isNormallyPlayed("1998-99", "1999-05-05")).toBe(true); // lockout season ran Feb-May
    expect(isNormallyPlayed("1998-99", "1999-02-05")).toBe(true);
  });

  it("is a no-op for a season with no named stretch", () => {
    expect(isNormallyPlayed("2024-25", "2025-05-16")).toBe(true);
    expect(isNormallyPlayed("2024-25", "2024-08-05")).toBe(true);
  });

  it("names why every stretch is excluded, so the list stays auditable", () => {
    for (const stretch of ABNORMAL_STRETCHES) {
      expect(stretch.why.length).toBeGreaterThan(20);
      expect(stretch.from <= stretch.to).toBe(true);
    }
  });
});
