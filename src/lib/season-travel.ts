import { rowToRecentGame, type PriorGameRow } from "./fatigue-recent-games";
import { haversineDistance } from "./haversine";

/**
 * A season's travel, one flight at a time.
 *
 * The fatigue model stores `travel_distance_miles` per game, but that figure is every leg flown
 * in the seven days before tip-off. Adding it up over a season counts each flight once for every
 * game inside that week, about four times over, which is what the Season Report published until
 * 2026-10-11. This module charges each flight once, to the game it arrives at.
 *
 * The leg rule is the fatigue model's own (`travelMilesBetweenGames` in fatigue.ts): no flight
 * home between two road games, none between two home games, and none between two games in the
 * same building. `season-travel.test.ts` checks the two against each other.
 */

/** Two games count as one building below this many miles. Mirrors the fatigue model. */
const SAME_ARENA_MILES = 1;

export type TravelGameRow = PriorGameRow & { gameId: number };

export function travelLegKey(gameId: number, teamId: number): string {
  return `${gameId}:${teamId}`;
}

type Stop = { isHome: boolean; lat: number; lon: number };

function stopOf(row: TravelGameRow, teamId: number): Stop & { homeLat: number; homeLon: number } {
  const game = rowToRecentGame(row, teamId);
  const atVenue =
    game.venueLat !== undefined && game.venueLon !== undefined
      ? { lat: game.venueLat, lon: game.venueLon }
      : game.isHome
        ? { lat: game.teamLat, lon: game.teamLon }
        : { lat: game.opponentLat, lon: game.opponentLon };
  return { isHome: game.isHome, ...atVenue, homeLat: game.teamLat, homeLon: game.teamLon };
}

/**
 * Miles each team flew into each game, keyed by `travelLegKey`.
 *
 * `rows` is one season's games in any order. A team's first game starts from its own arena.
 */
export function seasonTravelLegs(rows: readonly TravelGameRow[]): Map<string, number> {
  const byTeam = new Map<number, TravelGameRow[]>();
  for (const row of rows) {
    for (const teamId of [row.homeTeamId, row.awayTeamId]) {
      const list = byTeam.get(teamId);
      if (list) list.push(row);
      else byTeam.set(teamId, [row]);
    }
  }

  const legs = new Map<string, number>();
  for (const [teamId, teamRows] of byTeam) {
    const ordered = [...teamRows].sort((a, b) => a.date.localeCompare(b.date));
    let previous: Stop | null = null;

    for (const row of ordered) {
      const stop = stopOf(row, teamId);
      let miles: number;
      if (previous === null) {
        miles = stop.isHome ? 0 : haversineDistance(stop.homeLat, stop.homeLon, stop.lat, stop.lon);
      } else if (
        haversineDistance(previous.lat, previous.lon, stop.lat, stop.lon) < SAME_ARENA_MILES ||
        (previous.isHome && stop.isHome)
      ) {
        miles = 0;
      } else if (previous.isHome) {
        miles = haversineDistance(stop.homeLat, stop.homeLon, stop.lat, stop.lon);
      } else if (stop.isHome) {
        miles = haversineDistance(previous.lat, previous.lon, stop.homeLat, stop.homeLon);
      } else {
        miles = haversineDistance(previous.lat, previous.lon, stop.lat, stop.lon);
      }

      legs.set(travelLegKey(row.gameId, teamId), miles);
      previous = { isHome: stop.isHome, lat: stop.lat, lon: stop.lon };
    }
  }

  return legs;
}
