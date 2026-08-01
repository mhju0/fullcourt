/**
 * The one signed display number on the site.
 *
 * Every column whose sign is doing work — a schedule edge, a deviation from the coin flip, a
 * model coefficient, a swing — renders through here. Eleven hand-rolled copies of this logic
 * had drifted apart in three ways: two emitted the ASCII hyphen instead of U+2212, three signed
 * an exact zero, and one could produce "−0".
 *
 * Two rules, no options:
 *
 * - **U+2212, never the ASCII hyphen.** The hyphen-minus reads short and sits off the numeral's
 *   baseline in a mono face, so a negative column looks mis-set next to its positive neighbours.
 * - **Zero is bare.** An exactly even schedule, a coin-flip season, a Round 1 prior-grind of
 *   zero: none of them point anywhere, and a sign would claim they did.
 *
 * Units stay at the call site. Every numeric column names its own unit, and folding that into a
 * shared formatter would move a per-column copy decision somewhere it cannot be reviewed.
 *
 * Known and deliberate: the sign is decided on the raw value, so a number that *rounds* to zero
 * still carries one — `signedNumber(-0.04, 1)` is "−0.0". Three of the replaced formatters
 * already behaved this way. It is the same posture the site takes toward the RA-threshold float
 * boundary: a documented edge, not a defect to chase.
 */
export function signedNumber(value: number, decimals?: number): string {
  const magnitude =
    decimals === undefined
      ? String(Math.abs(value))
      : Math.abs(value).toFixed(decimals);

  if (value === 0) return magnitude;
  return `${value > 0 ? "+" : "−"}${magnitude}`;
}
