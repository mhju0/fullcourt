/**
 * Regular-season games the league leaves off the released schedule until the NBA Cup group stage
 * is decided. Teams knocked out of the Cup play two more games against other knocked-out teams,
 * and the quarterfinal losers play one more against each other; until those are set, a team's
 * season reads 80 games.
 *
 * `after` is the last published Cup date before the gap (the quarterfinals), so a placeholder sits
 * where the games will land. `window` is what the page prints in the date column. It stays loose
 * on purpose: no dates had been announced when this was written (2026-10-17), only the gap
 * between the quarterfinals (Dec 4–5) and the final (Dec 11).
 *
 * Once ingest adds the real games the count reaches 82 and the placeholders disappear by
 * themselves.
 */
const CUP_PENDING: Readonly<Record<string, { after: string; window: string }>> = {
  "2026-27": { after: "2026-12-05", window: "Early Dec" },
};

const REGULAR_SEASON_GAMES = 82;

/** How many placeholder rows a team's season needs, and where they go. Null when none. */
export function cupPlaceholders(
  season: string,
  gameDates: readonly string[]
): { count: number; afterIndex: number; window: string } | null {
  const pending = CUP_PENDING[season];
  if (!pending) return null;
  const count = REGULAR_SEASON_GAMES - gameDates.length;
  // A lockout year or a partial ingest is not a Cup gap; only the two missing games are.
  if (count < 1 || count > 2) return null;
  let afterIndex = -1;
  gameDates.forEach((date, i) => {
    if (date <= pending.after) afterIndex = i;
  });
  return { count, afterIndex, window: pending.window };
}
