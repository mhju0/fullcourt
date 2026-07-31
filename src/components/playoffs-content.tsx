"use client"

import { useCallback, useState, type KeyboardEvent } from "react"
import useSWR from "swr"
import { ChevronDown } from "lucide-react"
import { SeasonSelector } from "@/components/season-selector"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { apiFetcher } from "@/lib/fetcher"
import { currentDisplaySeason } from "@/lib/nba-season"
import { priorRoundGamesLabel } from "@/lib/playoff-rest-facts"
import { playoffModelSeasons } from "@/lib/playoff-seasons"
import { TERM_ACCENT, termCardStyle } from "@/lib/terminal-styles"
import type {
  PlayoffRoundGroup,
  PlayoffSeriesPredictionMethod,
  PlayoffSeriesWithPredictions,
  PlayoffsResponse,
} from "@/types"

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
  if (status === "correct") return TERM_ACCENT.blue
  if (status === "incorrect") return TERM_ACCENT.red
  // "pending" is neutral grey, not tan — tan does not separate from red for
  // deuteranopia (ΔE 3.2), which made an upset and a pending series look alike.
  return TERM_ACCENT.neutral
}

function CorrectnessBadge({ status, source }: { status: CorrectnessStatus; source: CorrectnessSource }) {
  const accent = correctnessAccent(status)
  const label = status === "correct" ? "✓ CORRECT" : status === "incorrect" ? "✗ UPSET" : "—"
  return (
    <span
      className="mono inline-flex items-center gap-1"
      style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: accent }}
    >
      {label}
      {source === "insample" && (
        <span style={{ fontSize: 10, color: "var(--term-text-muted)", fontWeight: 600 }}>(HINDSIGHT)</span>
      )}
    </span>
  )
}

// ─── Method inline (PICK / HINDSIGHT row) ───────────────────────────

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
  label: "PICK" | "HINDSIGHT"
  method: PlayoffSeriesPredictionMethod | null
  series: PlayoffSeriesWithPredictions
}) {
  if (!method) {
    return (
      <span className="mono inline-flex items-center gap-1" style={{ fontSize: 11, color: "var(--term-text-muted)", letterSpacing: "0.04em" }}>
        <span style={{ fontWeight: 700, color: "var(--term-text)" }}>{label}</span>
        N/A
        <span style={{ fontSize: 10 }}>(insufficient history)</span>
      </span>
    )
  }
  const prob = methodDisplayProb(method, series)
  return (
    <span className="mono inline-flex items-center gap-1 tabular-nums" style={{ fontSize: 11, color: "var(--term-text)", letterSpacing: "0.04em" }}>
      <span style={{ fontWeight: 700, color: "var(--term-text-muted)" }}>{label}</span>
      {(prob * 100).toFixed(1)}% {method.predictedWinnerTeam.abbreviation}
    </span>
  )
}

// ─── Feature drill-down ─────────────────────────────────────────────

function FeatureRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="mono flex justify-between gap-2" style={{ fontSize: 12 }}>
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
        style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 700, borderBottom: "1px solid var(--term-border)" }}
      >
        SERIES FEATURES
      </p>
      <FeatureRow k="SEED DIFF" v={formatFeature(series.seedDiff)} />
      <FeatureRow k="WIN% DIFF" v={formatFeature(series.winPctDiff)} />
      <FeatureRow k="PRIOR GRIND DIFF" v={formatFeature(series.priorGrindDiff)} />
      <FeatureRow k="ENTRY REST DIFF" v={formatFeature(series.entryRestDiff)} />
      <FeatureRow k="H2H DIFF" v={formatFeature(series.h2hDiff)} />
      <p className="mono mt-1" style={{ fontSize: 10, color: "var(--term-text-muted)", letterSpacing: "0.04em", lineHeight: 1.4 }}>
        SIGN CONVENTION: POSITIVE FAVORS HOME-COURT ({series.homeCourtTeam.abbreviation}). ALL ROWS ARE
        (HOME-COURT − OPPONENT) EXCEPT PRIOR GRIND DIFF, WHICH IS (OPPONENT − HOME-COURT) SO THAT
        POSITIVE STILL MEANS THE SAME THING.
      </p>
    </div>
  )
}

/**
 * How each side arrived — the page's whole argument, restated for one matchup.
 *
 * Sits on the collapsed row rather than inside the drawer: it is the reason a reader is on
 * this page, and it was previously buried three clicks deep as a signed decimal.
 */
function GrindLine({ series }: { series: PlayoffSeriesWithPredictions }) {
  const home = priorRoundGamesLabel(series.homeCourtPriorGames, series.isBestOf7)
  const opp = priorRoundGamesLabel(series.opponentPriorGames, series.isBestOf7)
  if (!home || !opp) return null

  return (
    <span className="mono" style={{ fontSize: 11, color: "var(--term-text-muted)", letterSpacing: "0.04em" }}>
      <span style={{ color: "var(--term-text)", fontWeight: 700 }}>{series.homeCourtTeam.abbreviation}</span>{" "}
      {home}
      <span style={{ padding: "0 6px" }}>·</span>
      <span style={{ color: "var(--term-text)", fontWeight: 700 }}>{series.opponentTeam.abbreviation}</span>{" "}
      {opp}
    </span>
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
      // Same 2px lift as MatchupCard; the shadow was already here.
      className="flex flex-col transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_10px_rgba(23,64,139,0.08)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      style={{ background: "var(--term-surface)", border: "1px solid var(--term-border)", borderLeft: `2px solid ${accent}`, borderRadius: "var(--term-radius)", overflow: "hidden" }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse series details" : "Expand series details"}
        onClick={toggle}
        onKeyDown={onKeyDown}
        className="cursor-pointer transition-colors hover:bg-[var(--term-bg)] focus-visible:ring-2 focus-visible:ring-[var(--term-blue)]/40"
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
            <span className="mono" style={{ fontSize: 12, color: "var(--term-text-muted)" }}>vs</span>
            <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: "var(--term-text)" }}>
              {series.opponentTeam.abbreviation}
            </span>
            {series.conference && (
              <span className="mono" style={{ fontSize: 10, color: "var(--term-text-muted)", letterSpacing: "0.06em" }}>
                {series.conference.toUpperCase()}
              </span>
            )}
          </div>

          <ChevronDown
            className={cn("size-4 shrink-0 text-[var(--term-text-muted)] transition-transform duration-200", expanded && "rotate-180")}
            aria-hidden
          />
        </div>

        <div className="mt-1.5">
          <GrindLine series={series} />
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="mono flex items-center gap-2 tabular-nums" style={{ fontSize: 12 }}>
            <span style={{ color: "var(--term-text)", fontWeight: 600 }}>
              {homeWins}-{oppWins}
            </span>
            <span style={{ color: "var(--term-text-muted)", letterSpacing: "0.04em" }}>
              {series.seriesWinnerTeam ? `${series.seriesWinnerTeam.abbreviation} WON` : "PENDING"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <MethodInline label="PICK" method={series.predictions.walkForwardOos} series={series} />
            <MethodInline label="HINDSIGHT" method={series.predictions.fullInsample} series={series} />
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
      <div className="mono flex items-center gap-3 py-1" style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)" }}>
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
    <div className="flex flex-col gap-12">
      <div style={termCardStyle}>
        <Skeleton className="h-10 w-64 bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
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

/**
 * Not every season with data — every season this model covers. 2019-20's playoffs were played
 * in the bubble and produce no series, and offering a permanently empty season renders as a
 * broken page rather than as an empty one.
 */
const PLAYOFF_SEASONS = playoffModelSeasons()

export function PlayoffsContent() {
  const [season, setSeason] = useState<string>(currentDisplaySeason())

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
      <div className="flex flex-col gap-12">
        <SeasonSelector id="playoffs-season" season={season} onSeasonChange={setSeason} seasons={PLAYOFF_SEASONS} />
        <div
          className="mono px-6 py-12 text-center"
          style={{ ...termCardStyle, borderLeft: "2px solid var(--term-red)" }}
        >
          <p style={{ fontSize: 12, letterSpacing: "0.08em", color: "var(--term-red)", fontWeight: 700 }}>
            FAILED TO LOAD THE BRACKET
          </p>
          <p className="mt-1" style={{ fontSize: 11, color: "var(--term-text-muted)" }}>
            {error ?? "UNKNOWN ERROR"}
          </p>
        </div>
      </div>
    )
  }

  return (
    // Capped as one column rather than per-section. A series row carries its matchup on the
    // left and its pick, hindsight and verdict on the right, so at full container width it
    // left a third of the screen empty between the two halves. Narrowing only those rows was
    // worse — it gave the page two different right edges — so the whole column comes in
    // together and everything stays aligned.
    <div className="flex flex-col gap-12" style={{ maxWidth: 1040 }}>
      <SeasonSelector id="playoffs-season" season={season} onSeasonChange={setSeason} seasons={PLAYOFF_SEASONS} />

      {/* Reachable whenever a season's playoffs have not been played yet. */}
      {data.rounds.length === 0 ? (
        <div className="mono px-6 py-12 text-center" style={termCardStyle}>
          <p style={{ fontSize: 12, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 700 }}>
            NO BRACKET FOR THIS SEASON
          </p>
          <p className="mt-2" style={{ fontSize: 11, color: "var(--term-text-muted)" }}>
            These playoffs have not been played yet.
          </p>
        </div>
      ) : (
        <>{data.rounds.map((group) => <RoundSection key={group.round} group={group} />)}</>
      )}
    </div>
  )
}
