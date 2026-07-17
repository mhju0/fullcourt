"use client"

import { useCallback, useRef, useState } from "react"
import {
  BarChart,
  Bar,
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
import { Skeleton } from "@/components/ui/skeleton"
import { apiFetcher } from "@/lib/fetcher"
import { NBA_SEASONS } from "@/lib/nba-season"
import { termCardStyle } from "@/lib/terminal-styles"
import type {
  AnalysisResponse,
  GameSearchResponse,
} from "@/types"

// ─── Shared styles (terminal) ─────────────────────────────────────

const termTooltip: React.CSSProperties = {
  background: "var(--term-surface)",
  border: "1px solid var(--term-border)",
  borderRadius: "var(--term-radius)",
  padding: "8px 10px",
  fontFamily: "'Courier New', Courier, monospace",
  fontSize: 12,
}

const exploreSelectStyle: React.CSSProperties = {
  background: "var(--term-surface)",
  border: "1px solid var(--term-border)",
  borderRadius: "var(--term-radius)",
  padding: "6px 10px",
  fontSize: 12,
  fontFamily: "'Courier New', Courier, monospace",
  color: "var(--term-text)",
  letterSpacing: "0.04em",
}

const exploreThStyle: React.CSSProperties = {
  fontFamily: "'Courier New', Courier, monospace",
  fontSize: 11,
  letterSpacing: "0.08em",
  color: "var(--term-text-muted)",
  fontWeight: 700,
  padding: "8px 10px",
  background: "var(--term-surface-2)",
  borderBottom: "1px solid var(--term-border)",
  textTransform: "uppercase",
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

// ─── Stat card (matches page.tsx pattern) ─────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent = "var(--term-hardwood)",
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
        borderLeft: `2px solid ${accent}`,
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

// ─── Chart datum shapes ───────────────────────────────────────────

type WinRateDatum = {
  label: string
  winPct: number
  games: number
  threshold?: number
}

// ─── Custom tooltips ──────────────────────────────────────────────

function WinRateTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as WinRateDatum
  return (
    <div style={termTooltip}>
      <p style={{ color: "var(--term-text)", fontWeight: 700, letterSpacing: "0.04em" }}>{d.label.toUpperCase()}</p>
      {payload.map((p) => (
        <p key={p.dataKey as string} style={{ color: p.color, marginTop: 2 }}>
          WIN RATE:{" "}
          <span style={{ fontWeight: 700 }}>{typeof p.value === "number" ? p.value : "--"}%</span>
        </p>
      ))}
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
}

function SeasonWinRateTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as SeasonWinRateDatum
  return (
    <div style={termTooltip}>
      <p style={{ color: "var(--term-text)", fontWeight: 700, letterSpacing: "0.04em" }}>{d.label}</p>
      <p style={{ marginTop: 2, color: "var(--term-blue)" }}>
        WIN RATE: <span style={{ fontWeight: 700 }}>{d.winPct}%</span>
      </p>
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
  }))

  return (
    <div className="mt-4 h-72 min-w-0">
      {loading ? (
        <Skeleton className="h-full w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
      ) : chartData.length === 0 ? (
        <div
          className="mono flex h-full items-center justify-center"
          style={{ border: "1px dashed var(--term-border)", borderRadius: "var(--term-radius)", fontSize: 12, color: "var(--term-text-muted)" }}
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
              tick={{ fontSize: 11, fill: "var(--term-text-muted)", fontFamily: "'Courier New', Courier, monospace" }}
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={-32}
              textAnchor="end"
              height={52}
            />
            <YAxis
              domain={[40, 70]}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 12, fill: "var(--term-text-muted)", fontFamily: "'Courier New', Courier, monospace" }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              cursor={{ fill: "rgba(23,64,139,0.06)" }}
              content={(props: TooltipContentProps) => <SeasonWinRateTooltip {...props} />}
            />
            <ReferenceLine
              y={50}
              stroke="var(--term-red)"
              strokeDasharray="4 4"
              strokeOpacity={0.55}
              label={{
                value: "COIN FLIP",
                position: "insideTopRight",
                fontSize: 11,
                fill: "var(--term-red)",
                opacity: 0.8,
              }}
            />
            <Bar
              dataKey="winPct"
              fill="var(--term-blue)"
              radius={[0, 0, 0, 0]}
              maxBarSize={48}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="games"
                position="top"
                formatter={(v: string | number | boolean | null | undefined) =>
                  typeof v === "number" ? `n=${v.toLocaleString()}` : ""
                }
                style={{ fontSize: "11px", fill: "var(--term-text-muted)", fontFamily: "'Courier New', Courier, monospace" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────

function AnalysisSkeleton() {
  return (
    <div className="flex flex-col gap-4">
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

const PAGE_SIZE = 20

// ─── Explore Games sub-component ──────────────────────────────────

type DrillSignal = { threshold: number; token: number } | null

function ExploreGames({
  exploreRef,
  drillSignal,
}: {
  exploreRef: React.RefObject<HTMLDivElement | null>
  drillSignal: DrillSignal
}) {
  const [raFilter, setRaFilter] = useState(drillSignal?.threshold ?? 0)
  const [teamFilter, setTeamFilter] = useState("")
  const [seasonFilter, setSeasonFilter] = useState("")
  const [resultFilter, setResultFilter] = useState<"all" | "correct" | "incorrect">("all")
  const [page, setPage] = useState(1)
  const [detailGameId, setDetailGameId] = useState<number | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [appliedDrillToken, setAppliedDrillToken] = useState(drillSignal?.token ?? 0)

  // Applies a chart-bar drill-down exactly once per click, keyed on `token`
  // (not the threshold value) so a repeat click on the same bar still applies,
  // and so it never re-fires and fights a later dropdown change or CLEAR FILTERS.
  if (drillSignal && drillSignal.token !== appliedDrillToken) {
    setAppliedDrillToken(drillSignal.token)
    setRaFilter(drillSignal.threshold)
    setPage(1)
  }

  const searchParams = new URLSearchParams()
  if (raFilter > 0) searchParams.set("minRA", String(raFilter))
  if (teamFilter) searchParams.set("team", teamFilter)
  if (seasonFilter) searchParams.set("season", seasonFilter)
  if (resultFilter !== "all") searchParams.set("result", resultFilter)
  searchParams.set("page", String(page))
  searchParams.set("limit", String(PAGE_SIZE))
  const searchKey = `/api/games/search?${searchParams}`

  const { data: searchData, error: searchError, isLoading: loading } = useSWR<GameSearchResponse>(
    searchKey,
    apiFetcher,
    { revalidateOnFocus: false, keepPreviousData: true }
  )
  const results = searchData?.games ?? []
  const total = searchData?.total ?? 0
  const error = searchError
    ? (searchError instanceof Error ? searchError.message : "Failed to load games")
    : null

  const handleRaChange = useCallback((v: number) => {
    setRaFilter(v)
    setPage(1)
  }, [])
  const handleTeamChange = useCallback((v: string) => {
    setTeamFilter(v)
    setPage(1)
  }, [])
  const handleSeasonChange = useCallback((v: string) => {
    setSeasonFilter(v)
    setPage(1)
  }, [])
  const handleResultChange = useCallback((v: "all" | "correct" | "incorrect") => {
    setResultFilter(v)
    setPage(1)
  }, [])

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const start = (page - 1) * PAGE_SIZE + 1
  const end = Math.min(page * PAGE_SIZE, total)

  const openDetail = useCallback((id: number) => {
    setDetailGameId(id)
    setDetailOpen(true)
  }, [])

  return (
    <div ref={exploreRef} style={termCardStyle}>
      <ExploreGameDetailModal
        gameId={detailGameId}
        open={detailOpen}
        onOpenChange={(next) => {
          setDetailOpen(next)
          if (!next) setDetailGameId(null)
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
          onChange={(e) => handleRaChange(Number(e.target.value))}
          style={exploreSelectStyle}
          aria-label="Rest advantage filter"
        >
          {RA_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={teamFilter}
          onChange={(e) => handleTeamChange(e.target.value)}
          style={exploreSelectStyle}
          aria-label="Team filter"
        >
          <option value="">All Teams</option>
          {NBA_TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={seasonFilter}
          onChange={(e) => handleSeasonChange(e.target.value)}
          style={exploreSelectStyle}
          aria-label="Season filter"
        >
          <option value="">All Seasons</option>
          {EXPLORE_SEASON_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={resultFilter}
          onChange={(e) => handleResultChange(e.target.value as "all" | "correct" | "incorrect")}
          style={exploreSelectStyle}
          aria-label="Result filter"
        >
          <option value="all">All Results</option>
          <option value="correct">Rested Team Won</option>
          <option value="incorrect">Rested Team Lost</option>
        </select>

        {(raFilter > 0 || teamFilter || seasonFilter || resultFilter !== "all") && (
          <button
            onClick={() => {
              setRaFilter(0)
              setTeamFilter("")
              setSeasonFilter("")
              setResultFilter("all")
              setPage(1)
            }}
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
              <th style={{ ...exploreThStyle, textAlign: "left" }}>Date</th>
              <th style={{ ...exploreThStyle, textAlign: "left" }}>Matchup</th>
              <th style={{ ...exploreThStyle, textAlign: "right" }} className="hidden sm:table-cell">Home Fat.</th>
              <th style={{ ...exploreThStyle, textAlign: "right" }} className="hidden sm:table-cell">Away Fat.</th>
              <th style={{ ...exploreThStyle, textAlign: "center" }}>RA</th>
              <th style={{ ...exploreThStyle, textAlign: "center" }} className="hidden sm:table-cell">Score</th>
              <th style={{ ...exploreThStyle, textAlign: "center" }}>Result</th>
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
                    className="hover:bg-[var(--term-surface-2)] focus-visible:bg-[var(--term-surface-2)] focus-visible:outline-none"
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
              onClick={() => setPage((p) => Math.max(1, p - 1))}
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
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
  const error = swrError
    ? (swrError instanceof Error ? swrError.message : "Failed to load analysis")
    : null

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
      <div
        className="mono px-6 py-12 text-center"
        style={{ ...termCardStyle, borderLeft: "2px solid var(--term-red)" }}
      >
        <p style={{ fontSize: 12, letterSpacing: "0.08em", color: "var(--term-red)", fontWeight: 700 }}>
          FAILED TO LOAD ANALYSIS
        </p>
        <p className="mt-1" style={{ fontSize: 11, color: "var(--term-text-muted)" }}>
          {error ?? "UNKNOWN ERROR"}
        </p>
      </div>
    )
  }

  const barData: WinRateDatum[] = data.thresholds.map((t) => ({
    label: `RA ≥ ${t.threshold}`,
    winPct: t.winPct,
    games: t.games,
    threshold: t.threshold,
  }))

  const ra5 = data.thresholds.find((t) => t.threshold === 5)
  const ra7 = data.thresholds.find((t) => t.threshold === 7)

  const winRateTooltipRenderer = (props: TooltipContentProps) => (
    <WinRateTooltip {...props} />
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Eyebrow heading */}
      <div className="flex flex-col gap-1">
        <span className="mono" style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-red)", fontWeight: 700 }}>
          HISTORICAL BACKTEST
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--term-text)]">Rest Advantage Analysis</h1>
        <p className="mono max-w-2xl" style={{ fontSize: 12, color: "var(--term-text-muted)", lineHeight: 1.5 }}>
          AMONG FINAL REGULAR-SEASON GAMES WITH FATIGUE DATA, DID THE MORE-RESTED TEAM WIN?
          THIS DOES NOT READ STORED PREDICTION ROWS.
        </p>
      </div>

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
          accent="var(--term-hardwood)"
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
                tick={{ fontSize: 12, fill: "var(--term-text-muted)", fontFamily: "'Courier New', Courier, monospace" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[45, 75]}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 12, fill: "var(--term-text-muted)", fontFamily: "'Courier New', Courier, monospace" }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                cursor={{ fill: "rgba(23,64,139,0.06)" }}
                content={winRateTooltipRenderer}
              />
              <ReferenceLine
                y={50}
                stroke="var(--term-red)"
                strokeDasharray="4 4"
                strokeOpacity={0.55}
                label={{
                  value: "COIN FLIP",
                  position: "insideTopRight",
                  fontSize: 11,
                  fill: "var(--term-red)",
                  opacity: 0.8,
                }}
              />
              <Bar
                dataKey="winPct"
                fill="var(--term-blue)"
                radius={[0, 0, 0, 0]}
                maxBarSize={72}
                style={{ cursor: "pointer" }}
                onClick={handleBarClick}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="games"
                  position="top"
                  formatter={(v: string | number | boolean | null | undefined) =>
                    typeof v === "number" ? `n=${v.toLocaleString()}` : ""
                  }
                  style={{ fontSize: "11px", fill: "var(--term-text-muted)", fontFamily: "'Courier New', Courier, monospace" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
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
