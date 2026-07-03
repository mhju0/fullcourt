"use client"

import { useCallback, useState, type KeyboardEvent } from "react"
import useSWR from "swr"
import { ChevronDown } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { apiFetcher } from "@/lib/fetcher"
import { NBA_SEASONS, defaultNbaSeason } from "@/lib/nba-season"
import type {
  PlayoffMethodSummary,
  PlayoffRoundGroup,
  PlayoffSeriesPredictionMethod,
  PlayoffSeriesWithPredictions,
  PlayoffsResponse,
} from "@/types"

// ─── Shared styles (terminal) ─────────────────────────────────────

const termCard: React.CSSProperties = {
  background: "var(--term-surface)",
  border: "1px solid var(--term-border)",
  borderRadius: "var(--term-radius)",
  padding: 16,
}

const termSelectClass =
  "mono inline-flex items-center gap-2 bg-white px-3 py-1.5 text-[11px] uppercase tracking-[0.05em] text-slate-700 transition-colors hover:bg-[var(--term-surface-2)] cursor-pointer appearance-none pr-8"

const termSelectStyle: React.CSSProperties = {
  border: "1px solid var(--term-border)",
  borderRadius: "var(--term-radius)",
  backgroundImage:
    "url('data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%238A8478%27%20stroke-width=%272%27%3E%3Cpath%20d=%27M6%209l6%206%206-6%27/%3E%3C/svg%3E')",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 0.5rem center",
  backgroundSize: "0.75rem",
}

// ─── Season selector ───────────────────────────────────────────────

const SEASON_OPTIONS = [...NBA_SEASONS].reverse()

function SeasonSelector({
  season,
  onSeasonChange,
}: {
  season: string
  onSeasonChange: (season: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor="playoffs-season"
        className="mono"
        style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 600 }}
      >
        SEASON
      </label>
      <select
        id="playoffs-season"
        value={season}
        onChange={(e) => onSeasonChange(e.target.value)}
        className={cn(termSelectClass, "max-w-xs")}
        style={termSelectStyle}
      >
        {SEASON_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  )
}

// ─── Method comparison header ──────────────────────────────────────

function MethodMetricCard({
  label,
  sub,
  summary,
  accent,
}: {
  label: string
  sub: string
  summary: PlayoffMethodSummary
  accent: string
}) {
  return (
    <div
      className="flex flex-col gap-1 px-3 py-3"
      style={{ background: "var(--term-surface-2)", borderRadius: "var(--term-radius)", borderLeft: `3px solid ${accent}` }}
    >
      <span className="mono" style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 700 }}>
        {label}
      </span>
      <span className="mono tabular-nums" style={{ fontSize: 32, fontWeight: 700, color: "var(--term-text)", lineHeight: 1.1 }}>
        {summary.accuracy}%
      </span>
      <span className="mono" style={{ fontSize: 10, color: "var(--term-text-muted)", letterSpacing: "0.04em" }}>
        {sub}
      </span>
      <span className="mono tabular-nums" style={{ fontSize: 10, color: "var(--term-text-muted)" }}>
        {summary.predictedCorrect.toLocaleString()} / {summary.knownWinnerGames.toLocaleString()} CORRECT
      </span>
    </div>
  )
}

function MethodComparisonHeader({ summary }: { summary: PlayoffsResponse["summary"] }) {
  return (
    <div style={termCard}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <MethodMetricCard
          label="OUT-OF-SAMPLE"
          sub="WALK-FORWARD"
          summary={summary.walkForwardOos}
          accent="var(--term-blue)"
        />
        <MethodMetricCard
          label="IN-SAMPLE"
          sub="FULL TRAINING FIT"
          summary={summary.fullInsample}
          accent="var(--term-hardwood)"
        />
      </div>
      <p className="mono mt-3" style={{ fontSize: 10, color: "var(--term-text-muted)", letterSpacing: "0.04em", lineHeight: 1.5 }}>
        OUT-OF-SAMPLE ACCURACY IS PREDICTED FROM PRIOR SEASONS ONLY — THE HONEST GENERALIZATION NUMBER.
        IN-SAMPLE REFLECTS FIT ON DATA THE MODEL WAS TRAINED ON AND WILL TYPICALLY LOOK BETTER.
      </p>
    </div>
  )
}

// ─── Series correctness ─────────────────────────────────────────────

type CorrectnessStatus = "correct" | "incorrect" | "pending"
type CorrectnessSource = "oos" | "insample" | "none"

function seriesCorrectness(
  series: PlayoffSeriesWithPredictions
): { status: CorrectnessStatus; source: CorrectnessSource } {
  const oos = series.predictions.walkForwardOos
  if (oos && oos.predictedWinnerCorrect !== null) {
    return { status: oos.predictedWinnerCorrect ? "correct" : "incorrect", source: "oos" }
  }
  const inSample = series.predictions.fullInsample
  if (inSample && inSample.predictedWinnerCorrect !== null) {
    return { status: inSample.predictedWinnerCorrect ? "correct" : "incorrect", source: "insample" }
  }
  return { status: "pending", source: "none" }
}

function correctnessAccent(status: CorrectnessStatus): string {
  if (status === "correct") return "var(--term-blue)"
  if (status === "incorrect") return "var(--term-red)"
  return "var(--term-hardwood)"
}

function CorrectnessBadge({ status, source }: { status: CorrectnessStatus; source: CorrectnessSource }) {
  const accent = correctnessAccent(status)
  const label = status === "correct" ? "✓ CORRECT" : status === "incorrect" ? "✗ UPSET" : "—"
  return (
    <span
      className="mono inline-flex items-center gap-1"
      style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", color: accent }}
    >
      {label}
      {source === "insample" && (
        <span style={{ fontSize: 9, color: "var(--term-text-muted)", fontWeight: 600 }}>(IN-SAMPLE)</span>
      )}
    </span>
  )
}

// ─── Method inline (OOS / IN row) ───────────────────────────────────

/** Probability shown is for the predicted winner, which may be either side of the series. */
function methodDisplayProb(
  method: PlayoffSeriesPredictionMethod,
  series: PlayoffSeriesWithPredictions
): number {
  const isHomeCourtPick = method.predictedWinnerTeam.id === series.homeCourtTeam.id
  return isHomeCourtPick ? method.predictedHomeCourtWinProb : 1 - method.predictedHomeCourtWinProb
}

function MethodInline({
  label,
  method,
  series,
}: {
  label: "OOS" | "IN"
  method: PlayoffSeriesPredictionMethod | null
  series: PlayoffSeriesWithPredictions
}) {
  if (!method) {
    return (
      <span className="mono inline-flex items-center gap-1" style={{ fontSize: 10, color: "var(--term-text-muted)", letterSpacing: "0.04em" }}>
        <span style={{ fontWeight: 700, color: "var(--term-text)" }}>{label}</span>
        N/A
        <span style={{ fontSize: 9 }}>(insufficient history)</span>
      </span>
    )
  }
  const prob = methodDisplayProb(method, series)
  return (
    <span className="mono inline-flex items-center gap-1 tabular-nums" style={{ fontSize: 10, color: "var(--term-text)", letterSpacing: "0.04em" }}>
      <span style={{ fontWeight: 700, color: "var(--term-text-muted)" }}>{label}</span>
      {(prob * 100).toFixed(1)}% {method.predictedWinnerTeam.abbreviation}
    </span>
  )
}

// ─── Feature drill-down ─────────────────────────────────────────────

function FeatureRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="mono flex justify-between gap-2" style={{ fontSize: 11 }}>
      <span style={{ color: "var(--term-text-muted)", letterSpacing: "0.04em" }}>{k}</span>
      <span className="tabular-nums" style={{ color: "var(--term-text)", fontWeight: 600 }}>{v}</span>
    </div>
  )
}

function formatFeature(v: number | null): string {
  if (v === null) return "—"
  const sign = v > 0 ? "+" : ""
  return `${sign}${v.toFixed(2)}`
}

function SeriesFeatureGrid({ series }: { series: PlayoffSeriesWithPredictions }) {
  return (
    <div
      className="flex flex-col gap-2 px-3 py-3"
      style={{ background: "var(--term-surface)", border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}
    >
      <p
        className="mono pb-1.5"
        style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 700, borderBottom: "1px solid var(--term-border)" }}
      >
        SERIES FEATURES
      </p>
      <FeatureRow k="SEED DIFF" v={formatFeature(series.seedDiff)} />
      <FeatureRow k="WIN% DIFF" v={formatFeature(series.winPctDiff)} />
      <FeatureRow k="ENTRY REST DIFF" v={formatFeature(series.entryRestDiff)} />
      <FeatureRow k="H2H DIFF" v={formatFeature(series.h2hDiff)} />
      <p className="mono mt-1" style={{ fontSize: 9, color: "var(--term-text-muted)", letterSpacing: "0.04em", lineHeight: 1.4 }}>
        SIGN CONVENTION: (HOME-COURT − OPPONENT). POSITIVE FAVORS HOME-COURT ({series.homeCourtTeam.abbreviation}).
      </p>
    </div>
  )
}

// ─── Series card (expandable) ───────────────────────────────────────

function SeriesCard({ series }: { series: PlayoffSeriesWithPredictions }) {
  const [expanded, setExpanded] = useState(false)
  const { status, source } = seriesCorrectness(series)
  const accent = correctnessAccent(status)

  const toggle = useCallback(() => setExpanded((e) => !e), [])
  const onKeyDown = useCallback(
    (ev: KeyboardEvent<HTMLDivElement>) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault()
        toggle()
      }
    },
    [toggle]
  )

  const homeWins = series.homeCourtWins ?? 0
  const oppWins = series.opponentWins ?? 0

  return (
    <div
      className="flex flex-col"
      style={{ background: "var(--term-surface)", border: "1px solid var(--term-border)", borderLeft: `2px solid ${accent}`, borderRadius: "var(--term-radius)", overflow: "hidden" }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse series details" : "Expand series details"}
        onClick={toggle}
        onKeyDown={onKeyDown}
        className="cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#17408B]/40"
        style={{ padding: "10px 14px" }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="mono inline-flex items-center gap-1" style={{ fontSize: 12, fontWeight: 700, color: "var(--term-text)" }}>
              {series.homeCourtTeam.abbreviation}
              <span
                className="mono"
                style={{ fontSize: 8, fontWeight: 700, color: "var(--term-blue)", border: "1px solid var(--term-blue)", borderRadius: "var(--term-radius-sm)", padding: "0 3px" }}
                aria-label="Home court"
              >
                HC
              </span>
            </span>
            <span className="mono" style={{ fontSize: 11, color: "var(--term-text-muted)" }}>vs</span>
            <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: "var(--term-text)" }}>
              {series.opponentTeam.abbreviation}
            </span>
            {series.conference && (
              <span className="mono" style={{ fontSize: 9, color: "var(--term-text-muted)", letterSpacing: "0.06em" }}>
                {series.conference.toUpperCase()}
              </span>
            )}
          </div>

          <ChevronDown
            className={cn("size-4 shrink-0 text-[var(--term-text-muted)] transition-transform duration-200", expanded && "rotate-180")}
            aria-hidden
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="mono flex items-center gap-2 tabular-nums" style={{ fontSize: 11 }}>
            <span style={{ color: "var(--term-text)", fontWeight: 600 }}>
              {homeWins}-{oppWins}
            </span>
            <span style={{ color: "var(--term-text-muted)", letterSpacing: "0.04em" }}>
              {series.seriesWinnerTeam ? `${series.seriesWinnerTeam.abbreviation} WON` : "PENDING"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <MethodInline label="OOS" method={series.predictions.walkForwardOos} series={series} />
            <MethodInline label="IN" method={series.predictions.fullInsample} series={series} />
            <CorrectnessBadge status={status} source={source} />
          </div>
        </div>
      </div>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="px-3 py-3" style={{ background: "var(--term-bg)", borderTop: "1px solid var(--term-border)" }}>
            <SeriesFeatureGrid series={series} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Round section ───────────────────────────────────────────────────

function RoundSection({ group }: { group: PlayoffRoundGroup }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="mono flex items-center gap-3 py-1" style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--term-text-muted)" }}>
        <span style={{ fontWeight: 700 }}>
          {group.roundLabel.toUpperCase()} · {group.series.length} SERIES
        </span>
        <span style={{ flex: 1, height: 1, background: "var(--term-border)" }} />
      </div>
      <div className="flex flex-col gap-2">
        {group.series.map((s) => (
          <SeriesCard key={s.seriesId} series={s} />
        ))}
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────

function PlayoffsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div style={termCard}>
        <Skeleton className="h-4 w-32 bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
      </div>
      <div style={termCard}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Skeleton className="h-24 w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
          <Skeleton className="h-24 w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
        <Skeleton className="h-16 w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
        <Skeleton className="h-16 w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────

export function PlayoffsContent() {
  const [season, setSeason] = useState<string>(defaultNbaSeason())

  const { data, error: swrError, isLoading: loading } = useSWR<PlayoffsResponse>(
    `/api/playoffs?season=${season}`,
    apiFetcher,
    { revalidateOnFocus: false, keepPreviousData: true }
  )
  const error = swrError
    ? (swrError instanceof Error ? swrError.message : "Failed to load playoff predictions")
    : null

  if (loading) return <PlayoffsSkeleton />

  if (error || !data) {
    return (
      <div className="flex flex-col gap-4">
        <SeasonSelector season={season} onSeasonChange={setSeason} />
        <div
          className="mono px-6 py-12 text-center"
          style={{ ...termCard, borderLeft: "2px solid var(--term-red)" }}
        >
          <p style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-red)", fontWeight: 700 }}>
            FAILED TO LOAD PLAYOFF PREDICTIONS
          </p>
          <p className="mt-1" style={{ fontSize: 10, color: "var(--term-text-muted)" }}>
            {error ?? "UNKNOWN ERROR"}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <SeasonSelector season={season} onSeasonChange={setSeason} />

      <MethodComparisonHeader summary={data.summary} />

      {data.rounds.length === 0 ? (
        <div className="mono px-6 py-12 text-center" style={termCard}>
          <p style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 700 }}>
            NO PLAYOFF PREDICTIONS FOR THIS SEASON
          </p>
        </div>
      ) : (
        data.rounds.map((group) => <RoundSection key={group.round} group={group} />)
      )}
    </div>
  )
}
