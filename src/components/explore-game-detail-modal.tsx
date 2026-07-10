"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import useSWR from "swr"
import { format, parseISO } from "date-fns"
import { ChevronLeft, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  FatigueDetailColumn,
  GameStatusRow,
  RaBadge,
} from "@/components/matchup-card"
import { getTeamBranding } from "@/lib/team-history"
import { apiFetcher } from "@/lib/fetcher"
import { termInsetStyle } from "@/lib/terminal-styles"
import { cn } from "@/lib/utils"
import type {
  GameDetailResponse,
  GameResponse,
  TeamRecentResultGame,
} from "@/types"

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter((el) => el.offsetParent !== null)
}

function RecentResultsList({
  label,
  items,
  onGameClick,
}: {
  label: string
  items: TeamRecentResultGame[]
  onGameClick: (gameId: number) => void
}) {
  return (
    <div
      className="px-3 py-3"
      style={{ background: "var(--term-surface)", border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}
    >
      <p
        className="mono pb-1.5 text-center uppercase"
        style={{
          fontSize: 10,
          letterSpacing: "0.08em",
          color: "var(--term-text-muted)",
          fontWeight: 700,
          borderBottom: "1px solid var(--term-border)",
        }}
      >
        {label}
      </p>
      {items.length === 0 ? (
        <p className="mono mt-2 text-center" style={{ fontSize: 10, color: "var(--term-text-muted)" }}>
          NO RECENT GAMES
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {items.map((g) => (
            <li
              key={g.gameId}
              role="button"
              tabIndex={0}
              onClick={() => onGameClick(g.gameId)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onGameClick(g.gameId)
                }
              }}
              className="mono flex cursor-pointer flex-wrap items-center justify-between gap-x-2 px-1.5 py-1 transition-colors hover:bg-[var(--term-surface-2)] focus-visible:bg-[var(--term-surface-2)] focus-visible:outline-none"
              style={{ fontSize: 11, color: "var(--term-text)", borderRadius: "var(--term-radius-sm)" }}
              aria-label={`View game details: ${format(parseISO(g.date), "MMM d")} vs ${g.opponentAbbreviation}`}
            >
              <span style={{ color: "var(--term-text-muted)" }}>
                {format(parseISO(g.date), "MMM d")}
                {g.isHome ? " vs " : " @ "}
                <span style={{ fontWeight: 700, color: "var(--term-text)" }}>{g.opponentAbbreviation}</span>
              </span>
              <span className="tabular-nums" style={{ color: "var(--term-text-muted)" }}>
                <span style={{ color: g.won ? "var(--term-pos)" : "var(--term-red)", fontWeight: 700 }}>
                  {g.won ? "W" : "L"}
                </span>{" "}
                {g.teamScore}–{g.opponentScore}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ExploreGameDetailBody({
  game,
  detail,
  onGameClick,
}: {
  game: GameResponse
  detail: GameDetailResponse
  onGameClick: (gameId: number) => void
}) {
  const homeBrand = getTeamBranding(game.homeTeam.abbreviation, game.season, {
    name: game.homeTeam.name,
    city: game.homeTeam.city,
  })
  const awayBrand = getTeamBranding(game.awayTeam.abbreviation, game.season, {
    name: game.awayTeam.name,
    city: game.awayTeam.city,
  })

  return (
    <div className="flex flex-col gap-3">
      <GameStatusRow
        status={game.status}
        homeScore={game.homeScore}
        awayScore={game.awayScore}
      />
      <p
        className="mono text-center"
        style={{ fontSize: 18, fontWeight: 700, color: "var(--term-text)", letterSpacing: "0.04em" }}
      >
        {awayBrand.abbreviation}
        <span className="mx-1.5" style={{ fontWeight: 400, color: "var(--term-hairline)" }}>@</span>
        {homeBrand.abbreviation}
      </p>
      <p className="mono text-center uppercase" style={{ fontSize: 10, color: "var(--term-text-muted)", letterSpacing: "0.04em" }}>
        {format(parseISO(game.date), "EEEE, MMMM d, yyyy")} · {game.season}
      </p>

      <div className="flex justify-center py-0.5">
        <RaBadge
          restAdvantage={game.restAdvantage}
          homeAbbr={homeBrand.abbreviation}
          awayAbbr={awayBrand.abbreviation}
        />
      </div>

      <div className="mt-1 px-3 py-4 sm:px-4" style={termInsetStyle}>
        <p
          className="mono mb-3 text-center uppercase"
          style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--term-text-muted)" }}
        >
          Fatigue breakdown
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FatigueDetailColumn
            label={`Away · ${awayBrand.abbreviation}`}
            fatigue={game.awayFatigue}
          />
          <FatigueDetailColumn
            label={`Home · ${homeBrand.abbreviation}`}
            fatigue={game.homeFatigue}
          />
        </div>
      </div>

      <div>
        <p
          className="mono mb-2 text-center uppercase"
          style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--term-text-muted)" }}
        >
          Recent Games
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <RecentResultsList
            label={`Away · ${awayBrand.abbreviation}`}
            items={detail.awayRecentWeek}
            onGameClick={onGameClick}
          />
          <RecentResultsList
            label={`Home · ${homeBrand.abbreviation}`}
            items={detail.homeRecentWeek}
            onGameClick={onGameClick}
          />
        </div>
      </div>
    </div>
  )
}

export function ExploreGameDetailModal({
  gameId,
  open,
  onOpenChange,
}: {
  gameId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const titleId = useId()

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <ExploreGameDetailModalContent
      key={gameId ?? "none"}
      gameId={gameId}
      onOpenChange={onOpenChange}
      titleId={titleId}
    />,
    document.body
  )
}

function ExploreGameDetailModalContent({
  gameId,
  onOpenChange,
  titleId,
}: {
  gameId: number | null
  onOpenChange: (open: boolean) => void
  titleId: string
}) {
  // Navigation stack: history of game IDs to go back to
  const [navHistory, setNavHistory] = useState<number[]>([])
  // Currently displayed game ID (may differ from the `gameId` prop when drilling down)
  const [activeGameId, setActiveGameId] = useState<number | null>(gameId)

  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<Element | null>(null)

  // SWR fetches game detail only when this already-open modal has an ID.
  const swrKey = activeGameId !== null ? `/api/game/${activeGameId}` : null
  const {
    data: detail,
    error: swrError,
    isLoading: loading,
  } = useSWR<GameDetailResponse>(swrKey, apiFetcher, { revalidateOnFocus: false })
  const error = swrError
    ? (swrError instanceof Error ? swrError.message : "Failed to load")
    : null

  const navigateTo = useCallback(
    (id: number) => {
      if (activeGameId !== null) {
        setNavHistory((prev) => [...prev, activeGameId])
      }
      setActiveGameId(id)
    },
    [activeGameId]
  )

  const goBack = useCallback(() => {
    if (navHistory.length === 0) return
    setActiveGameId(navHistory[navHistory.length - 1])
    setNavHistory((prev) => prev.slice(0, -1))
  }, [navHistory])

  const onBackdrop = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  // Capture the trigger on mount, move focus into the modal, and restore
  // focus to the trigger when the modal unmounts.
  useEffect(() => {
    triggerRef.current = document.activeElement
    const first = dialogRef.current
      ? getFocusableElements(dialogRef.current)[0]
      : undefined
    first?.focus()
    return () => {
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus()
      }
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false)
        return
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = getFocusableElements(dialogRef.current)
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onOpenChange])

  if (typeof document === "undefined") return null

  const game = detail?.game
  const canGoBack = navHistory.length > 0

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/50"
        onClick={onBackdrop}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative z-[101] max-h-[min(90vh,720px)] w-full max-w-lg overflow-y-auto p-4 shadow-2xl",
          "sm:p-5"
        )}
        style={{
          background: "var(--term-surface)",
          border: "1px solid var(--term-border)",
          borderRadius: "var(--term-radius)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {canGoBack && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 rounded-full px-2 text-xs text-slate-500 hover:text-slate-800"
                onClick={goBack}
                aria-label="Back to previous game"
              >
                <ChevronLeft className="size-3" />
                Back
              </Button>
            )}
            <h2
              id={titleId}
              className={cn("mono uppercase", canGoBack && "sr-only")}
              style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--term-text-muted)" }}
            >
              Game details
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 rounded-full"
            onClick={() => onOpenChange(false)}
            aria-label="Close dialog"
          >
            <X className="size-4" />
          </Button>
        </div>

        {loading && (
          <p className="mono py-8 text-center" style={{ fontSize: 11, color: "var(--term-text-muted)", letterSpacing: "0.06em" }}>
            LOADING…
          </p>
        )}
        {error && (
          <p className="mono py-6 text-center" style={{ fontSize: 11, color: "var(--term-red)", letterSpacing: "0.06em" }}>
            {error}
          </p>
        )}
        {!loading && !error && game && detail && (
          <ExploreGameDetailBody
            game={game}
            detail={detail}
            onGameClick={navigateTo}
          />
        )}
      </div>
    </div>
  )
}
