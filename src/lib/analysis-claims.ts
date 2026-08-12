import type { AnalysisResponse } from "@/types"
import { homeWinRateWhenVisitorRested } from "@/lib/rest-advantage-display"
import { signedNumber } from "@/lib/signed-number"

/**
 * What `/analysis` claims about the historical backtest, as values rather than JSX.
 *
 * The page's rules used to live only in comments, and the only thing that checked them was
 * `e2e/analysis.spec.ts` — a suite `CLAUDE.md` deliberately keeps out of the commit gate and
 * out of CI, so it ran nowhere automatic. This module exists so those rules run in `test:run`.
 *
 * Shaped after {@link import("@/lib/rest-advantage-display").buildRestAdvantageEvidence}, which
 * solved the same problem one level down for a single matchup: build the claim, or return
 * nothing. That module's tests assert editorial house rules rather than arithmetic, and so do
 * this one's. It is deliberately NOT shaped after the `*-facts.ts` modules — those are frozen
 * constants pinned to `ml/*.json`, and everything here derives from live data.
 *
 * The boundary: this module owns anything that **asserts something about the data**. It owns no
 * part of how a mark is drawn — the chart scale, fill and bar-size helpers stay beside the
 * chart, and are covered by `analysis-deviation.test.ts`.
 */

/**
 * `winPct − baseline`, in percentage points, to one decimal.
 *
 * The lift is the finding; the rate alone is not. 61.2% sounds like an eleven-point edge and is
 * a one-point one — the other ten points are home court, which the model did not produce. Lives
 * here rather than beside the chart because it is claim vocabulary, not drawing: every sentence
 * and tile on the page states a rate through it.
 */
export function toDeviation(winPct: number, baselinePct: number): number {
  return Math.round((winPct - baselinePct) * 10) / 10
}

/**
 * How close two lifts must sit, in percentage points, before the page calls them the same gain.
 *
 * An editorial **wording** threshold: it picks which sentence is rendered, never which games are
 * counted, and it is not a significance test. One point, because the page states every lift to
 * one decimal and RA ≥ 7 is the thinnest slice it plots — around a thousand games, where a rate
 * near 65% carries a standard error of roughly 1.4 points. A difference under a point is inside
 * the noise on that bucket by any reading, and the page must not narrate a trend smaller than
 * the noise. Raising this makes the page quieter, never wronger.
 */
const SAME_GAIN_TOLERANCE_PP = 1

/** One hero tile: a rate, over a named slice, with the lift and denominator that qualify it. */
export type ClaimTile = {
  /**
   * Names WHO won and over WHICH slice, in that order.
   *
   * These labels used to lead with the measure — "OVERALL WIN RATE", "WIN RATE · RA ≥ 5" —
   * which named neither. "Overall" has no referent on a page whose whole point is that the rate
   * is not overall (it is home-only, called-games-only), and a bare "win rate" leaves the reader
   * to guess whose. The words here are the site's existing ones, taken from the section divider
   * below the row and from the per-matchup evidence sentence.
   */
  label: string
  /** The rate as rendered, with its unit. */
  value: string
  /**
   * Denominator and lift, as one line. Built here rather than in JSX so "no rate without its
   * count, and none read against a coin flip" is a property of the claim a unit test can
   * assert — the same reason `buildRestAdvantageEvidence` returns finished sentences.
   */
  detail: string
  winPct: number
  /** Never absent: no rate is published on this site without the count behind it. */
  games: number
  /** Points against the venue baseline. The part rest accounts for. */
  lift: number
  /** The RA floor this tile covers; `null` for the any-gap cut. */
  threshold: number | null
}

/**
 * The half the model declines: games where the more-rested team was the visitor.
 *
 * Stated as the home team's win rate over those games rather than the rested visitor's, because
 * it is the win it is rather than the loss backing the visitor would have been — and against the
 * same baseline as the tiles, so every rate on the page reads off one number.
 *
 * This was a third hero tile until 2026-08-11 and no label ever made it legible, because the
 * wording was not the problem: a tile row is a row of results, and this is not a result. It is
 * the rule the results are produced under. It stays on the page in some form, always — dropping
 * it would leave the headline sitting alone with no sign that thousands of games were set aside
 * to get it, and publishing the declined half is the model's central honesty move.
 */
export type DeclinedHalf = {
  games: number
  homeWinPct: number
  lift: number
}

/** How one lift compares with another. Derived, never asserted. */
export type SameGainRelation = "flat" | "higher" | "lower"

/** `subject` against `reference`, in the page's wording. */
function compareLift(subject: number, reference: number): SameGainRelation {
  const delta = subject - reference
  if (Math.abs(delta) < SAME_GAIN_TOLERANCE_PP) return "flat"
  return delta > 0 ? "higher" : "lower"
}

/**
 * Opens the RA ≥ 5 sentence, keyed by how its lift compares with the any-gap lift.
 *
 * The map lives here, beside the comparison it renders, rather than in the component: a
 * relation is only half the fix, and pointing `"higher"` at the words "worth about the same"
 * would restore exactly the defect this module exists to prevent. Being here, it is tested.
 */
export const WIDER_GAP_CLAUSE: Record<SameGainRelation, string> = {
  higher: "A bigger gap is worth more:",
  flat: "A bigger gap is worth about the same:",
  lower: "A bigger gap is worth less:",
}

/** Wraps the wider-floor sentence: `lead` opens it, `tail` closes after the denominator. */
export const BEYOND_CLAUSE: Record<SameGainRelation, { lead: string; tail: string }> = {
  flat: {
    lead: "It does not keep climbing past that:",
    tail: "which is the same gain, not a larger one.",
  },
  higher: {
    lead: "It keeps climbing past that:",
    tail: "which is a larger gain, not the same one.",
  },
  lower: {
    lead: "It falls back past that:",
    tail: "which is a smaller gain, not the same one.",
  },
}

/**
 * The reading-these-numbers claim — the densest on the page, and the one that has been wrong.
 *
 * An earlier version called RA ≥ 5 "a significant edge over the coin-flip baseline" (most of
 * that edge was home court) and said the signal "compounds at the extremes" (the rate is flat
 * from RA ≥ 5 upward, not rising). Both were fixed prose sitting over live figures, so neither
 * could be caught by anything.
 *
 * {@link SameGainRelation} is why this type exists: the comparison between RA ≥ 7 and RA ≥ 5 is
 * now computed from the two lifts, so the sentence moves if the data does.
 */
export type ReadingClaim = {
  baselinePct: number
  overallWinPct: number
  overallLift: number
  ra5: {
    threshold: number
    winPct: number
    games: number
    lift: number
    /**
     * How RA ≥ 5's lift compares with the any-gap lift. The page's "a bigger gap is worth
     * more" was fixed prose over two live figures, exactly like the RA ≥ 7 sentence after it.
     */
    relationToAnyGap: SameGainRelation
  }
  /** `null` when the wider bucket is absent or empty — the page then says nothing about it. */
  beyond: {
    threshold: number
    winPct: number
    games: number
    lift: number
    relation: SameGainRelation
  } | null
}

export type AnalysisClaims = {
  /** The header sentence: what was counted, and the baseline it is read against. */
  headerDescription: string
  /** At most two. See {@link buildAnalysisClaims} for why a third cut is refused. */
  tiles: readonly ClaimTile[]
  declinedHalf: DeclinedHalf
  /** Names what zero is on the threshold chart. Never a coin flip. */
  thresholdZeroLabel: string
  /** The season chart uses each season's own baseline, so its zero is named differently. */
  seasonZeroLabel: string
  reading: ReadingClaim | null
}

/**
 * Builds every claim `/analysis` makes, or `null` when it cannot honestly make one.
 *
 * `null` rather than a half-built set, matching `buildRestAdvantageEvidence`: a rate with no
 * denominator, or no baseline to state it against, is not a weaker claim but an inadmissible
 * one. The page keeps its own skeleton and error branches for that case.
 *
 * **A third cut is refused.** RA ≥ 7 is the obvious candidate and is the wrong one: the rate is
 * flat from RA ≥ 5 upward, which {@link ReadingClaim} says in as many words. Three ascending
 * tiles would draw a trend the data does not have, off the thinnest slice on the page. The chart
 * below the row already plots all four thresholds, which is where a reader should meet them.
 */
export function buildAnalysisClaims(
  data: AnalysisResponse | null | undefined
): AnalysisClaims | null {
  if (!data) return null

  const baselinePct = data.venueBaseline.homeWinPct
  // No baseline, no claim. Every rate here is a distance from it, so without one there is
  // nothing to publish — only a bare number a reader would inevitably read against 50.
  if (!Number.isFinite(baselinePct) || baselinePct <= 0) return null
  if (data.totalGames <= 0) return null

  const overallLift = toDeviation(data.overallWinRate, baselinePct)
  const tiles: ClaimTile[] = [
    {
      label: "RESTED TEAM AT HOME WON · ANY GAP",
      value: `${data.overallWinRate}%`,
      // The leading tile names the baseline outright; the one below it does not repeat the
      // number, because by then the reader has met it.
      detail: `${data.totalGames.toLocaleString()} GAMES · ${signedNumber(overallLift)} VS ${baselinePct}% BASELINE`,
      winPct: data.overallWinRate,
      games: data.totalGames,
      lift: overallLift,
      threshold: null,
    },
  ]

  const ra5 = data.thresholds.find((t) => t.threshold === 5)
  if (ra5 && ra5.games > 0) {
    const ra5Lift = toDeviation(ra5.winPct, baselinePct)
    tiles.push({
      label: `RESTED TEAM AT HOME WON · RA ≥ ${ra5.threshold}`,
      value: `${ra5.winPct}%`,
      detail: `${ra5.games.toLocaleString()} GAMES · ${signedNumber(ra5Lift)} VS BASELINE`,
      winPct: ra5.winPct,
      games: ra5.games,
      lift: ra5Lift,
      threshold: ra5.threshold,
    })
  }

  const declinedGames = data.homeAwayBreakdown.awayTeamMoreRested
  const declinedHomeRate = homeWinRateWhenVisitorRested(declinedGames)

  const ra7 = data.thresholds.find((t) => t.threshold === 7)
  let reading: ReadingClaim | null = null
  if (ra5 && ra5.games > 0) {
    const ra5Lift = toDeviation(ra5.winPct, baselinePct)
    let beyond: ReadingClaim["beyond"] = null
    if (ra7 && ra7.games > 0) {
      const beyondLift = toDeviation(ra7.winPct, baselinePct)
      beyond = {
        threshold: ra7.threshold,
        winPct: ra7.winPct,
        games: ra7.games,
        lift: beyondLift,
        relation: compareLift(beyondLift, ra5Lift),
      }
    }
    reading = {
      baselinePct,
      overallWinPct: data.overallWinRate,
      overallLift,
      ra5: {
        threshold: ra5.threshold,
        winPct: ra5.winPct,
        games: ra5.games,
        lift: ra5Lift,
        relationToAnyGap: compareLift(ra5Lift, overallLift),
      },
      beyond,
    }
  }

  return {
    // Kept to two lines at 1440px, which `page-headers.spec.ts` enforces. The legend under each
    // chart carries the fuller "how often the home team wins anyway" gloss, so this line does
    // not repeat it.
    headerDescription: `Among completed regular-season games, did the more-rested team win? Counted only where that team was also at home, and measured against the ${baselinePct}% home teams win anyway.`,
    tiles,
    declinedHalf: {
      games: declinedGames.games,
      homeWinPct: declinedHomeRate,
      lift: toDeviation(declinedHomeRate, baselinePct),
    },
    thresholdZeroLabel: `PERCENTAGE POINTS · 0 = ${baselinePct}%, HOW OFTEN THE HOME TEAM WINS ANYWAY`,
    seasonZeroLabel: "PERCENTAGE POINTS · 0 = THAT SEASON'S OWN HOME WIN RATE",
    reading,
  }
}
