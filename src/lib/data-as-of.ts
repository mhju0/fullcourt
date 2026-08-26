/**
 * The "as of" data stamp — what a reader needs in order to know how current a published
 * figure is.
 *
 * Adopted 2026-08-18 from the Korean sports properties (docs/UIUX_CHECKLIST.md §5): Naver
 * and KBO record pages carry 기준 시각, and it is the single strongest trust pattern in that
 * set. FullCourt had the server half since the stamped caches shipped, and no surface showed
 * it.
 *
 * **This is not the footer's `RENDERED` stamp**, and the distinction is the whole point.
 * `RENDERED` says when the layout was built and deliberately makes no claim about the data
 * (`src/app/layout.tsx`). This says which games the figures above it were computed from. A
 * reader who cannot tell those apart has been told nothing by either.
 *
 * The presentation matches the one that already existed on /schedule — `AS OF <ET date>` in
 * mono, muted, uppercase — so the pattern reads as one convention rather than two.
 */
export type DataAsOf = {
  /** The ET calendar date of the most recent final game in the published population. */
  latestFinalDate: string | null;
  /**
   * How many final games that population holds. Read but deliberately **not printed** — see
   * {@link formatDataAsOf}. It is here because the caller reads it anyway (it is half the
   * cache key) and because a later surface may have a use for it.
   */
  finalGames: number;
};

/**
 * The stamp as one line, or `null` when there is nothing honest to say.
 *
 * Takes the date alone rather than a whole {@link DataAsOf}: the season-scoped surfaces
 * (2026-08-27) derive their date from the rows they already reduce and have no `finalGames`
 * count to hand over, and inventing a zero to satisfy a parameter this function does not read
 * would be a number in the code that means nothing.
 *
 * Null rather than a placeholder: with no games there is no "as of", and a surface that
 * prints `AS OF —` has spent a line to say nothing. The caller renders nothing instead —
 * the same rule as `NO_FIGURE` for an unmeasured number, applied to a whole element.
 *
 * The date is passed through, not reformatted. `games.date` is already the ET calendar date
 * of tip-off (the house rule), and reformatting it through a `Date` is how an ET date becomes
 * a UTC one — the bug class SEASON_ROLLOVER records.
 *
 * **The date only, and no count.** The first version printed `· 47,143 FINAL GAMES`, which on
 * /analysis landed four lines above a tile reading `27,400 GAMES` — the same noun for two
 * populations (every publishable final game, versus the games the model actually called). A
 * trust stamp that invites a reader to compare two figures that are not comparable spends its
 * credibility instead of building it. /schedule's existing stamp prints a bare date for the
 * same reason.
 */
export function formatDataAsOf(
  asOf: { latestFinalDate: string | null; finalGames?: number } | null | undefined
): string | null {
  if (!asOf?.latestFinalDate) return null;

  return `AS OF ${asOf.latestFinalDate}`;
}
