import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = join(__dirname, "..", "..")
const css = readFileSync(join(root, "app", "globals.css"), "utf8")
const source = readFileSync(join(root, "components", "schedule-disparity-content.tsx"), "utf8")

describe("schedule breakdown stacking", () => {
  it("keeps every mark in the table below the pinned team column", () => {
    const rule = css.match(/\.fc-schedule-breakdown :is\(th, td\):nth-child\(2\) \{[^}]*z-index: (\d+)/)
    expect(rule).not.toBeNull()
    const pinned = Number(rule![1])

    const marks = [...source.matchAll(/\bz-\[(\d+)\]|\bz-(\d+)\b|zIndex: (\d+)/g)].map((m) =>
      Number(m[1] ?? m[2] ?? m[3]),
    )
    for (const z of marks) expect(z).toBeLessThan(pinned)
  })
})
