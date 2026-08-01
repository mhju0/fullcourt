import { describe, expect, it } from "vitest";

import { signedNumber } from "@/lib/signed-number";

/**
 * Consolidated from `formatSignedCount` (/schedule) and `formatDeviation` (/analysis), the two
 * formatters that had unit tests. Nine others had none, and two of those were emitting the
 * ASCII hyphen.
 */
describe("signedNumber", () => {
  it("marks a favorable value with a plus", () => {
    // Every column on /schedule is oriented so positive is favorable: the sign is the only
    // thing telling a reader whether the schedule helped or hurt.
    expect(signedNumber(15)).toBe("+15");
    expect(signedNumber(6.6)).toBe("+6.6");
    expect(signedNumber(0.7141, 2)).toBe("+0.71");
  });

  it("uses a typographic minus, not a hyphen", () => {
    // U+2212. The hyphen-minus reads short and sits off the numeral's baseline in mono.
    expect(signedNumber(-11)).toBe("−11");
    expect(signedNumber(-11)).not.toBe("-11");
    // The two regressions this consolidation fixes: /playoffs series features and the
    // model-coefficient table both rendered `toFixed`'s own ASCII sign.
    expect(signedNumber(-0.5, 2)).toBe("−0.50");
    expect(signedNumber(-0.5, 2)).not.toBe("-0.50");
  });

  it("renders an exact zero bare, with no sign", () => {
    expect(signedNumber(0)).toBe("0");
    expect(signedNumber(-0)).toBe("0");
    expect(signedNumber(0, 2)).toBe("0.00");
  });

  it("keeps the decimal padding at zero", () => {
    // season-report-content does `signedNumber(margin, 1).replace(".0", "")` to render "+12"
    // from an integer. Returning a bare "0" here would silently stop that replace firing.
    expect(signedNumber(0, 1)).toBe("0.0");
  });

  it("renders the value as-is when no decimals are given", () => {
    // The /analysis axis ticks are integers and its tooltips carry one decimal; both go
    // through the same formatter, so neither may be forced to a fixed width.
    expect(signedNumber(10)).toBe("+10");
    expect(signedNumber(-10)).toBe("−10");
    expect(signedNumber(-1.59)).toBe("−1.59");
  });

  it("signs a value that only rounds to zero", () => {
    // Documented above: the sign reads the raw value. Pinned so a later change is a decision.
    expect(signedNumber(-0.04, 1)).toBe("−0.0");
  });
});
