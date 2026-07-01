"use client"

import { useState } from "react"
import Image from "next/image"
import useSWR from "swr"
import { format } from "date-fns"
import { NBA_TEAM_IDS } from "@/lib/nba-team-ids"
import { parseSeasonStartYear, regularSeasonDateBounds } from "@/lib/nba-season"
import { apiFetcher } from "@/lib/fetcher"
import { Skeleton } from "@/components/ui/skeleton"
import type { UpcomingGameWithRA } from "@/types"

// ─── Shared styles (terminal) ─────────────────────────────────────

const termCard: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #E2DFD8",
  borderRadius: 4,
  padding: 16,
}

const thStyle: React.CSSProperties = {
  fontFamily: "'Courier New', Courier, monospace",
  fontSize: 10,
  letterSpacing: "0.08em",
  color: "#8A8478",
  fontWeight: 700,
  padding: "8px 10px",
  background: "#F0EEE9",
  borderBottom: "1px solid #E2DFD8",
  textTransform: "uppercase",
}

const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #E2DFD8",
  fontSize: 11,
}

// ─── RA threshold options ──────────────────────────────────────────

const RA_OPTIONS = [
  { label: "All", value: 0 },
  { label: "RA ≥ 2", value: 2 },
  { label: "RA ≥ 3", value: 3 },
  { label: "RA ≥ 5", value: 5 },
  { label: "RA ≥ 7", value: 7 },
]

function nextSeasonLabel(season: string): string {
  const nextStartYear = parseSeasonStartYear(season) + 1
  return `${nextStartYear}-${String(nextStartYear + 1).slice(-2)}`
}

function OffSeasonEmptyState({ nextSeason }: { nextSeason: string }) {
  return (
    <div className="rounded-[4px] border border-[#E2DFD8] border-l-2 border-l-[#C4853C] bg-white px-6 py-10 text-center">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8A8478]">
        REGULAR SEASON COMPLETE
      </p>
      <p className="mt-2 text-base font-medium text-slate-900">See you next season.</p>
      <p className="mt-1 text-xs text-[#8A8478]">
        {nextSeason} season tips off in October.
      </p>
    </div>
  )
}

// ─── Team logo ─────────────────────────────────────────────────────

function TeamLogo({ abbreviation }: { abbreviation: string }) {
  const [error, setError] = useState(false)
  const nbaId = NBA_TEAM_IDS[abbreviation]

  if (!nbaId || error) {
    return (
      <span
        className="mono flex size-6 shrink-0 items-center justify-center bg-[#F0EEE9] text-[9px] font-bold text-slate-500"
        style={{ borderRadius: 2 }}
      >
        {abbreviation}
      </span>
    )
  }

  return (
    <Image
      src={`https://cdn.nba.com/logos/nba/${nbaId}/global/L/logo.svg`}
      alt={`${abbreviation} logo`}
      width={24}
      height={24}
      unoptimized
      className="size-6 shrink-0 object-contain"
      onError={() => setError(true)}
    />
  )
}

// ─── Main component ────────────────────────────────────────────────

export function UpcomingContent() {
  const [raFilter, setRaFilter] = useState(0)

  const season = "2025-26"
  const seasonBounds = regularSeasonDateBounds(season)
  const today = format(new Date(), "yyyy-MM-dd")
  const nextSeason = nextSeasonLabel(season)
  const nextSeasonBounds = regularSeasonDateBounds(nextSeason)
  const isOffSeason =
    today < seasonBounds.from || (today > seasonBounds.to && today < nextSeasonBounds.from)

  const params = new URLSearchParams({ season })
  if (raFilter > 0) params.set("minRA", String(raFilter))
  const swrKey = `/api/games/upcoming?${params}`

  const { data: games, error: swrError, isLoading: loading } = useSWR<UpcomingGameWithRA[]>(
    swrKey,
    apiFetcher,
    { revalidateOnFocus: false }
  )
  const error = swrError ? (swrError instanceof Error ? swrError.message : "Failed to load games") : null

  return (
    <div style={termCard}>
      {/* ── Filter pills ──────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {RA_OPTIONS.map((opt) => {
          const active = raFilter === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => setRaFilter(opt.value)}
              className="mono transition-colors"
              style={{
                background: active ? "#17408B" : "#ffffff",
                color: active ? "#ffffff" : "#0f172a",
                border: `1px solid ${active ? "#17408B" : "#E2DFD8"}`,
                borderRadius: 4,
                padding: "4px 10px",
                fontSize: 11,
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

      {/* ── Game count ────────────────────────────────────────────── */}
      {!loading && !error && games && (
        <p className="mono mb-3" style={{ fontSize: 10, color: "#8A8478", letterSpacing: "0.04em" }}>
          {games.length.toLocaleString()} GAME{games.length !== 1 ? "S" : ""} FOUND
        </p>
      )}

      {/* ── Table ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full bg-[#F0EEE9]" style={{ borderRadius: 4 }} />
          ))}
        </div>
      ) : error ? (
        <div
          className="mono px-6 py-10 text-center"
          style={{
            background: "#ffffff",
            border: "1px solid #E2DFD8",
            borderLeft: "2px solid #C9082A",
            borderRadius: 4,
          }}
        >
          <p style={{ fontSize: 11, letterSpacing: "0.08em", color: "#C9082A", fontWeight: 700 }}>{error}</p>
        </div>
      ) : !games || games.length === 0 ? (
        isOffSeason ? (
          <OffSeasonEmptyState nextSeason={nextSeason} />
        ) : (
          <div
            className="mono px-6 py-12 text-center"
            style={{ border: "1px dashed #E2DFD8", borderRadius: 4, fontSize: 11, color: "#8A8478" }}
          >
            NO SCHEDULED GAMES MATCH THIS FILTER.
          </div>
        )
      ) : (
        <div className="overflow-x-auto">
          <table className="mono w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: "left" }}>Date</th>
                <th style={{ ...thStyle, textAlign: "left" }}>Matchup</th>
                <th style={{ ...thStyle, textAlign: "right" }} className="hidden sm:table-cell">Home Fat.</th>
                <th style={{ ...thStyle, textAlign: "right" }} className="hidden sm:table-cell">Away Fat.</th>
                <th style={{ ...thStyle, textAlign: "center" }}>RA</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Edge</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g, i) => {
                const absDiff = Math.abs(g.restAdvantageDifferential)
                const advAbbr = g.predictedAdvantageAbbreviation
                const isHomeAdv = advAbbr === g.homeTeam.abbreviation

                return (
                  <tr
                    key={g.gameId}
                    className={`transition-colors ${i % 2 === 1 ? "bg-[#F7F6F3]" : "bg-white"} hover:bg-[#F0EEE9]`}
                  >
                    <td style={{ ...tdStyle, color: "#8A8478" }}>
                      {format(new Date(g.date + "T00:00:00"), "MMM d")}
                    </td>
                    <td style={{ ...tdStyle, color: "#0f172a" }}>
                      <div className="flex items-center gap-1.5">
                        <TeamLogo abbreviation={g.awayTeam.abbreviation} />
                        <span style={{ fontWeight: 600 }}>{g.awayTeam.abbreviation}</span>
                        <span style={{ color: "#C9C5BC" }}>@</span>
                        <TeamLogo abbreviation={g.homeTeam.abbreviation} />
                        <span style={{ fontWeight: 600 }}>{g.homeTeam.abbreviation}</span>
                      </div>
                    </td>
                    <td
                      style={{ ...tdStyle, textAlign: "right", color: "#0f172a" }}
                      className="hidden tabular-nums sm:table-cell"
                    >
                      {g.homeFatigueScore !== null ? g.homeFatigueScore.toFixed(1) : "—"}
                    </td>
                    <td
                      style={{ ...tdStyle, textAlign: "right", color: "#0f172a" }}
                      className="hidden tabular-nums sm:table-cell"
                    >
                      {g.awayFatigueScore !== null ? g.awayFatigueScore.toFixed(1) : "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", color: "#0f172a" }} className="tabular-nums">
                      {absDiff.toFixed(1)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <span
                        className="mono inline-flex items-center"
                        style={{
                          background: isHomeAdv ? "#17408B" : "#C9082A",
                          color: "#fff",
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: 2,
                          letterSpacing: "0.04em",
                        }}
                      >
                        {advAbbr} EDGE
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
