"use client"

import { NBA_SEASONS } from "@/lib/nba-season"
import { termSelectClass, termSelectStyle, TRACK, MONO_FONT_STACK } from "@/lib/terminal-styles"
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
  disabled = false,
  options: customOptions,
  ariaLabel,
}: {
  id: string
  season: string
  onSeasonChange: (season: string) => void
  disabled?: boolean
  seasons?: readonly string[]
  options?: readonly { value: string; label: string }[]
  ariaLabel?: string
}) {
  const options = customOptions ?? (seasons ? [...seasons].reverse() : SEASON_OPTIONS).map(s => ({ value: s, label: s }))
  return (
    <div className="fc-season-selector flex flex-col gap-2">
      <label
        htmlFor={id}
        className="mono"
        style={{ fontSize: 11, letterSpacing: TRACK.label, color: "var(--term-text-muted)", fontWeight: 600 }}
      >
        SEASON
      </label>
      <select
        id={id}
        aria-label={ariaLabel}
        disabled={disabled}
        value={season}
        onChange={(e) => onSeasonChange(e.target.value)}
        className={cn(termSelectClass, "w-40 min-h-11")}
        style={{ ...termSelectStyle, fontSize: 16, fontFamily: MONO_FONT_STACK }}
      >
        {options.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  )
}
