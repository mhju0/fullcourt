import { describe, expect, it } from "vitest"

import { formatSignedCount } from "@/components/schedule-disparity-content"

/**
 * Every column on /schedule is oriented so positive is favorable, so the sign is doing real
 * work — it is the only thing telling a reader whether the schedule helped or hurt.
 */
describe("formatSignedCount", () => {
  it("marks a favorable edge with a plus", () => {
    expect(formatSignedCount(15)).toBe("+15")
  })

  it("uses a typographic minus, not a hyphen, for unfavorable edges", () => {
    // U+2212. The hyphen-minus reads short and sits off the numeral's baseline in mono.
    expect(formatSignedCount(-11)).toBe("−11")
    expect(formatSignedCount(-11)).not.toBe("-11")
  })

  it("renders an exactly even schedule as a bare zero, with no sign", () => {
    expect(formatSignedCount(0)).toBe("0")
  })
})
