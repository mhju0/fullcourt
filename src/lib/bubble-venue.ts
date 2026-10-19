/**
 * A campus proxy, not an individual arena or hotel. NBA's restart agreement places all games,
 * practices and housing at Disney; the OSM complex feature supplies this approximate point.
 * https://www.nba.com/news/nba-nbpa-finalize-season-comeback-official-release
 * https://www.openstreetmap.org/way/294862121
 */
export const BUBBLE_CAMPUS = Object.freeze({ latitude: 28.3375, longitude: -81.55662, altitude: false });

const BUBBLE_TEAMS = new Set([
  "BKN", "BOS", "DAL", "DEN", "HOU", "IND", "LAC", "LAL", "MEM", "MIA", "MIL",
  "NOP", "OKC", "ORL", "PHI", "PHX", "POR", "SAC", "SAS", "TOR", "UTA", "WAS",
]);

/** The modeled operating base covers only the 22 restart participants and stored bubble dates. */
export function hasBubbleBase(abbreviation: string, date: string): boolean {
  return date >= "2020-07-30" && date <= "2020-10-11" && BUBBLE_TEAMS.has(abbreviation);
}
