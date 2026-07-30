"use client"

import { useCallback, useState, type KeyboardEvent } from "react"
import useSWR from "swr"
import { ChevronDown } from "lucide-react"
import { SeasonSelector } from "@/components/season-selector"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { apiFetcher } from "@/lib/fetcher"
import { currentDisplaySeason } from "@/lib/nba-season"
import {
  PLAYOFF_MODEL_ACCURACY,
  PLAYOFF_MODEL_CALIBRATION,
  PLAYOFF_MODEL_EVAL,
} from "@/lib/playoff-model-metrics"
import { playoffModelSeasons } from "@/lib/playoff-seasons"
import { TERM_ACCENT, termCardStyle } from "@/lib/terminal-styles"
import type {
  PlayoffMethodSummary,
  PlayoffRoundGroup,
  PlayoffSeriesPredictionMethod,
  PlayoffSeriesWithPredictions,
  PlayoffsResponse,
} from "@/types"

// ─── Model result header ────────────────────────────────────────────

/** One pooled calibration metric, shown against the base rate it beats. Lower is better. */
function CalibrationTile({
  label,
  model,
  baseline,
  improvementPct,
}: {
  label: string
  model: number
  baseline: number
  improvementPct: number
}) {
  return (
    <div
      className="flex flex-col gap-1 px-3 py-3"
      style={{ background: "var(--term-surface-2)", borderRadius: "var(--term-radius)", borderTop: "2px solid var(--term-blue)" }}
    >
      <span className="mono" style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 700 }}>
        {label}
      </span>
      <span className="mono tabular-nums" style={{ fontSize: 32, fontWeight: 700, color: "var(--term-text)", lineHeight: 1.1 }}>
        {model.toFixed(3)}
      </span>
      <span className="mono tabular-nums" style={{ fontSize: 11, color: "var(--term-text-muted)", letterSpacing: "0.04em" }}>
        VS {baseline.toFixed(3)} BASE RATE
      </span>
      <span className="mono tabular-nums" style={{ fontSize: 11, color: "var(--term-blue)", fontWeight: 700, letterSpacing: "0.04em" }}>
        {improvementPct}% BETTER
      </span>
    </div>
  )
}

/**
 * What the model actually claims: better-calibrated probabilities, not better picks.
 *
 * This deliberately leads with calibration and states the accuracy tie in the same breath. The
 * page previously headlined two accuracy tiles, which oversold the model twice over — accuracy
 * is the metric it cannot beat a one-line rule on, and the second tile was a hindsight fit.
 */
function ModelResultHeader() {
  const accGap = (PLAYOFF_MODEL_ACCURACY.model - PLAYOFF_MODEL_ACCURACY.baseline) * 100
  return (
    <div style={termCardStyle}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {PLAYOFF_MODEL_CALIBRATION.map((m) => (
          <CalibrationTile
            key={m.key}
            label={m.label}
            model={m.model}
            baseline={m.baseline}
            improvementPct={m.improvementPct}
          />
        ))}
      </div>
      <p className="mt-3 max-w-3xl" style={{ fontSize: 15, color: "var(--term-text-muted)", lineHeight: 1.55 }}>
        <span style={{ color: "var(--term-text)", fontWeight: 600 }}>
          What this model is good at is knowing how sure to be.
        </span>{" "}
        Across {PLAYOFF_MODEL_EVAL.folds} seasons predicted in advance ({PLAYOFF_MODEL_EVAL.series}{" "}
        series), it separates a lopsided matchup from a near coin flip far better than the base
        rate does — that is what the two numbers above measure.
      </p>
      <p className="mt-2 max-w-3xl" style={{ fontSize: 15, color: "var(--term-text-muted)", lineHeight: 1.55 }}>
        <span style={{ color: "var(--term-text)", fontWeight: 600 }}>
          What it is not good at is picking winners.
        </span>{" "}
        It calls {(PLAYOFF_MODEL_ACCURACY.model * 100).toFixed(1)}% of series right against{" "}
        {(PLAYOFF_MODEL_ACCURACY.baseline * 100).toFixed(1)}% for {PLAYOFF_MODEL_ACCURACY.baselineName}{" "}
        — a gap of {accGap.toFixed(1)} points, well inside the noise (it beat, tied and lost to that
        rule {PLAYOFF_MODEL_ACCURACY.winTieLoss} across those seasons). Read the probabilities, not
        the picks.
      </p>
    </div>
  )
}

// ─── This season's scoreboard ───────────────────────────────────────

function ScoreLine({
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
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="mono" style={{ fontSize: 11, letterSpacing: "0.08em", color: accent, fontWeight: 700 }}>
        {label}
      </span>
      <span className="mono tabular-nums" style={{ fontSize: 20, fontWeight: 700, color: "var(--term-text)" }}>
        {summary.predictedCorrect.toLocaleString()} / {summary.knownWinnerGames.toLocaleString()}
      </span>
      <span className="mono tabular-nums" style={{ fontSize: 12, color: "var(--term-text-muted)" }}>
        ({summary.accuracy}%)
      </span>
      <span className="mono" style={{ fontSize: 11, color: "var(--term-text-muted)", letterSpacing: "0.04em" }}>
        {sub}
      </span>
    </div>
  )
}

/**
 * How the model did on the selected bracket only.
 *
 * The hindsight row is rendered ONLY when there is no forecast to show — the first ten covered
 * seasons have too little prior history to train on, so they carry a hindsight fit and nothing
 * else. Everywhere else it is omitted rather than sat beside the forecast, because a
 * side-by-side invites reading the bigger number as the better model.
 */
function SeasonScoreboard({ season, summary }: { season: string; summary: PlayoffsResponse["summary"] }) {
  const forecast = summary.walkForwardOos
  const hasForecast = forecast.knownWinnerGames > 0
  const shown = hasForecast ? forecast : summary.fullInsample
  const swing = shown.knownWinnerGames > 0 ? 100 / shown.knownWinnerGames : 0

  return (
    <div style={termCardStyle}>
      <p className="mono pb-2" style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 700 }}>
        THIS BRACKET · {season}
      </p>
      {hasForecast ? (
        <ScoreLine
          label="PREDICTED IN ADVANCE"
          sub="TRAINED ON EARLIER SEASONS ONLY"
          summary={forecast}
          accent="var(--term-blue)"
        />
      ) : (
        <ScoreLine
          label="HINDSIGHT FIT"
          sub="NO FORECAST EXISTS FOR THIS SEASON"
          summary={summary.fullInsample}
          accent="var(--term-neutral)"
        />
      )}
      <p className="mt-2 max-w-3xl" style={{ fontSize: 15, color: "var(--term-text-muted)", lineHeight: 1.55 }}>
        {hasForecast ? (
          <>
            One bracket, {shown.knownWinnerGames} series — a single flipped upset moves this by{" "}
            {swing.toFixed(1)} points, so treat it as a result rather than as a measurement. The
            pooled numbers above are the ones that carry the claim.
          </>
        ) : (
          <>
            This season is too early in the record for the model to have been trained on anything
            before it, so no genuine forecast exists. The figure above comes from a model that had
            already seen this bracket&rsquo;s results — it is a description, not a prediction, and
            it is not counted as evidence anywhere.
          </>
        )}
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
      <FeatureRow k="ENTRY REST DIFF" v={formatFeature(series.entryRestDiff)} />
      <FeatureRow k="H2H DIFF" v={formatFeature(series.h2hDiff)} />
      <p className="mono mt-1" style={{ fontSize: 10, color: "var(--term-text-muted)", letterSpacing: "0.04em", lineHeight: 1.4 }}>
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
        <Skeleton className="h-4 w-32 bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
      </div>
      <div style={termCardStyle}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Skeleton className="h-24 w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
          <Skeleton className="h-24 w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
        </div>
      </div>
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
            FAILED TO LOAD PLAYOFF PREDICTIONS
          </p>
          <p className="mt-1" style={{ fontSize: 11, color: "var(--term-text-muted)" }}>
            {error ?? "UNKNOWN ERROR"}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-12">
      <SeasonSelector id="playoffs-season" season={season} onSeasonChange={setSeason} seasons={PLAYOFF_SEASONS} />

      {/* No accuracy header when there is nothing to score. Rendering it anyway prints "0%"
          over "0 / 0 CORRECT", which reads as the model having got every series wrong rather
          than as having predicted none — the difference between an empty page and a broken
          one. Reachable whenever a season's playoffs have not been played yet. */}
      {data.rounds.length === 0 ? (
        <div className="mono px-6 py-12 text-center" style={termCardStyle}>
          <p style={{ fontSize: 12, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 700 }}>
            NO PLAYOFF PREDICTIONS FOR THIS SEASON
          </p>
          <p className="mt-2" style={{ fontSize: 11, color: "var(--term-text-muted)" }}>
            These playoffs have not been played yet.
          </p>
        </div>
      ) : (
        <>
          <ModelResultHeader />
          <SeasonScoreboard season={season} summary={data.summary} />
          {data.rounds.map((group) => <RoundSection key={group.round} group={group} />)}
        </>
      )}
    </div>
  )
}
