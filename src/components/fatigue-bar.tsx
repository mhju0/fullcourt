import { cn } from "@/lib/utils"

/** Score treated as 100% fill on the bar — scores above are clamped. */
const SCALE_MAX = 10

export type FatigueBarTone = "higher" | "lower" | "neutral"

function toneColor(tone: FatigueBarTone): string {
  if (tone === "higher") return "var(--term-red)"
  if (tone === "lower") return "var(--term-blue)"
  return "var(--term-neutral)"
}

interface FatigueBarProps {
  score: number
  tone?: FatigueBarTone
  className?: string
}

/**
 * Thin 4px horizontal bar. Color encodes relative position in the matchup:
 * red = higher fatigue, blue = lower fatigue, grey = neutral / single-team.
 *
 * Decorative to assistive tech (2026-08-24, axe pass). Every caller prints the score as
 * text right beside the bar, so the bar is a visual restatement of an adjacent number —
 * and it used to be an *unnamed* `role="progressbar"`, which axe flags as serious and a
 * screen reader announces as an anonymous control before reading the same value again as
 * text. Nothing is in progress here anyway; if the bar ever renders without its printed
 * score, it needs a real accessible name, not the role back.
 */
export function FatigueBar({ score, tone = "neutral", className }: FatigueBarProps) {
  const fillPct = Math.min((score / SCALE_MAX) * 100, 100)

  return (
    <div
      className={cn("relative w-full overflow-hidden bg-[var(--term-border)]", className)}
      style={{ height: "4px", borderRadius: "var(--term-radius-bar)" }}
      aria-hidden
    >
      <div
        className="h-full transition-[width] duration-500 ease-out"
        style={{ width: `${fillPct}%`, background: toneColor(tone) }}
      />
    </div>
  )
}
