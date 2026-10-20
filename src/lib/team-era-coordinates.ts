import source from "@/data/arena-history.json";
import { createArenaHistory, type ArenaHistory } from "./arena-history";
import { BUBBLE_CAMPUS, hasBubbleBase } from "./bubble-venue";

const history = createArenaHistory(source as ArenaHistory);

/**
 * Dated arena/base points include moves within a metropolitan area. Each physical
 * building has one sourced point; shared Lakers/Clippers homes use the same point.
 * Fixture exceptions resolve the actual home venue separately. San Jose and Tacoma
 * do not imply relocated operating bases; Tampa and Katrina-era Oklahoma City do.
 * Atlanta's mixed-arena interval preserves its released modeled base explicitly,
 * without treating the demolished Omni as an active arena.
 */
export function eraCoordinates(
  abbreviation: string,
  gameDate: string,
  currentLat: number,
  currentLon: number
): { latitude: number; longitude: number } {
  if (hasBubbleBase(abbreviation, gameDate)) {
    return { latitude: BUBBLE_CAMPUS.latitude, longitude: BUBBLE_CAMPUS.longitude };
  }
  const base = history.baseFor(abbreviation, gameDate);
  return base
    ? { latitude: base.latitude, longitude: base.longitude }
    : { latitude: currentLat, longitude: currentLon };
}

export const requiresFixtureVenueCorrection = (abbreviation: string, date: string): boolean =>
  history.requiresFixtureCorrection(abbreviation, date);
