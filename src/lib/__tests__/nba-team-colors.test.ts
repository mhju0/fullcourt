import { describe, it, expect } from "vitest"
import { readableTextOn } from "@/lib/nba-team-colors"

// Guards the light-theme chip legibility fix: text color must follow the fill's
// luminance, not a constant. A constant-white implementation fails the SAS case.
describe("readableTextOn", () => {
  it("returns white on dark team fills", () => {
    expect(readableTextOn("#0A0A0A")).toBe("#FFFFFF") // BKN black
    expect(readableTextOn("#552583")).toBe("#FFFFFF") // LAL purple
  })

  it("returns near-black on light team fills", () => {
    // SAS silver — the reason this helper exists; white text would vanish on white.
    expect(readableTextOn("#C4CED4")).toBe("#111318")
  })
})
