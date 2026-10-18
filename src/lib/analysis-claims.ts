import type { AnalysisResponse, EraRates, GapRangeBucket } from "@/types"
import { homeWinRateWhenVisitorRested } from "@/lib/rest-advantage-display"
import { gapRangeByKey, gapRangeSpan, type GapRangeKey } from "@/lib/rest-advantage-evidence"

/**
 * What `/analysis` claims about the historical backtest, as values rather than JSX.
 *
 * The page's rules used to live only in comments, and the only thing that checked them was
 * `e2e/analysis.spec.ts` — a suite `CLAUDE.md` deliberately keeps out of the commit gate and
 * out of CI, so it ran nowhere automatic. This module exists so those rules run in `test:run`.
 *
 * Each claim is built or returns nothing, and the tests assert editorial house rules rather
 * than arithmetic. It is deliberately NOT shaped after the `*-facts.ts` modules — those are frozen
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

/** A counted population: a denominator, and the wins inside it. */
type Counted = { games: number; wins: number }

/**
 * The page states every lift to one decimal, so a tolerance below that would let pure rounding
 * start a sentence. A floor rather than a mechanism — it only ever binds on a degenerate bucket
 * (a rate of exactly 0% or 100%, where the binomial standard error collapses to zero).
 */
const DISPLAY_PRECISION_PP = 0.1

/** Binomial standard error of a rate, in percentage points. */
function standardErrorPp({ games, wins }: Counted): number {
  const p = wins / games
  return 100 * Math.sqrt((p * (1 - p)) / games)
}

/**
 * How far apart two lifts must sit before the page calls one bigger than the other.
 *
 * **Derived, not chosen** (issue #30): the page must not narrate a difference smaller than the
 * noise, so the noise is the bar. The gap ranges are disjoint, each game in one range (D-102), so
 * the two rates are independent and their difference carries `hypot(se(a), se(b))`. The nested
 * version this replaced had to subtract a bucket from its superset to get there.
 *
 * Still an editorial **wording** threshold, not a significance test: it picks which sentence
 * renders, never which games are counted. One standard error rather than two, because this
 * decides between "worth more" and "worth about the same", where the quiet reading is the safe one.
 */
export function rangeGapTolerancePp(a: Counted, b: Counted): number {
  if (a.games <= 0 || b.games <= 0) return Infinity
  return Math.max(Math.hypot(standardErrorPp(a), standardErrorPp(b)), DISPLAY_PRECISION_PP)
}

/**
 * Whether a range's lift is too small to tell from the baseline: inside two standard errors of
 * the range's own rate. Two here, not one, because this is the clause that tells a reader a
 * figure is noise, and it should only say so when the data cannot separate them.
 */
function liftWithinNoise(lift: number, counted: Counted): boolean {
  return Math.abs(lift) < Math.max(1.96 * standardErrorPp(counted), DISPLAY_PRECISION_PP)
}

/** One hero tile: a rate, over a named slice, with the lift and denominator that qualify it. */
export type ClaimTile = {
  /**
   * Names WHO won, then WHICH slice. "HOME TEAM MORE RESTED" replaced "RESTED TEAM AT HOME WON ·
   * ANY GAP" on 2026-10-17: "any gap" read as every game, when it meant every gap of 0.5 or more
   * with the rested team at home. The gap floor now sits in the detail line, in numbers.
   */
  label: string
  /** The rate as rendered, with its unit. */
  value: string
  /** The gap floor and the denominator, as one line. No rate without its count. */
  detail: string
  winPct: number
  /** Never absent: no rate is published on this site without the count behind it. */
  games: number
  /** Points against the venue baseline. The part rest accounts for. */
  lift: number
  /** Names the baseline {@link lift} is read against, for the tile's E1 slot (ADR 0010). */
  baselineLabel: string
  /** The gap range this tile covers; `null` for every called game. */
  range: GapRangeKey | null
}

/**
 * The half the model declines: games where the more-rested team was the visitor.
 *
 * Stated as the home team's win rate over those games, against the same baseline as the tiles,
 * so every rate on the page reads off one number. Publishing it is the model's central honesty
 * move: dropping it would leave the headline with no sign that thousands of games were set aside.
 */
export type DeclinedHalf = {
  games: number
  homeWinPct: number
  lift: number
}

/** How one lift compares with another. Derived, never asserted. */
export type SameGainRelation = "flat" | "higher" | "lower"

function compareLift(subject: number, reference: number, tolerancePp: number): SameGainRelation {
  const delta = subject - reference
  if (Math.abs(delta) < tolerancePp) return "flat"
  return delta > 0 ? "higher" : "lower"
}

/**
 * Opens the range sentence, keyed by how the large range's lift compares with the small one's.
 * Kept beside the comparison it renders, and tested, so `"flat"` can never be worded as a climb.
 */
export const RANGE_RELATION_CLAUSE: Record<SameGainRelation, string> = {
  higher: "The gain sits in the bigger gaps.",
  flat: "Gap size makes no measurable difference.",
  lower: "Bigger gaps are worth less, not more.",
}

/** One gap range as the reading paragraph states it. */
export type RangeReading = {
  key: GapRangeKey
  /** Lower case, for prose: "small". */
  name: string
  /** "0.5–3", "3–5", "5+". */
  span: string
  winPct: number
  games: number
  lift: number
  /** Too small to tell from the baseline; the sentence says so rather than quoting it as a gain. */
  withinNoise: boolean
}

/**
 * The reading-these-numbers claim. It used to compare nested buckets (RA ≥ 5 against every
 * called game, RA ≥ 7 against RA ≥ 5), where each comparison mostly measured the same games
 * twice. It now states each disjoint range and one derived relation, large against small.
 */
export type ReadingClaim = {
  baselinePct: number
  overallWinPct: number
  overallLift: number
  /** Only ranges with games, in size order. */
  ranges: readonly RangeReading[]
  /** `null` unless both the small and the large range have games. */
  largeVsSmall: SameGainRelation | null
}

/** What the era chart shows, in one derived sentence. */
export type EraSummary = {
  eraCount: number
  /** Eras whose large range beat that era's own home win rate. */
  largeAboveCount: number
  /** The small range's lowest and highest lift across eras, in points. */
  smallLiftMin: number
  smallLiftMax: number
}

export type AnalysisClaims = {
  /** The header sentence: what was counted, and the baseline it is read against. */
  headerDescription: string
  /** At most two. See {@link buildAnalysisClaims} for why a third is refused. */
  tiles: readonly ClaimTile[]
  declinedHalf: DeclinedHalf
  /** Names what zero is on the range chart. Never a coin flip. */
  rangeZeroLabel: string
  /** The era chart uses each era's own baseline, so its zero is named differently. */
  eraZeroLabel: string
  reading: ReadingClaim | null
  eraSummary: EraSummary | null
}

const counted = (range: GapRangeBucket): Counted => ({ games: range.games, wins: range.restedTeamWins })

/** Lift of one range against its era's own home win rate. */
export function eraLift(era: EraRates, key: GapRangeKey): number | null {
  const range = era.ranges.find((r) => r.key === key)
  return range && range.games > 0 ? toDeviation(range.winPct, era.homeWinPct) : null
}

function summarizeEras(eras: readonly EraRates[]): EraSummary | null {
  const largeLifts = eras.map((era) => eraLift(era, "large"))
  const smallLifts = eras.map((era) => eraLift(era, "small")).filter((v): v is number => v !== null)
  if (eras.length === 0 || largeLifts.some((v) => v === null) || smallLifts.length !== eras.length) return null
  return {
    eraCount: eras.length,
    largeAboveCount: largeLifts.filter((v) => (v ?? 0) > 0).length,
    smallLiftMin: Math.min(...smallLifts),
    smallLiftMax: Math.max(...smallLifts),
  }
}

/**
 * Builds every claim `/analysis` makes, or `null` when it cannot honestly make one: a rate with
 * no denominator, or no baseline to state it against, is inadmissible, not weaker.
 *
 * **A third tile is refused.** The range chart below the row shows all three sizes with their
 * counts and error bars, which is where a reader should meet the medium one. Two tiles state the
 * headline and the size where the effect lives.
 */
export function buildAnalysisClaims(
  data: AnalysisResponse | null | undefined
): AnalysisClaims | null {
  if (!data) return null

  const baselinePct = data.venueBaseline.homeWinPct
  // No baseline, no claim: without one a reader would inevitably read the rate against 50.
  if (!Number.isFinite(baselinePct) || baselinePct <= 0) return null
  if (data.totalGames <= 0) return null

  const overallLift = toDeviation(data.overallWinRate, baselinePct)
  const smallFloor = gapRangeByKey("small").min
  const tiles: ClaimTile[] = [
    {
      label: "RESTED TEAM AT HOME",
      value: `${data.overallWinRate}%`,
      detail: `GAP ${smallFloor} OR MORE · ${data.totalGames.toLocaleString()} GAMES`,
      winPct: data.overallWinRate,
      games: data.totalGames,
      lift: overallLift,
      // The leading tile names the baseline outright; the one beside it does not repeat it.
      baselineLabel: `VS ${baselinePct}% VENUE BASELINE`,
      range: null,
    },
  ]

  const large = data.gapRanges.find((r) => r.key === "large")
  if (large && large.games > 0) {
    tiles.push({
      label: "RESTED TEAM AT HOME · LARGE GAP",
      value: `${large.winPct}%`,
      detail: `GAP ${large.min} OR MORE · ${large.games.toLocaleString()} GAMES`,
      winPct: large.winPct,
      games: large.games,
      lift: toDeviation(large.winPct, baselinePct),
      baselineLabel: "VS VENUE BASELINE",
      range: "large",
    })
  }

  const declinedGames = data.homeAwayBreakdown.awayTeamMoreRested
  const declinedHomeRate = homeWinRateWhenVisitorRested(declinedGames)

  const ranges: RangeReading[] = data.gapRanges
    .filter((r) => r.games > 0)
    .map((r) => {
      const lift = toDeviation(r.winPct, baselinePct)
      const range = gapRangeByKey(r.key)
      return {
        key: r.key,
        name: range.label.toLowerCase(),
        span: gapRangeSpan(range),
        winPct: r.winPct,
        games: r.games,
        lift,
        withinNoise: liftWithinNoise(lift, counted(r)),
      }
    })
  const small = data.gapRanges.find((r) => r.key === "small")
  const largeVsSmall =
    small && small.games > 0 && large && large.games > 0
      ? compareLift(
          toDeviation(large.winPct, baselinePct),
          toDeviation(small.winPct, baselinePct),
          rangeGapTolerancePp(counted(large), counted(small))
        )
      : null

  return {
    // Kept to two lines at 1440px, which `page-headers.spec.ts` enforces.
    headerDescription: `Across completed regular-season games, compare more-rested teams also at home with the ${baselinePct}% home baseline. Rested visitors are shown separately.`,
    tiles,
    declinedHalf: {
      games: declinedGames.games,
      homeWinPct: declinedHomeRate,
      lift: toDeviation(declinedHomeRate, baselinePct),
    },
    rangeZeroLabel: `PERCENTAGE POINTS · 0 = ${baselinePct}%, HOW OFTEN THE HOME TEAM WINS ANYWAY`,
    eraZeroLabel: "PERCENTAGE POINTS · 0 = THAT ERA'S OWN HOME WIN RATE",
    reading: ranges.length > 0
      ? { baselinePct, overallWinPct: data.overallWinRate, overallLift, ranges, largeVsSmall }
      : null,
    eraSummary: summarizeEras(data.eras),
  }
}

/** Binomial standard error of a range's rate, in points, for the chart's error bars. */
export function rangeStandardErrorPp(range: { games: number; restedTeamWins: number }): number {
  return range.games > 0 ? standardErrorPp({ games: range.games, wins: range.restedTeamWins }) : 0
}
