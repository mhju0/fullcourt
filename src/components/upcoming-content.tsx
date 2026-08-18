"use client"

import { useState } from "react"
import useSWR from "swr"
import { format } from "date-fns"
import { TeamLogo } from "@/components/matchup-parts"
import { getTeamColors } from "@/lib/nba-team-colors"
import { currentDisplaySeason, isNbaOffSeason, nextSeasonLabel } from "@/lib/nba-season"
import { apiFetcher, errMsg } from "@/lib/fetcher"
import { useBacktest } from "@/hooks/useBacktest"
import { Skeleton } from "@/components/ui/skeleton"
import { buildRestAdvantageEvidence } from "@/lib/rest-advantage-display"
import { signedNumber } from "@/lib/signed-number"
import { termCardStyle, termDashedEmptyStyle } from "@/lib/terminal-styles"
import { DataTable } from "@/components/ui/data-table"
import type { UpcomingGameWithRA } from "@/types"
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
    <div className="rounded-[4px] border border-[var(--term-border)] border-l-2 border-l-[var(--term-hardwood)] bg-[var(--term-surface)] px-6 py-12 text-center">
      <p className="mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--term-text-muted)]">
        REGULAR SEASON COMPLETE
      </p>
      <p className="mt-2 text-[15px] font-medium text-[var(--term-text)]">See you next season.</p>
      <p className="mt-1 text-xs text-[var(--term-text-muted)]">
        {nextSeason} season tips off in October.
      </p>
    </div>
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
  // has no /api/analysis data to inherit, so it reads its own. A failure here is not
  // surfaced: the table still renders and the historical column reads "—", because a
  // missing hit rate must never take the schedule down with it.
  const { evidenceSource } = useBacktest()

  return (
    <div style={termCardStyle}>
      {/* ── Filter pills ──────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {RA_OPTIONS.map((opt) => {
          const active = raFilter === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => setRaFilter(opt.value)}
              className="mono transition-[background-color,border-color,transform] active:scale-[0.97]"
              style={{
                // Solid ink when active, never the rested-pole teal: the pill is chrome,
                // and only the table's data marks may wear a pole.
                background: active ? "var(--term-text)" : "var(--term-surface)",
                color: active ? "var(--term-surface)" : "var(--term-text)",
                border: `1px solid ${active ? "var(--term-text)" : "var(--term-border)"}`,
                borderRadius: "var(--term-radius)",
                padding: "4px 12px",
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
        <>
        <DataTable
          rows={games}
          rowKey={(g) => g.gameId}
          rowAttrs={(_g, i) => ({
            className: `transition-colors ${i % 2 === 1 ? "bg-[var(--term-bg)]" : "bg-[var(--term-surface)]"} hover:bg-[var(--term-surface-2)]`,
          })}
          columns={[
            {
              label: "Date",
              style: { color: "var(--term-text-muted)" },
              cell: (g) => format(new Date(g.date + "T00:00:00"), "MMM d"),
            },
            {
              label: "Matchup",
              style: { color: "var(--term-text)" },
              cell: (g) => (
                // The shared TeamLogo, not a private copy. This page carried its own until
                // 2026-08-11 — a second adapter at a seam that already existed, and one that
                // could not take a season, so it had no way to resolve era-correct branding
                // even in principle. No `season` is passed because these games are upcoming:
                // the current logo IS the correct one. The point is that the capability now
                // sits one prop away instead of behind a rewrite.
                <div className="flex items-center gap-2">
                  <TeamLogo
                    abbreviation={g.awayTeam.abbreviation}
                    color={getTeamColors(g.awayTeam.abbreviation).primary}
                  />
                  <span style={{ fontWeight: 600 }}>{g.awayTeam.abbreviation}</span>
                  <span style={{ color: "var(--term-hairline)" }}>@</span>
                  <TeamLogo
                    abbreviation={g.homeTeam.abbreviation}
                    color={getTeamColors(g.homeTeam.abbreviation).primary}
                  />
                  <span style={{ fontWeight: 600 }}>{g.homeTeam.abbreviation}</span>
                </div>
              ),
            },
            {
              label: "Home Fat.",
              unit: "fatigue score",
              numeric: true,
              className: "hidden sm:table-cell",
              style: { color: "var(--term-text)" },
              cell: (g) => (g.homeFatigueScore !== null ? g.homeFatigueScore.toFixed(1) : "—"),
            },
            {
              label: "Away Fat.",
              unit: "fatigue score",
              numeric: true,
              className: "hidden sm:table-cell",
              style: { color: "var(--term-text)" },
              cell: (g) => (g.awayFatigueScore !== null ? g.awayFatigueScore.toFixed(1) : "—"),
            },
            {
              label: "RA",
              unit: "fatigue gap",
              numeric: true,
              align: "center",
              style: { color: "var(--term-text)" },
              cell: (g) => Math.abs(g.restAdvantageDifferential).toFixed(1),
            },
            {
              label: "Edge",
              align: "center",
              cell: (g) => (
                <span
                  className="mono inline-flex items-center"
                  style={{
                    // Always the rested pole: the named team is the more-rested side, whichever
                    // side it is. Side-coloring painted a rested visitor in the fatigued hue —
                    // backwards under two-pole semantics (see RaBadge in matchup-parts.tsx).
                    background: "var(--term-blue)",
                    color: "var(--term-surface)",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "4px 8px",
                    borderRadius: "var(--term-radius-sm)",
                    letterSpacing: "0.04em",
                  }}
                >
                  {g.predictedAdvantageAbbreviation} EDGE
                </span>
              ),
            },
            {
              label: "Historically",
              unit: "win rate",
              numeric: true,
              cell: (g) => {
                // The predicted abbreviation is the authoritative side, not the sign of the
                // stored differential — these rows come from `predictions`, which the daily
                // refresh only writes for a home pick, so in practice this is always "home".
                // Stated explicitly anyway: the evidence sentence is denominated on called
                // games, and passing the pair is what keeps that honest if the rule widens.
                const evidence = buildRestAdvantageEvidence(
                  {
                    differential: g.restAdvantageDifferential,
                    advantageTeam:
                      g.predictedAdvantageAbbreviation === g.homeTeam.abbreviation
                        ? "home"
                        : "away",
                  },
                  evidenceSource
                )
                if (!evidence) return <span style={{ color: "var(--term-text-muted)" }}>—</span>
                return (
                  <span className="inline-flex flex-col items-end" style={{ lineHeight: 1.35 }}>
                    {/* The rate and its lift share a line: a rested road team's 42.4% standing
                        alone next to a coloured EDGE chip reads as a pick, where "42.4% +2.3"
                        reads as the measurement it is. */}
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--term-text)" }}>
                      {evidence.winPct.toFixed(1)}%{" "}
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: evidence.lift >= 0 ? "var(--term-blue)" : "var(--term-red)",
                        }}
                      >
                        {signedNumber(evidence.lift)}
                      </span>
                    </span>
                    <span style={{ fontSize: 10, color: "var(--term-text-muted)" }}>
                      {evidence.classLabel} · vs {evidence.baselinePct.toFixed(1)}% · n=
                      {evidence.games.toLocaleString("en-US")}
                    </span>
                  </span>
                )
              },
            },
          ]}
        />
          <p
            className="mt-3"
            style={{ fontSize: 11, lineHeight: 1.5, color: "var(--term-text-muted)" }}
          >
            &ldquo;Historically&rdquo; is how often the more-rested team won across every past
            regular-season game in the matching class, next to how often that side wins from that
            venue <em>regardless</em> of rest — the signed figure is the difference. Visiting teams
            travel, so the rested team is usually the home team; the two venues are counted
            separately for that reason and never pooled. It describes a class of games, not this
            one. Not betting advice.
          </p>
        </>
      )}
    </div>
  )
}
