"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { addDays, format, parseISO } from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { MatchupCard } from "@/components/matchup-card"
import { apiFetcher } from "@/lib/fetcher"
import { useLiveGames } from "@/hooks/useLiveGames"
import {
  defaultNbaCalendarMonth,
  defaultNbaSeason,
  formatLocalDateKey,
  NBA_REGULAR_MONTHS,
  NBA_SEASONS,
  pickDefaultGamesDate,
} from "@/lib/nba-season"
import { cn } from "@/lib/utils"
import type { AnalysisResponse, ApiResponse, GameDateCount, GameResponse } from "@/types"

// ─── Helpers ─────────────────────────────────────────────────────

function pickInitialDate(dates: GameDateCount[]): string | null {
  if (dates.length === 0) return null
  const todayKey = format(new Date(), "yyyy-MM-dd")
  if (dates.some((d) => d.date === todayKey)) return todayKey
  return dates[dates.length - 1].date
}

function filterDatesByMonth(dates: GameDateCount[], month: number): GameDateCount[] {
  const monthKey = String(month).padStart(2, "0")
  return dates.filter((d) => d.date.slice(5, 7) === monthKey)
}

type PendingScope = { season: string; month: number }

const HIGH_CONF_THRESHOLD = 2.0

// Terminal-style flat button: white bg, 1px border, mono uppercase, 4px corners.
const termBtn =
  "mono inline-flex items-center gap-2 bg-white px-3 py-1.5 text-[11px] uppercase tracking-[0.05em] text-slate-700 transition-colors hover:bg-[#F0EEE9]"
const termBtnStyle: React.CSSProperties = { border: "1px solid #E2DFD8", borderRadius: 4 }

// ─── Stat summary row ────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="mono flex flex-col gap-1"
      style={{ background: "#F0EEE9", borderRadius: 4, padding: "10px 12px" }}
    >
      <span style={{ fontSize: 10, letterSpacing: "0.08em", color: "#8A8478", fontWeight: 600 }}>
        {label}
      </span>
      <span className="tabular-nums" style={{ fontSize: 20, fontWeight: 500, color: "#0f172a", lineHeight: 1 }}>
        {value}
      </span>
    </div>
  )
}

function StatSummaryRow({
  gamesToday,
  avgRestAdv,
  seasonWinRate,
  highConfPicks,
}: {
  gamesToday: number
  avgRestAdv: string
  seasonWinRate: string
  highConfPicks: number
}) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <StatCard label="GAMES TODAY" value={String(gamesToday)} />
      <StatCard label="AVG REST ADV" value={avgRestAdv} />
      <StatCard label="SEASON WIN RATE" value={seasonWinRate} />
      <StatCard label="HIGH CONF PICKS" value={String(highConfPicks)} />
    </div>
  )
}

// ─── Section divider ─────────────────────────────────────────────

function SectionDivider({ label, count }: { label: string; count: number }) {
  return (
    <div className="mono flex items-center gap-3 py-2" style={{ fontSize: 10, letterSpacing: "0.08em", color: "#8A8478" }}>
      <span style={{ fontWeight: 700 }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: "#E2DFD8" }} />
      <span style={{ fontWeight: 600 }}>
        {count} {count === 1 ? "GAME" : "GAMES"}
      </span>
    </div>
  )
}

// ─── Skeleton ────────────────────────────────────────────────────

function MatchupRowSkeleton() {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #E2DFD8",
        borderLeft: "2px solid #C4853C",
        borderRadius: 4,
        padding: "10px 14px",
      }}
    >
      <div className="flex items-center gap-4">
        <Skeleton className="h-9 w-[110px] bg-[#F0EEE9]" />
        <Skeleton className="h-9 flex-1 bg-[#F0EEE9]" />
        <Skeleton className="h-9 w-[110px] bg-[#F0EEE9]" />
        <Skeleton className="h-9 w-16 bg-[#F0EEE9]" />
      </div>
    </div>
  )
}

function SkeletonList() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <MatchupRowSkeleton key={i} />
      ))}
    </div>
  )
}

// ─── Empty / error states ─────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <div
      className="mono flex flex-col items-center gap-2 px-6 py-16 text-center"
      style={{ background: "#ffffff", border: "1px solid #E2DFD8", borderRadius: 4 }}
    >
      <p style={{ fontSize: 11, letterSpacing: "0.08em", color: "#0f172a", fontWeight: 700 }}>
        NO GAMES SCHEDULED
      </p>
      <p style={{ fontSize: 10, color: "#8A8478" }}>NO NBA GAMES ON {label.toUpperCase()}</p>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      className="mono flex flex-col items-center gap-2 px-6 py-12 text-center"
      style={{ background: "#ffffff", border: "1px solid #E2DFD8", borderLeft: "2px solid #C9082A", borderRadius: 4 }}
    >
      <p style={{ fontSize: 11, letterSpacing: "0.08em", color: "#C9082A", fontWeight: 700 }}>
        FAILED TO LOAD GAMES
      </p>
      <p style={{ fontSize: 10, color: "#8A8478" }}>{message}</p>
    </div>
  )
}

// ─── Date picker chip ────────────────────────────────────────────

function DateChip({
  day,
  count,
  selected,
  onClick,
  ariaLabel,
}: {
  day: string
  count: number
  selected: boolean
  onClick: () => void
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-current={selected ? "date" : undefined}
      className="mono flex min-w-[3rem] flex-col items-center px-2 py-1.5 transition-colors"
      style={{
        background: selected ? "#17408B" : "#ffffff",
        border: "1px solid #E2DFD8",
        borderLeft: selected ? "2px solid #17408B" : "1px solid #E2DFD8",
        borderRadius: 4,
        color: selected ? "#ffffff" : "#0f172a",
      }}
    >
      <span className="tabular-nums" style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.1 }}>
        {day}
      </span>
      <span className="tabular-nums" style={{ fontSize: 9, color: selected ? "rgba(255,255,255,0.7)" : "#8A8478" }}>
        {count} {count === 1 ? "GM" : "GMS"}
      </span>
    </button>
  )
}

// ─── Page ────────────────────────────────────────────────────────

export default function HomePage() {
  const [season, setSeason] = useState<string>(() => defaultNbaSeason())
  const [month, setMonth] = useState<number>(() => defaultNbaCalendarMonth())
  const [availableDates, setAvailableDates] = useState<GameDateCount[]>([])
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)

  const [loadingDates, setLoadingDates] = useState(true)
  const [errorDates, setErrorDates] = useState<string | null>(null)

  const [games, setGames] = useState<GameResponse[]>([])
  const [loadingGames, setLoadingGames] = useState(false)
  const [errorGames, setErrorGames] = useState<string | null>(null)

  const pendingSelectionResetRef = useRef<PendingScope | null>(null)
  const isFirstDatesFetchRef = useRef(true)
  const initialTodayKeyRef = useRef(formatLocalDateKey())

  const gameIds = useMemo(() => games.map((g) => g.id), [games])
  const { liveUpdates, recentlyUpdated } = useLiveGames(gameIds)

  // Live overall win rate for the stat card — same value /analysis renders,
  // computed from the DB by /api/analysis (0–100, 1 decimal). Isolated from the
  // date/games state machine; shows "—" while loading or if the request fails.
  const { data: analysis } = useSWR<AnalysisResponse>("/api/analysis", apiFetcher, {
    revalidateOnFocus: false,
  })
  const seasonWinRate = analysis ? `${analysis.overallWinRate}%` : "—"

  const clearSelectedDate = useCallback(() => {
    setSelectedDateKey(null)
    setGames([])
    setLoadingGames(false)
    setErrorGames(null)
  }, [])

  const mergedGames =
    Object.keys(liveUpdates).length === 0
      ? games
      : games.map((game) => {
          const update = liveUpdates[game.id]
          if (!update) return game
          return {
            ...game,
            homeScore: update.homeScore ?? game.homeScore,
            awayScore: update.awayScore ?? game.awayScore,
            status: update.status ?? game.status,
          }
        })

  // Sync calendar month tab when the selected day moves across a month boundary.
  if (selectedDateKey) {
    const m = Number(selectedDateKey.slice(5, 7))
    if (NBA_REGULAR_MONTHS.some((x) => x.value === m) && m !== month) {
      setMonth(m)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    queueMicrotask(() => {
      if (!active) return
      setLoadingDates(true)
      setErrorDates(null)
    })

    const isInitialFetch =
      isFirstDatesFetchRef.current && pendingSelectionResetRef.current === null
    const params = new URLSearchParams({ season })
    if (!isInitialFetch) params.set("month", String(month))
    fetch(`/api/games/dates?${params.toString()}`, { signal: controller.signal })
      .then((res) => res.json() as Promise<ApiResponse<GameDateCount[]>>)
      .then(({ data, error: apiError }) => {
        if (apiError) throw new Error(apiError)
        return data
      })
      .then((data) => {
        setAvailableDates(data)
        const pending = pendingSelectionResetRef.current
        const matchesPending =
          pending !== null && pending.season === season && pending.month === month
        if (matchesPending) {
          pendingSelectionResetRef.current = null
          const nextDate = data.length > 0 ? pickInitialDate(data) : null
          if (nextDate) setSelectedDateKey(nextDate)
          else clearSelectedDate()
          return
        }
        if (isFirstDatesFetchRef.current) {
          isFirstDatesFetchRef.current = false
          const nextDate = pickDefaultGamesDate(initialTodayKeyRef.current, data)
          if (nextDate) {
            const nextMonth = Number(nextDate.slice(5, 7))
            setAvailableDates(filterDatesByMonth(data, nextMonth))
            setSelectedDateKey(nextDate)
            if (nextMonth !== month) setMonth(nextMonth)
          } else {
            clearSelectedDate()
          }
          return
        }
        setSelectedDateKey((prev) => {
          if (!prev) return data.length > 0 ? pickInitialDate(data) : null
          const pm = Number(prev.slice(5, 7))
          if (pm === month) return prev
          return prev
        })
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return
        setErrorDates(err instanceof Error ? err.message : "Failed to load dates")
        setAvailableDates([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingDates(false)
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [clearSelectedDate, season, month])

  useEffect(() => {
    if (!selectedDateKey) {
      return
    }

    const controller = new AbortController()
    let active = true

    queueMicrotask(() => {
      if (!active) return
      setLoadingGames(true)
      setErrorGames(null)
    })

    fetch(`/api/games/${selectedDateKey}`, { signal: controller.signal })
      .then((res) => res.json() as Promise<ApiResponse<GameResponse[]>>)
      .then(({ data, error: apiError }) => {
        if (apiError) throw new Error(apiError)
        setGames(data)
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return
        setErrorGames(err instanceof Error ? err.message : "Something went wrong")
        setGames([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingGames(false)
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [selectedDateKey])

  function onSeasonChange(next: string) {
    pendingSelectionResetRef.current = { season: next, month }
    setLoadingDates(true)
    setErrorDates(null)
    setSeason(next)
  }

  function onMonthTabClick(nextMonth: number) {
    // Clear the selected date so the render-time month-sync block (which snaps
    // `month` to whatever month `selectedDateKey` belongs to, to support arrow
    // navigation across month boundaries) does not immediately revert this
    // change. The dates-fetch effect repopulates the selection from the new
    // month's first available day via pendingSelectionResetRef.
    clearSelectedDate()
    pendingSelectionResetRef.current = { season, month: nextMonth }
    setLoadingDates(true)
    setErrorDates(null)
    setMonth(nextMonth)
  }

  function shiftSelectedDay(delta: number) {
    if (!selectedDateKey) return
    const base = parseISO(`${selectedDateKey}T12:00:00`)
    setSelectedDateKey(format(addDays(base, delta), "yyyy-MM-dd"))
  }

  const formattedSelected =
    selectedDateKey !== null
      ? format(parseISO(`${selectedDateKey}T12:00:00`), "EEEE, MMMM d, yyyy")
      : null
  const shortLabel =
    selectedDateKey !== null
      ? format(parseISO(`${selectedDateKey}T12:00:00`), "MMMM d, yyyy")
      : "this date"

  const showGamesError = errorGames !== null
  const showGamesSkeleton = loadingGames && !showGamesError
  const showGamesEmpty =
    !showGamesError && !showGamesSkeleton && selectedDateKey !== null && mergedGames.length === 0

  // Summary metrics for the stat row.
  const gamesToday = mergedGames.length
  const diffs = mergedGames
    .map((g) => Math.abs(g.restAdvantage?.differential ?? 0))
    .filter((d) => d > 0)
  const avgRestAdv =
    diffs.length === 0 ? "0.0" : (diffs.reduce((s, d) => s + d, 0) / diffs.length).toFixed(1)
  const highConfPicks = mergedGames.filter(
    (g) => Math.abs(g.restAdvantage?.differential ?? 0) >= HIGH_CONF_THRESHOLD
  ).length

  return (
    <div className="flex flex-col gap-6">
      {/* Heading */}
      <div className="flex flex-col gap-1">
        <span className="mono" style={{ fontSize: 10, letterSpacing: "0.08em", color: "#C9082A", fontWeight: 700 }}>
          REST ADVANTAGE DASHBOARD
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Today&apos;s Matchups</h1>
        <p className="mono max-w-2xl" style={{ fontSize: 11, color: "#8A8478", lineHeight: 1.5 }}>
          FATIGUE SCORES FOR EVERY NBA GAME. HIGHER DIFFERENTIAL = ONE TEAM CARRYING MORE TRAVEL AND SCHEDULE LOAD.
        </p>
      </div>

      {/* Stat summary row */}
      <StatSummaryRow
        gamesToday={gamesToday}
        avgRestAdv={avgRestAdv}
        seasonWinRate={seasonWinRate}
        highConfPicks={highConfPicks}
      />

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="nba-season" className="mono" style={{ fontSize: 10, letterSpacing: "0.08em", color: "#8A8478", fontWeight: 600 }}>
            SEASON
          </label>
          <select
            id="nba-season"
            value={season}
            onChange={(e) => onSeasonChange(e.target.value)}
            className={cn(termBtn, "max-w-xs cursor-pointer appearance-none pr-8")}
            style={{
              ...termBtnStyle,
              backgroundImage:
                "url('data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%238A8478%27%20stroke-width=%272%27%3E%3Cpath%20d=%27M6%209l6%206%206-6%27/%3E%3C/svg%3E')",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 0.5rem center",
              backgroundSize: "0.75rem",
            }}
          >
            {NBA_SEASONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="mono" style={{ fontSize: 10, letterSpacing: "0.08em", color: "#8A8478", fontWeight: 600 }}>
            MONTH
          </span>
          <div className="-mx-1 overflow-x-auto overflow-y-hidden pb-1 [scrollbar-width:thin]">
            <div className="flex min-w-min gap-1.5 px-1">
              {NBA_REGULAR_MONTHS.map(({ value: m, label }) => {
                const active = month === m
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onMonthTabClick(m)}
                    aria-pressed={active}
                    className={cn(termBtn, "shrink-0")}
                    style={{
                      ...termBtnStyle,
                      background: active ? "#17408B" : "#ffffff",
                      color: active ? "#ffffff" : "#0f172a",
                      borderColor: active ? "#17408B" : "#E2DFD8",
                    }}
                  >
                    {label.toUpperCase()}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {errorDates ? (
          <p className="mono" style={{ fontSize: 11, color: "#C9082A" }} role="alert">
            {errorDates}
          </p>
        ) : loadingDates ? (
          <Skeleton className="h-16 w-full max-w-md bg-[#F0EEE9]" style={{ borderRadius: 4 }} />
        ) : availableDates.length === 0 ? (
          <p className="mono" style={{ fontSize: 11, color: "#8A8478" }}>
            NO GAMES IN THIS MONTH.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="mono" style={{ fontSize: 10, letterSpacing: "0.08em", color: "#8A8478", fontWeight: 600 }}>
              DAYS WITH GAMES
            </span>
            <div className="flex flex-wrap gap-1.5">
              {availableDates.map(({ date: d, gameCount }) => {
                const dayNum = format(parseISO(`${d}T12:00:00`), "d")
                const longLabel = format(parseISO(`${d}T12:00:00`), "MMMM d, yyyy")
                return (
                  <DateChip
                    key={d}
                    day={dayNum}
                    count={gameCount}
                    selected={selectedDateKey === d}
                    onClick={() => setSelectedDateKey(d)}
                    ariaLabel={`${longLabel}, ${gameCount} games`}
                  />
                )
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => shiftSelectedDay(-1)}
            disabled={!selectedDateKey}
            aria-label="Previous day"
            className="bg-white"
            style={{ border: "1px solid #E2DFD8", borderRadius: 4 }}
          >
            <ChevronLeft />
          </Button>
          <p
            className="mono min-w-[12rem] text-center sm:text-left"
            style={{ fontSize: 11, letterSpacing: "0.04em", color: "#0f172a", fontWeight: 600 }}
            data-testid="selected-date-display"
          >
            {formattedSelected?.toUpperCase() ?? "PICK A DATE"}
          </p>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => shiftSelectedDay(1)}
            disabled={!selectedDateKey}
            aria-label="Next day"
            className="bg-white"
            style={{ border: "1px solid #E2DFD8", borderRadius: 4 }}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      {/* Matchups section */}
      <div className="flex flex-col gap-2">
        <SectionDivider label="MATCHUPS" count={mergedGames.length} />

        {showGamesError ? (
          <ErrorState message={errorGames} />
        ) : showGamesSkeleton ? (
          <SkeletonList />
        ) : showGamesEmpty ? (
          <EmptyState label={shortLabel} />
        ) : mergedGames.length > 0 ? (
          <div className="flex flex-col gap-2">
            {mergedGames.map((game, i) => (
              <MatchupCard
                key={game.id}
                game={game}
                index={i}
                isScoreFlashing={recentlyUpdated.has(game.id)}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
