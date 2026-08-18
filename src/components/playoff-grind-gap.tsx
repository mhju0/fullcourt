import { PLAYOFF_GRIND_MATRIX } from "@/lib/playoff-rest-facts"
import { LEAD, SPACE, termCardStyle, TRACK, TYPE, WIDTH } from "@/lib/terminal-styles"

/**
 * The Grind Tax, as one number and two bars — replacing the 2×2 matrix on 2026-08-01.
 *
 * The matrix was correct and unreadable: four cells and two axes a reader had to decode before
 * the finding appeared, on a page whose whole job is stating the finding. This holds the reader's
 * own last round fixed (they closed early — the top matrix row), so the only thing varying across
 * the two bars is how long the *opponent's* last round went. The reversal, when you went long
 * too, stays as one line rather than as a second row nobody read.
 */

const { ownLowOppLow, ownLowOppHigh, ownHighOppLow, ownHighOppHigh } = PLAYOFF_GRIND_MATRIX
const GAP_PTS = ownLowOppHigh.winPct - ownLowOppLow.winPct

/** Track is a full 0-100 scale: a truncated axis would draw a bigger gap than the data has. */
function Bar({ label, winPct, n, lit }: { label: string; winPct: number; n: number; lit?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span style={{ fontSize: TYPE.body, fontWeight: lit ? 700 : 600, color: lit ? "var(--term-text)" : "var(--term-text-muted)" }}>
          {label}
        </span>
        <span
          className="mono tabular-nums"
          style={{ fontSize: TYPE.stat, fontWeight: 700, lineHeight: LEAD.figure, color: lit ? "var(--term-blue)" : "var(--term-text)" }}
        >
          {winPct.toFixed(1)}%
        </span>
      </div>
      <div style={{ height: 12, background: "var(--term-surface-2)", borderRadius: "var(--term-radius-bar)", overflow: "hidden" }}>
        <div style={{ width: `${winPct}%`, height: "100%", background: lit ? "var(--term-blue)" : "var(--term-neutral)" }} />
      </div>
      <span className="mono" style={{ fontSize: 11, letterSpacing: TRACK.sub, color: "var(--term-text-muted)" }}>
        {n} SERIES
      </span>
    </div>
  )
}

export function PlayoffGrindGap() {
  return (
    <div style={termCardStyle}>
      <span
        className="mono tabular-nums block"
        style={{ fontSize: TYPE.figure, fontWeight: 700, color: "var(--term-blue)", lineHeight: LEAD.figure }}
      >
        +{GAP_PTS.toFixed(1)} points
      </span>
      <span
        className="mono block"
        style={{ fontSize: 11, letterSpacing: TRACK.label, color: "var(--term-text-muted)", fontWeight: 700, marginTop: SPACE.sm }}
      >
        BETTER YOUR ODDS WHEN THE OTHER TEAM ARRIVES OFF A LONG SERIES · ROUNDS 2+
      </span>

      <div className="mt-6 flex flex-col gap-4">
        <Bar label="They closed their last round early" winPct={ownLowOppLow.winPct} n={ownLowOppLow.n} />
        <Bar label="They went the distance" winPct={ownLowOppHigh.winPct} n={ownLowOppHigh.n} lit />
      </div>

      <p className="mt-4" style={{ fontSize: TYPE.body, color: "var(--term-text-muted)", lineHeight: LEAD.body, maxWidth: WIDTH.prose }}>
        Both bars are teams that closed their own last round early, so the only thing changing is
        the opponent. When you went the distance too, the edge reverses —{" "}
        {ownHighOppLow.winPct.toFixed(1)}% against a fresh opponent,{" "}
        {ownHighOppHigh.winPct.toFixed(1)}% against a tired one.
      </p>
    </div>
  )
}
