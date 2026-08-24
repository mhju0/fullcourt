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
import { useBacktest } from "@/hooks/useBacktest"
import { useExploreGames, type DrillSignal } from "@/hooks/useExploreGames"
import type { ExploreResult } from "@/lib/explore-games-machine"
import { apiFetcher } from "@/lib/fetcher"
import { NBA_SEASONS } from "@/lib/nba-season"
import {
  BEYOND_CLAUSE,
  WIDER_GAP_CLAUSE,
  buildAnalysisClaims,
  toDeviation,
} from "@/lib/analysis-claims"
import type { DataAsOf } from "@/lib/data-as-of"
import { LEAD, MONO_FONT_STACK, SPACE, termCardStyle, termDashedEmptyStyle, termInsetStyle, termTdStyle, TRACK, TYPE } from "@/lib/terminal-styles"
import { DataTable } from "@/components/ui/data-table"
import type { AnalysisResponse } from "@/types"
import { signedNumber } from "@/lib/signed-number"
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

// No fontSize here. The size is the responsive class below (`EXPLORE_SELECT_CLASS`), because
// the iOS input-zoom floor needs 16px at phone widths and 12px above — and an inline fontSize
// cannot be responsive, nor overridden by any class. See termSelectClass in terminal-styles.ts.
const exploreSelectStyle: React.CSSProperties = {
  background: "var(--term-surface)",
  border: "1px solid var(--term-border)",
  borderRadius: "var(--term-radius)",
  padding: "8px 12px",
  fontFamily: MONO_FONT_STACK,
  color: "var(--term-text)",
  letterSpacing: TRACK.sub,
}

const EXPLORE_SELECT_CLASS = "text-[16px] sm:text-data"

// ─── Section divider ──────────────────────────────────────────────

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
 * earn. Callers pass the venue baseline the API now ships; the season chart passes that
 * season's own, because home court ran from 67.9% in 1987-88 to 54.3% in 2023-24.
 *
 * `toDeviation` itself lives in `@/lib/analysis-claims`: the lift is claim vocabulary before
 * it is a plotted value, since every tile and sentence on the page states a rate through it.
 * What stays here is the drawing alone — fill, bar size and scale.
 */

/**
 * Blue above the baseline, red below — the two poles of a diverging scale, with
 * a neutral midpoint. Dead-even is real: RA ≥ 7 in 2011-12 went 17/34.
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
      <p style={{ color: "var(--term-text)", fontWeight: 700, letterSpacing: TRACK.sub }}>{d.label.toUpperCase()}</p>
      <p style={{ color: "var(--term-text-muted)", marginTop: SPACE.xs }}>RESTED TEAM AT HOME</p>
      {/* The bar plots the deviation, so the tooltip leads with it and carries the
          absolute win rate underneath — the axis no longer shows it anywhere. The
          baseline is named on the same line so the two can never be read apart. */}
      <p style={{ marginTop: SPACE.xs, color: deviationText(d.deviation) }}>
        <span style={{ fontWeight: 700 }}>{signedNumber(d.deviation)} PP</span> VS {d.baselinePct}% BASELINE
      </p>
      <p style={{ color: "var(--term-text-muted)", marginTop: SPACE.xs }}>WIN RATE: {d.winPct}%</p>
      <p style={{ color: "var(--term-text-muted)", marginTop: SPACE.xs }}>{d.games.toLocaleString()} GAMES</p>
      {d.threshold !== undefined && (
        <p style={{ marginTop: SPACE.sm, fontSize: TYPE.label, color: "var(--term-accent)" }}>CLICK TO EXPLORE ↓</p>
      )}
    </div>
  )
}

type SeasonWinRateDatum = {
  label: string
  winPct: number
  games: number
  restedTeamWins: number
  /** winPct − that season's own home baseline, in percentage points. */
  deviation: number
  /** That season's home win rate. Not a constant — see `toDeviation`. */
  baselinePct: number
}

function SeasonWinRateTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as SeasonWinRateDatum
  return (
    <div style={termTooltip}>
      <p style={{ color: "var(--term-text)", fontWeight: 700, letterSpacing: TRACK.sub }}>{d.label}</p>
      <p style={{ marginTop: SPACE.xs, color: deviationText(d.deviation) }}>
        <span style={{ fontWeight: 700 }}>{signedNumber(d.deviation)} PP</span> VS {d.baselinePct}% BASELINE
      </p>
      <p style={{ color: "var(--term-text-muted)", marginTop: SPACE.xs }}>WIN RATE: {d.winPct}%</p>
      <p style={{ color: "var(--term-text-muted)", marginTop: SPACE.xs }}>
        {d.restedTeamWins.toLocaleString()} / {d.games.toLocaleString()} (RESTED TEAM WON)
      </p>
      <p style={{ color: "var(--term-text-muted)", marginTop: SPACE.xs }}>
        HOME TEAMS WON {d.baselinePct}% THAT SEASON
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
  // Each season against its OWN home baseline. A single zero line across 41 seasons would
  // be wrong at both ends: home teams won 67.9% in 1987-88 and 54.3% in 2023-24, so a fixed
  // line renders the 1980s as a huge rest effect and the 2020s as a collapse, when neither
  // is about rest at all.
  const chartData: SeasonWinRateDatum[] = seasonWinRates.map((s) => ({
    label: s.season,
    winPct: s.winPct,
    games: s.games,
    restedTeamWins: s.restedTeamWins,
    deviation: toDeviation(s.winPct, s.homeBaselinePct),
    baselinePct: s.homeBaselinePct,
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
      <p className="mono mt-1" style={{ fontSize: 11, color: "var(--term-text-muted)", letterSpacing: TRACK.sub }}>
        FILTER AND BROWSE INDIVIDUAL MATCHUPS — CLICK A ROW FOR DETAILS.
      </p>

      {/* Filters */}
      <div className="mt-3 flex flex-wrap gap-2">
        <select
          value={raFilter}
          onChange={(e) => send({ type: "MIN_RA_SELECTED", minRA: Number(e.target.value) })}
          className={EXPLORE_SELECT_CLASS}
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
          className={EXPLORE_SELECT_CLASS}
          style={exploreSelectStyle}
          aria-label="Team filter"
        >
          <option value="">All Teams</option>
          {NBA_TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={seasonFilter}
          onChange={(e) => send({ type: "SEASON_SELECTED", season: e.target.value })}
          className={EXPLORE_SELECT_CLASS}
          style={exploreSelectStyle}
          aria-label="Season filter"
        >
          <option value="">All Seasons</option>
          {EXPLORE_SEASON_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
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

        {hasFilters && (
          <button
            onClick={() => send({ type: "FILTERS_CLEARED" })}
            className="mono"
            style={{
              ...exploreSelectStyle,
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
          "aria-label": `Open details: ${g.awayTeamAbbreviation} at ${g.homeTeamAbbreviation}, ${g.date}`,
        })}
        columns={[
          {
            label: "Date",
            style: { color: "var(--term-text-muted)" },
            cell: (g) => format(new Date(g.date + "T00:00:00"), "yyyy-MM-dd"),
          },
          {
            label: "Matchup",
            style: { color: "var(--term-text)", fontWeight: 600 },
            cell: (g) => (
              <>
                {g.awayTeamAbbreviation}
                <span style={{ margin: "0 4px", color: "var(--term-hairline)" }}>@</span>
                {g.homeTeamAbbreviation}
              </>
            ),
          },
          {
            label: "Home Fat.",
            unit: "fatigue score",
            numeric: true,
            className: "hidden sm:table-cell",
            style: { color: "var(--term-text)" },
            cell: (g) => g.homeFatigueScore.toFixed(1),
          },
          {
            label: "Away Fat.",
            unit: "fatigue score",
            numeric: true,
            className: "hidden sm:table-cell",
            style: { color: "var(--term-text)" },
            cell: (g) => g.awayFatigueScore.toFixed(1),
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
                {g.advantageTeam === "home" ? g.homeTeamAbbreviation : g.awayTeamAbbreviation} +
                {g.restAdvantageDifferential.toFixed(1)}
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

export function AnalysisContent({ asOf }: { asOf?: DataAsOf | null }) {
  const [drillSignal, setDrillSignal] = useState<DrillSignal>(null)
  const [seasonRaFilter, setSeasonRaFilter] = useState(0)

  const exploreRef = useRef<HTMLDivElement>(null)
  const drillTokenRef = useRef(0)

  // The one surface whose subject *is* the backtest, so it is also the only one that
  // renders the failure rather than degrading around it.
  const { data, error, loading } = useBacktest()

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
  const barData: WinRateDatum[] = data.thresholds.map((t) => ({
    label: `RA ≥ ${t.threshold}`,
    winPct: t.winPct,
    games: t.games,
    threshold: t.threshold,
    deviation: toDeviation(t.winPct, homeBaseline),
    baselinePct: homeBaseline,
  }))
  const thresholdScale = deviationScale(barData.map((d) => d.deviation))

  const winRateTooltipRenderer = (props: TooltipContentProps) => (
    <WinRateTooltip {...props} />
  )

  return (
    <div className="flex flex-col gap-12">
      {/* Inside the loaded branch, so the heading arrives with the data it describes. */}
      <PageHeader
        eyebrow="HISTORICAL BACKTEST · WIN RATE"
        title="Model Results"
        description={claims.headerDescription}
        // Read on the server, not from the backtest response: the same query that keys the
        // held backtest, so the date shown and the population measured cannot diverge.
        asOf={asOf}
      />
      <MethodLink surfaceHref="/analysis" />

      {/* Hero stat row. Which tiles exist, what each is named, which slice it covers and the
          rule that a third cut never appears are all decided by `buildAnalysisClaims` and
          asserted in its tests. What is left here is the drawing. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {claims.tiles.map((tile) => (
          <StatTile
            key={tile.label}
            label={tile.label}
            value={tile.value}
            sub={tile.detail}
            accent="var(--term-blue)"
          />
        ))}
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
          The model does not count them, because the home side keeps winning them — but it wins
          them by{" "}
          <span className="mono font-bold" style={{ color: "var(--term-blue-text)" }}>
            {signedNumber(claims.declinedHalf.lift)}
          </span>{" "}
          points against the{" "}
          <span className="mono tabular-nums">{homeBaseline}%</span> it takes across all games,
          which is the rest effect showing up on the side this page will not call.
        </p>
      </div>

      {/* Bar chart — win rate by threshold */}
      <div style={termCardStyle}>
        <SectionDivider
          label="WIN RATE BY RA THRESHOLD — RESTED TEAM AT HOME"
          descriptor="CLICK A BAR TO EXPLORE"
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
              {/* Deviation columns from zero = the venue baseline. `position="top"` puts the
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
        <BaselineLegend zeroLabel={claims.thresholdZeroLabel} />
      </div>

      {/* The card that argued this rule in full used to sit here. Every clause of it was
          already in `/behind-the-data/rest-advantage`, near-verbatim, alongside a
          counterfactual this page never carried — so it was thirty lines of duplication
          arguing a caveat on the page whose subject is the result. The figure it published
          is still live, in the stat tile above; the argument is one click away under the
          method link. */}

      {/* Win rate by season */}
      {/* `data-shot-anchor` marks where the README's screenshot of this page ends. It is read by
          scripts/screenshots.mjs, which measures this element's bottom edge instead of carrying a
          hand-derived pixel height — see the header of that file. */}
      <div style={termCardStyle} data-shot-anchor="win-rate-by-season">
        <SectionDivider
          label="WIN RATE BY SEASON"
          descriptor="VS THAT SEASON'S HOME BASELINE"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {RA_THRESHOLD_OPTIONS.map((opt) => {
            const active = seasonRaFilter === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => handleSeasonFilterChange(opt.value)}
                className="mono transition-[background-color,border-color,transform] active:scale-[0.97]"
                style={{
                  // Solid ink when active, never the rested-pole teal: the pill selects a
                  // view of the chart, and only the marks inside it may wear a data pole.
                  background: active ? "var(--term-text)" : "var(--term-surface)",
                  color: active ? "var(--term-surface)" : "var(--term-text)",
                  border: `1px solid ${active ? "var(--term-text)" : "var(--term-border)"}`,
                  borderRadius: "var(--term-radius)",
                  padding: "4px 12px",
                  fontSize: 12,
                  letterSpacing: TRACK.sub,
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
        <BaselineLegend zeroLabel={claims.seasonZeroLabel} />
      </div>

      {/* Key insight callout. Both comparisons in this paragraph — whether a bigger gap is
          worth more, and whether the gain keeps climbing past RA ≥ 5 — are read off
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
            <span className="mono font-bold" style={{ color: "var(--term-blue-text)" }}>
              {signedNumber(claims.reading.overallLift)}
            </span>{" "}
            points above that baseline — the part rest accounts for.{" "}
            {WIDER_GAP_CLAUSE[claims.reading.ra5.relationToAnyGap]} at{" "}
            <span className="font-semibold text-[var(--term-text)]">
              RA ≥ {claims.reading.ra5.threshold}
            </span>{" "}
            the rested team wins{" "}
            <span className="mono font-bold" style={{ color: "var(--term-blue-text)" }}>{claims.reading.ra5.winPct}%</span>,{" "}
            <span className="mono font-bold" style={{ color: "var(--term-blue-text)" }}>
              {signedNumber(claims.reading.ra5.lift)}
            </span>{" "}
            over baseline across{" "}
            <span className="mono tabular-nums">{claims.reading.ra5.games.toLocaleString()}</span> games.
            {claims.reading.beyond && (
              <>
                {" "}{BEYOND_CLAUSE[claims.reading.beyond.relation].lead} RA ≥{" "}
                {claims.reading.beyond.threshold} sits at{" "}
                <span className="mono tabular-nums">{claims.reading.beyond.winPct}%</span> on{" "}
                <span className="mono tabular-nums">{claims.reading.beyond.games.toLocaleString()}</span> games,
                {" "}{BEYOND_CLAUSE[claims.reading.beyond.relation].tail}
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
