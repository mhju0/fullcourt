import { SPACE, TRACK, TYPE } from "@/lib/terminal-styles"
import { ordinal } from "@/lib/rank"

/**
 * The D1 rank rider (ADR 0010): a value's standing, riding quietly after the value itself.
 *
 * The value stays primary — the rider is micro, muted and aria-hidden, with a visually-hidden
 * sentence carrying the full claim ("ranked 3rd of 30 teams") in reading order, so a screen
 * reader hears one sensible phrase instead of a floating ordinal fragment.
 *
 * Key columns only, by law: a rank on every cell is CTG's density, not this app's. And a rank
 * states a direction, so the column's unit line says which end is 1st ("1ST = MOST") — a bare
 * ordinal on an ambiguous measure is a claim the reader has to guess at.
 */
export function RankBadge({
  rank,
  of,
  population,
}: {
  rank: number
  /** How many measured rows the rank is within — the filtered view, not the league. */
  of: number
  /** What the population is, for the screen-reader sentence: "teams", "players in view". */
  population: string
}) {
  return (
    // `relative` is load-bearing, not cosmetic. `.sr-only` is `position: absolute`, so it
    // resolves against the nearest positioned ancestor — and with none inside the table's
    // scroll container it reached the page, took its static position from inside a table far
    // wider than a phone, and planted its 1x1 box past the viewport edge. That scrolled the
    // *document* 57px on /season and 47px on /shooting at 390px (audit, 2026-09-01): one pixel
    // of element, a page that slides sideways. Positioned here, the scroller clips it.
    // `layout-integrity.spec.ts` fails if this comes off.
    <span className="relative">
      <span
        aria-hidden="true"
        className="mono"
        style={{
          fontSize: TYPE.micro,
          letterSpacing: TRACK.sub,
          color: "var(--term-text-muted)",
          fontWeight: 600,
          // Label-to-its-own-value distance: the rider qualifies the number it follows.
          marginLeft: SPACE.xs,
        }}
      >
        {ordinal(rank)}
      </span>
      <span className="sr-only">{` ranked ${rank} of ${of} ${population}`}</span>
    </span>
  )
}
