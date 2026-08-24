"use client"

import { useState } from "react"
import useSWR from "swr"
import { format } from "date-fns"
import { TeamLogo } from "@/components/matchup-parts"
import { getTeamColors } from "@/lib/nba-team-colors"
import {
  currentDisplaySeason,
  defaultNbaSeason,
  isNbaOffSeason,
  nextSeasonLabel,
} from "@/lib/nba-season"
import { apiFetcher, errMsg } from "@/lib/fetcher"
import { useBacktest } from "@/hooks/useBacktest"
import { Skeleton } from "@/components/ui/skeleton"
import { buildRestAdvantageEvidence } from "@/lib/rest-advantage-display"
import { signedNumber } from "@/lib/signed-number"
import { LEAD, termCardStyle, termDashedEmptyStyle, TRACK, TYPE } from "@/lib/terminal-styles"
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

/**
 * Nothing ahead — but for one of two different reasons, and they are not interchangeable.
 *
 * `awaitingSchedule` means the season being asked about has not started *and* carries no games
 * yet, i.e. the league has not published it. Saying "regular season complete" there is simply
 * false, and naming `nextSeasonLabel(season)` names a season two years out.
 */
function NoUpcomingGames({
  season,
  awaitingSchedule,
}: {
  season: string
  awaitingSchedule: boolean
}) {
  return (
    <div className="rounded-[4px] border border-[var(--term-border)] border-l-2 border-l-[var(--term-hardwood)] bg-[var(--term-surface)] px-6 py-12 text-center">
      <p className="mono text-[11px] font-semibold uppercase tracking-label text-[var(--term-text-muted)]">
        {awaitingSchedule ? "SCHEDULE NOT PUBLISHED" : "REGULAR SEASON COMPLETE"}
      </p>
      <p className="mt-2 text-body font-medium text-[var(--term-text)]">
        {awaitingSchedule ? "Nothing to show yet." : "See you next season."}
      </p>
      <p className="mt-1 text-xs text-[var(--term-text-muted)]">
        {season} season tips off in October.
      </p>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────

export function UpcomingContent() {
  const [raFilter, setRaFilter] = useState(0)

  // `defaultNbaSeason()`, not `currentDisplaySeason()`. They diverge for two months a year and
  // this tab is on the wrong side of it: through August and September `currentDisplaySeason()`
  // still names the season that just ended, so "upcoming" asked for a season with no game left
  // ahead of it and rendered "see you next season" over a schedule that had already been
  // published. `defaultNbaSeason()` names the season whose games are actually ahead, which is
  // the same season the board opens on, and from October the two agree again.
  const season = defaultNbaSeason()
  const isOffSeason = isNbaOffSeason()
  // Are we looking past the season the calendar is in? Then an empty result means the schedule
  // has not been published, not that basketball is over.
  const awaitingSchedule = season > currentDisplaySeason()
  // The season the empty card should name: the one we are waiting on either way.
  const waitingOn = awaitingSchedule ? season : nextSeasonLabel(season)

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

      {/* ── Game count ────────────────────────────────────────────── */}
      {!loading && !error && games && (
        <p className="mono mb-3" style={{ fontSize: 11, color: "var(--term-text-muted)", letterSpacing: TRACK.sub }}>
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
          <NoUpcomingGames season={waitingOn} awaitingSchedule={awaitingSchedule} />
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
              // Annotated where the gap was read off the published schedule rather than
              // measured from played basketball — an unplayed game sits earlier in the season,
              // so the previous game's overtime and margin can still move it. Every other
              // input is already fixed. See src/lib/fatigue-provenance.ts.
              cell: (g) => (
                <span className="inline-flex flex-col items-center" style={{ lineHeight: LEAD.label }}>
                  <span>{Math.abs(g.restAdvantageDifferential).toFixed(1)}</span>
                  {g.projectedFatigue && (
                    <span
                      style={{
                        fontSize: TYPE.micro,
                        fontWeight: 600,
                        letterSpacing: TRACK.sub,
                        color: "var(--term-text-muted)",
                      }}
                    >
                      PROJ
                    </span>
                  )}
                </span>
              ),
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
                    // Text grade, not the pole hue: 11px white text on the chip needs 4.5:1.
                    background: "var(--term-blue-text)",
                    color: "var(--term-surface)",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "4px 8px",
                    borderRadius: "var(--term-radius-sm)",
                    letterSpacing: TRACK.sub,
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
                  <span className="inline-flex flex-col items-end" style={{ lineHeight: LEAD.label }}>
                    {/* The rate and its lift share a line: a rested road team's 42.4% standing
                        alone next to a coloured EDGE chip reads as a pick, where "42.4% +2.3"
                        reads as the measurement it is. */}
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--term-text)" }}>
                      {evidence.winPct.toFixed(1)}%{" "}
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: evidence.lift >= 0 ? "var(--term-blue-text)" : "var(--term-red-text)",
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
            style={{ fontSize: 11, lineHeight: LEAD.body, color: "var(--term-text-muted)" }}
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
