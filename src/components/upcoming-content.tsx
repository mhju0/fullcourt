"use client"

import { useState } from "react"
import Image from "next/image"
import useSWR from "swr"
import { format } from "date-fns"
import { teamLogoUrl } from "@/lib/team-history"
import { getTeamColors, readableTextOn } from "@/lib/nba-team-colors"
import { currentDisplaySeason, isNbaOffSeason, nextSeasonLabel } from "@/lib/nba-season"
import { apiFetcher, errMsg } from "@/lib/fetcher"
import { Skeleton } from "@/components/ui/skeleton"
import { buildRestAdvantageEvidence } from "@/lib/rest-advantage-display"
import { termCardStyle, termDashedEmptyStyle, termTdStyle as tdStyle, termThStyle as thStyle, termThUnitStyle } from "@/lib/terminal-styles"
import type { AnalysisResponse, UpcomingGameWithRA } from "@/types"
import { MessageCard } from "@/components/ui/message-card"

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
      <p className="mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--term-text-muted)]">
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
  if (error) {
    const bg = getTeamColors(abbreviation).primary
    return (
      <span
        className="mono flex size-6 shrink-0 items-center justify-center text-[10px] font-bold"
        style={{
          borderRadius: "var(--term-radius-sm)",
          background: bg,
          color: readableTextOn(bg),
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)",
        }}
      >
        {abbreviation}
      </span>
    )
  }

  return (
    <Image
      src={teamLogoUrl(abbreviation)}
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
  const error = swrError ? errMsg(swrError) : null

  // Backtest slice that denominates each row's edge. Unlike the home page this component
  // has no /api/analysis data to inherit, so it fetches its own. A failure here is not
  // surfaced: the table still renders and the historical column reads "—", because a
  // missing hit rate must never take the schedule down with it.
  const { data: analysis } = useSWR<AnalysisResponse>("/api/analysis", apiFetcher, {
    revalidateOnFocus: false,
  })
  const evidenceSource = analysis
    ? {
        thresholds: analysis.thresholds,
        overallWinRate: analysis.overallWinRate,
        totalGames: analysis.totalGames,
      }
    : null

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

      {/* ── Game count ────────────────────────────────────────────── */}
      {!loading && !error && games && (
        <p className="mono mb-3" style={{ fontSize: 11, color: "var(--term-text-muted)", letterSpacing: "0.04em" }}>
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
        <MessageCard tone="error" title="FAILED TO LOAD GAMES" body={error} />
      ) : !games || games.length === 0 ? (
        isOffSeason ? (
          <OffSeasonEmptyState nextSeason={nextSeason} />
        ) : (
          <div
            className="mono px-6 py-12 text-center"
            style={termDashedEmptyStyle}
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
                <th style={{ ...thStyle, textAlign: "right" }} className="hidden sm:table-cell">
                  Home Fat.
                  <span style={termThUnitStyle}>fatigue score</span>
                </th>
                <th style={{ ...thStyle, textAlign: "right" }} className="hidden sm:table-cell">
                  Away Fat.
                  <span style={termThUnitStyle}>fatigue score</span>
                </th>
                <th style={{ ...thStyle, textAlign: "center" }}>
                  RA
                  <span style={termThUnitStyle}>fatigue gap</span>
                </th>
                <th style={{ ...thStyle, textAlign: "center" }}>Edge</th>
                <th style={{ ...thStyle, textAlign: "right" }}>
                  Historically
                  <span style={termThUnitStyle}>win rate</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {games.map((g, i) => {
                const absDiff = Math.abs(g.restAdvantageDifferential)
                const advAbbr = g.predictedAdvantageAbbreviation
                const isHomeAdv = advAbbr === g.homeTeam.abbreviation
                const evidence = buildRestAdvantageEvidence(
                  g.restAdvantageDifferential,
                  evidenceSource
                )

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
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "var(--term-radius-sm)",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {advAbbr} EDGE
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }} className="tabular-nums">
                      {evidence ? (
                        <span
                          className="inline-flex flex-col items-end"
                          style={{ lineHeight: 1.35 }}
                        >
                          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--term-text)" }}>
                            {evidence.winPct.toFixed(1)}%
                          </span>
                          <span style={{ fontSize: 10, color: "var(--term-text-muted)" }}>
                            gap {evidence.classLabel} · n={evidence.games.toLocaleString("en-US")}
                          </span>
                        </span>
                      ) : (
                        <span style={{ color: "var(--term-text-muted)" }}>—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p
            className="mt-3"
            style={{ fontSize: 11, lineHeight: 1.5, color: "var(--term-text-muted)" }}
          >
            &ldquo;Historically&rdquo; is how often the more-rested team won across every past
            regular-season game in the matching rest-advantage class, against a 50% coin-flip
            baseline. It describes that class of games, not this one. Not betting advice.
          </p>
        </div>
      )}
    </div>
  )
}
