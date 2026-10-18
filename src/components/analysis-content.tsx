"use client"

import { SeasonSelector } from "@/components/season-selector";
import { useCallback, useRef, useState } from "react"
import {
  BarChart,
  Bar,
  Cell,
  ErrorBar,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"
import type { TooltipContentProps } from "recharts"
import { format } from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { ExploreGameDetailModal } from "@/components/explore-game-detail-modal"
import { MethodLink } from "@/components/method-link"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { useBacktest } from "@/hooks/useBacktest"
import { useExploreGames, type DrillSignal } from "@/hooks/useExploreGames"
import type { ExploreResult } from "@/lib/explore-games-machine"
import { NBA_SEASONS } from "@/lib/nba-season"
import { formerAbbreviations, getTeamBranding } from "@/lib/team-history"
import {
  RANGE_RELATION_CLAUSE,
  buildAnalysisClaims,
  eraLift,
  rangeStandardErrorPp,
  toDeviation,
  type EraSummary,
} from "@/lib/analysis-claims"
import { ERA_LENGTH, GAP_RANGES, gapRangeByKey, gapRangeSpan, type ExploreSide, type GapRangeKey } from "@/lib/rest-advantage-evidence"
import type { DataAsOf } from "@/lib/data-as-of"
import { LEAD, MONO_FONT_STACK, SPACE, termSelectClass, termSelectStyle, termCardStyle, termDashedEmptyStyle, termInsetStyle, termTdStyle, TRACK, TYPE } from "@/lib/terminal-styles"
import { DataTable } from "@/components/ui/data-table"
import type { AnalysisResponse, EraRates } from "@/types"
import { signedNumber } from "@/lib/signed-number"
import { formatFatigueScore, formatRestAdvantageValue } from "@/lib/rest-advantage-display"
import { MessageCard } from "@/components/ui/message-card"
import { StatTile } from "@/components/ui/stat-tile"

// ─── Shared styles (terminal) ─────────────────────────────────────

const termTooltip: React.CSSProperties = {
  background: "var(--term-surface)",
  border: "1px solid var(--term-border)",
  borderRadius: "var(--term-radius)",
  padding: "8px 12px",
  fontFamily: MONO_FONT_STACK,
  fontSize: 12,
}

const exploreSelectStyle = termSelectStyle
const EXPLORE_SELECT_CLASS = termSelectClass

// ─── Section divider ──────────────────────────────────────────────

/** The abbreviation the team played under that season: a 1995 Sonics game reads SEA, not OKC. */
function seasonAbbr(currentAbbreviation: string, season: string): string {
  return getTeamBranding(currentAbbreviation, season).abbreviation
}

function SectionDivider({ label, descriptor }: { label: string; descriptor?: string }) {
  return (
    <div
      className="mono flex items-center gap-3 py-2"
      style={{ fontSize: 11, letterSpacing: TRACK.label, color: "var(--term-text-muted)" }}
    >
      <span style={{ fontWeight: 700 }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: "var(--term-border)" }} />
      {descriptor && <span style={{ fontWeight: 600 }}>{descriptor}</span>}
    </div>
  )
}

// ─── Chart legend ─────────────────────────────────────────────────

/**
 * Names the two poles of the diverging scale. The zero rule needs no swatch —
 * it is the axis, and the axis labels it.
 */
function BaselineLegend({ zeroLabel }: { zeroLabel: string }) {
  return (
    <div
      className="mono mt-3 flex flex-wrap items-center gap-x-6 gap-y-2"
      style={{ fontSize: 11, color: "var(--term-text-muted)", letterSpacing: TRACK.sub }}
    >
      <span className="inline-flex items-center gap-2">
        <span style={{ width: 12, height: 12, borderRadius: 2, background: "var(--term-blue)" }} />
        RESTED TEAM BEAT THE HOME BASELINE
      </span>
      <span className="inline-flex items-center gap-2">
        <span style={{ width: 12, height: 12, borderRadius: 2, background: "var(--term-red)" }} />
        RESTED TEAM FELL SHORT OF IT
      </span>
      <span>{zeroLabel}</span>
    </div>
  )
}

// ─── Chart scale ──────────────────────────────────────────────────

/*
 * Win-rate bars are **deviation columns**: the plotted value is `winPct - baseline`, in
 * percentage points, and zero IS the baseline. This replaced a zero-based bar
 * stacked from a `base` (≤50) and an `edge` (>50) segment.
 *
 * Why it changed:
 *  - A stack encodes part-to-whole, but "the coin-flip half" is not a part of
 *    anything — it was one number cut at an arbitrary height, so two colors
 *    described a single measurement.
 *  - The old split could not draw a losing slice at all: `edge` clamped to 0, so
 *    a 39.0% season (real — RA ≥ 7, 2016-17) rendered as a bare base segment,
 *    the same kind of mark as 50.0%, while the legend still called it "what a
 *    coin flip already gives you".
 *  - Deviation columns are genuinely zero-based on the measured quantity, so the
 *    truncated-axis dishonesty the split existed to avoid never arises.
 *
 * The baseline is a parameter, and it is **not 50**. Every game on this page is one where
 * the rested team was also at home, and home teams win ~59.9% of everything regardless of
 * rest — so a coin-flip zero credited the model with nine points of home court it did not
 * earn. Callers pass the venue baseline the API now ships; the era chart passes each era's
 * own, because home court ran from 67.9% in 1987-88 to 54.3% in 2023-24.
 *
 * `toDeviation` itself lives in `@/lib/analysis-claims`: the lift is claim vocabulary before
 * it is a plotted value, since every tile and sentence on the page states a rate through it.
 * What stays here is the drawing alone — fill, bar size and scale.
 */

/**
 * Blue above the baseline, red below — the two poles of a diverging scale, with
 * a neutral midpoint. A rate exactly at the baseline is a real result, not missing data.
 */
export function deviationFill(deviation: number): string {
  if (deviation === 0) return "var(--term-neutral)"
  return deviation < 0 ? "var(--term-red)" : "var(--term-blue)"
}

/** The same poles at text grade — tooltip prose is small text and needs 4.5:1, chart fills do not. */
export function deviationText(deviation: number): string {
  if (deviation === 0) return "var(--term-neutral)"
  return deviation < 0 ? "var(--term-red-text)" : "var(--term-blue-text)"
}

/**
 * A dead-even slice has zero length, so without this it draws nothing at all and
 * reads as missing data rather than as "exactly at the baseline". Give it a 2px stub;
 * every other bar keeps its true length.
 */
export function minBarSize(value: number | undefined | null): number {
  return value === 0 ? 2 : 0
}

const TICK_STEP_CANDIDATES = [2, 5, 10] as const
const MAX_TICK_INTERVALS = 6

/**
 * A signed domain with evenly spaced ticks that always includes zero. Recharts
 * left to improvise emits odd intervals (a `[0, 70]` domain gave 0/20/40/60 plus
 * an orphan 70), and a hardcoded ceiling silently clips a wide era whisker.
 */
export function deviationScale(values: readonly number[]): { domain: [number, number]; ticks: number[] } {
  const peak = values.length > 0 ? Math.max(...values, 0) : 0
  const trough = values.length > 0 ? Math.min(...values, 0) : 0
  const step =
    TICK_STEP_CANDIDATES.find((s) => (peak - trough) / s <= MAX_TICK_INTERVALS) ??
    TICK_STEP_CANDIDATES[TICK_STEP_CANDIDATES.length - 1]
  const max = Math.max(step, Math.ceil(peak / step) * step)
  const min = Math.min(0, Math.floor(trough / step) * step)
  const ticks: number[] = []
  for (let v = min; v <= max + 1e-9; v += step) ticks.push(Math.round(v))
  return { domain: [min, max], ticks }
}

// ─── Chart datum shapes ───────────────────────────────────────────

type WinRateDatum = {
  label: string
  /** "0.5–3", printed under the label. */
  span: string
  winPct: number
  games: number
  range: GapRangeKey
  /** Half-width of the 95% interval on the rate, in points. Drawn as the whisker. */
  error: number
  /** winPct − the venue baseline, in percentage points. Negative below it. */
  deviation: number
  /** The baseline this bar is measured against, so the tooltip can name it. */
  baselinePct: number
}

// ─── Custom tooltips ──────────────────────────────────────────────

function WinRateTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as WinRateDatum
  return (
    <div style={termTooltip}>
      <p style={{ color: "var(--term-text)", fontWeight: 700, letterSpacing: TRACK.sub }}>{d.label.toUpperCase()} GAP · {d.span}</p>
      <p style={{ color: "var(--term-text-muted)", marginTop: SPACE.xs }}>HOME TEAM MORE RESTED</p>
      {/* The bar plots the deviation, so the tooltip leads with it and carries the
          absolute win rate underneath — the axis no longer shows it anywhere. The
          baseline is named on the same line so the two can never be read apart. */}
      <p style={{ marginTop: SPACE.xs, color: deviationText(d.deviation) }}>
        <span style={{ fontWeight: 700 }}>{signedNumber(d.deviation)} PP</span> VS {d.baselinePct}% BASELINE
      </p>
      <p style={{ color: "var(--term-text-muted)", marginTop: SPACE.xs }}>WIN RATE: {d.winPct}%</p>
      <p style={{ color: "var(--term-text-muted)", marginTop: SPACE.xs }}>±{d.error.toFixed(1)} PP, 95% RANGE</p>
      <p style={{ color: "var(--term-text-muted)", marginTop: SPACE.xs }}>{d.games.toLocaleString()} GAMES</p>
      <p style={{ marginTop: SPACE.sm, fontSize: TYPE.label, color: "var(--term-accent)" }}>CLICK TO SEE THESE GAMES ↓</p>
    </div>
  )
}

/** 95% half-width, in points: the whisker on every gap-size bar. */
function interval95(range: { games: number; restedTeamWins: number }): number {
  return Math.round(1.96 * rangeStandardErrorPp(range) * 10) / 10
}

/** "1986–91": the seasons an era spans, by the year each ended, short enough for an axis. */
function eraLabel(era: EraRates): string {
  return `${Number(era.firstSeason.slice(0, 4)) + 1}\u2013${era.lastSeason.slice(5)}`
}

/**
 * An axis tick on two lines. One line of "LARGE 5+ · n=3,756" or "1986–90" per category ran
 * into its neighbour at phone width; stacked, each fits its own column.
 */
function TwoLineTick({
  x,
  y,
  payload,
  lines,
}: {
  x?: number
  y?: number
  payload?: { value: string }
  lines: (value: string) => [string, string]
}) {
  const [first, second] = lines(payload?.value ?? "")
  return (
    <text x={x} y={y} textAnchor="middle" fontSize={11} fill="var(--term-text-muted)" fontFamily={MONO_FONT_STACK}>
      <tspan x={x} dy={12}>{first}</tspan>
      <tspan x={x} dy={14}>{second}</tspan>
    </text>
  )
}

/** "5 SEASONS PER GROUP", naming the oldest era's count when the remainder made it longer. */
function eraDescriptor(eras: readonly EraRates[]): string {
  const oldest = eras[0]?.seasonCount
  const base = `${ERA_LENGTH} SEASONS PER GROUP`
  return oldest !== undefined && oldest !== ERA_LENGTH ? `${base}, THE OLDEST ${oldest}` : base
}

/** Fill strength by size, so the three bars of an era read small to large in one hue. */
const RANGE_OPACITY: Record<GapRangeKey, number> = { small: 0.35, medium: 0.65, large: 1 }

type EraDatum = {
  label: string
  era: EraRates
} & Partial<Record<GapRangeKey | `${GapRangeKey}Error`, number>>

function EraTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as EraDatum
  return (
    <div style={termTooltip}>
      <p style={{ color: "var(--term-text)", fontWeight: 700, letterSpacing: TRACK.sub }}>
        {d.era.firstSeason} TO {d.era.lastSeason} · {d.era.seasonCount} SEASONS
      </p>
      <p style={{ color: "var(--term-text-muted)", marginTop: SPACE.xs }}>HOME TEAMS WON {d.era.homeWinPct}%</p>
      {GAP_RANGES.map((range) => {
        const value = d[range.key]
        const bucket = d.era.ranges.find((r) => r.key === range.key)
        if (value === undefined || !bucket) return null
        return (
          <p key={range.key} style={{ marginTop: SPACE.xs, color: deviationText(value) }}>
            <span style={{ fontWeight: 700 }}>{range.label.toUpperCase()} {signedNumber(value)} PP</span>{" "}
            <span style={{ color: "var(--term-text-muted)" }}>· {bucket.winPct}% OF {bucket.games.toLocaleString()}</span>
          </p>
        )
      })}
    </div>
  )
}

/**
 * Gap size by five-season era, each against that era's own home win rate (D-102). It replaced a
 * 41-bar season chart whose seasons average about 90 large-gap games, too few to read: the
 * question it answers is whether the large-gap edge holds in every era, not in every season.
 */
function EraChart({
  eras,
  summary,
  zeroLabel,
}: {
  eras: readonly EraRates[]
  summary: EraSummary | null
  zeroLabel: string
}) {
  const chartData: EraDatum[] = eras.map((era) => {
    const datum: EraDatum = { label: eraLabel(era), era }
    for (const range of GAP_RANGES) {
      const lift = eraLift(era, range.key)
      const bucket = era.ranges.find((r) => r.key === range.key)
      if (lift === null || !bucket) continue
      datum[range.key] = lift
      datum[`${range.key}Error`] = interval95(bucket)
    }
    return datum
  })
  const values = chartData.flatMap((d) =>
    GAP_RANGES.flatMap((range) => {
      const v = d[range.key]
      const e = d[`${range.key}Error`] ?? 0
      return v === undefined ? [] : [v - e, v + e]
    })
  )
  const { domain, ticks } = deviationScale(values)

  return (
    <div className="mt-4 min-w-0">
      <div className="h-72 min-w-0">
        {chartData.length === 0 ? (
          <div className="mono flex h-full items-center justify-center" style={termDashedEmptyStyle}>
            NO COMPLETE ERA YET: AN ERA NEEDS FIVE FINISHED SEASONS
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 8 }} barGap={2}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--term-border)" />
              <XAxis
                dataKey="label"
                tick={<TwoLineTick lines={(label) => [label.slice(0, 4), `\u2013${label.slice(-2)}`]} />}
                tickLine={false}
                axisLine={false}
                interval={0}
                height={36}
              />
              <YAxis
                domain={domain}
                ticks={ticks}
                tickFormatter={(v: number) => signedNumber(v)}
                tick={{ fontSize: 12, fill: "var(--term-text-muted)", fontFamily: MONO_FONT_STACK }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                isAnimationActive={false}
                cursor={{ fill: "rgba(23,64,139,0.06)" }}
                content={(props: TooltipContentProps) => <EraTooltip {...props} />}
              />
              {GAP_RANGES.map((range) => (
                <Bar key={range.key} dataKey={range.key} maxBarSize={20} minPointSize={minBarSize} isAnimationActive={false}>
                  {chartData.map((d) => (
                    <Cell
                      key={d.label}
                      fill={deviationFill(d[range.key] ?? 0)}
                      fillOpacity={RANGE_OPACITY[range.key]}
                    />
                  ))}
                  <ErrorBar dataKey={`${range.key}Error`} isAnimationActive={false} pointerEvents="none" width={3} stroke="var(--term-text)" strokeWidth={1} />
                </Bar>
              ))}
              <ReferenceLine y={0} stroke="var(--term-text)" strokeWidth={1.5} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <RangeKey />
      <BaselineLegend zeroLabel={zeroLabel} />
      {summary && (
        <p className="mono m-0" style={{ fontSize: 11, letterSpacing: TRACK.sub, color: "var(--term-text-muted)", marginTop: SPACE.sm }}>
          LARGE GAPS BEAT THEIR ERA&apos;S HOME RATE IN{" "}
          <span style={{ fontWeight: 700, color: "var(--term-text)" }}>{summary.largeAboveCount} OF {summary.eraCount}</span> ERAS.
          SMALL GAPS STAYED BETWEEN {signedNumber(summary.smallLiftMin)} AND {signedNumber(summary.smallLiftMax)} PP OF IT.
          ONE ERA ALONE IS TOO FEW GAMES TO SETTLE IT, AS THE WHISKERS SHOW; THE REPEAT ACROSS ERAS IS THE READING.
        </p>
      )}
    </div>
  )
}

/** Names the three fill strengths the era chart uses for size. */
function RangeKey() {
  return (
    <div
      className="mono mt-3 flex flex-wrap items-center gap-x-6 gap-y-2"
      style={{ fontSize: 11, color: "var(--term-text-muted)", letterSpacing: TRACK.sub }}
    >
      {GAP_RANGES.map((range) => (
        <span key={range.key} className="inline-flex items-center gap-2">
          <span style={{ width: 12, height: 12, borderRadius: 2, background: "var(--term-blue)", opacity: RANGE_OPACITY[range.key] }} />
          {range.label.toUpperCase()} {gapRangeSpan(range)}
        </span>
      ))}
      <span>WHISKERS: 95% RANGE</span>
    </div>
  )
}

/**
 * The baseline itself, season by season. Every era bar above is measured against a home rate
 * that ran from about 68% to about 54%; this shows that drift on its own, so a reader can see it
 * is home court moving and not rest.
 */
function HomeCourtBySeasonChart({
  seasonWinRates,
  overallPct,
}: {
  seasonWinRates: AnalysisResponse["seasonWinRates"]
  overallPct: number
}) {
  const chartData = seasonWinRates
    .filter((s) => s.isComplete)
    .map((s) => ({ label: s.season, homeWinPct: s.homeBaselinePct }))
  const values = chartData.map((d) => d.homeWinPct)
  const min = values.length ? Math.floor(Math.min(...values, overallPct) / 5) * 5 : 50
  const max = values.length ? Math.ceil(Math.max(...values, overallPct) / 5) * 5 : 70
  const ticks: number[] = []
  for (let v = min; v <= max; v += 5) ticks.push(v)

  return (
    <div className="mt-4 h-72 min-w-0">
      {chartData.length === 0 ? (
        <div className="mono flex h-full items-center justify-center" style={termDashedEmptyStyle}>
          NO COMPLETE SEASON YET
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--term-border)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--term-text-muted)", fontFamily: MONO_FONT_STACK }}
              tickLine={false}
              axisLine={false}
              ticks={chartData.filter((_, i) => i % Math.max(1, Math.ceil((chartData.length - 1) / 4)) === 0 || i === chartData.length - 1).map((row) => row.label)}
              minTickGap={16}
              height={32}
            />
            <YAxis
              domain={[min, max]}
              ticks={ticks}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 12, fill: "var(--term-text-muted)", fontFamily: MONO_FONT_STACK }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip
              isAnimationActive={false}
              content={({ active, payload }: TooltipContentProps) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload as { label: string; homeWinPct: number }
                return (
                  <div style={termTooltip}>
                    <p style={{ color: "var(--term-text)", fontWeight: 700, letterSpacing: TRACK.sub }}>{d.label}</p>
                    <p style={{ color: "var(--term-text-muted)", marginTop: SPACE.xs }}>HOME TEAMS WON {d.homeWinPct}%</p>
                  </div>
                )
              }}
            />
            <ReferenceLine y={overallPct} stroke="var(--term-hairline)" strokeDasharray="4 4" />
            <Line dataKey="homeWinPct" stroke="var(--term-text)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

/**
 * F2 (2026-08-29, ADR 0010 — build-to-decide): the headline pair as a dot plot instead of
 * bars. 61.2 against 59.9 drawn as bars from zero is an axis crime — the bars would be
 * near-identical and the whole finding lives in their sliver of difference. Dots on one
 * shared win-rate scale show the finding as *distance*: both halves of the result, called
 * and declined, displaced in opposite directions from the same home-court baseline.
 *
 * Every number arrives through `buildAnalysisClaims` — nothing here is typed in.
 */
function HeadlineDotPlot({
  calledLabel,
  calledPct,
  declinedPct,
  baselinePct,
}: {
  calledLabel: string
  calledPct: number
  declinedPct: number
  baselinePct: number
}) {
  const values = [calledPct, declinedPct, baselinePct]
  const pad = 1.5
  const min = Math.min(...values) - pad
  const max = Math.max(...values) + pad
  const pos = (v: number) => ((v - min) / (max - min)) * 100

  const rows = [
    {
      label: calledLabel,
      value: calledPct,
      tone: toDeviation(calledPct, baselinePct) >= 0 ? "var(--term-blue)" : "var(--term-red)",
      text:
        toDeviation(calledPct, baselinePct) >= 0
          ? "var(--term-blue-text)"
          : "var(--term-red-text)",
    },
    {
      label: "RESTED VISITOR · HOME STILL WON",
      value: declinedPct,
      tone: toDeviation(declinedPct, baselinePct) >= 0 ? "var(--term-blue)" : "var(--term-red)",
      text:
        toDeviation(declinedPct, baselinePct) >= 0
          ? "var(--term-blue-text)"
          : "var(--term-red-text)",
    },
  ]

  return (
    <figure
      className="m-0"
      role="img"
      aria-label={`Home teams win ${baselinePct}% of all games. With the rest edge at home they won ${calledPct}%; with a rested visitor they still won ${declinedPct}%. Both read as distance from the same home-court baseline.`}
    >
      <div aria-hidden className="flex flex-col" style={{ gap: SPACE.md }}>
        {rows.map((row) => {
          const left = Math.min(pos(row.value), pos(baselinePct))
          const width = Math.abs(pos(row.value) - pos(baselinePct))
          return (
            <div key={row.label} className="grid items-center gap-x-4" style={{ gridTemplateColumns: "minmax(150px, 220px) 1fr" }}>
              <span
                className="mono"
                style={{ fontSize: 10, letterSpacing: TRACK.label, fontWeight: 600, color: "var(--term-text-muted)" }}
              >
                {row.label}
              </span>
              <div className="relative" style={{ height: 32 }}>
                {/* the scale */}
                <span className="absolute inset-x-0" style={{ top: "50%", height: 1, background: "var(--term-border)" }} />
                {/* the shared baseline tick */}
                <span
                  className="absolute"
                  style={{ left: `${pos(baselinePct)}%`, top: 4, bottom: 4, width: 1, background: "var(--term-hairline)" }}
                />
                {/* the gap — the finding itself */}
                <span
                  className="absolute"
                  style={{ left: `${left}%`, width: `${width}%`, top: "calc(50% - 1px)", height: 2, background: row.tone }}
                />
                {/* baseline dot: hollow — it is the ground, not a result */}
                <span
                  className="absolute"
                  style={{
                    left: `${pos(baselinePct)}%`,
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--term-surface)",
                    border: "1.5px solid var(--term-text-muted)",
                  }}
                />
                {/* the result dot */}
                <span
                  className="absolute"
                  style={{
                    left: `${pos(row.value)}%`,
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: row.tone,
                  }}
                />
                <span
                  className="mono tabular-nums absolute"
                  style={{
                    left: `${pos(row.value)}%`,
                    transform: "translateX(-50%)",
                    top: -4,
                    fontSize: 11,
                    fontWeight: 700,
                    color: row.text,
                  }}
                >
                  {row.value}%
                </span>
              </div>
            </div>
          )
        })}
        {/* the scale's one caption: what the shared tick is */}
        <div className="grid gap-x-4" style={{ gridTemplateColumns: "minmax(150px, 220px) 1fr" }}>
          <span />
          <div className="relative" style={{ height: 14 }}>
            <span
              className="mono tabular-nums absolute"
              style={{
                // Anchored by its right edge: backing off half the label's own ~25.6ch
                // width centers it on the tick when the row has room, and the max() pins
                // it inside the scale when it hasn't — on a phone the caption bleeds left
                // over the empty label cell, never off the page's right edge.
                right: `max(0px, calc(${100 - pos(baselinePct)}% - 12.8ch))`,
                fontSize: 10,
                letterSpacing: TRACK.sub,
                fontWeight: 600,
                color: "var(--term-text-muted)",
                whiteSpace: "nowrap",
              }}
            >
              {baselinePct}% · HOME COURT ALONE
            </span>
          </div>
        </div>
      </div>
    </figure>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────

function AnalysisSkeleton() {
  return (
    <div className="flex flex-col gap-12">
      <div style={termCardStyle}>
        <Skeleton className="h-12 w-32 bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
        <Skeleton className="mt-2 h-3 w-52 bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
      </div>
      <div style={termCardStyle}>
        <Skeleton className="mb-1 h-3 w-48 bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
        <Skeleton className="h-64 w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
      </div>
      <div style={termCardStyle}>
        <Skeleton className="mb-2 h-3 w-40 bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
        <Skeleton className="h-10 w-24 bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
      </div>
      <div style={termCardStyle}>
        <Skeleton className="mb-1 h-3 w-48 bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
        <Skeleton className="h-64 w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
      </div>
    </div>
  )
}

// ─── Explore Games constants ───────────────────────────────────────

const GAP_OPTIONS: { label: string; value: GapRangeKey | "" }[] = [
  { label: `All gaps (${GAP_RANGES[0].min}+)`, value: "" },
  ...GAP_RANGES.map((range) => ({ label: `${range.label} (${gapRangeSpan(range)})`, value: range.key })),
]

const SIDE_OPTIONS: { label: string; value: ExploreSide }[] = [
  { label: "Home team", value: "home" },
  { label: "Visitor", value: "away" },
  { label: "Either team", value: "either" },
]

const EXPLORE_SEASON_OPTIONS = [...NBA_SEASONS].reverse()

const NBA_TEAMS = [
  "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DAL", "DEN",
  "DET", "GSW", "HOU", "IND", "LAC", "LAL", "MEM", "MIA",
  "MIL", "MIN", "NOP", "NYK", "OKC", "ORL", "PHI", "PHX",
  "POR", "SAC", "SAS", "TOR", "UTA", "WAS",
]

// ─── Explore Games sub-component ──────────────────────────────────

function ExploreGames({
  exploreRef,
  drillSignal,
}: {
  exploreRef: React.RefObject<HTMLDivElement | null>
  drillSignal: DrillSignal
}) {
  const { state, send, results, total, loading, error, window: pages, hasFilters } =
    useExploreGames(drillSignal)
  const { gap: gapFilter, side: sideFilter, team: teamFilter, season: seasonFilter, result: resultFilter, page } = state
  const { totalPages, start, end } = pages

  const openDetail = useCallback((gameId: number) => send({ type: "DETAIL_OPENED", gameId }), [send])

  return (
    <div ref={exploreRef} style={termCardStyle}>
      <ExploreGameDetailModal
        gameId={state.detailGameId}
        open={state.detailOpen}
        onOpenChange={(next) => {
          if (!next) send({ type: "DETAIL_CLOSED" })
        }}
      />
      <SectionDivider label="EXPLORE GAMES" descriptor={`${total.toLocaleString()} TOTAL`} />
      <p className="mono mt-1" style={{ fontSize: 11, color: "var(--term-text-muted)", letterSpacing: TRACK.sub }}>
          FILTER AND BROWSE INDIVIDUAL MATCHUPS · CLICK A ROW FOR DETAILS. NEUTRAL-SITE GAMES ARE
          LEFT OUT; SET RESTED TEAM TO VISITOR FOR THE GAMES THE RATES ABOVE DO NOT COUNT.
      </p>

      {/* Filters */}
      <div className="fc-filter-grid mt-3" aria-label="Explore game filters">
        <SeasonSelector
          id="analysis-season-filter"
          ariaLabel="Season filter"
          season={seasonFilter}
          onSeasonChange={(season) => send({ type: "SEASON_SELECTED", season })}
          options={[{ value: "", label: "All Seasons" }, ...EXPLORE_SEASON_OPTIONS.map(s => ({ value: s, label: s }))]}
        />
        <label className="fc-filter-field" htmlFor="analysis-gap-filter">
          <span className="fc-control-label">Rest gap</span>
          <select
            id="analysis-gap-filter"
            value={gapFilter}
            onChange={(e) => send({ type: "GAP_SELECTED", gap: e.target.value as GapRangeKey | "" })}
            className={EXPLORE_SELECT_CLASS}
            style={exploreSelectStyle}
            aria-label="Rest gap filter"
          >
            {GAP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="fc-filter-field" htmlFor="analysis-side-filter">
          <span className="fc-control-label">Rested team</span>
          <select
            id="analysis-side-filter"
            value={sideFilter}
            onChange={(e) => send({ type: "SIDE_SELECTED", side: e.target.value as ExploreSide })}
            className={EXPLORE_SELECT_CLASS}
            style={exploreSelectStyle}
            aria-label="Rested team filter"
          >
            {SIDE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="fc-filter-field" htmlFor="analysis-team-filter">
          <span className="fc-control-label">Team</span>
          <select
            id="analysis-team-filter"
            value={teamFilter}
            onChange={(e) => send({ type: "TEAM_SELECTED", team: e.target.value })}
            className={EXPLORE_SELECT_CLASS}
            style={exploreSelectStyle}
            aria-label="Team filter"
          >
            <option value="">All Teams</option>
            {NBA_TEAMS.map((t) => {
              // The rows print the code a team played under that season, so the option names them.
              const former = formerAbbreviations(t)
              return <option key={t} value={t}>{former.length ? `${t} (incl. ${former.join(", ")})` : t}</option>
            })}
          </select>
        </label>

        <label className="fc-filter-field" htmlFor="analysis-result-filter">
          <span className="fc-control-label">Result</span>
          <select
            id="analysis-result-filter"
            value={resultFilter}
            onChange={(e) => send({ type: "RESULT_SELECTED", result: e.target.value as ExploreResult })}
            className={EXPLORE_SELECT_CLASS}
            style={exploreSelectStyle}
            aria-label="Result filter"
          >
            <option value="all">All Results</option>
            <option value="correct">Rested Team Won</option>
            <option value="incorrect">Rested Team Lost</option>
          </select>
        </label>

        {hasFilters && (
          <button
            onClick={() => send({ type: "FILTERS_CLEARED" })}
            className="fc-control mono"
            style={{
              // Accent: an in-page action, not the fatigued data pole.
              color: "var(--term-accent)",
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: TRACK.data,
            }}
          >
            CLEAR FILTERS
          </button>
        )}
      </div>

      {/* Table */}
      {/* Table. A local `exploreTdBaseStyle` const used to sit above this file holding
          `padding: 8px 12px`, a bottom rule and `fontSize: 12` — byte-for-byte what `.fc-table`
          and `termTdStyle` already gave every other table. A private copy of the shared style
          is what a convention with no module behind it produces; the state rows below use the
          shared one. */}
      <DataTable
        wrapperClassName="mt-3 overflow-x-auto"
        rows={loading || error || results.length === 0 ? [] : results}
        rowKey={(g) => g.gameId}
        rowAttrs={(g, i) => ({
          role: "button",
          tabIndex: 0,
          onClick: () => openDetail(g.gameId),
          onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              openDetail(g.gameId)
            }
          },
          style: { background: i % 2 === 1 ? "var(--term-bg)" : "var(--term-surface)", cursor: "pointer" },
          className: "hover:bg-[var(--term-surface-2)] focus-visible:bg-[var(--term-surface-2)]",
          "aria-label": `Open details: ${seasonAbbr(g.awayTeamAbbreviation, g.season)} at ${seasonAbbr(g.homeTeamAbbreviation, g.season)}, ${g.date}`,
        })}
        columns={[
          {
            label: "Date",
            style: { color: "var(--term-text-muted)", whiteSpace: "nowrap" },
            cell: (g) => format(new Date(g.date + "T00:00:00"), "yyyy-MM-dd"),
          },
          {
            label: "Matchup",
            style: { color: "var(--term-text)", fontWeight: 600 },
            cell: (g) => (
              <>
                {seasonAbbr(g.awayTeamAbbreviation, g.season)}
                <span style={{ margin: "0 4px", color: "var(--term-hairline)" }}>@</span>
                {seasonAbbr(g.homeTeamAbbreviation, g.season)}
              </>
            ),
          },
          {
            label: "Home Fat.",
            unit: "fatigue score",
            numeric: true,
            className: "hidden sm:table-cell",
            style: { color: "var(--term-text)" },
            cell: (g) => formatFatigueScore(g.homeFatigueScore),
          },
          {
            label: "Away Fat.",
            unit: "fatigue score",
            numeric: true,
            className: "hidden sm:table-cell",
            style: { color: "var(--term-text)" },
            cell: (g) => formatFatigueScore(g.awayFatigueScore),
          },
          {
            label: "RA",
            unit: "fatigue gap",
            align: "center",
            cell: (g) => (
              <span
                className="mono inline-flex items-center"
                style={{
                  // Text grade, not the pole: the chip is the GROUND under 11px white text,
                  // so the pair needs 4.5:1 — white on the pole teal is 3.68.
                  background: "var(--term-blue-text)",
                  color: "var(--term-surface)",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "4px 8px",
                  borderRadius: "var(--term-radius-sm)",
                  letterSpacing: TRACK.sub,
                }}
              >
                {seasonAbbr(g.advantageTeam === "home" ? g.homeTeamAbbreviation : g.awayTeamAbbreviation, g.season)} +
                {formatRestAdvantageValue(g.restAdvantageDifferential)}
              </span>
            ),
          },
          {
            label: "Score",
            numeric: true,
            align: "center",
            className: "hidden sm:table-cell",
            style: { color: "var(--term-text)" },
            cell: (g) => `${g.awayScore}\u2013${g.homeScore}`,
          },
          {
            label: "Result",
            align: "center",
            cell: (g) => (
              <span
                className="mono inline-flex items-center"
                style={{
                  color: g.restedTeamWon ? "var(--term-pos)" : "var(--term-red-text)",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: TRACK.data,
                }}
              >
                {g.restedTeamWon ? "WON" : "LOST"}
              </span>
            ),
          },
        ]}
      >
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}>
              <td colSpan={7} style={{ ...termTdStyle, padding: 12 }}>
                <Skeleton
                  className="h-4 w-full bg-[var(--term-surface-2)]"
                  style={{ borderRadius: "var(--term-radius-sm)" }}
                />
              </td>
            </tr>
          ))
        ) : error ? (
          <tr>
            <td colSpan={7} style={{ ...termTdStyle, textAlign: "center", color: "var(--term-red-text)", padding: 24 }}>
              {error}
            </td>
          </tr>
        ) : results.length === 0 ? (
          <tr>
            <td colSpan={7} style={{ ...termTdStyle, textAlign: "center", color: "var(--term-text-muted)", padding: 24 }}>
              NO GAMES MATCH THE CURRENT FILTERS
            </td>
          </tr>
        ) : null}
      </DataTable>

      {/* Pagination */}
      {total > 0 && (
        <div className="mono mt-3 flex items-center justify-between" style={{ fontSize: 11, color: "var(--term-text-muted)", letterSpacing: TRACK.sub }}>
          {/*
            Test id rather than the text itself: this line says LOADING… while a page is in
            flight, so a locator matched on /SHOWING …/ resolves to nothing mid-fetch and the
            assertion fails as "element not found" instead of waiting for the range to settle.
          */}
          <p data-testid="explore-range">
            {loading
              ? "LOADING…"
              : <>SHOWING <span className="whitespace-nowrap">{start.toLocaleString()}–{end.toLocaleString()}</span> OF {total.toLocaleString()}</>}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => send({ type: "PAGE_SHIFTED", delta: -1, totalPages })}
              disabled={page === 1 || loading}
              className="fc-control-button flex size-11 items-center justify-center bg-[var(--term-surface)] text-[var(--term-text-dim)] transition-colors hover:bg-[var(--term-surface-2)] disabled:opacity-40"
              style={{ border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="mono whitespace-nowrap px-2 tabular-nums" style={{ fontSize: 12, color: "var(--term-text)", fontWeight: 600 }}>
              {page} / {totalPages || 1}
            </span>
            <button
              onClick={() => send({ type: "PAGE_SHIFTED", delta: 1, totalPages })}
              disabled={page >= totalPages || loading}
              className="fc-control-button flex size-11 items-center justify-center bg-[var(--term-surface)] text-[var(--term-text-dim)] transition-colors hover:bg-[var(--term-surface-2)] disabled:opacity-40"
              style={{ border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────

export function AnalysisContent({ asOf }: { asOf?: DataAsOf | null }) {
  const [drillSignal, setDrillSignal] = useState<DrillSignal>(null)

  const exploreRef = useRef<HTMLDivElement>(null)
  const drillTokenRef = useRef(0)

  // The one surface whose subject *is* the backtest, so it is also the only one that
  // renders the failure rather than degrading around it.
  const { data, error, loading } = useBacktest()

  const handleBarClick = useCallback(
    (datum: unknown) => {
      const d = datum as WinRateDatum
      drillTokenRef.current += 1
      setDrillSignal({ gap: d.range, token: drillTokenRef.current })
      setTimeout(() => {
        exploreRef.current?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
          block: "start",
        })
      }, 60)
    },
    []
  )

  if (loading) return <AnalysisSkeleton />

  // Every claim this page makes, decided in one place and tested there. A null means the
  // payload arrived without a baseline or without a counted game, which is not a thinner
  // page but an unpublishable one — so it takes the same branch as a failed fetch.
  const claims = buildAnalysisClaims(data)

  if (error || !data || !claims) {
    return (
      <MessageCard tone="error" title="FAILED TO LOAD ANALYSIS" body={error ?? "UNKNOWN ERROR"} />
    )
  }

  const homeBaseline = data.venueBaseline.homeWinPct
  const barData: WinRateDatum[] = data.gapRanges
    .filter((r) => r.games > 0)
    .map((r) => {
      const range = gapRangeByKey(r.key)
      return {
        label: range.label,
        span: gapRangeSpan(range),
        winPct: r.winPct,
        games: r.games,
        range: r.key,
        error: interval95(r),
        deviation: toDeviation(r.winPct, homeBaseline),
        baselinePct: homeBaseline,
      }
    })
  const rangeScale = deviationScale(barData.flatMap((d) => [d.deviation - d.error, d.deviation + d.error]))

  const winRateTooltipRenderer = (props: TooltipContentProps) => (
    <WinRateTooltip {...props} />
  )

  return (
    <div className="flex flex-col gap-12">
      {/* Inside the loaded branch, so the heading arrives with the data it describes. */}
      <header className="page-intro"><PageHeader
        eyebrow="HISTORICAL BACKTEST · WIN RATE"
        title="Model Results"
        description={claims.headerDescription}
        // Read on the server, not from the backtest response: the same query that keys the
        // held backtest, so the date shown and the population measured cannot diverge.
        asOf={asOf}
      />
      <MethodLink surfaceHref="/analysis" /></header>
      <div className="flex flex-col gap-2">
        <p className="text-[15px] text-[var(--term-text-muted)]">On this page</p>
        <nav aria-label="Model Results sections" className="flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
          <a href="#answer" className="fc-text-link inline-flex min-h-11 items-center">The answer</a>
          <a href="#explorer" className="fc-text-link inline-flex min-h-11 items-center">The explorer</a>
        </nav>
      </div>
      <section id="answer" className="flex scroll-mt-20 flex-col gap-8" aria-labelledby="answer-heading">
        <h2 id="answer-heading" className="text-2xl font-semibold">The answer</h2>

      {/* Hero stat row. Which tiles exist, what each is named, which slice it covers and the
          rule that a third cut never appears are all decided by `buildAnalysisClaims` and
          asserted in its tests. What is left here is the drawing. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {claims.tiles.map((tile) => (
          <StatTile
            key={tile.label}
            label={tile.label}
            value={tile.value}
            baseline={{ delta: tile.lift, label: tile.baselineLabel }}
            sub={tile.detail}
            accent="var(--term-blue)"
          />
        ))}
      </div>

      {/* F2 (build-to-decide): the same headline as distance on one scale — the called half
          and the declined half displaced in opposite directions from the same baseline. The
          tiles above state the numbers; this is what the numbers look like. */}
      <div style={termCardStyle}>
        <SectionDivider label="THE HEADLINE, AS DISTANCE FROM HOME COURT" />
        <div className="mt-4">
          <HeadlineDotPlot
            calledLabel="HOME TEAM MORE RESTED · WON"
            calledPct={claims.tiles[0].winPct}
            declinedPct={claims.declinedHalf.homeWinPct}
            baselinePct={homeBaseline}
          />
        </div>
      </div>

      {/* The excluded half. Why it is a band rather than a tile, and why it is stated as the
          home team's win rather than the visitor's loss, is argued on `DeclinedHalf` in
          `@/lib/analysis-claims`; the full argument for the rule itself lives once, in
          /behind-the-data/rest-advantage.

          `termInsetStyle` is a band by design: no horizontal inset, so this sits on the same
          rail as the tiles and the page title rather than starting a third one. */}
      <div className="flex flex-col gap-2 py-4" style={termInsetStyle}>
        <p
          className="mono"
          style={{ fontSize: 11, letterSpacing: TRACK.label, color: "var(--term-text-muted)", fontWeight: 700 }}
        >
          NOT COUNTED
        </p>
        <p className="text-[var(--term-text-dim)]" style={{ fontSize: TYPE.body, lineHeight: LEAD.body }}>
          In the{" "}
          <span className="mono tabular-nums">
            {claims.declinedHalf.games.toLocaleString()}
          </span>{" "}
          games where the rested team was the <strong className="font-semibold text-[var(--term-text)]">visitor</strong>,
          the home team won{" "}
          <span className="mono font-bold" style={{ color: "var(--term-text)" }}>{claims.declinedHalf.homeWinPct}%</span>.
          These games are excluded from the headline. Their home win rate differs by{" "}
          <span className="mono font-bold" style={{ color: "var(--term-blue-text)" }}>
            {signedNumber(claims.declinedHalf.lift)}
          </span>{" "}
          points against the{" "}
          <span className="mono tabular-nums">{homeBaseline}%</span> home baseline across all games.
        </p>
      </div>

      {/* Win rate by gap size. Three disjoint ranges, so each bar is its own games and a click
          opens exactly those (D-102); the whiskers say how far each rate could move by chance. */}
      <div style={termCardStyle}>
        <SectionDivider
          label="DOES A BIGGER GAP WIN MORE? · HOME TEAM MORE RESTED"
          descriptor="CLICK A BAR TO SEE ITS GAMES"
        />
        <div className="mt-2 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 24, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                stroke="var(--term-border)"
              />
              <XAxis
                dataKey="label"
                tick={
                  <TwoLineTick
                    lines={(label) => {
                      const d = barData.find((row) => row.label === label)
                      return d ? [`${label.toUpperCase()} ${d.span}`, `n=${d.games.toLocaleString()}`] : [label, ""]
                    }}
                  />
                }
                tickLine={false}
                axisLine={false}
                interval={0}
                height={36}
              />
              <YAxis
                domain={rangeScale.domain}
                ticks={rangeScale.ticks}
                tickFormatter={(v: number) => signedNumber(v)}
                tick={{ fontSize: 12, fill: "var(--term-text-muted)", fontFamily: MONO_FONT_STACK }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                isAnimationActive={false}
                cursor={{ fill: "rgba(23,64,139,0.06)" }}
                content={winRateTooltipRenderer}
              />
              <Bar
                dataKey="deviation"
                maxBarSize={72}
                minPointSize={minBarSize}
                style={{ cursor: "pointer" }}
                onClick={handleBarClick}
                isAnimationActive={false}
              >
                {barData.map((d) => (
                  <Cell key={d.label} fill={deviationFill(d.deviation)} />
                ))}
                {/* The whisker sits over the bar's middle; a click on it still has to open the bar's games. */}
                <ErrorBar dataKey="error" isAnimationActive={false} pointerEvents="none" width={8} stroke="var(--term-text)" strokeWidth={1.5} />
              </Bar>
              {/* Declared after the bars so it draws on top. Solid ink at full weight:
                  this is the zero axis, not an annotation laid over the plot. */}
              <ReferenceLine y={0} stroke="var(--term-text)" strokeWidth={1.5} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <BaselineLegend zeroLabel={claims.rangeZeroLabel} />
      </div>

      <div style={termCardStyle}>
        <SectionDivider
          label="DOES THE LARGE-GAP EDGE HOLD IN EVERY ERA?"
          descriptor={eraDescriptor(data.eras)}
        />
        <EraChart eras={data.eras} summary={claims.eraSummary} zeroLabel={claims.eraZeroLabel} />
      </div>

      <div style={termCardStyle}>
        <SectionDivider
          label="HOW MUCH DID HOME COURT ITSELF MOVE?"
          descriptor="HOME WIN RATE BY SEASON, ALL GAMES"
        />
        <HomeCourtBySeasonChart seasonWinRates={data.seasonWinRates} overallPct={homeBaseline} />
        <p className="mono m-0 mt-3" style={{ fontSize: 11, letterSpacing: TRACK.sub, color: "var(--term-text-muted)" }}>
          DASHED LINE: {homeBaseline}% ACROSS EVERY SEASON. EACH ERA ABOVE IS READ AGAINST ITS OWN RATE, NOT THIS ONE.
        </p>
      </div>

      {/* Key insight callout. Both comparisons in this paragraph — whether a bigger gap is
          worth more, and whether each range clears the noise — are read off
          `claims.reading`, never written as fixed prose over live figures. That is what this
          paragraph got wrong twice; see `ReadingClaim` in `@/lib/analysis-claims`. */}
      {claims.reading && (
        <div
          className="px-4 py-4"
          style={{
            background: "var(--term-surface)",
            border: "1px solid var(--term-border)",
            // Accent, not the rested-pole teal: the callout is editorial chrome. The teal
            // inside it stays, because there it colors the data figures themselves.
            borderLeft: "2px solid var(--term-accent)",
            borderRadius: "var(--term-radius)",
          }}
        >
          <p className="mono" style={{ fontSize: 11, letterSpacing: TRACK.label, color: "var(--term-accent)", fontWeight: 700 }}>
            READING THESE NUMBERS
          </p>
          <p className="mt-2 text-[var(--term-text-dim)]" style={{ fontSize: TYPE.body, lineHeight: LEAD.body }}>
            Every game counted here is one the more-rested team played at home, and home teams
            win{" "}
            <span className="mono font-bold" style={{ color: "var(--term-text)" }}>{claims.reading.baselinePct}%</span>{" "}
            of all games regardless of rest. So the rate to read is not{" "}
            <span className="mono tabular-nums">{claims.reading.overallWinPct}%</span> but the{" "}
            <span className="mono font-bold" style={{ color: deviationText(claims.reading.overallLift) }}>
              {signedNumber(claims.reading.overallLift)}
            </span>{" "}
            percentage points above that baseline. This is an association, not a causal estimate.{" "}
            By gap size,{" "}
            {claims.reading.ranges.map((r, index) => (
              <span key={r.key}>
                {index > 0 && (index === claims.reading!.ranges.length - 1 ? ", and " : ", ")}
                <span className="whitespace-nowrap font-semibold text-[var(--term-text)]">
                  {r.name} gaps ({r.span})
                </span>{" "}
                win <span className="mono font-bold" style={{ color: deviationText(r.lift) }}>{r.winPct.toFixed(1)}%</span> on{" "}
                <span className="mono tabular-nums">{r.games.toLocaleString()}</span> games,{" "}
                <span className="mono font-bold" style={{ color: deviationText(r.lift) }}>{signedNumber(r.lift, 1)}</span>
                {r.withinNoise ? " points, within the noise" : " points"}
              </span>
            ))}
            .{claims.reading.largeVsSmall && <> {RANGE_RELATION_CLAUSE[claims.reading.largeVsSmall]}</>}
          </p>
        </div>
      )}

      </section>
      <section id="explorer" className="flex scroll-mt-20 flex-col gap-6" aria-labelledby="explorer-heading">
        <h2 id="explorer-heading" className="text-2xl font-semibold">The explorer</h2>
        <ExploreGames exploreRef={exploreRef} drillSignal={drillSignal} />
      </section>
    </div>
  )
}
