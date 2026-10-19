"use client"

import { useCallback, useState } from "react"
import useSWR from "swr"
import { ChevronDown } from "lucide-react"
import { StudySeasonGuide } from "@/components/study-season-guide"
import { SeasonDataGuide } from "@/components/season-data-guide"
import { defaultNbaSeason } from "@/lib/nba-season"
import { SeasonSelector } from "@/components/season-selector"
import { KeepTogether } from "@/components/ui/keep-together"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { apiFetcher, errMsg } from "@/lib/fetcher"
import { grindLineLabels } from "@/lib/playoff-rest-facts"
import { playoffModelSeasons } from "@/lib/playoff-seasons"
import { LEAD, TERM_ACCENT, termCardStyle, TRACK, TYPE, WIDTH } from "@/lib/terminal-styles"
import type {
  PlayoffRoundGroup,
  PlayoffSeriesPredictionMethod,
  PlayoffSeriesWithPredictions,
  PlayoffsResponse,
} from "@/types"
import { signedNumber } from "@/lib/signed-number"
import { MessageCard } from "@/components/ui/message-card"
import { CopyFindingButton } from "@/components/copy-finding-button"
import { usePageQuery } from "@/hooks/useSeasonUrl"

// ─── Series correctness ─────────────────────────────────────────────

type CorrectnessStatus = "correct" | "incorrect" | "pending"
type CorrectnessSource = "oos" | "none"

function seriesCorrectness(
  series: PlayoffSeriesWithPredictions
): { status: CorrectnessStatus; source: CorrectnessSource } {
  const oos = series.predictions.walkForwardOos
  if (oos && oos.predictedWinnerCorrect !== null) {
    return { status: oos.predictedWinnerCorrect ? "correct" : "incorrect", source: "oos" }
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

/** The same statuses at text grade — the 11px badge needs 4.5:1, the card's border does not. */
function correctnessTextAccent(status: CorrectnessStatus): string {
  if (status === "correct") return TERM_ACCENT.blueText
  if (status === "incorrect") return TERM_ACCENT.redText
  return TERM_ACCENT.neutral
}

function CorrectnessBadge({ status }: { status: CorrectnessStatus }) {
  const accent = correctnessTextAccent(status)
  const label = status === "correct" ? "✓ CORRECT" : status === "incorrect" ? "✗ UPSET" : "—"
  return (
    <span
      className="mono inline-flex items-center gap-1"
      style={{ fontSize: 11, fontWeight: 700, letterSpacing: TRACK.sub, color: accent }}
    >
      {label}
    </span>
  )
}

/** Probabilities are stored for the home-court team, irrespective of the model's pick. */
function methodDisplayProb(
  method: PlayoffSeriesPredictionMethod,
  series: PlayoffSeriesWithPredictions
): number {
  return method.predictedWinnerTeam.id === series.homeCourtTeam.id
    ? method.predictedHomeCourtWinProb
    : 1 - method.predictedHomeCourtWinProb
}

function SeriesEstimate({ method, series, knownResults = false }: {
  method: PlayoffSeriesPredictionMethod | null
  series: PlayoffSeriesWithPredictions
  knownResults?: boolean
}) {
  if (!method) return <p>{knownResults ? "Known-results estimate unavailable." : "Estimate unavailable: insufficient earlier history."}</p>
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span style={{ color: "var(--term-text)", fontWeight: 600 }}>{method.predictedWinnerTeam.name}</span>
      <span className="mono tabular-nums" style={{ fontSize: TYPE.stat, fontWeight: 700, color: "var(--term-text)" }}>
        {(methodDisplayProb(method, series) * 100).toFixed(1)}%
      </span>
      <span>Estimated chance {method.predictedWinnerTeam.abbreviation} wins the series</span>
    </div>
  )
}

// ─── Feature drill-down ─────────────────────────────────────────────

/**
 * One feature as a compact cell — label over value — rather than as a full-width row with the
 * two ends pushed apart.
 *
 * As `justify-between` rows these measured 882–890px between a label and its number inside a
 * ~987px panel, which is the width the numeric tables are capped at 760 to avoid (see
 * TERM_NUMERIC_TABLE_MAX_WIDTH). A repeating two-end list can carry that distance because the
 * eye learns the two columns, but these five are heterogeneous named features read once each,
 * so there is no column to learn — just a long jump from "SEED DIFF" to "+1.00".
 */
function FeatureCell({ k, v }: { k: string; v: string }) {
  return (
    <div className="mono flex flex-col gap-1">
      <span style={{ fontSize: 10, color: "var(--term-text-muted)", letterSpacing: TRACK.data }}>{k}</span>
      <span className="tabular-nums" style={{ fontSize: TYPE.data, color: "var(--term-text)", fontWeight: 700 }}>
        {v}
      </span>
    </div>
  )
}

/** Every feature but WIN% DIFF is a whole count; WIN% DIFF is stored 0–1 and shown in points. */
function formatFeature(v: number | null, decimals = 0): string {
  return v === null ? "—" : signedNumber(v, decimals)
}

function SeriesFeatureGrid({ series }: { series: PlayoffSeriesWithPredictions }) {
  return (
    <div
      className="flex flex-col gap-2 px-3 py-3"
      style={{ background: "var(--term-surface)", border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}
    >
      <p
        className="mono pb-2"
        style={{ fontSize: 11, letterSpacing: TRACK.label, color: "var(--term-text-muted)", fontWeight: 700, borderBottom: "1px solid var(--term-border)" }}
      >
        SERIES FEATURES
      </p>
      {/* An actual grid now, not five full-width rows: the five features spread across the
          width they already occupied instead of leaving ~885px of it empty between each label
          and its number. */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 pt-1 sm:grid-cols-3 lg:grid-cols-5">
        <FeatureCell k="SEED DIFF" v={formatFeature(series.seedDiff)} />
        <FeatureCell k="WIN% DIFF, PP" v={formatFeature(series.winPctDiff === null ? null : series.winPctDiff * 100, 1)} />
        <FeatureCell k="PRIOR GRIND DIFF" v={formatFeature(series.priorGrindDiff)} />
        <FeatureCell k="ENTRY REST DIFF" v={formatFeature(series.entryRestDiff)} />
        <FeatureCell k="H2H DIFF" v={formatFeature(series.h2hDiff)} />
      </div>
      <p className="mono mt-1" style={{ fontSize: 10, color: "var(--term-text-muted)", letterSpacing: TRACK.sub, lineHeight: LEAD.label }}><KeepTogether>
        SIGN CONVENTION: POSITIVE FAVORS HOME-COURT ({series.homeCourtTeam.abbreviation}). ALL ROWS ARE
        (HOME-COURT − OPPONENT) EXCEPT PRIOR GRIND DIFF, WHICH IS (OPPONENT − HOME-COURT) SO THAT
        POSITIVE STILL MEANS THE SAME THING.
      </KeepTogether></p>
    </div>
  )
}

/**
 * How each side arrived — the page's whole argument, restated for one matchup.
 *
 * Sits on the collapsed row rather than inside the drawer: it is the reason a reader is on
 * this page, and it was previously buried three clicks deep as a signed decimal.
 */
function GrindLine({
  series,
  labels,
}: {
  series: PlayoffSeriesWithPredictions
  labels: { homeCourt: string; opponent: string }
}) {
  return (
    <span className="mono" style={{ fontSize: 11, color: "var(--term-text-muted)", letterSpacing: TRACK.sub }}>
      <span style={{ color: "var(--term-text)", fontWeight: 700 }}>{series.homeCourtTeam.abbreviation}</span>{" "}
      {labels.homeCourt}
      <span style={{ padding: "0 8px" }}>·</span>
      <span style={{ color: "var(--term-text)", fontWeight: 700 }}>{series.opponentTeam.abbreviation}</span>{" "}
      {labels.opponent}
    </span>
  )
}

// ─── Series card (expandable) ───────────────────────────────────────

function SeriesCard({ series }: { series: PlayoffSeriesWithPredictions }) {
  const [expanded, setExpanded] = useState(false)
  const { status } = seriesCorrectness(series)
  const accent = correctnessAccent(status)

  const featuresId = `playoff-series-features-${series.seriesId}`
  const toggle = useCallback(() => setExpanded((e) => !e), [])
  const homeWins = series.homeCourtWins ?? "—"
  const oppWins = series.opponentWins ?? "—"
  const grindLabels = grindLineLabels(series)

  return (
    <div
      className="flex flex-col"
      style={{ background: "var(--term-surface)", border: "1px solid var(--term-border)", borderLeft: `2px solid ${accent}`, borderRadius: "var(--term-radius)", overflow: "hidden" }}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={`${expanded ? "Collapse" : "Expand"} series details: ${series.homeCourtTeam.abbreviation} vs ${series.opponentTeam.abbreviation}`}
        aria-controls={featuresId}
        onClick={toggle}
        className="w-full text-left cursor-pointer transition-colors hover:bg-[var(--term-bg)] focus-visible:ring-2 focus-visible:ring-[var(--term-blue)]/40"
        style={{ padding: "12px 16px" }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="mono inline-flex items-center gap-1" style={{ fontSize: 12, fontWeight: 700, color: "var(--term-text)" }}>
              {series.homeCourtTeam.abbreviation}
              <span
                className="mono"
                style={{ fontSize: TYPE.micro, fontWeight: 700, color: "var(--term-blue-text)", border: "1px solid var(--term-blue-text)", borderRadius: "var(--term-radius-sm)", padding: "0 4px" }}
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
              <span className="mono" style={{ fontSize: 10, color: "var(--term-text-muted)", letterSpacing: TRACK.data }}>
                {series.conference.toUpperCase()}
              </span>
            )}
          </div>

          <ChevronDown
            className={cn("size-4 shrink-0 text-[var(--term-text-muted)]", expanded && "rotate-180")}
            aria-hidden
          />
        </div>

        {/* Wrapper only when there is a line: in Round 1 an empty `mt-2` div costs 0px
            today because its margin collapses through, but only while the ancestor stays a
            plain block. */}
        {grindLabels && (
          <div className="mt-2">
            <GrindLine series={series} labels={grindLabels} />
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="mono flex items-center gap-2 tabular-nums" style={{ fontSize: 12 }}>
            <span style={{ color: "var(--term-text)", fontWeight: 600 }}>
              {homeWins}-{oppWins}
            </span>
            <span style={{ color: "var(--term-text-muted)", letterSpacing: TRACK.sub }}>
              {series.seriesWinnerTeam ? `Actual result: ${series.seriesWinnerTeam.abbreviation} won` : "Actual result: pending"}
            </span>
          </div>

          {status !== "pending" && <CorrectnessBadge status={status} />}
        </div>
      </button>

      <div className="flex flex-col gap-3 px-4 pb-4" style={{ fontSize: TYPE.body, lineHeight: LEAD.body, color: "var(--term-text-muted)" }}>
        <div className="flex flex-col gap-1">
          <p style={{ fontWeight: 700, color: "var(--term-text)" }}>Model pick</p>
          <SeriesEstimate method={series.predictions.walkForwardOos} series={series} />
        </div>
        <details style={{ borderTop: "1px solid var(--term-border)" }}>
          <summary className="min-h-11 cursor-pointer content-center font-semibold text-[var(--term-text)] focus-visible:outline-2 focus-visible:outline-[var(--term-accent)]">Fit using known results</summary>
          <div className="flex flex-col gap-3 pb-1">
            <p>This fit includes the target season’s known results and can include later observations. It shows how a model fits results it has seen; it cannot demonstrate predictive performance.</p>
            <SeriesEstimate method={series.predictions.fullInsample} series={series} knownResults />
          </div>
        </details>
      </div>

      <div
        id={featuresId}
        aria-hidden={!expanded}
        className={cn(
          "grid",
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
    // `data-shot-anchor` on every round, so scripts/screenshots.mjs can end the README shot after
    // the first one by index rather than by a hand-derived pixel height.
    <div className="flex flex-col gap-2" data-shot-anchor="round-group">
      <div className="mono flex items-center gap-3 py-1" style={{ fontSize: 11, letterSpacing: TRACK.label, color: "var(--term-text-muted)" }}>
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
  const { params, update } = usePageQuery()
  const requestedSeason = params.get("season")
  const validRequestedSeason = requestedSeason && PLAYOFF_SEASONS.includes(requestedSeason)
    ? requestedSeason
    : null

  const { data, error: swrError, isLoading: loading } = useSWR<PlayoffsResponse>(
    validRequestedSeason ? `/api/playoffs?season=${validRequestedSeason}` : "/api/playoffs",
    apiFetcher,
    { revalidateOnFocus: false, keepPreviousData: true }
  )
  const error = swrError ? errMsg(swrError) : null
  const season = validRequestedSeason ?? data?.season ?? PLAYOFF_SEASONS.at(-1)!
  const dataMatchesSelection = Boolean(data && data.season === season)
  const setSeason = (value: string) => update({ season: value })
  const fallbackNote = requestedSeason && !validRequestedSeason && data
    ? `${requestedSeason} is unavailable on this page. Showing ${data.season}.`
    : null

  const controls = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <SeasonSelector id="playoffs-season" season={season} onSeasonChange={setSeason} seasons={PLAYOFF_SEASONS} />
      {dataMatchesSelection ? (
        <CopyFindingButton
          key={season}
          text={`${season} NBA Playoff Rest. Model picks are estimated series win chances in a historical replay, not guarantees.`}
          query={{ season }}
        />
      ) : null}
    </div>
  )

  if (error) {
    return (
      <div className="flex flex-col gap-12">
        {controls}
        <MessageCard
          tone="error"
          title="FAILED TO LOAD THE BRACKET"
          body={error}
        />
      </div>
    )
  }

  if ((loading && !data) || !data || !dataMatchesSelection) {
    return <div className="flex flex-col gap-12">{controls}<PlayoffsSkeleton /></div>
  }

  return (
    <div className="flex flex-col gap-12" style={{ maxWidth: WIDTH.wide }}>
      {controls}
      {fallbackNote ? <p role="status" className="mono text-xs text-[var(--term-text-muted)]">{fallbackNote}</p> : null}

      {data.rounds.length > 0 && (!requestedSeason || requestedSeason === defaultNbaSeason()) ? <StudySeasonGuide latestPublishedSeason={data.latestPublishedSeason}
        body={`The series explorer is published through ${data.latestPublishedSeason}. New-season coverage will follow the playoffs and updated series data.`}
        previousHref={`/playoffs?season=${data.latestPublishedSeason}`} /> : null}
      {data.rounds.length === 0 && season >= defaultNbaSeason() ? <SeasonDataGuide season={season}
        body="This season’s playoff bracket and series results have not been published. Coverage follows the playoffs and updated series data."
        previousHref={`/playoffs?season=${data.latestPublishedSeason}`}
        previousLabel={`View published results · ${data.latestPublishedSeason}`} /> : data.rounds.length === 0 ? (
        <div className="flex flex-col gap-3">
          <MessageCard
            tone="muted"
            title="NO PUBLISHED BRACKET FOR THIS SEASON"
            body={season > data.latestPublishedSeason
              ? `The ${season} playoffs have not been published yet.`
              : `No playoff bracket is published for ${season}.`}
          />
          <button
            type="button"
            onClick={() => setSeason(data.latestPublishedSeason)}
            className="mono min-h-11 self-start text-xs font-bold text-[var(--term-accent)] underline underline-offset-4"
          >
            View latest results · {data.latestPublishedSeason}
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2" style={{ fontSize: TYPE.body, lineHeight: LEAD.body, color: "var(--term-text-muted)", maxWidth: WIDTH.prose }}>
            <p><strong>Model pick:</strong> estimated series win chance, trained only on seasons before {season}. This is a historical replay; this page does not establish that the estimate was published before the series.</p>
            <p>Each chance refers to the named team winning the whole series. It is not a model accuracy score, a guarantee, or the effect of rest alone. Estimates remain unavailable when earlier history is insufficient.</p>
            <details>
              <summary className="min-h-11 cursor-pointer content-center font-semibold text-[var(--term-text)] focus-visible:outline-2 focus-visible:outline-[var(--term-accent)]">Why two numbers?</summary>
              <div className="flex flex-col gap-3 pt-2">
                <p>Think of a practice test. The earlier-season model studies old tests, then answers this one. The known-results fit studies this test’s answers too, and may also study tests that came later. Seeing those answers can change its estimate; it cannot show how well the model would do on an unseen test.</p>
                <p>The percentage expresses uncertainty about one series. Model accuracy instead counts how often a model’s selected team wins across many series.</p>
              </div>
            </details>
          </div>
          {data.rounds.map((group) => <RoundSection key={group.round} group={group} />)}
        </>
      )}
    </div>
  )
}
