"use client"

import { useState } from "react"
import useSWR from "swr"
import { ChevronDown } from "lucide-react"
import { SeasonSelector } from "@/components/season-selector"
import { Skeleton } from "@/components/ui/skeleton"
import { apiFetcher } from "@/lib/fetcher"
import { NEUTRAL_REST_ADVANTAGE_THRESHOLD } from "@/lib/rest-advantage-evidence"
import { browsableSeasons } from "@/lib/nba-season"
import { defaultRankableSeason, rankableSeasons } from "@/lib/schedule-disparity"
import {
  HOME_COURT_SPAN_PP,
  REST_SHARE_OF_HOME_COURT,
  REST_SPAN_PP,
} from "@/lib/schedule-value"
import { termCardStyle, termDashedEmptyStyle, WIDTH } from "@/lib/terminal-styles"
import { DataTable } from "@/components/ui/data-table"
import type { ScheduleDisparityResponse, ScheduleDisparityTeam } from "@/types"
import { signedNumber } from "@/lib/signed-number"

// Rankable rather than browsable: this is the one module that ranks teams against each other
// inside a season, so a season whose teams played unequal numbers of games is withheld here and
// offered everywhere else. See TRUNCATED_SEASONS.
const SEASON_OPTIONS = rankableSeasons(browsableSeasons())

// Not `SEASON_OPTIONS[last]`. In August and September the options also carry the upcoming
// season, which has no games until it is ingested — opening on it showed an empty page for two
// months of every year. Same rule the route defaults to, so client and API agree.
const LATEST_SEASON = defaultRankableSeason()

/**
 * Blue favorable, red unfavorable, grey exactly even — the same diverging pair the Analysis
 * page uses. Every figure on this page is oriented so positive is favorable, so one mapping
 * serves the whole table.
 */
function edgeColor(value: number | null): string {
  if (value === null || value === 0) return "var(--term-neutral)"
  return value > 0 ? "var(--term-blue)" : "var(--term-red)"
}

/**
 * Bar length as a percentage of half the track. The domain is symmetric around zero so a −8
 * and a +8 draw identically long — an axis fitted to the data would make them differ.
 */
function barGeometry(value: number, bound: number) {
  const pct = bound === 0 ? 0 : (Math.abs(value) / bound) * 50
  return value >= 0
    ? { left: "50%", width: `${pct}%` }
    : { right: "50%", width: `${pct}%` }
}

function StatCell({ label, value, sub, tone }: {
  label: string
  value: string
  sub: string
  tone?: string
}) {
  return (
    <div className="flex flex-col gap-[3px] bg-[var(--term-surface)] px-[13px] py-[11px]">
      <span
        className="mono"
        style={{ fontSize: 10, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--term-text-muted)" }}
      >
        {label}
      </span>
      <span
        className="mono"
        style={{ fontSize: 21, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: tone ?? "var(--term-text)" }}
      >
        {value}
      </span>
      <span className="mono" style={{ fontSize: 10.5, color: "var(--term-text-muted)" }}>
        {sub}
      </span>
    </div>
  )
}

/** Diverging bar on a zero rule. Shared by the ranked list and the table's inline column. */
function EdgeBar({ value, bound, height }: { value: number; bound: number; height: number }) {
  const geo = barGeometry(value, bound)
  return (
    <div
      className="relative w-full"
      style={{ height, background: "var(--term-surface-2)", borderRadius: "var(--term-radius-bar)" }}
    >
      <div className="absolute inset-y-0 z-[2]" style={{ left: "50%", width: 1.5, background: "var(--term-text)" }} />
      <div
        className="absolute"
        style={{ ...geo, top: 2, bottom: 2, background: edgeColor(value), borderRadius: "var(--term-radius-bar)" }}
      />
    </div>
  )
}

/**
 * Column explainer. A native <details> rather than hover tooltips: it opens on tap, takes
 * keyboard focus, and is announced by screen readers. Mirrors the MethodologyNote pattern in
 * shot-quality-content.tsx.
 */
function ColumnGuide({ countedGames, scheduledGames }: { countedGames: number; scheduledGames: number }) {
  const term = (t: string) => (
    <span style={{ color: "var(--term-text)", fontWeight: 600 }}>{t}</span>
  )

  return (
    <details className="mono group" style={{ ...termCardStyle, padding: 0 }}>
      <summary
        className="flex cursor-pointer items-center justify-between rounded-[var(--term-radius)] px-4 py-3 transition-colors hover:bg-[var(--term-surface-2)]"
        style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text)", fontWeight: 700 }}
      >
        WHAT THESE COLUMNS MEAN
        <ChevronDown
          className="size-4 text-[var(--term-text-muted)] transition-transform duration-200 group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div
        className="flex max-w-2xl flex-col gap-3 px-4 pb-4"
        style={{ fontSize: 15, color: "var(--term-text-muted)", lineHeight: 1.55 }}
      >
        <p
          style={{
            background: "var(--term-surface-2)",
            borderLeft: "2px solid var(--term-blue)",
            borderRadius: "var(--term-radius-sm)",
            padding: "8px 12px",
            color: "var(--term-text)",
            fontSize: 14,
          }}
        >
          <strong>One rule for the whole table: positive is always favorable.</strong> A plus sign
          means the schedule treated this team better than the teams it played.
        </p>
        <p>
          {term("Net edge games")} — games where this team arrived with a real rest edge, minus
          games where its opponent did. &ldquo;Real&rdquo; means a fatigue gap of at least{" "}
          {NEUTRAL_REST_ADVANTAGE_THRESHOLD.toFixed(1)} — the same bar the whole site uses before
          calling an edge, on the Games page and in the backtest. Every unit is one nameable game,
          not a season average.
        </p>
        <p>
          {term("Worth")} — the net edge priced in wins, at what a rest edge is measured to be
          worth. Being the fresher side moves a home team&rsquo;s win probability{" "}
          {REST_SPAN_PP.toFixed(1)} points against {HOME_COURT_SPAN_PP.toFixed(1)} for playing at
          home at all, so an edge is about {Math.round(REST_SHARE_OF_HOME_COURT * 100)}% of home
          court. It is small for every team because the league spreads edges out evenly, not
          because rest does nothing — the per-game effect is the same either way. The Season Report
          publishes the identical figure.
        </p>
        <p>
          {term("Fav / Unfav")} — the two counts behind the net: games with the edge, and games
          against it. Fatigue folds in rest, travel, altitude and schedule density, so these counts
          can disagree with a bare day count — a team can have more rest days and still arrive more
          tired, because it flew further to get there.
        </p>
        <p>
          {term("Big edge")} — the same net, counting only gaps of 1.5 or more. Fewer games, louder
          signal.
        </p>
        <p>
          {term("B2B edge")} and {term("3-in-4 edge")} — back-to-backs, and third-nights-in-four,
          avoided relative to opponents. Positive means the team arrived rested more often than the
          teams across from it.
        </p>
        <p>
          Every team plays a full schedule. Every column except <em>Worth</em> compares the{" "}
          {countedGames.toLocaleString()} of {scheduledGames.toLocaleString()} games where{" "}
          <em>both</em> sides had a previous game to rest from — a season opener has no rest days
          to measure. <em>Worth</em> deliberately counts the openers too: a fatigue score exists for
          them, so the rest gap is measured even where the day count is not, and leaving them out
          put this page a tenth of a win away from the Season Report on the same team. Edge games
          are counted from played games, so a season in progress lags until its games are scored.
        </p>
      </div>
    </details>
  )
}

export function ScheduleDisparityContent() {
  const [season, setSeason] = useState<string>(LATEST_SEASON)

  const { data, error, isLoading } = useSWR<ScheduleDisparityResponse>(
    `/api/schedule-disparity?season=${season}`,
    apiFetcher
  )

  const teams: ScheduleDisparityTeam[] = data?.teams ?? []
  const bound = teams.length
    ? Math.max(5, Math.ceil(Math.max(...teams.map((t) => Math.abs(t.netEdgeGames))) / 5) * 5)
    : 5

  const most = teams[0]
  const least = teams[teams.length - 1]

  return (
    <div className="flex flex-col gap-12">
      <div style={termCardStyle}>
        <SeasonSelector
          id="schedule-disparity-season"
          season={season}
          onSeasonChange={setSeason}
          seasons={SEASON_OPTIONS}
        />
        {data ? (
          <p
            className="mono"
            style={{ marginTop: 10, fontSize: 11, color: "var(--term-text-muted)", lineHeight: 1.6 }}
          >
            {data.provisional ? "PROVISIONAL" : "FINAL"} ·{" "}
            {data.league.countedGames.toLocaleString()} OF{" "}
            {data.scheduledGames.toLocaleString()} GAMES COMPARED
            {data.provisional ? ` · AS OF ${data.asOf}` : ""}
          </p>
        ) : null}
        {data?.provisional ? (
          <p style={{ marginTop: 6, fontSize: 13, color: "var(--term-text-muted)", lineHeight: 1.55 }}>
            This season&rsquo;s schedule is not finished. The NBA announces only 80 of each
            team&rsquo;s 82 games before opening night and fills the rest once NBA Cup group play
            resolves in December, so these figures will revise.
          </p>
        ) : null}
      </div>

      {data && most && least ? (
        <div
          className="grid gap-px overflow-hidden"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            background: "var(--term-border)",
            border: "1px solid var(--term-border)",
            borderRadius: "var(--term-radius)",
          }}
        >
          <StatCell
            label="Most favored"
            value={signedNumber(most.netEdgeGames)}
            sub={`${most.abbreviation} · ${most.name}`}
            tone={edgeColor(most.netEdgeGames)}
          />
          <StatCell
            label="Least favored"
            value={signedNumber(least.netEdgeGames)}
            sub={`${least.abbreviation} · ${least.name}`}
            tone={edgeColor(least.netEdgeGames)}
          />
          <StatCell label="Spread" value={String(data.league.delta)} sub="edge games, best to worst" />
          <StatCell
            label="Games with an edge"
            value={data.league.gamesWithAnyEdge.toLocaleString()}
            sub={`${data.league.gamesWithLargeEdge.toLocaleString()} of them big (1.5+)`}
          />
        </div>
      ) : null}

      <div style={termCardStyle}>
        <p
          className="mono"
          style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 600, textTransform: "uppercase" }}
        >
          Net edge games — games with a real rest edge, minus games against one
        </p>

        {isLoading ? (
          <Skeleton
            className="mt-3 h-[420px] w-full bg-[var(--term-surface-2)]"
            style={{ borderRadius: "var(--term-radius)" }}
          />
        ) : error || teams.length === 0 ? (
          <div
            className="mono mt-3 flex h-40 items-center justify-center"
            style={{
              ...termDashedEmptyStyle,
              color: error ? "var(--term-red)" : "var(--term-text-muted)",
            }}
          >
            {error ? "COULD NOT LOAD SCHEDULE DISPARITY" : "NO SCHEDULE DATA FOR THIS SEASON"}
          </div>
        ) : (
          <ol className="mt-3 flex list-none flex-col gap-[2px] p-0">
            {teams.map((t, i) => (
              <li
                key={t.teamId}
                className="grid items-center gap-2"
                style={{ gridTemplateColumns: "26px 40px 1fr 46px" }}
              >
                <span
                  className="mono text-right"
                  style={{ fontSize: 10, color: "var(--term-text-muted)", fontVariantNumeric: "tabular-nums" }}
                >
                  {i + 1}
                </span>
                <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: "var(--term-text)" }}>
                  {t.abbreviation}
                </span>
                <EdgeBar value={t.netEdgeGames} bound={bound} height={15} />
                <span
                  className="mono text-right"
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    color: edgeColor(t.netEdgeGames),
                  }}
                >
                  {signedNumber(t.netEdgeGames)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {data && teams.length > 0 ? (
        <>
          <div style={termCardStyle}>
            <p
              className="mono"
              style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 600, textTransform: "uppercase" }}
            >
              Full breakdown
            </p>
            {/* The scale the "worth" column cannot be read without. A rest edge is a real
                per-game effect and a small one; the column is small because the league hands
                edges out evenly, not because the effect is nothing. Stating only one of those
                two facts beside a wins figure is what makes it misread. */}
            <p
              data-testid="schedule-worth-scale"
              className="mt-2"
              style={{ fontSize: 13, color: "var(--term-text-muted)", maxWidth: WIDTH.prose, lineHeight: 1.55 }}
            >
              {/* Explicit {" "}: JSX drops a bare space that opens a text node after an
                  element, so "Worth prices" rendered as "Worthprices". */}
              <strong>Worth</strong>{" "}
              prices each edge at what it is measured to be: being the
              fresher side moves a home team&rsquo;s win probability {REST_SPAN_PP.toFixed(1)}{" "}
              points, against {HOME_COURT_SPAN_PP.toFixed(1)} for playing at home at all — about{" "}
              {Math.round(REST_SHARE_OF_HOME_COURT * 100)}% of home court. Spread across a season
              the league keeps close to even, no schedule is worth half a game either way.
            </p>
            <DataTable
              wrapperClassName="mt-3 overflow-x-auto"
              rows={teams}
              rowKey={(t) => t.teamId}
              columns={[
                {
                  label: "#",
                  align: "right",
                  style: { fontSize: 10, color: "var(--term-text-muted)" },
                  cell: (_t, i) => i + 1,
                },
                {
                  label: "Team",
                  className: "whitespace-nowrap",
                  cell: (t) => (
                    <>
                      <span style={{ fontWeight: 700 }}>{t.abbreviation}</span>{" "}
                      <span style={{ color: "var(--term-text-muted)" }}>{t.name}</span>
                    </>
                  ),
                },
                {
                  label: "Edge games",
                  style: { width: "30%", minWidth: 150 },
                  cell: (t) => <EdgeBar value={t.netEdgeGames} bound={bound} height={11} />,
                },
                {
                  label: "Net",
                  unit: "games",
                  numeric: true,
                  cell: (t) => (
                    <span style={{ fontWeight: 700, color: edgeColor(t.netEdgeGames) }}>
                      {signedNumber(t.netEdgeGames)}
                    </span>
                  ),
                },
                {
                  // The same figure the Season Report publishes, from the same conversion
                  // and the same population — the two must never disagree for a team.
                  label: "Worth",
                  unit: "wins",
                  numeric: true,
                  cell: (t) => (
                    <span
                      data-testid="schedule-value-wins"
                      style={{ fontWeight: 700, color: edgeColor(t.netEdgeGames) }}
                    >
                      {signedNumber(t.scheduleValueWins, 1)}
                    </span>
                  ),
                },
                {
                  label: "Fav / Unfav",
                  unit: "games",
                  numeric: true,
                  className: "whitespace-nowrap",
                  style: { color: "var(--term-text-muted)" },
                  cell: (t) => `${t.favorableGames} / ${t.unfavorableGames}`,
                },
                {
                  label: "Big edge",
                  unit: "games",
                  numeric: true,
                  cell: (t) => (
                    <span style={{ color: edgeColor(t.bigFavorableGames - t.bigUnfavorableGames) }}>
                      {signedNumber(t.bigFavorableGames - t.bigUnfavorableGames)}
                    </span>
                  ),
                },
                {
                  label: "B2B edge",
                  unit: "games",
                  numeric: true,
                  cell: (t) => (
                    <span style={{ color: edgeColor(t.backToBackEdge) }}>
                      {signedNumber(t.backToBackEdge)}
                    </span>
                  ),
                },
                {
                  label: "3-in-4 edge",
                  unit: "games",
                  numeric: true,
                  cell: (t) => (
                    <span style={{ color: edgeColor(t.threeInFourEdge) }}>
                      {signedNumber(t.threeInFourEdge)}
                    </span>
                  ),
                },
              ]}
            />

            <p style={{ marginTop: 12, fontSize: 13, color: "var(--term-text-muted)", lineHeight: 1.55 }}>
              Positive is favorable in every column. Edge games are counted from the same fatigue
              scores as the Games page, so a season in progress lags until its games are played.
            </p>
          </div>

          <ColumnGuide
            countedGames={data.league.countedGames}
            scheduledGames={data.scheduledGames}
          />
        </>
      ) : null}
    </div>
  )
}
