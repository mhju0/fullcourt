"use client"

import { useState } from "react"
import Image from "next/image"
import useSWR from "swr"
import { format } from "date-fns"
import { NBA_TEAM_IDS } from "@/lib/nba-team-ids"
import { getTeamColors } from "@/lib/nba-team-colors"
import { currentDisplaySeason, isNbaOffSeason, nextSeasonLabel } from "@/lib/nba-season"
import { apiFetcher } from "@/lib/fetcher"
import { Skeleton } from "@/components/ui/skeleton"
import { termCardStyle, termThStyle as thStyle, termTdStyle as tdStyle } from "@/lib/terminal-styles"
import type { UpcomingGameWithRA } from "@/types"

// ─── RA threshold options ──────────────────────────────────────────

const RA_OPTIONS = [
  { label: "All", value: 0 },
  { label: "RA ≥ 2", value: 2 },
  { label: "RA ≥ 3", value: 3 },
  { label: "RA ≥ 5", value: 5 },
  { label: "RA ≥ 7", value: 7 },
]

function OffSeasonEmptyState({ nextSeason }: { nextSeason: string }) {
  return (
    <div className="rounded-[4px] border border-[var(--term-border)] border-l-2 border-l-[var(--term-hardwood)] bg-[var(--term-surface)] px-6 py-10 text-center">
      <p className="mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--term-text-muted)]">
        REGULAR SEASON COMPLETE
      </p>
      <p className="mt-2 text-base font-medium text-[var(--term-text)]">See you next season.</p>
      <p className="mt-1 text-xs text-[var(--term-text-muted)]">
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
        className="mono flex size-6 shrink-0 items-center justify-center text-[9px] font-bold text-white"
        style={{
          borderRadius: "var(--term-radius-sm)",
          background: getTeamColors(abbreviation).primary,
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.14)",
        }}
      >
        {abbreviation}
      </span>
    )
  }

  return (
    <Image
      src={`https://cdn.nba.com/logos/nba/${nbaId}/primary/D/logo.svg`}
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

  const season = currentDisplaySeason()
  const nextSeason = nextSeasonLabel(season)
  const isOffSeason = isNbaOffSeason()

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
    <div style={termCardStyle}>
      {/* ── Filter pills ──────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {RA_OPTIONS.map((opt) => {
          const active = raFilter === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => setRaFilter(opt.value)}
              className="mono transition-[background-color,border-color,transform] active:scale-[0.97]"
              style={{
                background: active ? "var(--term-blue)" : "var(--term-surface)",
                color: active ? "var(--term-surface)" : "var(--term-text)",
                border: `1px solid ${active ? "var(--term-blue)" : "var(--term-border)"}`,
                borderRadius: "var(--term-radius)",
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
        <p className="mono mb-3" style={{ fontSize: 10, color: "var(--term-text-muted)", letterSpacing: "0.04em" }}>
          {games.length.toLocaleString()} GAME{games.length !== 1 ? "S" : ""} FOUND
        </p>
      )}

      {/* ── Table ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
          ))}
        </div>
      ) : error ? (
        <div
          className="mono px-6 py-10 text-center"
          style={{
            background: "var(--term-surface)",
            border: "1px solid var(--term-border)",
            borderLeft: "2px solid var(--term-red)",
            borderRadius: "var(--term-radius)",
          }}
        >
          <p style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-red)", fontWeight: 700 }}>{error}</p>
        </div>
      ) : !games || games.length === 0 ? (
        isOffSeason ? (
          <OffSeasonEmptyState nextSeason={nextSeason} />
        ) : (
          <div
            className="mono px-6 py-12 text-center"
            style={{ border: "1px dashed var(--term-border)", borderRadius: "var(--term-radius)", fontSize: 11, color: "var(--term-text-muted)" }}
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
                    className={`transition-colors ${i % 2 === 1 ? "bg-[var(--term-bg)]" : "bg-[var(--term-surface)]"} hover:bg-[var(--term-surface-2)]`}
                  >
                    <td style={{ ...tdStyle, color: "var(--term-text-muted)" }}>
                      {format(new Date(g.date + "T00:00:00"), "MMM d")}
                    </td>
                    <td style={{ ...tdStyle, color: "var(--term-text)" }}>
                      <div className="flex items-center gap-1.5">
                        <TeamLogo abbreviation={g.awayTeam.abbreviation} />
                        <span style={{ fontWeight: 600 }}>{g.awayTeam.abbreviation}</span>
                        <span style={{ color: "var(--term-hairline)" }}>@</span>
                        <TeamLogo abbreviation={g.homeTeam.abbreviation} />
                        <span style={{ fontWeight: 600 }}>{g.homeTeam.abbreviation}</span>
                      </div>
                    </td>
                    <td
                      style={{ ...tdStyle, textAlign: "right", color: "var(--term-text)" }}
                      className="hidden tabular-nums sm:table-cell"
                    >
                      {g.homeFatigueScore !== null ? g.homeFatigueScore.toFixed(1) : "—"}
                    </td>
                    <td
                      style={{ ...tdStyle, textAlign: "right", color: "var(--term-text)" }}
                      className="hidden tabular-nums sm:table-cell"
                    >
                      {g.awayFatigueScore !== null ? g.awayFatigueScore.toFixed(1) : "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", color: "var(--term-text)" }} className="tabular-nums">
                      {absDiff.toFixed(1)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <span
                        className="mono inline-flex items-center"
                        style={{
                          background: isHomeAdv ? "var(--term-blue)" : "var(--term-red)",
                          color: "var(--term-surface)",
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "var(--term-radius-sm)",
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
