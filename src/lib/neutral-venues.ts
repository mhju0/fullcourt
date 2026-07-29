/**
 * Neutral-site venue coordinates, keyed by the city ESPN reports in
 * `competitions[0].venue.address.city` (see scripts/fetch_game_context.ts).
 *
 * Every neutral game in the database resolves to one of these five cities, so a map
 * is the whole solution — no venues table, no geocoding dependency. Coordinates are
 * the arena, matching the convention in `scripts/seed_teams.py`.
 *
 * Add a row when the NBA plays somewhere new; an unknown city resolves to null and
 * the game falls back to the listed home team's arena, i.e. today's behaviour.
 */
export interface NeutralVenue {
  latitude: number;
  longitude: number;
  /** Matches `teams.altitude_flag`: thin air worth a fatigue multiplier. */
  altitude: boolean;
}

const NEUTRAL_VENUES: Record<string, NeutralVenue> = {
  // 7,350 ft — higher than Denver, and the highest venue the NBA plays at. Altitude
  // otherwise comes from the home team's `altitude_flag`, which is false for whoever
  // is nominally hosting, so these games would carry no altitude term at all.
  "Mexico City": { latitude: 19.4028, longitude: -99.1889, altitude: true }, // Arena CDMX
  London: { latitude: 51.503, longitude: 0.0032, altitude: false }, // The O2
  "Las Vegas": { latitude: 36.1028, longitude: -115.1783, altitude: false }, // T-Mobile Arena
  Paris: { latitude: 48.8386, longitude: 2.3784, altitude: false }, // Accor Arena (Bercy)
  Berlin: { latitude: 52.5075, longitude: 13.4432, altitude: false }, // Uber Arena
};

export function neutralVenueCoordinates(
  city: string | null | undefined
): NeutralVenue | null {
  if (!city) return null;
  return NEUTRAL_VENUES[city] ?? null;
}
