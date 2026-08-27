import { describe, expect, it } from "vitest"

import {
  deviationFill,
  deviationScale,
  minBarSize,
  plottableSeasonRates,
} from "@/components/analysis-content"
// The lift is claim vocabulary before it is a plotted value, so it lives with the claims.
// The three helpers above are drawing alone and stay beside the chart.
import { toDeviation } from "@/lib/analysis-claims"
import { MIN_GAMES_FOR_INFERENCE } from "@/lib/season-report"

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

/**
 * The by-season chart shares one y-axis, derived from the data, so a season whose sample is a
 * fraction of its peers' rescales every other bar rather than merely drawing a noisy one.
 *
 * Every figure below was read off the live database on 2026-08-27, when 2026-27 was seeded
 * (1,200 games, none played) and the chart held 41 completed seasons.
 */
describe("plottableSeasonRates", () => {
  /** Unfiltered per-season called games, live: fewest 382, median 688, most 775. */
  const UNFILTERED = [
    { season: "1998-99", games: 382 },
    { season: "2024-25", games: 703 },
    { season: "2025-26", games: 605 },
  ]

  it("plots every completed season", () => {
    expect(plottableSeasonRates(UNFILTERED, UNFILTERED).map((s) => s.season)).toEqual([
      "1998-99",
      "2024-25",
      "2025-26",
    ])
  })

  /**
   * Four days into 2026-27 the season has ~5 called games and sits a median 17.1pp off its own
   * baseline — which widened the axis from 6pp to 25pp in 153 of 200 simulated openings.
   */
  it("withholds a season still being played", () => {
    const opening = [...UNFILTERED, { season: "2026-27", games: 5 }]
    expect(plottableSeasonRates(opening, opening).map((s) => s.season)).not.toContain("2026-27")
  })

  it("admits it once it reaches the gate, and not one game before", () => {
    const below = [{ season: "2026-27", games: MIN_GAMES_FOR_INFERENCE - 1 }]
    const at = [{ season: "2026-27", games: MIN_GAMES_FOR_INFERENCE }]
    expect(plottableSeasonRates(below, below)).toHaveLength(0)
    expect(plottableSeasonRates(at, at)).toHaveLength(1)
  })

  /**
   * The case that fails if maturity is ever read off the row being drawn instead of the
   * unfiltered population. The threshold views re-count each season over a rare subset: at
   * RA >= 7 a *complete* season yields 9 to 46 called games, and all 41 sit below the gate.
   * Gating on those counts would empty the chart — and hide 22 of 41 seasons at RA >= 5.
   */
  it("keeps completed seasons in the threshold views, where every count is small", () => {
    const atRa7 = [
      { season: "1998-99", games: 25 },
      { season: "2024-25", games: 14 },
      { season: "2025-26", games: 12 },
    ]
    expect(plottableSeasonRates(atRa7, UNFILTERED).map((s) => s.season)).toEqual([
      "1998-99",
      "2024-25",
      "2025-26",
    ])
  })

  it("withholds the young season in those views too", () => {
    const atRa7 = [
      { season: "2025-26", games: 12 },
      { season: "2026-27", games: 1 },
    ]
    const unfiltered = [...UNFILTERED, { season: "2026-27", games: 5 }]
    expect(plottableSeasonRates(atRa7, unfiltered).map((s) => s.season)).toEqual(["2025-26"])
  })

  it("drops a season the unfiltered population cannot vouch for", () => {
    expect(plottableSeasonRates([{ season: "2026-27", games: 900 }], UNFILTERED)).toHaveLength(0)
  })
})
