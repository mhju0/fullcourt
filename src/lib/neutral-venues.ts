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
  // Added with the 2026-27 schedule: NOP host SAS at Co-op Live on 2027-01-17, three days
  // after the pair meet in Paris. Without a row here that leg resolves to New Orleans and
  // the model reads the second European game as a home stand rather than the longest
  // road trip on the calendar.
  Manchester: { latitude: 53.4839, longitude: -2.1953, altitude: false }, // Co-op Live
};

/**
 * Neutral venues that sit at altitude, derived from the table above rather than restated.
 *
 * A maintenance job that needs to find every game where a team met thin air has to know these
 * as well as `teams.altitude_flag` — Mexico City is above Denver and belongs to no franchise,
 * so a query written only against the flag misses it.
 */
export const ALTITUDE_NEUTRAL_CITIES: readonly string[] = Object.entries(NEUTRAL_VENUES)
  .filter(([, venue]) => venue.altitude)
  .map(([city]) => city);

export function neutralVenueCoordinates(
  city: string | null | undefined
): NeutralVenue | null {
  if (!city) return null;
  return NEUTRAL_VENUES[city] ?? null;
}
