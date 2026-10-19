import { seasonTravelLegs, travelLegKey, type TravelGameRow } from "./season-travel";

/**
 * Assign every physical leg to the next published appearance for that team. A Cup final's
 * inbound and outbound legs therefore both count, without adding a regular-season outcome row.
 * Trailing postseason travel has no next published appearance and is omitted.
 */
export function publishedSeasonTravelLegs(
  physicalGames: readonly TravelGameRow[],
  publishedGameIds: ReadonlySet<number>
): Map<string, number> {
  const legs = seasonTravelLegs(physicalGames);
  const pending = new Map<number, number>();
  const published = new Map<string, number>();
  const ordered = [...physicalGames].sort((a, b) => a.date.localeCompare(b.date) || a.gameId - b.gameId);
  for (const game of ordered) {
    for (const teamId of [game.homeTeamId, game.awayTeamId]) {
      const accumulated = (pending.get(teamId) ?? 0) + (legs.get(travelLegKey(game.gameId, teamId)) ?? 0);
      if (publishedGameIds.has(game.gameId)) {
        published.set(travelLegKey(game.gameId, teamId), accumulated);
        pending.set(teamId, 0);
      } else {
        pending.set(teamId, accumulated);
      }
    }
  }
  return published;
}
