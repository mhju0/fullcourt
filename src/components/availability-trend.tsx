"use client"

import { useState, type PointerEvent as ReactPointerEvent } from "react"
import { AVAILABILITY_TREND_SEASONS } from "@/lib/availability-facts"
import { inspectionStep, SERIES_INSPECTION_HELP } from "@/lib/chart-inspection"
import { parseSeasonStartYear } from "@/lib/nba-season"
import { LEAD, termCardStyle, termSelectClass, termSelectStyle, TYPE, WIDTH } from "@/lib/terminal-styles"

export function AvailabilityTrend() {
  const seasons = AVAILABILITY_TREND_SEASONS
  const first = seasons[0]!
  const last = seasons.at(-1)!
  const [selectedSeason, setSelectedSeason] = useState(last.season)
  const selected = seasons.find((row) => row.season === selectedSeason) ?? last
  const max = Math.max(...seasons.map((row) => row.rate), 0.01)
  const selectedIndex = seasons.indexOf(selected)
  const firstYear = parseSeasonStartYear(first.season)
  const yearCount = parseSeasonStartYear(last.season) - firstYear + 1
  // Bars sit on a calendar grid with blank years, so a pointer picks the nearest measured season.
  const inspectPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const year = firstYear + Math.floor(((event.clientX - bounds.left) / bounds.width) * yearCount)
    const nearest = seasons.reduce((best, row) => Math.abs(parseSeasonStartYear(row.season) - year) < Math.abs(parseSeasonStartYear(best.season) - year) ? row : best)
    setSelectedSeason(nearest.season)
  }
  const body = { fontSize: TYPE.body, color: "var(--term-text-muted)", lineHeight: LEAD.body, maxWidth: WIDTH.prose }

  return <section className="flex flex-col gap-3" aria-labelledby="availability-trend-heading">
    <div className="flex items-center gap-3 py-1 text-lg">
      <h2 id="availability-trend-heading" className="font-bold">Best-player absences over time</h2>
      <span className="h-px flex-1 bg-[var(--term-border)]" />
    </div>
    <div style={termCardStyle}>
      <p style={body}><strong className="font-semibold text-[var(--term-text)]">Best-player absences in the included games.</strong>{" "}Source coverage varies by season, so these rates do not establish a league-wide trend. Blank spaces mark seasons without an eligible sample.</p>
      <figure className="mt-6 flex flex-col gap-2">
        <p id="availability-trend-help" className="text-[15px] text-[var(--term-text-muted)]">{SERIES_INSPECTION_HELP}</p>
        <div
          className="grid items-end gap-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--term-accent)]"
          style={{ height: 120, gridTemplateColumns: `repeat(${yearCount}, minmax(0, 1fr))`, gridTemplateRows: "1fr", touchAction: "manipulation", cursor: "pointer" }}
          role="group"
          tabIndex={0}
          aria-label={`Best-player absence rate in included team-games, ${first.season} through ${last.season}. Source coverage varies; seasons without eligible data are blank.`}
          aria-describedby="availability-trend-help"
          onPointerMove={(event) => { if (event.pointerType === "mouse") inspectPointer(event) }}
          onPointerDown={inspectPointer}
          onKeyDown={(event) => {
            const next = inspectionStep(event.key, selectedIndex, seasons.length)
            if (next === null) return
            event.preventDefault()
            setSelectedSeason(seasons[next]!.season)
          }}
        >
          {seasons.map((row) => <div key={row.season} aria-hidden="true" style={{ gridColumn: parseSeasonStartYear(row.season) - firstYear + 1, height: `${(row.rate / max) * 100}%`, background: row.season === selected.season ? "var(--term-blue)" : "var(--term-neutral)", borderRadius: "var(--term-radius-bar) var(--term-radius-bar) 0 0", minHeight: 2 }} />)}
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
