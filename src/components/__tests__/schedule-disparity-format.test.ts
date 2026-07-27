import { describe, expect, it } from "vitest"

import {
  formatSignedDays,
  formatSignedScore,
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

describe("formatSignedScore", () => {
  it("keeps one decimal so near-ties stay distinguishable", () => {
    expect(formatSignedScore(49.02)).toBe("+49.0")
    expect(formatSignedScore(-50.87)).toBe("−50.9")
  })

  it("renders a missing fatigue edge as an em dash rather than a zero", () => {
    // Null means no counted game is scored yet — an unplayed schedule. Printing 0.0 would
    // claim the teams came out even, which is a different statement from "not known".
    expect(formatSignedScore(null)).toBe("—")
  })

  it("never emits a negative zero", () => {
    // −0.04 rounds to −0, which would print as "−0.0" and imply a disadvantage that isn't there.
    expect(formatSignedScore(-0.04)).toBe("0.0")
    expect(formatSignedScore(0)).toBe("0.0")
  })
})
