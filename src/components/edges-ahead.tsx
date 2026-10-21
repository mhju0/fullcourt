"use client"

import { useEffect, useMemo, useRef } from "react"
import useSWR from "swr"
import { format } from "date-fns"
import { useNow } from "@/hooks/useNow"
import { formatRestAdvantageValue } from "@/lib/rest-advantage-display"
import { compareUpcomingTipOff } from "@/lib/upcoming-rest-edges"
import { hasNotTipped } from "@/lib/game-phase"
import { apiFetcher } from "@/lib/fetcher"
import { defaultNbaSeason } from "@/lib/nba-season"
import { TYPE, termCardStyle } from "@/lib/terminal-styles"
import type { UpcomingGameWithRA } from "@/types"

/** The nearest large rested-home gaps, across dates; clicking keeps the board's date jump. */

const STRIP_SIZE = 3
const RESERVE_SIZE = 6

export function EdgesAhead({
  onJump,
}: {
  onJump: (season: string, date: string) => void
}) {
  const season = defaultNbaSeason()
  const now = useNow()
  const refilled = useRef<string | null>(null)
  const { data: games, mutate } = useSWR<UpcomingGameWithRA[]>(
    `/api/games/upcoming?${new URLSearchParams({ season, minRA: "5", order: "soonest", limit: String(RESERVE_SIZE) })}`,
    apiFetcher,
    { refreshInterval: 60_000, revalidateOnFocus: true, revalidateOnReconnect: true, refreshWhenHidden: false, refreshWhenOffline: false }
  )

  const top = useMemo(() => {
    if (!games || games.length === 0) return []
    return games.filter((game) => hasNotTipped(game.tipOffUtc, now) && Math.abs(game.restAdvantageDifferential) >= 5)
      .sort(compareUpcomingTipOff)
      .slice(0, STRIP_SIZE)
  }, [games, now])

  useEffect(() => {
    if (!games || games.length < RESERVE_SIZE || top.length >= STRIP_SIZE) return
    const signature = games.map((game) => game.gameId).join(",")
    if (refilled.current === signature || document.visibilityState !== "visible" || !navigator.onLine) return
    refilled.current = signature
    void mutate().catch(() => {})
  }, [games, top.length, mutate])

  if (top.length === 0) return null

  return (
    <div className="flex flex-col gap-3" style={termCardStyle}>
      <div className="flex flex-col gap-2">
        <h2 style={{ fontSize: TYPE.emph, fontWeight: 600, color: "var(--term-text)" }}>
          Upcoming large rest edges
        </h2>
        <p style={{ fontSize: TYPE.body, color: "var(--term-text-muted)" }}>
          Rested team at home · gap 5+ · {season}
        </p>
      </div>
      <div className="fc-upcoming-edges flex flex-wrap gap-2">
        {top.map((g) => {
          const dateLabel = format(new Date(g.date + "T00:00:00"), "MMM d, yyyy")
          const value = formatRestAdvantageValue(g.restAdvantageDifferential)
          return (
            <button
              key={g.gameId}
              type="button"
              onClick={() => onJump(g.season, g.date)}
              aria-label={`Jump to ${dateLabel}: ${g.awayTeam.abbreviation} at ${g.homeTeam.abbreviation}, rest edge ${g.predictedAdvantageAbbreviation} ${value}`}
              className="fc-upcoming-edge fc-control-button mono flex flex-wrap items-center gap-x-3 gap-y-1 bg-[var(--term-surface)] px-3 py-2 transition-[background-color,border-color,transform] hover:bg-[var(--term-surface-2)] active:scale-[0.97]"
              style={{ border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}
            >
              <span
                className="fc-upcoming-edge-date tabular-nums"
                style={{ fontSize: TYPE.micro, fontWeight: 600, color: "var(--term-text-muted)" }}
              >
                {dateLabel.toUpperCase()}
              </span>
              <span className="fc-upcoming-edge-game whitespace-nowrap" style={{ fontSize: 12, fontWeight: 600, color: "var(--term-text)" }}>
                {g.awayTeam.abbreviation} @ {g.homeTeam.abbreviation}
              </span>
              {/* Always the rested pole at text grade — the named side is the more-rested
                  side, same law as the RA cell and the old Edge chip. */}
              <span
                className="fc-upcoming-edge-badge whitespace-nowrap tabular-nums"
                style={{
                  background: "var(--term-blue-text)",
                  color: "var(--term-surface)",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "var(--term-radius-sm)",
                }}
              >
                {g.predictedAdvantageAbbreviation} {value}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
