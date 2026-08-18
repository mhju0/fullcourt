/**
 * Whether a game's fatigue was **measured** from played basketball or **projected** from a
 * published schedule.
 *
 * The distinction is not "has this game been played". A game tipping tonight has not been
 * played, yet every input its fatigue rests on — its teams' rest days, travel legs, density and
 * the overtime of their previous games — is already a fact. Nothing about it is projected.
 *
 * What makes fatigue projected is a **prior** game that has not been played. Those are the rows
 * `fetchRecentGamesForTeam`'s `"scheduled"` basis admits, and the two inputs it neutralises
 * there (prior-game overtime, prior-game margin) are exactly the two that can still move.
 *
 * So the question is: is there an unplayed game *earlier in the season* than this one? That
 * reduces to a single scalar per season — the date of its first unplayed game — because games
 * are only ever played in date order:
 *
 *   season not started      first unplayed = opening night
 *                           → opening night itself is measured, everything after is projected
 *   mid-season              first unplayed = today
 *                           → today and everything before is measured, tomorrow on is projected
 *   season complete         first unplayed = null → everything is measured
 *
 * Opening night falling on the measured side is correct rather than a rounding of the rule: no
 * team has played, so no team is more rested, and the model's opener branch reports that as a
 * genuine 0 rather than as an absence.
 */

/**
 * @param gameDate            ET calendar date of the game being described
 * @param firstUnplayedDate   ET date of the season's earliest non-final game, or null when the
 *                            season has no unplayed games left
 */
export function isProjectedFatigue(
  gameDate: string,
  firstUnplayedDate: string | null
): boolean {
  if (firstUnplayedDate === null) return false;
  return gameDate > firstUnplayedDate;
}
