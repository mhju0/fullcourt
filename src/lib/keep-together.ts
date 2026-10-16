/**
 * Line-break glue for running text. Chrome breaks a line after a hyphen that precedes a digit,
 * so "2019-20" or "2026-10-20" can split across two lines, and an ordinary space lets an
 * operator end a line apart from what it applies to ("RA ≥ ⏎ 5", "p = ⏎ 0.0016").
 */

// A season, an ISO date, or an "N-in-M" stretch: one token that only `nowrap` keeps whole.
const UNBREAKABLE = /(\b\d{4}-\d{2}(?:-\d{2})?\b|\b\d+-in-\d+\b)/;

/** Alternating plain / unbreakable parts; odd indexes are the tokens to keep whole. */
export function splitUnbreakable(text: string): string[] {
  return text.split(UNBREAKABLE);
}

/** Binds an operator to the operand after it, and "RA" to the comparison that follows. */
export function glueOperators(text: string): string {
  return text
    .replace(/\bRA ([≥≤])/g, "RA $1")
    .replace(/(^|[\s(])(=|≥|≤|<|>|±|−|\+|@|vs\.?) /g, "$1$2 ");
}
