"use client"

import { useCallback, useRef, useState } from "react"
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  LabelList,
} from "recharts"
import type { TooltipContentProps } from "recharts"
import useSWR from "swr"
import { format } from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { ExploreGameDetailModal } from "@/components/explore-game-detail-modal"
import { MethodLink } from "@/components/method-link"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { useExploreGames, type DrillSignal } from "@/hooks/useExploreGames"
import type { ExploreResult } from "@/lib/explore-games-machine"
import { apiFetcher, errMsg } from "@/lib/fetcher"
import { NBA_SEASONS } from "@/lib/nba-season"
import { MONO_FONT_STACK, termCardStyle, termDashedEmptyStyle, termThStyle, termThUnitStyle } from "@/lib/terminal-styles"
import type { AnalysisResponse } from "@/types"
import { signedNumber } from "@/lib/signed-number"
import { MessageCard } from "@/components/ui/message-card"

// ─── Shared styles (terminal) ─────────────────────────────────────

const termTooltip: React.CSSProperties = {
  background: "var(--term-surface)",
  border: "1px solid var(--term-border)",
  borderRadius: "var(--term-radius)",
  padding: "8px 10px",
  fontFamily: MONO_FONT_STACK,
  fontSize: 12,
}

const exploreSelectStyle: React.CSSProperties = {
  background: "var(--term-surface)",
  border: "1px solid var(--term-border)",
  borderRadius: "var(--term-radius)",
  padding: "6px 10px",
  fontSize: 12,
  fontFamily: MONO_FONT_STACK,
  color: "var(--term-text)",
  letterSpacing: "0.04em",
}

const exploreTdBaseStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid var(--term-border)",
  fontSize: 12,
}

// ─── Section divider ──────────────────────────────────────────────

function SectionDivider({ label, descriptor }: { label: string; descriptor?: string }) {
  return (
    <div
      className="mono flex items-center gap-3 py-2"
      style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)" }}
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
function BaselineLegend() {
  return (
    <div
      className="mono mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5"
      style={{ fontSize: 11, color: "var(--term-text-muted)", letterSpacing: "0.03em" }}
    >
      <span className="inline-flex items-center gap-2">
        <span style={{ width: 12, height: 12, borderRadius: 2, background: "var(--term-blue)" }} />
        RESTED TEAM BEAT A COIN FLIP
      </span>
      <span className="inline-flex items-center gap-2">
        <span style={{ width: 12, height: 12, borderRadius: 2, background: "var(--term-red)" }} />
        RESTED TEAM LOST TO A COIN FLIP
      </span>
      <span>PERCENTAGE POINTS · 0 = 50% WIN RATE</span>
    </div>
  )
}

// ─── Stat card (matches page.tsx pattern) ─────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent = "var(--term-neutral)",
}: {
  label: string
  value: string
  sub?: string
  accent?: string
}) {
  return (
    <div
      className="mono flex flex-col gap-1.5"
      style={{
        background: "var(--term-surface)",
        border: "1px solid var(--term-border)",
        // Top rule, not left: as a left border a row of tiles reads as a list with coloured
        // bullets. Along the top edge it reads as a row of measures. Matches page.tsx.
        borderTop: `2px solid ${accent}`,
        borderRadius: "var(--term-radius)",
        padding: "12px 14px",
      }}
    >
      <span style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 600 }}>
        {label}
      </span>
      <span className="tabular-nums" style={{ fontSize: 24, fontWeight: 600, color: "var(--term-text)", lineHeight: 1 }}>
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: 11, color: "var(--term-text-muted)", letterSpacing: "0.04em" }}>{sub}</span>
      )}
    </div>
  )
}

// ─── Chart scale ──────────────────────────────────────────────────

/** A coin flip. Win-rate charts plot the distance from here, not the win rate. */
const BASELINE_PCT = 50

/**
 * Win-rate bars are **deviation columns**: the plotted value is `winPct - 50`, in
 * percentage points, and zero IS the coin flip. This replaced a zero-based bar
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
 */
export function toDeviation(winPct: number): number {
  return Math.round((winPct - BASELINE_PCT) * 10) / 10
}

/**
 * Blue above the coin flip, red below — the two poles of a diverging scale, with
 * a neutral midpoint. Dead-even is real: RA ≥ 7 in 2011-12 went 17/34.
 */
export function deviationFill(deviation: number): string {
  if (deviation === 0) return "var(--term-neutral)"
  return deviation < 0 ? "var(--term-red)" : "var(--term-blue)"
}

/**
 * A dead-even slice has zero length, so without this it draws nothing at all and
 * reads as missing data rather than as "exactly a coin flip". Give it a 2px stub;
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
 * an orphan 70), and a hardcoded ceiling silently clips — the RA ≥ 7 season
 * series runs −11.0 to +25.0 pp.
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
  winPct: number
  games: number
  threshold?: number
  /** winPct − 50, in percentage points. Negative below the coin flip. */
  deviation: number
}

// ─── Custom tooltips ──────────────────────────────────────────────

function WinRateTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as WinRateDatum
  return (
    <div style={termTooltip}>
      <p style={{ color: "var(--term-text)", fontWeight: 700, letterSpacing: "0.04em" }}>{d.label.toUpperCase()}</p>
      {/* The bar plots the deviation, so the tooltip leads with it and carries the
          absolute win rate underneath — the axis no longer shows it anywhere. */}
      <p style={{ marginTop: 2, color: deviationFill(d.deviation) }}>
        <span style={{ fontWeight: 700 }}>{signedNumber(d.deviation)} PP</span> VS COIN FLIP
      </p>
      <p style={{ color: "var(--term-text-muted)", marginTop: 2 }}>WIN RATE: {d.winPct}%</p>
      <p style={{ color: "var(--term-text-muted)", marginTop: 2 }}>{d.games.toLocaleString()} GAMES</p>
      {d.threshold !== undefined && (
        <p style={{ marginTop: 4, fontSize: 11, color: "var(--term-blue)" }}>CLICK TO EXPLORE ↓</p>
      )}
    </div>
  )
}

type SeasonWinRateDatum = {
  label: string
  winPct: number
  games: number
  restedTeamWins: number
  /** winPct − 50, in percentage points. Negative below the coin flip. */
  deviation: number
}

function SeasonWinRateTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as SeasonWinRateDatum
  return (
    <div style={termTooltip}>
      <p style={{ color: "var(--term-text)", fontWeight: 700, letterSpacing: "0.04em" }}>{d.label}</p>
      <p style={{ marginTop: 2, color: deviationFill(d.deviation) }}>
        <span style={{ fontWeight: 700 }}>{signedNumber(d.deviation)} PP</span> VS COIN FLIP
      </p>
      <p style={{ color: "var(--term-text-muted)", marginTop: 2 }}>WIN RATE: {d.winPct}%</p>
      <p style={{ color: "var(--term-text-muted)", marginTop: 2 }}>
        {d.restedTeamWins.toLocaleString()} / {d.games.toLocaleString()} (RESTED TEAM WON)
      </p>
    </div>
  )
}

// ─── RA threshold toggle options ──────────────────────────────────

const RA_THRESHOLD_OPTIONS = [
  { label: "All Games", value: 0 },
  { label: "RA ≥ 2", value: 2 },
  { label: "RA ≥ 3", value: 3 },
  { label: "RA ≥ 5", value: 5 },
  { label: "RA ≥ 7", value: 7 },
]

function SeasonWinRateBySeasonChart({
  seasonWinRates,
  loading,
}: {
  seasonWinRates: AnalysisResponse["seasonWinRates"]
  loading: boolean
}) {
  const chartData: SeasonWinRateDatum[] = seasonWinRates.map((s) => ({
    label: s.season,
    winPct: s.winPct,
    games: s.games,
    restedTeamWins: s.restedTeamWins,
    deviation: toDeviation(s.winPct),
  }))
  const { domain, ticks } = deviationScale(chartData.map((d) => d.deviation))

  return (
    <div className="mt-4 h-72 min-w-0">
      {loading ? (
        <Skeleton className="h-full w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
      ) : chartData.length === 0 ? (
        <div
          className="mono flex h-full items-center justify-center"
          style={termDashedEmptyStyle}
        >
          NO SEASON-LEVEL DATA YET
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              stroke="var(--term-border)"
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--term-text-muted)", fontFamily: MONO_FONT_STACK }}
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={-32}
              textAnchor="end"
              height={52}
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
              cursor={{ fill: "rgba(23,64,139,0.06)" }}
              content={(props: TooltipContentProps) => <SeasonWinRateTooltip {...props} />}
            />
            {/* No per-bar value label here, unlike the four-bar threshold chart: at ~40
                seasons each bar is roughly 44px wide and the labels overlap into a smear.
                Sample size and win rate stay available on hover. */}
            <Bar dataKey="deviation" maxBarSize={48} minPointSize={minBarSize} isAnimationActive={false}>
              {chartData.map((d) => (
                <Cell key={d.label} fill={deviationFill(d.deviation)} />
              ))}
            </Bar>
            {/* Declared after the bars so it draws on top. This is the zero axis, not a
                decoration, so it is solid ink at full weight — the one rule on the chart
                that is allowed to be assertive. */}
            <ReferenceLine y={0} stroke="var(--term-text)" strokeWidth={1.5} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
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

const RA_OPTIONS = [
  { label: "All", value: 0 },
  { label: "RA ≥ 2", value: 2 },
  { label: "RA ≥ 3", value: 3 },
  { label: "RA ≥ 5", value: 5 },
  { label: "RA ≥ 7", value: 7 },
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
  const { minRA: raFilter, team: teamFilter, season: seasonFilter, result: resultFilter, page } = state
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
      <p className="mono mt-1" style={{ fontSize: 11, color: "var(--term-text-muted)", letterSpacing: "0.04em" }}>
        FILTER AND BROWSE INDIVIDUAL MATCHUPS — CLICK A ROW FOR DETAILS.
      </p>

      {/* Filters */}
      <div className="mt-3 flex flex-wrap gap-2">
        <select
          value={raFilter}
          onChange={(e) => send({ type: "MIN_RA_SELECTED", minRA: Number(e.target.value) })}
          style={exploreSelectStyle}
          aria-label="Rest advantage filter"
        >
          {RA_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={teamFilter}
          onChange={(e) => send({ type: "TEAM_SELECTED", team: e.target.value })}
          style={exploreSelectStyle}
          aria-label="Team filter"
        >
          <option value="">All Teams</option>
          {NBA_TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={seasonFilter}
          onChange={(e) => send({ type: "SEASON_SELECTED", season: e.target.value })}
          style={exploreSelectStyle}
          aria-label="Season filter"
        >
          <option value="">All Seasons</option>
          {EXPLORE_SEASON_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={resultFilter}
          onChange={(e) => send({ type: "RESULT_SELECTED", result: e.target.value as ExploreResult })}
          style={exploreSelectStyle}
          aria-label="Result filter"
        >
          <option value="all">All Results</option>
          <option value="correct">Rested Team Won</option>
          <option value="incorrect">Rested Team Lost</option>
        </select>

        {hasFilters && (
          <button
            onClick={() => send({ type: "FILTERS_CLEARED" })}
            className="mono"
            style={{
              ...exploreSelectStyle,
              color: "var(--term-red)",
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            CLEAR FILTERS
          </button>
        )}
      </div>

      {/* Table */}
      <div className="mt-3 overflow-x-auto">
        <table className="mono w-full" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...termThStyle, textAlign: "left" }}>Date</th>
              <th style={{ ...termThStyle, textAlign: "left" }}>Matchup</th>
              <th style={{ ...termThStyle, textAlign: "right" }} className="hidden sm:table-cell">
                Home Fat.
                <span style={termThUnitStyle}>fatigue score</span>
              </th>
              <th style={{ ...termThStyle, textAlign: "right" }} className="hidden sm:table-cell">
                Away Fat.
                <span style={termThUnitStyle}>fatigue score</span>
              </th>
              <th style={{ ...termThStyle, textAlign: "center" }}>
                RA
                <span style={termThUnitStyle}>fatigue gap</span>
              </th>
              <th style={{ ...termThStyle, textAlign: "center" }} className="hidden sm:table-cell">Score</th>
              <th style={{ ...termThStyle, textAlign: "center" }}>Result</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} style={{ ...exploreTdBaseStyle, padding: "10px" }}>
                    <Skeleton className="h-4 w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius-sm)" }} />
                  </td>
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={7} style={{ ...exploreTdBaseStyle, textAlign: "center", color: "var(--term-red)", padding: "20px" }}>
                  {error}
                </td>
              </tr>
            ) : results.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ ...exploreTdBaseStyle, textAlign: "center", color: "var(--term-text-muted)", padding: "24px" }}>
                  NO GAMES MATCH THE CURRENT FILTERS
                </td>
              </tr>
            ) : (
              results.map((g, i) => {
                const advAbbr =
                  g.advantageTeam === "home"
                    ? g.homeTeamAbbreviation
                    : g.awayTeamAbbreviation
                const rowBg = i % 2 === 1 ? "var(--term-bg)" : "var(--term-surface)"
                return (
                  <tr
                    key={g.gameId}
                    role="button"
                    tabIndex={0}
                    onClick={() => openDetail(g.gameId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        openDetail(g.gameId)
                      }
                    }}
                    style={{ background: rowBg, cursor: "pointer" }}
                    className="hover:bg-[var(--term-surface-2)] focus-visible:bg-[var(--term-surface-2)]"
                    aria-label={`Open details: ${g.awayTeamAbbreviation} at ${g.homeTeamAbbreviation}, ${g.date}`}
                  >
                    <td style={{ ...exploreTdBaseStyle, color: "var(--term-text-muted)" }}>
                      {format(new Date(g.date + "T00:00:00"), "yyyy-MM-dd")}
                    </td>
                    <td style={{ ...exploreTdBaseStyle, color: "var(--term-text)", fontWeight: 600 }}>
                      {g.awayTeamAbbreviation}
                      <span style={{ margin: "0 4px", color: "var(--term-hairline)" }}>@</span>
                      {g.homeTeamAbbreviation}
                    </td>
                    <td style={{ ...exploreTdBaseStyle, textAlign: "right", color: "var(--term-text)" }} className="hidden sm:table-cell tabular-nums">
                      {g.homeFatigueScore.toFixed(1)}
                    </td>
                    <td style={{ ...exploreTdBaseStyle, textAlign: "right", color: "var(--term-text)" }} className="hidden sm:table-cell tabular-nums">
                      {g.awayFatigueScore.toFixed(1)}
                    </td>
                    <td style={{ ...exploreTdBaseStyle, textAlign: "center" }}>
                      <span
                        className="mono inline-flex items-center"
                        style={{
                          background: "var(--term-blue)",
                          color: "var(--term-surface)",
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "var(--term-radius-sm)",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {advAbbr} +{g.restAdvantageDifferential.toFixed(1)}
                      </span>
                    </td>
                    <td style={{ ...exploreTdBaseStyle, textAlign: "center", color: "var(--term-text)" }} className="hidden sm:table-cell tabular-nums">
                      {g.awayScore}–{g.homeScore}
                    </td>
                    <td style={{ ...exploreTdBaseStyle, textAlign: "center" }}>
                      <span
                        className="mono inline-flex items-center"
                        style={{
                          color: g.restedTeamWon ? "var(--term-pos)" : "var(--term-red)",
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                        }}
                      >
                        {g.restedTeamWon ? "WON" : "LOST"}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="mono mt-3 flex items-center justify-between" style={{ fontSize: 11, color: "var(--term-text-muted)", letterSpacing: "0.04em" }}>
          <p>
            {loading
              ? "LOADING…"
              : `SHOWING ${start.toLocaleString()}–${end.toLocaleString()} OF ${total.toLocaleString()}`}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => send({ type: "PAGE_SHIFTED", delta: -1, totalPages })}
              disabled={page === 1 || loading}
              className="flex size-7 items-center justify-center bg-[var(--term-surface)] text-[var(--term-text-dim)] transition-colors hover:bg-[var(--term-surface-2)] disabled:opacity-40"
              style={{ border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="mono px-2 tabular-nums" style={{ fontSize: 12, color: "var(--term-text)", fontWeight: 600 }}>
              {page} / {totalPages || 1}
            </span>
            <button
              onClick={() => send({ type: "PAGE_SHIFTED", delta: 1, totalPages })}
              disabled={page >= totalPages || loading}
              className="flex size-7 items-center justify-center bg-[var(--term-surface)] text-[var(--term-text-dim)] transition-colors hover:bg-[var(--term-surface-2)] disabled:opacity-40"
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

export function AnalysisContent() {
  const [drillSignal, setDrillSignal] = useState<DrillSignal>(null)
  const [seasonRaFilter, setSeasonRaFilter] = useState(0)

  const exploreRef = useRef<HTMLDivElement>(null)
  const drillTokenRef = useRef(0)

  const { data, error: swrError, isLoading: loading } = useSWR<AnalysisResponse>(
    "/api/analysis",
    apiFetcher,
    { revalidateOnFocus: false }
  )
  const error = swrError ? errMsg(swrError) : null

  const seasonSwrKey = seasonRaFilter > 0
    ? `/api/analysis?seasonMinRA=${seasonRaFilter}`
    : null
  const { data: seasonData, isLoading: seasonRateLoading } = useSWR<AnalysisResponse>(
    seasonSwrKey,
    apiFetcher,
    { revalidateOnFocus: false }
  )

  const displayedSeasonRates = seasonRaFilter > 0
    ? (seasonData?.seasonWinRates ?? [])
    : (data?.seasonWinRates ?? [])

  const handleSeasonFilterChange = useCallback(
    (threshold: number) => {
      setSeasonRaFilter(threshold)
    },
    []
  )

  const handleBarClick = useCallback(
    (datum: unknown) => {
      const d = datum as WinRateDatum
      const threshold = d.threshold ?? 0
      drillTokenRef.current += 1
      setDrillSignal({ threshold, token: drillTokenRef.current })
      setTimeout(() => {
        exploreRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      }, 60)
    },
    []
  )

  if (loading) return <AnalysisSkeleton />

  if (error || !data) {
    return (
      <MessageCard tone="error" title="FAILED TO LOAD ANALYSIS" body={error ?? "UNKNOWN ERROR"} />
    )
  }

  const barData: WinRateDatum[] = data.thresholds.map((t) => ({
    label: `RA ≥ ${t.threshold}`,
    winPct: t.winPct,
    games: t.games,
    threshold: t.threshold,
    deviation: toDeviation(t.winPct),
  }))
  const thresholdScale = deviationScale(barData.map((d) => d.deviation))

  const ra5 = data.thresholds.find((t) => t.threshold === 5)
  const ra7 = data.thresholds.find((t) => t.threshold === 7)

  const winRateTooltipRenderer = (props: TooltipContentProps) => (
    <WinRateTooltip {...props} />
  )

  return (
    <div className="flex flex-col gap-12">
      {/* Inside the loaded branch, so the heading arrives with the data it describes. */}
      <PageHeader
        eyebrow="HISTORICAL BACKTEST"
        title="Rest Advantage Analysis"
        description="Among completed regular-season games with fatigue data on both sides, did the more-rested team win? Charts plot the gap against a coin flip, so zero is a 50% win rate."
      />
      <MethodLink surfaceHref="/analysis" />

      {/* Hero stat row (terminal stat cards) */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <StatCard
          label="OVERALL WIN RATE"
          value={`${data.overallWinRate}%`}
          sub={`${data.totalGames.toLocaleString()} GAMES`}
          accent="var(--term-blue)"
        />
        <StatCard
          label="HOME RESTED WIN%"
          value={`${data.homeAwayBreakdown.homeTeamMoreRested.winPct}%`}
          sub={`${data.homeAwayBreakdown.homeTeamMoreRested.restedTeamWins.toLocaleString()} / ${data.homeAwayBreakdown.homeTeamMoreRested.games.toLocaleString()}`}
          accent="var(--term-neutral)"
        />
        {ra5 && (
          <StatCard
            label="WIN RATE · RA ≥ 5"
            value={`${ra5.winPct}%`}
            sub={`${ra5.games.toLocaleString()} GAMES`}
            accent="var(--term-blue)"
          />
        )}
      </div>

      {/* Bar chart — win rate by threshold */}
      <div style={termCardStyle}>
        <SectionDivider label="WIN RATE BY RA THRESHOLD" descriptor="CLICK A BAR TO EXPLORE" />
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
                tick={{ fontSize: 12, fill: "var(--term-text-muted)", fontFamily: MONO_FONT_STACK }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={thresholdScale.domain}
                ticks={thresholdScale.ticks}
                tickFormatter={(v: number) => signedNumber(v)}
                tick={{ fontSize: 12, fill: "var(--term-text-muted)", fontFamily: MONO_FONT_STACK }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                cursor={{ fill: "rgba(23,64,139,0.06)" }}
                content={winRateTooltipRenderer}
              />
              {/* Deviation columns from zero = coin flip. `position="top"` puts the
                  label above the cap for a positive bar and below the foot for a
                  negative one, so it never lands inside the mark. */}
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
                <LabelList
                  dataKey="games"
                  position="top"
                  formatter={(v: string | number | boolean | null | undefined) =>
                    typeof v === "number" ? `n=${v.toLocaleString()}` : ""
                  }
                  style={{ fontSize: "11px", fill: "var(--term-text-muted)", fontFamily: MONO_FONT_STACK }}
                />
              </Bar>
              {/* Declared after the bars so it draws on top. Solid ink at full weight:
                  this is the zero axis, not an annotation laid over the plot. */}
              <ReferenceLine y={0} stroke="var(--term-text)" strokeWidth={1.5} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <BaselineLegend />
      </div>

      {/* Home rested breakdown — terminal bar */}
      <div style={termCardStyle}>
        <SectionDivider
          label="HOME TEAM MORE RESTED"
          descriptor={`${data.homeAwayBreakdown.homeTeamMoreRested.games.toLocaleString()} GAMES`}
        />
        <p className="mono mt-3 tabular-nums" style={{ fontSize: 36, fontWeight: 700, color: "var(--term-blue)", lineHeight: 1 }}>
          {data.homeAwayBreakdown.homeTeamMoreRested.winPct}%
        </p>
        <p className="mono mt-1" style={{ fontSize: 12, color: "var(--term-text-muted)", letterSpacing: "0.04em" }}>
          {data.homeAwayBreakdown.homeTeamMoreRested.restedTeamWins.toLocaleString()} WINS /{" "}
          {data.homeAwayBreakdown.homeTeamMoreRested.games.toLocaleString()} GAMES
        </p>
        <div className="mt-3 w-full" style={{ height: 4, background: "var(--term-surface-2)", borderRadius: "var(--term-radius-bar)" }}>
          <div
            className="h-full transition-all duration-700"
            style={{
              width: `${data.homeAwayBreakdown.homeTeamMoreRested.winPct}%`,
              background: "var(--term-blue)",
              borderRadius: "var(--term-radius-bar)",
            }}
          />
        </div>
      </div>

      {/* Win rate by season */}
      <div style={termCardStyle}>
        <SectionDivider label="WIN RATE BY SEASON" descriptor="REGULAR SEASON (OCT–APR)" />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {RA_THRESHOLD_OPTIONS.map((opt) => {
            const active = seasonRaFilter === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => handleSeasonFilterChange(opt.value)}
                className="mono transition-[background-color,border-color,transform] active:scale-[0.97]"
                style={{
                  background: active ? "var(--term-blue)" : "var(--term-surface)",
                  color: active ? "var(--term-surface)" : "var(--term-text)",
                  border: `1px solid ${active ? "var(--term-blue)" : "var(--term-border)"}`,
                  borderRadius: "var(--term-radius)",
                  padding: "4px 10px",
                  fontSize: 12,
                  letterSpacing: "0.04em",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {opt.label.toUpperCase()}
              </button>
            )
          })}
        </div>

        <SeasonWinRateBySeasonChart
          seasonWinRates={displayedSeasonRates}
          loading={seasonRateLoading}
        />
        <BaselineLegend />
      </div>

      {/* Key insight callout */}
      {ra5 && (
        <div
          className="px-4 py-4"
          style={{
            background: "var(--term-surface)",
            border: "1px solid var(--term-border)",
            borderLeft: "2px solid var(--term-blue)",
            borderRadius: "var(--term-radius)",
          }}
        >
          <p className="mono" style={{ fontSize: 11, letterSpacing: "0.12em", color: "var(--term-blue)", fontWeight: 700 }}>
            KEY INSIGHT
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--term-text-dim)]">
            Teams with a Rest Advantage of{" "}
            <span className="font-semibold text-[var(--term-text)]">+5 or more</span> win{" "}
            <span className="mono font-bold" style={{ color: "var(--term-blue)" }}>{ra5.winPct}%</span> of games — a
            significant edge over the coin-flip baseline.
            {ra7 && (
              <>
                {" "}At RA ≥ 7, that rises to{" "}
                <span className="mono font-bold" style={{ color: "var(--term-blue)" }}>{ra7.winPct}%</span> across{" "}
                <span className="mono tabular-nums">{ra7.games.toLocaleString()}</span> games, suggesting the fatigue signal compounds at the extremes.
              </>
            )}
          </p>
        </div>
      )}

      {/* Explore Games */}
      <ExploreGames exploreRef={exploreRef} drillSignal={drillSignal} />
    </div>
  )
}
