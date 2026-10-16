import { LEAD, termCardStyle, TRACK, TYPE } from "@/lib/terminal-styles"
import { cn } from "@/lib/utils"

export type SummaryItem = { label: string; value: string; tone?: string }

/**
 * A row of measures in one card, label over figure, split by hairlines. The Games slate and a
 * team's season both open with one. The caller sets the grid columns on `className`.
 */
export function SummaryLine({
  label,
  items,
  testId,
  className,
}: {
  label: string
  items: readonly SummaryItem[]
  testId?: string
  className?: string
}) {
  return (
    <dl aria-label={label} data-testid={testId} className={cn("mono", className)} style={{ ...termCardStyle, padding: 0 }}>
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col gap-1 border-l border-[var(--term-border)] px-3 py-2 first:border-l-0 sm:px-4 sm:py-3">
          <dt style={{ fontSize: TYPE.micro, letterSpacing: TRACK.label, fontWeight: 600, color: "var(--term-text-muted)" }}>
            {item.label}
          </dt>
          <dd className="tabular-nums" style={{ fontSize: TYPE.emph, fontWeight: 700, lineHeight: LEAD.figure, color: item.tone ?? "var(--term-text)" }}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
