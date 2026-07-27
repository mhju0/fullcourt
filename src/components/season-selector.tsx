"use client"

import { NBA_SEASONS } from "@/lib/nba-season"
import { termSelectClass, termSelectStyle } from "@/lib/terminal-styles"
import { cn } from "@/lib/utils"

const SEASON_OPTIONS = [...NBA_SEASONS].reverse()

export function SeasonSelector({
  id,
  season,
  onSeasonChange,
  /**
   * Override the option list. Defaults to seasons with data; Schedule Disparity passes
   * `browsableSeasons()` so an upcoming schedule can be browsed before its season starts.
   */
  seasons,
}: {
  id: string
  season: string
  onSeasonChange: (season: string) => void
  seasons?: readonly string[]
}) {
  const options = seasons ? [...seasons].reverse() : SEASON_OPTIONS
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="mono"
        style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 600 }}
      >
        SEASON
      </label>
      <select
        id={id}
        value={season}
        onChange={(e) => onSeasonChange(e.target.value)}
        className={cn(termSelectClass, "max-w-xs")}
        style={termSelectStyle}
      >
        {options.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  )
}
