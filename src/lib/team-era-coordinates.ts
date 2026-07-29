/**
 * Era-correct arena coordinates for relocated franchises (ratified 2026-07-29).
 *
 * The teams table stores one coordinate per franchise — today's arena. Without this,
 * historical games for franchises that moved cities are geolocated ~1,000+ miles from
 * where they were played (every Sonics home game 1985–2008 lands in Oklahoma City),
 * distorting each travel leg in those eras for both the team and every visitor.
 *
 * Deliberately NOT here:
 * - Metro-level moves (NJ→Brooklyn, Oakland→SF, Landover→DC): all under ~15 miles,
 *   below travel-model materiality.
 * - Old Charlotte Hornets (CHH, 1988–2002): ingest maps CHH to the modern CHA row,
 *   whose coordinates are already Charlotte.
 * - Per-game neutral sites: the schema has no venue column; a known, documented limit.
 */
interface Era {
  abbreviation: string;
  /** Inclusive ISO lower bound; omitted = since the beginning of our data (1985). */
  from?: string;
  /** Exclusive ISO upper bound (offseason boundary). */
  before: string;
  latitude: number;
  longitude: number;
}

const ERAS: readonly Era[] = [
  // Seattle SuperSonics through 2007-08 (KeyArena); the franchise became OKC in 2008-09.
  { abbreviation: "OKC", before: "2008-07-01", latitude: 47.6221, longitude: -122.354 },
  // Vancouver Grizzlies 1995–2001 (General Motors Place); moved to Memphis in 2001-02.
  { abbreviation: "MEM", before: "2001-07-01", latitude: 49.2778, longitude: -123.1089 },
  // Katrina years: the Hornets played most home games at the Ford Center in Oklahoma
  // City. A minority were in New Orleans/Baton Rouge; per-game venues are not in the
  // data, so the era's majority venue stands (documented limitation).
  {
    abbreviation: "NOP",
    from: "2005-07-01",
    before: "2007-07-01",
    latitude: 35.4634,
    longitude: -97.5151,
  },
];

/** Arena coordinates for `abbreviation` on `gameDate`, falling back to today's arena. */
export function eraCoordinates(
  abbreviation: string,
  gameDate: string,
  currentLat: number,
  currentLon: number
): { latitude: number; longitude: number } {
  for (const era of ERAS) {
    if (era.abbreviation !== abbreviation) continue;
    if (gameDate >= era.before) continue;
    if (era.from !== undefined && gameDate < era.from) continue;
    return { latitude: era.latitude, longitude: era.longitude };
  }
  return { latitude: currentLat, longitude: currentLon };
}
