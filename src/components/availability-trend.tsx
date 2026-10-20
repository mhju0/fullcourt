"use client"

import { useState } from "react"
import { AVAILABILITY_TREND_SEASONS } from "@/lib/availability-facts"
import { parseSeasonStartYear } from "@/lib/nba-season"
import { LEAD, termCardStyle, termSelectClass, termSelectStyle, TYPE, WIDTH } from "@/lib/terminal-styles"

export function AvailabilityTrend() {
  const seasons = AVAILABILITY_TREND_SEASONS
  const first = seasons[0]!
  const last = seasons.at(-1)!
  const [selectedSeason, setSelectedSeason] = useState(last.season)
  const selected = seasons.find((row) => row.season === selectedSeason) ?? last
  const max = Math.max(...seasons.map((row) => row.rate), 0.01)
  const firstYear = parseSeasonStartYear(first.season)
  const yearCount = parseSeasonStartYear(last.season) - firstYear + 1
  const body = { fontSize: TYPE.body, color: "var(--term-text-muted)", lineHeight: LEAD.body, maxWidth: WIDTH.prose }

  return <section className="flex flex-col gap-3" aria-labelledby="availability-trend-heading">
    <div className="flex items-center gap-3 py-1 text-lg">
      <h2 id="availability-trend-heading" className="font-bold">Best-player absences over time</h2>
      <span className="h-px flex-1 bg-[var(--term-border)]" />
    </div>
    <div style={termCardStyle}>
      <p style={body}><strong className="font-semibold text-[var(--term-text)]">Best-player absences in the included games.</strong>{" "}Source coverage varies by season, so these rates do not establish a league-wide trend. Blank spaces mark seasons without an eligible sample.</p>
      <figure className="mt-6 flex flex-col gap-2">
        <div className="grid items-end gap-[2px]" style={{ height: 120, gridTemplateColumns: `repeat(${yearCount}, minmax(0, 1fr))`, gridTemplateRows: "1fr" }} role="img" aria-label={`Best-player absence rate in included team-games, ${first.season} through ${last.season}. Select a measured season below for its rate and count. Source coverage varies; seasons without eligible data are blank.`}>
          {seasons.map((row) => <div key={row.season} title={`${row.season} — ${(row.rate * 100).toFixed(1)}% of ${row.teamGames.toLocaleString()} team-games`} style={{ gridColumn: parseSeasonStartYear(row.season) - firstYear + 1, height: `${(row.rate / max) * 100}%`, background: row.season === selected.season ? "var(--term-blue)" : "var(--term-neutral)", borderRadius: "var(--term-radius-bar) var(--term-radius-bar) 0 0", minHeight: 2 }} />)}
        </div>
        <figcaption className="mono flex justify-between gap-2 text-xs text-[var(--term-text-muted)]"><span>{first.season}</span><span>{last.season}</span></figcaption>
      </figure>
      <label className="mt-4 flex max-w-sm flex-col gap-2 text-[15px]">Measured season
        <select className={`${termSelectClass} min-h-11 w-full`} style={{ ...termSelectStyle, fontSize: 16 }} value={selected.season} onChange={(event) => setSelectedSeason(event.target.value)}>
          {seasons.map((row) => <option key={row.season} value={row.season}>{row.season}</option>)}
        </select>
      </label>
      <div className="mt-3 border border-[var(--term-border)] p-4" role="status" aria-live="polite">
        <div className="flex flex-wrap items-baseline justify-between gap-3"><h3 className="text-lg font-semibold">{selected.season}</h3><p className="mono text-[32px] font-semibold">{(selected.rate * 100).toFixed(1)}%</p></div>
        <p className="mt-2 text-[15px] text-[var(--term-text-muted)]">Best player absent · {selected.teamGames.toLocaleString()} included team-games</p>
      </div>
      <p className="mt-4" style={body}>Each rate uses the source-supported team-games available for that season. Small or incomplete samples can differ from the league as a whole.</p>
    </div>
  </section>
}
