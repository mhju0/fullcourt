"use client"

import { useMemo } from "react"
import useSWR from "swr"
import { format } from "date-fns"
import { apiFetcher } from "@/lib/fetcher"
import { defaultNbaSeason } from "@/lib/nba-season"
import { TRACK, TYPE, termCardStyle } from "@/lib/terminal-styles"
import type { UpcomingGameWithRA } from "@/types"

/**
 * EDGES AHEAD (2026-08-28 redesign, Q16): the three biggest upcoming rest edges, one
 * line each. This is what survived the UPCOMING view's retirement — the one job a date
 * picker cannot do is cut ACROSS dates, and three rows do that job where a whole second
 * table shape used to. Clicking a game jumps the board to its date.
 *
 * Silent by design in every state that is not "here are edges": while loading, on error,
 * and when nothing lies ahead (off-season, schedule not yet published) the strip simply
 * does not exist. A failure to rank future games must never take the schedule down.
 */

const STRIP_SIZE = 3

export function EdgesAhead({
  onJump,
}: {
  onJump: (season: string, date: string) => void
}) {
  const season = defaultNbaSeason()
  const { data: games } = useSWR<UpcomingGameWithRA[]>(
    `/api/games/upcoming?${new URLSearchParams({ season })}`,
    apiFetcher,
    { revalidateOnFocus: false }
  )

  const top = useMemo(() => {
    if (!games || games.length === 0) return []
    return [...games]
      .sort(
        (a, b) =>
          Math.abs(b.restAdvantageDifferential) - Math.abs(a.restAdvantageDifferential) ||
          a.date.localeCompare(b.date) ||
          a.gameId - b.gameId
      )
      .slice(0, STRIP_SIZE)
  }, [games])

  if (top.length === 0) return null

  return (
    <div className="flex flex-col gap-3" style={termCardStyle}>
      <span
        className="mono uppercase"
        style={{ fontSize: 10, letterSpacing: TRACK.label, fontWeight: 700, color: "var(--term-text-muted)" }}
      >
        EDGES AHEAD · BIGGEST REST GAPS ON THE SCHEDULE
      </span>
      <div className="flex flex-wrap gap-2">
        {top.map((g) => {
          const dateLabel = format(new Date(g.date + "T00:00:00"), "MMM d")
          const value = Math.abs(g.restAdvantageDifferential).toFixed(1)
          return (
            <button
              key={g.gameId}
              type="button"
              onClick={() => onJump(g.season, g.date)}
              aria-label={`Jump to ${dateLabel}: ${g.awayTeam.abbreviation} at ${g.homeTeam.abbreviation}, rest edge ${g.predictedAdvantageAbbreviation} ${value}`}
              className="mono flex items-center gap-3 bg-[var(--term-surface)] px-3 py-2 transition-[background-color,border-color,transform] hover:bg-[var(--term-surface-2)] active:scale-[0.97]"
              style={{ border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}
            >
              <span
                className="tabular-nums"
                style={{ fontSize: TYPE.micro, letterSpacing: TRACK.sub, fontWeight: 600, color: "var(--term-text-muted)" }}
              >
                {dateLabel.toUpperCase()}
              </span>
              <span style={{ fontSize: 12, letterSpacing: TRACK.data, fontWeight: 600, color: "var(--term-text)" }}>
                {g.awayTeam.abbreviation} @ {g.homeTeam.abbreviation}
              </span>
              {/* Always the rested pole at text grade — the named side is the more-rested
                  side, same law as the RA cell and the old Edge chip. */}
              <span
                className="tabular-nums"
                style={{
                  background: "var(--term-blue-text)",
                  color: "var(--term-surface)",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: TRACK.sub,
                  padding: "2px 8px",
                  borderRadius: "var(--term-radius-sm)",
                }}
              >
                {g.predictedAdvantageAbbreviation} {value}
              </span>
              {g.projectedFatigue && (
                <span
                  style={{ fontSize: TYPE.micro, fontWeight: 600, letterSpacing: TRACK.sub, color: "var(--term-text-muted)" }}
                >
                  PROJ
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
