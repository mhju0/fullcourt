import { describe, expect, it } from "vitest"

import {
  formatSignedDays,
  formatSignedRate,
} from "@/components/schedule-disparity-content"

/**
 * Every column on /schedule is oriented so positive is favorable, so the sign is doing real
 * work — it is the only thing telling a reader whether the schedule helped or hurt. These pin
 * the two formatters that render it.
 */
describe("formatSignedDays", () => {
  it("marks a favorable edge with a plus", () => {
    expect(formatSignedDays(15)).toBe("+15")
  })

  it("uses a typographic minus, not a hyphen, for unfavorable edges", () => {
    // U+2212. The hyphen-minus reads short and sits off the numeral's baseline in mono.
    expect(formatSignedDays(-11)).toBe("−11")
    expect(formatSignedDays(-11)).not.toBe("-11")
  })

  it("renders an exactly even schedule as a bare zero, with no sign", () => {
    expect(formatSignedDays(0)).toBe("0")
  })
})

describe("formatSignedRate", () => {
  it("keeps two decimals, because the whole league fits inside roughly ±0.65", () => {
    expect(formatSignedRate(0.61)).toBe("+0.61")
    expect(formatSignedRate(-0.63)).toBe("−0.63")
  })

  it("distinguishes values that one decimal would collapse together", () => {
    // Cleveland and Utah round to the same figure at one decimal but are meaningfully apart.
    expect(formatSignedRate(0.61)).not.toBe(formatSignedRate(0.5))
  })

  it("renders a missing fatigue edge as an em dash rather than a zero", () => {
    // Null means no counted game is scored yet — an unplayed schedule. Printing 0.00 would
    // claim the teams came out even, which is a different statement from "not known".
    expect(formatSignedRate(null)).toBe("—")
  })

  it("never emits a negative zero", () => {
    // −0.004 rounds to −0, which would print as "−0.00" and imply a disadvantage that isn't there.
    expect(formatSignedRate(-0.004)).toBe("0.00")
    expect(formatSignedRate(0)).toBe("0.00")
  })
})
