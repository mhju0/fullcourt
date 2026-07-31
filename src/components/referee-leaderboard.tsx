import {
  FOUL_COLUMNS,
  ranksFor,
  relativePct,
  type FoulColumnKey,
  type RefereeStyleRow,
} from "@/lib/referee-foul-style"
import { termCardStyle } from "@/lib/terminal-styles"

/**
 * The extremes, above the table.
 *
 * A 74-row table answers "who calls what" only for a reader willing to sort it. This answers
 * the question most people actually arrive with — who calls the most of each — and leaves the
 * table for the ones who want the rest.
 */
export function RefereeLeaderboard({
  rows,
  leagueShares,
}: {
  rows: RefereeStyleRow[]
  leagueShares: Record<FoulColumnKey, number>
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {FOUL_COLUMNS.map((col) => {
        const ordered = [...rows].sort((a, b) => b[col.key] - a[col.key])
        const most = ordered[0]
        const least = ordered[ordered.length - 1]
        const rank = ranksFor(rows, col.key)
        return (
          <div
            key={col.key}
            data-testid={`leader-${col.key}`}
            style={{ ...termCardStyle, padding: 14 }}
            className="flex flex-col gap-3"
          >
            <p
              className="mono"
              style={{ fontSize: 11, letterSpacing: "0.08em", fontWeight: 700, color: "var(--term-text-muted)" }}
            >
              {col.label.toUpperCase()} FOULS
              <span style={{ fontWeight: 400, marginLeft: 6 }}>{leagueShares[col.key]}% OF ALL FOULS</span>
            </p>
            {[
              { label: "MOST", row: most, tone: "var(--term-blue)" },
              { label: "FEWEST", row: least, tone: "var(--term-red)" },
            ].map(({ label, row, tone }) => (
              <div key={label} className="flex items-baseline justify-between gap-2">
                <span className="flex flex-col">
                  <span className="mono" style={{ fontSize: 9, letterSpacing: "0.1em", color: "var(--term-text-muted)" }}>
                    {label}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{row.name}</span>
                </span>
                <span
                  className="mono tabular-nums whitespace-nowrap"
                  style={{ fontSize: 15, fontWeight: 700, color: tone }}
                  title={`#${rank.get(row.name)} of ${rows.length}`}
                >
                  {relativePct(row[col.key], leagueShares[col.key]) > 0 ? "+" : "−"}
                  {Math.abs(relativePct(row[col.key], leagueShares[col.key]))}%
                </span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
