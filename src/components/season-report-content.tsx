"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { SeasonSelector } from "@/components/season-selector"
import { Skeleton } from "@/components/ui/skeleton"
import { apiFetcher } from "@/lib/fetcher"
import { NBA_SEASONS } from "@/lib/nba-season"
import {
  allSeasonNormExcluding,
  seasonReportVerdict,
  type SeasonReportRate,
  type SeasonReportResponse,
  type SeasonReportVerdict,
} from "@/lib/season-report"
import { termCardStyle } from "@/lib/terminal-styles"
import type { AnalysisResponse } from "@/types"

// The newest season with data, which is the current one by construction: NBA_SEASONS is
// derived from the ET date. No separate "is it the current season" question to get wrong.
const LATEST_SEASON = NBA_SEASONS[NBA_SEASONS.length - 1]

/** One decimal with a sign, for a swing or a gap. */
function signedPct(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}`
}

function Tile({
  label,
  value,
  sub,
  accent = "var(--term-neutral)",
  testId,
}: {
  label: string
  value: string
  sub: string
  accent?: string
  testId?: string
}) {
  return (
    <div
      className="mono flex flex-col gap-2"
      style={{
        background: "var(--term-surface)",
        border: "1px solid var(--term-border)",
        borderTop: `2px solid ${accent}`,
        borderRadius: "var(--term-radius)",
        padding: "14px 14px 16px",
      }}
    >
      <span style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 500 }}>
        {label}
      </span>
      <span
        className="tabular-nums"
        data-testid={testId}
        style={{ fontSize: 24, fontWeight: 500, letterSpacing: "-0.01em", color: "var(--term-text)", lineHeight: 1 }}
      >
        {value}
      </span>
      <span style={{ fontSize: 11, color: "var(--term-text-muted)" }}>{sub}</span>
    </div>
  )
}

/** A rate tile that refuses to print a number it cannot stand behind. */
function RateTile({ label, rate, testId }: { label: string; rate: SeasonReportRate; testId?: string }) {
  const gated = rate.band === null
  return (
    <Tile
      label={label}
      value={gated ? "—" : `${rate.winPct.toFixed(1)}%`}
      sub={
        gated
          ? "NO DECIDABLE GAMES YET"
          : `±${rate.band!.toFixed(1)} · ${rate.games.toLocaleString()} GAMES`
      }
      accent={gated ? "var(--term-neutral)" : "var(--term-blue)"}
      testId={testId}
    />
  )
}

function SectionDivider({ label, descriptor, testId }: { label: string; descriptor?: string; testId?: string }) {
  return (
    <div
      className="mono flex items-center gap-3 py-2"
      style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)" }}
    >
      <span data-testid={testId} style={{ fontWeight: 700 }}>
        {label}
      </span>
      <span style={{ flex: 1, height: 1, background: "var(--term-border)" }} />
      {descriptor ? <span style={{ fontWeight: 600 }}>{descriptor}</span> : null}
    </div>
  )
}

/** The one sentence under the tiles. Three states, no superlative. */
function VerdictLine({ verdict }: { verdict: SeasonReportVerdict }) {
  const { text, tone } =
    verdict.kind === "tooEarly"
      ? {
          text: `TOO EARLY TO CALL — ${verdict.games.toLocaleString()} DECIDABLE GAMES SO FAR`,
          tone: "var(--term-text-muted)",
        }
      : verdict.kind === "inLine"
        ? {
            text: `IN LINE WITH THE ALL-SEASON NORM — ${verdict.winPct.toFixed(1)}% ±${verdict.band.toFixed(1)} VS ${verdict.norm.toFixed(1)}%`,
            tone: "var(--term-text)",
          }
        : {
            text: `${verdict.kind === "above" ? "ABOVE" : "BELOW"} THE NORM — ${verdict.winPct.toFixed(1)}% ±${verdict.band.toFixed(1)} VS ${verdict.norm.toFixed(1)}%`,
            tone: verdict.kind === "above" ? "var(--term-blue)" : "var(--term-red)",
          }

  return (
    <p className="mono" style={{ fontSize: 12, letterSpacing: "0.04em", fontWeight: 600, color: tone }}>
      {text}
    </p>
  )
}

export function SeasonReportContent() {
  const [season, setSeason] = useState(LATEST_SEASON)

  const { data, error, isLoading } = useSWR<SeasonReportResponse>(
    `/api/season-report?season=${season}`,
    apiFetcher,
    { revalidateOnFocus: false }
  )

  // The all-season baseline. Season-independent, so it is fetched once and never refetched
  // when the selector moves.
  const { data: analysis } = useSWR<AnalysisResponse>("/api/analysis", apiFetcher, {
    revalidateOnFocus: false,
  })

  const norm = useMemo(
    () => (analysis ? allSeasonNormExcluding(analysis.seasonWinRates, season) : null),
    [analysis, season]
  )

  const verdict = useMemo(
    () => (data ? seasonReportVerdict(data.overall, norm) : null),
    [data, norm]
  )

  if (error) {
    return (
      <p className="mono" role="alert" style={{ fontSize: 12, color: "var(--term-red)" }}>
        FAILED TO LOAD THE SEASON REPORT.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-12">
      <div style={{ ...termCardStyle, padding: 18 }}>
        <SeasonSelector id="season-report-season" season={season} onSeasonChange={setSeason} />
      </div>

      {isLoading || !data ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton
              key={i}
              className="h-[92px] w-full bg-[var(--term-surface-2)]"
              style={{ borderRadius: "var(--term-radius)" }}
            />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <RateTile label="REST ADVANTAGE WIN RATE" rate={data.overall} testId="season-rest-win-rate" />
            <RateTile label="WIN RATE · RA ≥ 2" rate={data.atLeastTwo} />
            <Tile
              label="SEASON PROGRESS"
              value={`${data.completedGames.toLocaleString()} / ${data.scheduledGames.toLocaleString()}`}
              sub={
                data.scheduledGames === 0
                  ? "NO GAMES SCHEDULED"
                  : `${Math.round((data.completedGames / data.scheduledGames) * 100)}% PLAYED`
              }
            />
          </div>

          <div className="flex flex-col gap-3">
            <SectionDivider
              label={`${data.season} VS HISTORY`}
              descriptor="EXCLUDES THIS SEASON FROM THE NORM"
              testId="season-vs-history-heading"
            />
            {verdict ? <VerdictLine verdict={verdict} /> : null}
            <p style={{ fontSize: 14, color: "var(--term-text-muted)", maxWidth: "42rem", lineHeight: 1.55 }}>
              A season yields roughly 940 games with a decidable rest gap, which is worth about
              three percentage points either way. Seasons move inside that range more often than
              they move outside it.{" "}
              <a href="/analysis" style={{ color: "var(--term-blue)", fontWeight: 600 }}>
                See the full backtest →
              </a>
            </p>
          </div>
        </>
      )}
    </div>
  )
}
