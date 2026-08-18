import type { CSSProperties, ReactNode } from "react"
import { LEAD, SPACE, SPACE_CARD, TRACK, TYPE } from "@/lib/terminal-styles"

/**
 * The two ways this app states a measured figure, and there are exactly two.
 *
 * Before 2026-08-18 there were **eight**, hand-rolled: `StatCard` in `games/page.tsx` and again
 * in `analysis-content.tsx` (same name, different padding and weights), `Tile` and `RateTile` in
 * `season-report-content.tsx`, `StatCell` in `schedule-disparity-content.tsx`, `VerdictTile` in
 * `referee-effect-content.tsx`, and inline copies in `availability-content.tsx` and the two
 * playoff sections. They disagreed on every measurable property: `/schedule` drew its at
 * 10 / 21 / 10.5 in an `11px 13px` box with a 3px gap where `/games` and `/season` used
 * 11 / 24 / 11 in a 16px box with an 8px gap. The type pass made the numbers agree; this makes
 * them agree by construction. Exactly the argument `DataTable` settled for the app's 21 tables.
 *
 * **The split between the two is the reading order, and it carries meaning.**
 *
 * - {@link StatTile} puts the **label first**. It is for a *row* of measures, where a reader
 *   scans the labels to find the one they came for, then reads across to its number.
 * - {@link StatFigure} puts the **figure first**. It is for the one number a section exists to
 *   state, where there is nothing to scan and the caption's job is to qualify a number the
 *   reader has already seen.
 *
 * Getting that backwards is not a style slip — a row of figures with their captions underneath
 * makes the reader read every number to find the one they wanted.
 */

/**
 * A labelled measure: label, figure, and an optional qualifier under it.
 *
 * Everything a caller may decide is a prop, and nothing else varies — the same posture as
 * `DataTable`. Type comes from `TYPE`, so the ladder holds: the figure (24) sits above its label
 * (11), which sits above its own sub-label (10).
 */
export function StatTile({
  label,
  value,
  sub,
  accent = "var(--term-neutral)",
  tone,
  variant = "card",
  valueTestId,
}: {
  label: string
  value: string
  /** The qualifier under the figure — a confidence band, a sample size, what the units are. */
  sub?: string
  /**
   * The 2px top rule on the `card` variant. Ignored by `cell`, which has no edges of its own.
   * A **top** rule, not a left one: down the left edge a row of tiles reads as a list with
   * coloured bullets, along the top edge as a row of measures, which is what it is.
   */
  accent?: string
  /** The figure's own colour, when the figure itself carries a data pole. Defaults to ink. */
  tone?: string
  /**
   * `card` draws its own box. `cell` draws nothing and inherits the box its container already
   * provides — a grid track on `/schedule`, a recessed band on `/referees`. A `cell` inside a
   * container that does *not* draw a box is the one way to misuse this.
   */
  variant?: "card" | "cell"
  /** Put a `data-testid` on the figure, so a spec can assert the number and not its caption. */
  valueTestId?: string
}) {
  const box: CSSProperties =
    variant === "card"
      ? {
          background: "var(--term-surface)",
          border: "1px solid var(--term-border)",
          borderTop: `2px solid ${accent}`,
          borderRadius: "var(--term-radius)",
          // The inner rail. A tile is a box, so its contents begin exactly where every other
          // box's do — this is the two-rail law, not a local choice (docs/FRONTEND.md).
          padding: SPACE_CARD,
        }
      : {}

  return (
    <div className="mono flex flex-col" style={{ ...box, gap: SPACE.sm }}>
      {/* Uppercased here rather than at the call site, so the house rule — uppercase mono for a
          label of about three words or fewer — cannot be missed by one caller out of eight.
          `/schedule` passed sentence case and got caps from its own copy; now it gets them from
          the component, and either case renders the same. */}
      <span
        style={{
          fontSize: TYPE.label,
          letterSpacing: TRACK.label,
          textTransform: "uppercase",
          color: "var(--term-text-muted)",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span
        className="tabular-nums"
        data-testid={valueTestId}
        style={{
          fontSize: TYPE.stat,
          fontWeight: 600,
          letterSpacing: TRACK.figure,
          color: tone ?? "var(--term-text)",
          lineHeight: LEAD.figure,
        }}
      >
        {value}
      </span>
      {/* The qualifier is NOT uppercased, deliberately: unlike the label it may be a phrase
          ("edge games, best to worst") rather than a label, and caps cost word-shape cues. */}
      {sub ? (
        <span style={{ fontSize: TYPE.micro, letterSpacing: TRACK.sub, color: "var(--term-text-muted)" }}>
          {sub}
        </span>
      ) : null}
    </div>
  )
}

/**
 * The one figure a section is built on, with its caption underneath.
 *
 * `figure` (40px) is a module's headline number — there is one per page at most. `stat` (24px) is
 * the same shape used for a row of two or three summary numbers inside a card, where each still
 * announces itself before it is explained.
 */
export function StatFigure({
  value,
  caption,
  size = "figure",
  tone = "var(--term-blue)",
}: {
  value: string
  /**
   * Uppercase, and it may run long — it is a sentence-length qualifier set as a label, so it
   * takes a node rather than a string: `/playoffs` breaks its caption over two lines on purpose.
   */
  caption: ReactNode
  size?: "figure" | "stat"
  tone?: string
}) {
  return (
    <div className="mono flex flex-col" style={{ gap: SPACE.sm }}>
      {/* A figure never wraps. At 40px, "2,545 of 2,545" is fourteen mono characters and breaking
          it splits the one number the section exists to state — so the rule lives here rather than
          being remembered at three call sites. */}
      <span
        className="tabular-nums whitespace-nowrap"
        style={{
          fontSize: size === "figure" ? TYPE.figure : TYPE.stat,
          fontWeight: 700,
          letterSpacing: TRACK.figure,
          color: tone,
          lineHeight: LEAD.figure,
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontSize: TYPE.label,
          letterSpacing: TRACK.label,
          color: "var(--term-text-muted)",
          fontWeight: 600,
          lineHeight: LEAD.label,
        }}
      >
        {caption}
      </span>
    </div>
  )
}
