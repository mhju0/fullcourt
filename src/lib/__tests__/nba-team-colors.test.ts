import { describe, it, expect } from "vitest"
import { NBA_TEAM_COLORS, NEUTRAL_TEAM_COLORS, readableTextOn } from "@/lib/nba-team-colors"

function luminance(hex: string): number {
  const rgb = Number.parseInt(hex.slice(1), 16)
  const channel = (value: number) => {
    const srgb = value / 255
    return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(rgb >> 16) + 0.7152 * channel((rgb >> 8) & 255) + 0.0722 * channel(rgb & 255)
}

function contrast(foreground: string, background: string): number {
  const light = Math.max(luminance(foreground), luminance(background))
  const dark = Math.min(luminance(foreground), luminance(background))
  return (light + 0.05) / (dark + 0.05)
}

const fills = Object.entries({ ...NBA_TEAM_COLORS, neutral: NEUTRAL_TEAM_COLORS })
  .flatMap(([team, colors]) => Object.entries(colors).map(([role, color]) => ({ team, role, color })))

describe("readableTextOn", () => {
  it("returns white on dark team fills", () => {
    expect(readableTextOn("#0A0A0A")).toBe("#FFFFFF")
    expect(readableTextOn("#552583")).toBe("#FFFFFF")
  })

  it("returns near-black on light team fills", () => {
    expect(readableTextOn("#C4CED4")).toBe("#111318")
    expect(readableTextOn("#FFFFFF")).toBe("#111318")
    expect(readableTextOn("C4CED4")).toBe("#111318")
  })

  it.each(["ATL", "POR"])("uses pure black on %s red because both theme text colors fail AA", (team) => {
    const fill = NBA_TEAM_COLORS[team].primary
    expect(fill).toBe("#E03A3E")
    expect(contrast("#FFFFFF", fill)).toBeLessThan(4.5)
    expect(contrast("#111318", fill)).toBeLessThan(4.5)
    expect(readableTextOn(fill)).toBe("#000000")
    expect(contrast(readableTextOn(fill), fill)).toBeGreaterThanOrEqual(4.5)
  })

  it("handles the middle-gray gap where white and near-black both fail", () => {
    expect(readableTextOn("#777777")).toBe("#000000")
    expect(contrast(readableTextOn("#777777"), "#777777")).toBeGreaterThanOrEqual(4.5)
  })

  it.each(fills)("meets normal-text AA on $team $role ($color)", ({ color }) => {
    const selected = readableTextOn(color)
    expect(contrast(selected, color)).toBeGreaterThanOrEqual(4.5)
    if (selected === "#000000") {
      expect(contrast("#FFFFFF", color)).toBeLessThan(4.5)
      expect(contrast("#111318", color)).toBeLessThan(4.5)
    } else {
      expect(contrast(selected, color)).toBe(Math.max(contrast("#FFFFFF", color), contrast("#111318", color)))
    }
  })
})
