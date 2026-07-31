import { PLAYOFF_GRIND_MATRIX, type GrindCell } from "@/lib/playoff-rest-facts"
import { TERM_ACCENT, termCardStyle } from "@/lib/terminal-styles"

/** Below this a cell's rate is noise and must not be presented as the finding. */
const MIN_MEANINGFUL_N = 20

/**
 * Exactly one cell carries the accent, and only when it is unambiguously the highest.
 *
 * A tie lights nothing rather than lighting both: highlighting two cells asserts a story the
 * data has not picked. A small-n cell is never lit however high it reads.
 */
export function grindCellTone(cell: GrindCell, all: GrindCell[]): "lit" | "plain" {
  const eligible = all.filter((c) => c.n >= MIN_MEANINGFUL_N)
  if (eligible.length === 0) return "plain"
  const top = Math.max(...eligible.map((c) => c.winPct))
  if (eligible.filter((c) => c.winPct === top).length !== 1) return "plain"
  return cell.n >= MIN_MEANINGFUL_N && cell.winPct === top ? "lit" : "plain"
}

function Cell({ cell, all }: { cell: GrindCell; all: GrindCell[] }) {
  const lit = grindCellTone(cell, all) === "lit"
  return (
    <td
      className="tabular-nums"
      style={{
        padding: "14px 12px",
        textAlign: "right",
        background: lit ? "var(--term-surface-2)" : "transparent",
        borderTop: `2px solid ${lit ? TERM_ACCENT.blue : "transparent"}`,
        borderLeft: "1px solid var(--term-border)",
      }}
    >
      <span
        className="mono"
        style={{
          fontSize: lit ? 26 : 20,
          fontWeight: 700,
          color: lit ? "var(--term-blue)" : "var(--term-text)",
          lineHeight: 1.1,
        }}
      >
        {cell.winPct.toFixed(1)}%
      </span>
      <span
        className="mono block"
        style={{ fontSize: 11, color: "var(--term-text-muted)", letterSpacing: "0.04em", marginTop: 2 }}
      >
        {cell.n} SERIES
      </span>
    </td>
  )
}

const ROW_HEAD: React.CSSProperties = {
  padding: "14px 12px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 700,
  color: "var(--term-text)",
}

/**
 * The Grind Tax, rounds 2+. Rows are the home-court team's own prior-round grind, columns its
 * opponent's; every cell is the home-court team's series win rate.
 *
 * The bottom row is not filler. When the home-court team also went long, the opponent's grind
 * stops helping and reverses — a differential, not "long series are bad in the absolute", and
 * the one thing here a revealed-weakness story does not predict.
 */
export function PlayoffGrindMatrix() {
  const m = PLAYOFF_GRIND_MATRIX
  const all = [m.ownLowOppLow, m.ownLowOppHigh, m.ownHighOppLow, m.ownHighOppHigh]

  return (
    <div style={termCardStyle}>
      {/* Scrolls inside its own box so the page body never scrolls sideways on a phone. */}
      <div style={{ overflowX: "auto" }}>
        <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 420 }}>
          <caption
            className="mono"
            style={{
              captionSide: "top",
              textAlign: "left",
              fontSize: 11,
              letterSpacing: "0.08em",
              color: "var(--term-text-muted)",
              fontWeight: 700,
              paddingBottom: 10,
            }}
          >
            HOME-COURT TEAM&rsquo;S SERIES WIN RATE · ROUNDS 2+
          </caption>
          <thead>
            <tr>
              <th style={{ ...ROW_HEAD, color: "var(--term-text-muted)", fontSize: 11, letterSpacing: "0.08em" }}>
                THEIR LAST ROUND →
              </th>
              <th className="mono" style={{ ...ROW_HEAD, textAlign: "right", fontSize: 11, letterSpacing: "0.06em", color: "var(--term-text-muted)" }}>
                CLOSED IT EARLY
              </th>
              <th className="mono" style={{ ...ROW_HEAD, textAlign: "right", fontSize: 11, letterSpacing: "0.06em", color: "var(--term-text-muted)" }}>
                WENT THE DISTANCE
              </th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderTop: "1px solid var(--term-border)" }}>
              <th scope="row" style={ROW_HEAD}>You closed it early</th>
              <Cell cell={m.ownLowOppLow} all={all} />
              <Cell cell={m.ownLowOppHigh} all={all} />
            </tr>
            <tr style={{ borderTop: "1px solid var(--term-border)" }}>
              <th scope="row" style={ROW_HEAD}>You went the distance</th>
              <Cell cell={m.ownHighOppLow} all={all} />
              <Cell cell={m.ownHighOppHigh} all={all} />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3" style={{ fontSize: 15, color: "var(--term-text-muted)", lineHeight: 1.55, maxWidth: "42rem" }}>
        &ldquo;Closed it early&rdquo; means a team won its previous round within one game of a
        sweep; &ldquo;went the distance&rdquo; means it needed the last game or the one before
        it. Measured that way rather than by raw games played because a five-game
        best-of-five went the distance while a five-game best-of-seven did not.
      </p>
    </div>
  )
}
