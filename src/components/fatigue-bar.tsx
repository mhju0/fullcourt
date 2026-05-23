import { cn } from "@/lib/utils"

/** Score treated as 100% fill on the bar — scores above are clamped. */
const SCALE_MAX = 10

export type FatigueBarTone = "higher" | "lower" | "neutral"

function toneColor(tone: FatigueBarTone): string {
  if (tone === "higher") return "#C9082A"
  if (tone === "lower") return "#17408B"
  return "#888888"
}

interface FatigueBarProps {
  score: number
  tone?: FatigueBarTone
  className?: string
}

/**
 * Thin 4px horizontal bar. Color encodes relative position in the matchup:
 * red = higher fatigue, blue = lower fatigue, grey = neutral / single-team.
 */
export function FatigueBar({ score, tone = "neutral", className }: FatigueBarProps) {
  const fillPct = Math.min((score / SCALE_MAX) * 100, 100)

  return (
    <div
      className={cn("relative w-full overflow-hidden bg-[#E2DFD8]", className)}
      style={{ height: "4px", borderRadius: "1px" }}
      role="progressbar"
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={SCALE_MAX}
    >
      <div
        className="h-full transition-[width] duration-500 ease-out"
        style={{ width: `${fillPct}%`, background: toneColor(tone) }}
      />
    </div>
  )
}
