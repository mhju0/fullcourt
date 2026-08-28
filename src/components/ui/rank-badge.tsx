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
    <>
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
    </>
  )
}
