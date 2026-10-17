import { describe, expect, it } from "vitest"

import {
  deviationFill,
  deviationScale,
  minBarSize,
} from "@/components/analysis-content"
// The lift is claim vocabulary before it is a plotted value, so it lives with the claims.
// The three helpers above are drawing alone and stay beside the chart.
import { toDeviation } from "@/lib/analysis-claims"

/**
 * The /analysis win-rate charts plot `winPct - baseline` as signed deviation columns.
 *
 * The encoding they replaced stacked a `base = min(winPct, 50)` segment under an
 * `edge = max(0, winPct - 50)` segment. That clamp is the defect these tests
 * pin: for any winPct <= 50 the edge was 0, so a losing slice drew as a bare
 * base segment — the same kind of mark as a dead-even one, with no encoding of
 * direction at all. Every "below the baseline" case here fails under the clamp.
 *
 * The baseline is now a parameter and is NOT 50. Every game these charts count is one the
 * rested team played at home, and home teams win ~59.9% of everything regardless of rest,
 * so a coin-flip zero credited the model with home court it did not produce.
 */
const HOME_BASELINE = 59.9

describe("toDeviation", () => {
  it("signs the distance from the baseline in percentage points", () => {
    expect(toDeviation(63.4, HOME_BASELINE)).toBe(3.5)
    expect(toDeviation(61.2, HOME_BASELINE)).toBe(1.3)
    expect(toDeviation(HOME_BASELINE, HOME_BASELINE)).toBe(0)
  })

  /**
   * The whole point of the change: rates that cleared a coin flip do not clear home court.
   * 56.6% used to plot as +6.6 and is really 3.3 points BELOW what a home team wins anyway.
   */
  it("goes negative for rates that beat 50 but not the baseline", () => {
    expect(toDeviation(56.6, HOME_BASELINE)).toBe(-3.3)
    expect(toDeviation(50, HOME_BASELINE)).toBe(-9.9)
  })

  // The clamped `edge` returned 0 for all three of these.
  it("goes negative below the baseline", () => {
    expect(toDeviation(39, HOME_BASELINE)).toBe(-20.9) // RA >= 7, 2016-17 (41 games)
    expect(toDeviation(40, HOME_BASELINE)).toBe(-19.9) // RA >= 7, 1998-99 (25 games)
    expect(toDeviation(48.3, HOME_BASELINE)).toBe(-11.6) // RA >= 7, 2022-23 (29 games)
  })

  /**
   * The season chart passes each season's own baseline, because home court ran from 67.9%
   * in 1987-88 to 54.3% in 2023-24. The same win rate is a different finding in each era.
   */
  it("reads one rate differently against different eras", () => {
    expect(toDeviation(62, 67.9)).toBe(-5.9)
    expect(toDeviation(62, 54.3)).toBe(7.7)
  })

  it("keeps one decimal place instead of leaking float error", () => {
    // 63.4 - 50 is 13.399999999999999 in IEEE 754.
    expect(toDeviation(63.4, 50)).not.toBe(13.399999999999999)
    expect(toDeviation(52.9, 50).toString()).toBe("2.9")
  })
})

describe("deviationFill", () => {
  it("uses a diverging pair with a neutral midpoint", () => {
    expect(deviationFill(13.4)).toBe("var(--term-blue)")
    expect(deviationFill(-11)).toBe("var(--term-red)")
    expect(deviationFill(0)).toBe("var(--term-neutral)")
  })
})

describe("minBarSize", () => {
  it("gives a dead-even slice a visible stub and no one else a nudge", () => {
    // RA >= 7, 2011-12 went 17/34 — exactly 50%, so its true bar height is 0px
    // and it would otherwise read as missing data rather than as a tie.
    expect(minBarSize(0)).toBe(2)
    expect(minBarSize(13.4)).toBe(0)
    expect(minBarSize(-11)).toBe(0)
  })
})

describe("deviationScale", () => {
  it("always includes zero in the domain and in the ticks", () => {
    const { domain, ticks } = deviationScale([6.6, 8.2, 11.1, 13.4])
    expect(domain[0]).toBe(0)
    expect(ticks).toContain(0)
  })

  it("extends below zero to fit losing slices", () => {
    // The live RA >= 7 season series.
    const { domain, ticks } = deviationScale([-11, -10, -1.7, 25, 23.8, 17.5])
    expect(domain[0]).toBeLessThanOrEqual(-11)
    expect(domain[1]).toBeGreaterThanOrEqual(25)
    expect(ticks).toContain(0)
  })

  it("never clips the extremes", () => {
    const values = [-11, 25]
    const { domain } = deviationScale(values)
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(domain[0])
      expect(v).toBeLessThanOrEqual(domain[1])
    }
  })

  it("emits evenly spaced ticks — no orphan final interval", () => {
    for (const values of [[6.6, 13.4], [-11, 25], [1, 2], [-3, 3]]) {
      const { ticks } = deviationScale(values)
      const gaps = ticks.slice(1).map((t, i) => t - ticks[i])
      expect(new Set(gaps).size).toBe(1)
      expect(ticks[0]).toBe(deviationScale(values).domain[0])
      expect(ticks[ticks.length - 1]).toBe(deviationScale(values).domain[1])
    }
  })

  it("keeps the tick count readable as the span grows", () => {
    for (const values of [[0.5], [6.6, 13.4], [-11, 25], [-40, 45]]) {
      const { ticks } = deviationScale(values)
      expect(ticks.length).toBeGreaterThanOrEqual(2)
      expect(ticks.length).toBeLessThanOrEqual(10)
    }
  })

  it("survives an empty series without producing a degenerate axis", () => {
    const { domain, ticks } = deviationScale([])
    expect(domain[0]).toBeLessThan(domain[1])
    expect(ticks).toContain(0)
  })
})
