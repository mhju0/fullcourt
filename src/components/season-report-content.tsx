"use client"

import { useMemo, useState, type CSSProperties } from "react"
import useSWR from "swr"
import { ExploreGameDetailModal } from "@/components/explore-game-detail-modal"
import { SeasonSelector } from "@/components/season-selector"
import { Skeleton } from "@/components/ui/skeleton"
import { ZeroRestWorkload } from "@/components/zero-rest-workload"
import { apiFetcher } from "@/lib/fetcher"
import { NBA_SEASONS } from "@/lib/nba-season"
import {
  ABNORMAL_SEASON_NOTES,
  allSeasonNormExcluding,
  MIN_GAMES_FOR_INFERENCE,
  seasonReportVerdict,
  type SeasonReportCall,
  type SeasonReportRate,
  type SeasonReportResponse,
  type SeasonReportTeamLabelled,
  type SeasonReportVerdict,
  type SeasonReportWeek,
} from "@/lib/season-report"
import {
  TERM_NUMERIC_TABLE_MAX_WIDTH,
  termCardStyle,
  termTdStyle,
  termThStyle,
  termThUnitStyle,
} from "@/lib/terminal-styles"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts"
import type { AnalysisResponse } from "@/types"
import { signedNumber } from "@/lib/signed-number"

// The newest season with data, which is the current one by construction: NBA_SEASONS is
// derived from the ET date. No separate "is it the current season" question to get wrong.
const LATEST_SEASON = NBA_SEASONS[NBA_SEASONS.length - 1]

/**
 * The vs-history blurb, read off the loaded season rather than a hardcoded 82-game figure —
 * a shortened season (1998-99, 2019-20 pre-bubble) or a mid-season one carries a real, much
 * wider band, and stating "roughly 940 games" beside either was simply false.
 */
function decidableGamesSentence(rate: SeasonReportRate): string {
  if (rate.band === null) return "This season has no games with a decidable rest gap yet."
  return `This season has produced ${rate.games.toLocaleString()} games with a decidable rest gap so far, worth about ±${rate.band.toFixed(1)} percentage points either way. Seasons move inside that range more often than they move outside it.`
}

/** The middle value of a sorted number list, for a prose figure that should track real data. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
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
  const gated = rate.games < MIN_GAMES_FOR_INFERENCE || rate.band === null
  return (
    <Tile
      label={label}
      value={gated ? "—" : `${rate.winPct.toFixed(1)}%`}
      sub={
        !gated
          ? `±${rate.band!.toFixed(1)} · ${rate.games.toLocaleString()} GAMES`
          : rate.games === 0
            ? "NO DECIDABLE GAMES YET"
            : `TOO EARLY · ${rate.games} OF ${MIN_GAMES_FOR_INFERENCE} GAMES NEEDED`
      }
      accent={gated ? "var(--term-neutral)" : "var(--term-blue)"}
      testId={testId}
    />
  )
}

/**
 * The note above the tiles when the selected season did not run the ordinary 82-game shape.
 *
 * Rendered from the season alone, so it is up before the data arrives rather than after —
 * the point is to be read *first*, not to caption numbers already on screen.
 */
function AbnormalSeasonNote({ season }: { season: string }) {
  const note = ABNORMAL_SEASON_NOTES[season]
  if (!note) return null

  return (
    <div
      data-testid="abnormal-season-note"
      className="flex flex-col gap-2"
      style={{ ...termCardStyle, padding: 16, borderLeft: "2px solid var(--term-amber)" }}
    >
      <span
        className="mono"
        style={{ fontSize: 11, letterSpacing: "0.08em", fontWeight: 700, color: "var(--term-amber)" }}
      >
        {note.label}
      </span>
      <p style={{ fontSize: 14, color: "var(--term-text-muted)", maxWidth: "42rem", lineHeight: 1.55 }}>
        {note.note}
      </p>
    </div>
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

/** The one sentence under the tiles. Four states, no superlative. */
function VerdictLine({ verdict }: { verdict: SeasonReportVerdict }) {
  const { text, tone } =
    verdict.kind === "tooEarly"
      ? {
          text: `TOO EARLY TO CALL — ${verdict.games.toLocaleString()} DECIDABLE GAMES SO FAR`,
          tone: "var(--term-text-muted)",
        }
      : verdict.kind === "noNorm"
        ? {
            text: "ALL-SEASON NORM UNAVAILABLE",
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

/** Blue positive, red negative, grey exactly even — the diverging pair the other pages use. */
function swingColor(swing: number | null): string {
  if (swing === null || swing === 0) return "var(--term-neutral)"
  return swing > 0 ? "var(--term-blue)" : "var(--term-red)"
}

/**
 * The three cells for one arm of the split — wins, losses, win rate — or em dashes across
 * all three when the team never played on that side. Wins and losses get their own columns
 * rather than a packed "21-8" so neither number has to be inferred from its position.
 */
function ArmCells({ wins, games, pct }: { wins: number; games: number; pct: number | null }) {
  const cell: CSSProperties = { ...termTdStyle, textAlign: "right" }
  if (pct === null) {
    return (
      <>
        <td style={cell}>—</td>
        <td style={cell}>—</td>
        <td style={cell}>—</td>
      </>
    )
  }
  return (
    <>
      <td className="tabular-nums" style={cell}>{wins}</td>
      <td className="tabular-nums" style={cell}>{games - wins}</td>
      <td className="tabular-nums" style={cell}>{pct.toFixed(0)}%</td>
    </>
  )
}

/**
 * The edge-conversion blurb, read off the loaded teams rather than a hardcoded "roughly
 * thirty" — true only of a completed 82-game season, and false mid-season or in a shortened
 * one, where each arm carries far fewer games.
 */
function edgeConversionSentence(teams: SeasonReportTeamLabelled[]): string {
  const armSize = teams.length > 0 ? Math.round(median(teams.map((t) => t.restedGames))) : 0
  const armSentence =
    armSize > 0
      ? `Around ${armSize} games sit behind each arm for a typical team, so treat these`
      : "Treat these"
  return `How much better each team played as the fresher side than as the tireder one. A team is its own comparison here, because win rate when rested on its own mostly ranks how good the team was. ${armSentence} as records rather than as a table of who manages rest well.`
}

/**
 * Rest edge conversion.
 *
 * A record table, deliberately not a ranking. Each team is measured against its own
 * tired record rather than the league's, because raw win-rate-when-rested ranks team
 * quality — but the difference of two ~30-game proportions still carries roughly twelve
 * points of standard error, so nothing here is crowned and every row shows its n.
 */
function EdgeConversion({ teams }: { teams: SeasonReportTeamLabelled[] }) {
  const thin = teams.filter((t) => t.restedGames < 10 || t.tiredGames < 10).length

  return (
    <div className="flex flex-col gap-3">
      <SectionDivider label="REST EDGE CONVERSION" descriptor="RECORDS, NOT A RANKING" />
      <p style={{ fontSize: 14, color: "var(--term-text-muted)", maxWidth: "42rem", lineHeight: 1.55 }}>
        {edgeConversionSentence(teams)}
      </p>
      <div className="overflow-x-auto">
        <table className="mono w-full" style={{ borderCollapse: "collapse", minWidth: 560, maxWidth: TERM_NUMERIC_TABLE_MAX_WIDTH }}>
          <thead>
            <tr>
              <th rowSpan={2} style={termThStyle}>TEAM</th>
              <th colSpan={3} style={{ ...termThStyle, textAlign: "center", borderBottom: "none" }}>
                RESTED
              </th>
              <th colSpan={3} style={{ ...termThStyle, textAlign: "center", borderBottom: "none" }}>
                TIRED
              </th>
              <th rowSpan={2} style={{ ...termThStyle, textAlign: "right" }}>
                SWING
                <span style={termThUnitStyle}>PCT POINTS</span>
              </th>
            </tr>
            <tr>
              {["WINS", "LOSSES", "WIN%", "WINS", "LOSSES", "WIN%"].map((label, i) => (
                <th key={i} style={{ ...termThStyle, textAlign: "right" }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => {
              const thinRow = t.restedGames < 10 || t.tiredGames < 10
              return (
                <tr key={t.teamId} data-testid="edge-conversion-row" style={{ opacity: thinRow ? 0.45 : 1 }}>
                  <td style={termTdStyle}>{t.abbreviation}</td>
                  <ArmCells wins={t.restedWins} games={t.restedGames} pct={t.restedWinPct} />
                  <ArmCells wins={t.tiredWins} games={t.tiredGames} pct={t.tiredWinPct} />
                  <td
                    className="tabular-nums"
                    style={{ ...termTdStyle, textAlign: "right", color: swingColor(t.swing), fontWeight: 700 }}
                  >
                    {t.swing === null ? "—" : signedNumber(t.swing, 1)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {thin > 0 ? (
        <p className="mono" style={{ fontSize: 11, color: "var(--term-text-muted)" }}>
          {thin} {thin === 1 ? "TEAM HAS" : "TEAMS HAVE"} FEWER THAN 10 GAMES ON ONE SIDE AND {thin === 1 ? "IS" : "ARE"} DIMMED
        </p>
      ) : null}
    </div>
  )
}

/**
 * Loudest calls.
 *
 * Ranked by rest gap and not by margin, because the two are uncorrelated: a
 * margin ranking fills up with blowouts the model had no opinion about.
 */
function LoudestCalls({
  calls,
  abbrById,
}: {
  calls: SeasonReportCall[]
  abbrById: Map<number, string>
}) {
  const [openGameId, setOpenGameId] = useState<number | null>(null)

  return (
    <div className="flex flex-col gap-3">
      <SectionDivider label="LOUDEST CALLS" descriptor="RANKED BY REST GAP" />
      <p style={{ fontSize: 14, color: "var(--term-text-muted)", maxWidth: "42rem", lineHeight: 1.55 }}>
        The games where the two teams arrived in the most different states, whether or not
        it worked out. Ranked by the size of the rest gap rather than by the final margin,
        because the two have nothing to do with each other.
      </p>
      <div className="flex flex-col gap-[2px]">
        {calls.map((c) => (
          <button
            key={c.gameId}
            type="button"
            data-testid="loudest-call-row"
            onClick={() => setOpenGameId(c.gameId)}
            className="mono flex items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--term-surface-2)]"
            style={{
              background: "var(--term-surface)",
              border: "1px solid var(--term-border)",
              borderLeft: `2px solid ${c.restedTeamWon ? "var(--term-blue)" : "var(--term-red)"}`,
              borderRadius: "var(--term-radius)",
              fontSize: 12,
            }}
          >
            <span className="tabular-nums" style={{ color: "var(--term-text-muted)", minWidth: 84 }}>
              {c.date}
            </span>
            <span style={{ flex: 1, color: "var(--term-text)", fontWeight: 600 }}>
              {abbrById.get(c.awayTeamId) ?? "—"} @ {abbrById.get(c.homeTeamId) ?? "—"}
            </span>
            {/* Dropped below `sm`: the five columns' minimum widths total more than a 390px
                phone, which pushed the whole page into a horizontal scroll. The score is the
                one value here a reader can get by opening the row, so it is the one to cut. */}
            <span
              className="hidden tabular-nums sm:inline"
              style={{ color: "var(--term-text-muted)", minWidth: 64 }}
            >
              {c.awayScore}-{c.homeScore}
            </span>
            <span className="tabular-nums" style={{ color: "var(--term-text)", minWidth: 76 }}>
              RA {c.restAdvantage.toFixed(2)}
            </span>
            <span
              style={{
                minWidth: 72,
                textAlign: "right",
                fontWeight: 700,
                color: c.restedTeamWon ? "var(--term-blue)" : "var(--term-red)",
              }}
            >
              {c.restedTeamWon ? "HIT" : "MISS"} {signedNumber(c.restedMargin, 1).replace(".0", "")}
            </span>
          </button>
        ))}
      </div>
      <ExploreGameDetailModal
        gameId={openGameId}
        open={openGameId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenGameId(null)
        }}
      />
    </div>
  )
}

/** Schedule tax — facts about what each team was asked to do. No inference, so no gate. */
function ScheduleTax({ teams }: { teams: SeasonReportTeamLabelled[] }) {
  const byMiles = [...teams].sort((a, b) => b.travelMiles - a.travelMiles || a.teamId - b.teamId)
  const most = byMiles[0]
  const least = byMiles[byMiles.length - 1]

  return (
    <div className="flex flex-col gap-3">
      <SectionDivider label="SCHEDULE TAX" descriptor="COMPLETED GAMES ONLY" />
      <p style={{ fontSize: 14, color: "var(--term-text-muted)", maxWidth: "42rem", lineHeight: 1.55 }}>
        What the schedule asked of each team. These are counts, not estimates — nothing here is
        a claim about who won because of it.
      </p>
      {most && least ? (
        <p className="mono" style={{ fontSize: 11, color: "var(--term-text-muted)" }}>
          {most.abbreviation} FLEW THE MOST AT {most.travelMiles.toLocaleString()} MILES ·{" "}
          {least.abbreviation} THE LEAST AT {least.travelMiles.toLocaleString()}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="mono w-full" style={{ borderCollapse: "collapse", minWidth: 520, maxWidth: TERM_NUMERIC_TABLE_MAX_WIDTH }}>
          <thead>
            <tr>
              <th style={termThStyle}>TEAM</th>
              <th style={{ ...termThStyle, textAlign: "right" }}>MILES FLOWN</th>
              <th style={{ ...termThStyle, textAlign: "right" }}>
                BACK-TO-BACKS
                <span style={termThUnitStyle}>GAMES</span>
              </th>
              <th style={{ ...termThStyle, textAlign: "right" }}>
                3-IN-4
                <span style={termThUnitStyle}>GAMES</span>
              </th>
              <th style={{ ...termThStyle, textAlign: "right" }}>
                JET LAG
                <span style={termThUnitStyle}>GAMES</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {byMiles.map((t) => (
              <tr key={t.teamId} data-testid="schedule-tax-row">
                <td style={termTdStyle}>{t.abbreviation}</td>
                <td className="tabular-nums" style={{ ...termTdStyle, textAlign: "right" }}>
                  {t.travelMiles.toLocaleString()}
                </td>
                <td className="tabular-nums" style={{ ...termTdStyle, textAlign: "right" }}>{t.backToBacks}</td>
                <td className="tabular-nums" style={{ ...termTdStyle, textAlign: "right" }}>{t.threeInFours}</td>
                <td className="tabular-nums" style={{ ...termTdStyle, textAlign: "right" }}>{t.jetLagGames}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** The league's fatigue curve across the season, in seven-day buckets from the first game. */
function FatigueCalendar({ weeks }: { weeks: SeasonReportWeek[] }) {
  const peak = weeks.reduce<SeasonReportWeek | null>(
    (best, w) => (best === null || w.avgFatigue > best.avgFatigue ? w : best),
    null
  )

  return (
    <div className="flex flex-col gap-3">
      <SectionDivider label="FATIGUE CALENDAR" descriptor="LEAGUE AVERAGE BY WEEK" />
      <p style={{ fontSize: 14, color: "var(--term-text-muted)", maxWidth: "42rem", lineHeight: 1.55 }}>
        Average fatigue across every team in every game, week by week. The season is not evenly
        hard — density, travel and back-to-backs pile up in stretches.
      </p>
      {peak ? (
        <p className="mono" style={{ fontSize: 11, color: "var(--term-text-muted)" }}>
          PEAK: WEEK {peak.week} OF {weeks.length}, FROM {peak.startDate}, AT {peak.avgFatigue.toFixed(2)}
        </p>
      ) : null}
      <div data-testid="fatigue-calendar" style={{ ...termCardStyle, height: 220, padding: 12 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weeks} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
            <XAxis
              dataKey="week"
              tick={{ fontSize: 10, fill: "var(--term-text-muted)" }}
              stroke="var(--term-border)"
              interval={3}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--term-text-muted)" }}
              stroke="var(--term-border)"
              width={32}
            />
            <Bar dataKey="avgFatigue" fill="var(--term-hardwood)" maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
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

  const abbrById = useMemo(
    () => new Map((data?.teams ?? []).map((t) => [t.teamId, t.abbreviation])),
    [data]
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

      <AbnormalSeasonNote season={season} />

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
              descriptor="EXCLUDES THE DISPLAYED SEASON"
              testId="season-vs-history-heading"
            />
            {verdict ? <VerdictLine verdict={verdict} /> : null}
            <p style={{ fontSize: 14, color: "var(--term-text-muted)", maxWidth: "42rem", lineHeight: 1.55 }}>
              {decidableGamesSentence(data.overall)}{" "}
              <a href="/analysis" style={{ color: "var(--term-blue)", fontWeight: 600 }}>
                See the full backtest →
              </a>
            </p>
          </div>

          <EdgeConversion teams={data.teams} />
          <LoudestCalls calls={data.loudestCalls} abbrById={abbrById} />
          <ScheduleTax teams={data.teams} />
          <FatigueCalendar weeks={data.weeks} />

          <div className="flex flex-col gap-3">
            <SectionDivider label="ZERO-REST WORKLOAD" descriptor="VOLUME, NOT EFFECT" />
            <ZeroRestWorkload season={data.season} />
          </div>
        </>
      )}
    </div>
  )
}
