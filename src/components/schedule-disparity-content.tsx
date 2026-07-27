"use client"

import { useState } from "react"
import useSWR from "swr"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { SeasonSelector } from "@/components/season-selector"
import { Skeleton } from "@/components/ui/skeleton"
import { deviationFill, formatDeviation, minBarSize } from "@/components/analysis-content"
import { apiFetcher } from "@/lib/fetcher"
import { NBA_SEASONS } from "@/lib/nba-season"
import {
  MONO_FONT_STACK,
  termCardStyle,
  termInsetStyle,
  termTdStyle,
  termThStyle,
} from "@/lib/terminal-styles"
import type { ScheduleDisparityResponse, ScheduleDisparityTeam } from "@/types"

const LATEST_SEASON = NBA_SEASONS[NBA_SEASONS.length - 1]

/** Signed whole days, matching the deviation phrasing used on the Analysis charts. */
function formatDays(days: number): string {
  if (days === 0) return "0"
  return `${days > 0 ? "+" : "−"}${Math.abs(days)}`
}

/** Signed fatigue points to one decimal; null when no counted game is scored yet. */
function formatFatigue(edge: number | null): string {
  if (edge === null) return "—"
  const rounded = Math.round(edge * 10) / 10
  if (rounded === 0) return "0.0"
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)}`
}

interface ChartDatum {
  label: string
  edge: number
  name: string
  games: number
}

function EdgeTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartDatum }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload

  return (
    <div className="mono" style={{ ...termInsetStyle, fontSize: 11, padding: "8px 10px" }}>
      <p style={{ fontWeight: 700, color: "var(--term-text)" }}>{d.name}</p>
      <p style={{ marginTop: 2, color: deviationFill(d.edge) }}>
        <span style={{ fontWeight: 700 }}>{formatDays(d.edge)} DAYS</span> NET REST EDGE
      </p>
      <p style={{ marginTop: 2, color: "var(--term-text-muted)" }}>{d.games} GAMES COUNTED</p>
    </div>
  )
}

export function ScheduleDisparityContent() {
  const [season, setSeason] = useState<string>(LATEST_SEASON)

  const { data, error, isLoading } = useSWR<ScheduleDisparityResponse>(
    `/api/schedule-disparity?season=${season}`,
    apiFetcher
  )

  const teams: ScheduleDisparityTeam[] = data?.teams ?? []
  const chartData: ChartDatum[] = teams.map((t) => ({
    label: t.abbreviation,
    edge: t.netRestEdge,
    name: t.name,
    games: t.games,
  }))

  // The domain is symmetric around zero so a team's bar length is comparable in both
  // directions — an asymmetric axis would make a −8 look longer than a +8.
  const peak = chartData.length ? Math.max(...chartData.map((d) => Math.abs(d.edge)), 1) : 1
  const bound = Math.ceil(peak / 5) * 5

  return (
    <div className="flex flex-col gap-4">
      <div style={termCardStyle}>
        <SeasonSelector id="schedule-disparity-season" season={season} onSeasonChange={setSeason} />
        {data ? (
          <p
            className="mono"
            style={{ marginTop: 10, fontSize: 11, color: "var(--term-text-muted)", lineHeight: 1.6 }}
          >
            {data.provisional ? (
              <>
                PROVISIONAL · {data.gamesPerTeamMin === data.gamesPerTeamMax
                  ? `${data.gamesPerTeamMax} GAMES`
                  : `${data.gamesPerTeamMin}–${data.gamesPerTeamMax} GAMES`}{" "}
                SCHEDULED PER TEAM · AS OF {data.asOf}
              </>
            ) : (
              <>FINAL · {data.league.countedGames} GAMES COUNTED</>
            )}
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

      <div style={termCardStyle}>
        <p
          className="mono"
          style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 600 }}
        >
          NET REST EDGE — DAYS, VS OPPONENTS
        </p>
        <div style={{ height: 340, marginTop: 12 }}>
          {isLoading ? (
            <Skeleton
              className="h-full w-full bg-[var(--term-surface-2)]"
              style={{ borderRadius: "var(--term-radius)" }}
            />
          ) : error || chartData.length === 0 ? (
            <div
              className="mono flex h-full items-center justify-center"
              style={{
                border: "1px dashed var(--term-border)",
                borderRadius: "var(--term-radius)",
                fontSize: 12,
                color: error ? "var(--term-red)" : "var(--term-text-muted)",
              }}
            >
              {error ? "COULD NOT LOAD SCHEDULE DISPARITY" : "NO SCHEDULE DATA FOR THIS SEASON"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--term-border)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "var(--term-text-muted)", fontFamily: MONO_FONT_STACK }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={-45}
                  textAnchor="end"
                  height={52}
                />
                <YAxis
                  domain={[-bound, bound]}
                  tickFormatter={formatDeviation}
                  tick={{ fontSize: 12, fill: "var(--term-text-muted)", fontFamily: MONO_FONT_STACK }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip cursor={{ fill: "rgba(23,64,139,0.06)" }} content={<EdgeTooltip />} />
                <Bar dataKey="edge" maxBarSize={28} minPointSize={minBarSize} isAnimationActive={false}>
                  {chartData.map((d) => (
                    <Cell key={d.label} fill={deviationFill(d.edge)} />
                  ))}
                </Bar>
                {/* Zero is the fair schedule, so it is solid ink rather than a gridline. */}
                <ReferenceLine y={0} stroke="var(--term-text)" strokeWidth={1.5} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {data && teams.length > 0 ? (
        <div style={termCardStyle}>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={termThStyle}>TEAM</th>
                  <th style={{ ...termThStyle, textAlign: "right" }}>NET REST EDGE</th>
                  <th style={{ ...termThStyle, textAlign: "right" }}>UNCAPPED</th>
                  <th style={{ ...termThStyle, textAlign: "right" }}>NET FATIGUE EDGE</th>
                  <th style={{ ...termThStyle, textAlign: "right" }}>B2B DIFF</th>
                  <th style={{ ...termThStyle, textAlign: "right" }}>3-IN-4 DIFF</th>
                  <th style={{ ...termThStyle, textAlign: "right" }}>GAMES</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => (
                  <tr key={t.teamId}>
                    <td style={termTdStyle}>
                      <span style={{ fontWeight: 700 }}>{t.abbreviation}</span>{" "}
                      <span style={{ color: "var(--term-text-muted)" }}>{t.name}</span>
                    </td>
                    <td
                      style={{ ...termTdStyle, textAlign: "right", color: deviationFill(t.netRestEdge), fontWeight: 700 }}
                    >
                      {formatDays(t.netRestEdge)}
                    </td>
                    <td style={{ ...termTdStyle, textAlign: "right", color: "var(--term-text-muted)" }}>
                      {formatDays(t.netRestEdgeUncapped)}
                    </td>
                    <td style={{ ...termTdStyle, textAlign: "right" }}>{formatFatigue(t.netFatigueEdge)}</td>
                    <td style={{ ...termTdStyle, textAlign: "right" }}>{formatDays(t.backToBackDiff)}</td>
                    <td style={{ ...termTdStyle, textAlign: "right" }}>{formatDays(t.threeInFourDiff)}</td>
                    <td style={{ ...termTdStyle, textAlign: "right", color: "var(--term-text-muted)" }}>
                      {t.games}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: 12, fontSize: 13, color: "var(--term-text-muted)", lineHeight: 1.55 }}>
            Rest is capped at five days per side before differencing, because the All-Star break
            otherwise dominates a season total with something that is not disparity. The uncapped
            column is shown so the cap is auditable. Net fatigue edge folds in travel and schedule
            density, and lags for games that have not been played.
          </p>
        </div>
      ) : null}
    </div>
  )
}
