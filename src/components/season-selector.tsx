"use client"

import { NBA_SEASONS } from "@/lib/nba-season"
import { termSelectClass, termSelectStyle } from "@/lib/terminal-styles"
import { cn } from "@/lib/utils"

const SEASON_OPTIONS = [...NBA_SEASONS].reverse()

export function SeasonSelector({
  id,
  season,
  onSeasonChange,
}: {
  id: string
  season: string
  onSeasonChange: (season: string) => void
}) {
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
        {SEASON_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  )
}
