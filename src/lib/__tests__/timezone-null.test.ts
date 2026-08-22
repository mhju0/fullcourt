import { describe, expect, it } from "vitest";
import timeZoneData from "@/data/timezone-null.json";
import { FATIGUE_CONSTANTS } from "@/lib/fatigue";
import {
  rawSwingPoints,
  strengthVsFatigueRatio,
  termRow,
  tripRow,
  type TimeZoneNull,
} from "@/lib/timezone-null";

/**
 * `/behind-the-data/time-zones` publishes a null, and a null is the easiest thing on this site
 * to turn into a false claim by accident — one regenerated artifact with a different sign and
 * the page is asserting "no effect" above a table showing one.
 *
 * Every bounded claim the page makes is pinned here at BOTH ends, which is the lesson
 * `referee-timing.test.ts` was rewritten for: a guard that only checks an effect is not *large*
 * will happily certify prose that says the effect is *absent*.
 */

const data = timeZoneData as TimeZoneNull;

describe("the time-zone null", () => {
  it("keeps the deciding term at exactly zero in every fold", () => {
    // The page says the primary term was "pinned at zero in every one of the folds". If a
    // regeneration ever lets it off the clamp, that sentence becomes false.
    const primary = termRow(data, data.primaryTerm);

    expect(data.primaryTerm).toBe("d_east3_short");
    expect(primary.foldsNonZero).toBe(0);
    expect(primary.meanWeight).toBe(0);
  });

  it("keeps the four candidates worth nothing, and not accidentally worth something", () => {
    // Both ends. Below: the page's "not a small gain, a small loss" needs the sign to stay
    // negative. Above: a candidate set that started genuinely helping would need the page
    // rewritten, not silently re-rendered.
    expect(data.logLoss.candidatesWorth).toBeLessThanOrEqual(0);
    expect(data.logLoss.candidatesWorth).toBeGreaterThan(-0.0005);

    // The arithmetic the formula block prints has to agree with the two models it sits between.
    expect(data.logLoss.withCandidates).toBeGreaterThan(data.logLoss.baseline);
    expect(data.logLoss.baseline).toBeLessThan(data.logLoss.strengthOnly);
  });

  it("lets no single candidate earn its place alone", () => {
    // Added one at a time, so a dead term cannot hide behind the other three. The page's
    // whole verdict rests on all four failing this, not just the primary one.
    for (const term of data.terms) {
      expect(Math.abs(term.aloneVsBaseline)).toBeLessThan(0.0001);
    }
  });

  it("keeps the raw split large enough that the page still has to explain it", () => {
    // The page exists BECAUSE the raw numbers look like a finding. If the swing ever shrank to
    // nothing, the "read it for the denominators, not the effect" framing would be arguing
    // against a table that no longer says anything — so this is pinned low as well as high.
    const swing = rawSwingPoints(data);

    expect(swing).toBeGreaterThan(5);
    expect(swing).toBeLessThan(10);
  });

  it("keeps the raw split pointing the wrong way for jet lag", () => {
    // Circadian disruption punishes EASTWARD travel. Here the eastward visitors do better than
    // the westward ones, which is the page's first warning sign and the reason it does not
    // simply report the split. If this ever flipped, the page would be telling the reader to
    // distrust a result that had started agreeing with the literature.
    const east = tripRow(data, "east ≥ 3h");
    const west = tripRow(data, "west ≥ 3h");

    expect(east.homeWinPct).toBeLessThan(data.protocol.baselineHomeWinPct);
    expect(west.homeWinPct).toBeGreaterThan(data.protocol.baselineHomeWinPct);
  });

  it("keeps the strength edge flipping sign with direction, which is the confound", () => {
    // This is the explanation, and it is load-bearing: the win rate follows strength, so the
    // signs must stay opposite and the no-shift cell must stay near zero between them.
    const east = tripRow(data, "east ≥ 3h");
    const west = tripRow(data, "west ≥ 3h");
    const neither = tripRow(data, "no long shift either way");

    expect(east.strengthEdgeToHome).toBeLessThan(0);
    expect(west.strengthEdgeToHome).toBeGreaterThan(0);
    expect(Math.abs(neither.strengthEdgeToHome ?? 1)).toBeLessThan(
      Math.abs(east.strengthEdgeToHome ?? 0)
    );
  });

  it("keeps the one stable-looking term mostly back-to-backs", () => {
    // The page explains d_west3_short's stable weight as "a second name for the back-to-back
    // the model already carries". That sentence is only true while the overlap stays high.
    const westShort = termRow(data, "d_west3_short");

    expect(westShort.foldsNonZero).toBe(data.protocol.folds);
    expect(westShort.alsoBackToBackPct).toBeGreaterThan(75);
    expect(Math.abs(westShort.aloneVsBaseline)).toBeLessThan(0.0001);
  });

  it("keeps altitude excluded by construction, which the page states as zero", () => {
    // A 3h threshold excludes Mountain time, so this is 0.0% by geometry rather than by luck.
    // The page prints it and the limits list leans on it; a non-zero value would make both wrong.
    for (const term of data.terms) {
      expect(term.alsoAltitudePct).toBe(0);
    }
  });

  it("keeps the shipped asymmetry unverified rather than confirmed", () => {
    // The page reads the two multipliers live from fatigue.ts and says this test is NOT
    // evidence they are right. That framing only makes sense while they remain asymmetric —
    // if they were ever equalised, the paragraph would be arguing about nothing.
    expect(FATIGUE_CONSTANTS.eastwardMultiplier).toBeGreaterThan(
      FATIGUE_CONSTANTS.westwardMultiplier
    );
  });

  it("keeps the scale figure the page rounds honest", () => {
    // The page prints `≈ N× the whole fatigue model`. Rounding a ratio is fine; rounding one
    // that has drifted is not.
    expect(Math.round(strengthVsFatigueRatio(data))).toBe(24);
  });

  it("resolves every row the page asks for by name", () => {
    // The helpers throw rather than render a blank, so a renamed row in the artifact fails
    // here instead of shipping a page with a hole in a sentence.
    for (const trip of [
      "east ≥ 3h",
      "east ≥ 3h, short rest",
      "west ≥ 3h",
      "west ≥ 3h, short rest",
      "no long shift either way",
    ]) {
      expect(() => tripRow(data, trip)).not.toThrow();
    }
    for (const term of ["d_east3_short", "d_west3_short", "d_east3", "d_west3"]) {
      expect(() => termRow(data, term)).not.toThrow();
    }
    expect(() => tripRow(data, "nope")).toThrow();
    expect(() => termRow(data, "nope")).toThrow();
  });
});
