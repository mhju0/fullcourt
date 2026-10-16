/**
 * Season-accurate display branding for NBA teams whose identity changed over time.
 * DB `teams` rows use current abbreviations; this maps (abbrev, season) → labels + logos.
 */

import { NBA_SEASONS, parseSeasonStartYear } from "@/lib/nba-season";

export interface TeamBranding {
  abbreviation: string;
  name: string;
  city: string;
  logoUrl: string;
}

/** ESPN slugs that are not just the lower-cased abbreviation we store. */
const ESPN_SLUGS: Record<string, string> = { NOP: "no", UTA: "utah" };

/**
 * Every logo, current era and historical, comes from ESPN's set.
 *
 * The NBA's own CDN publishes a light and a dark variant per team (`primary/L`,
 * `primary/D`) and we were serving the dark one — white ink — on this app's near-white
 * ground: Utah's mark was a single #FCFCFC fill and invisible, Philadelphia's wordmark
 * was white on white. Switching to `primary/L` fixes those two, but not Brooklyn or San
 * Antonio: their marks are #FFFFFF and #C4CED3 in every variant the CDN ships, because
 * those brands genuinely are white and silver. ESPN normalises all 30 to dark-on-light,
 * which is why their scoreboard needs no chip behind a logo, and it is reachable from
 * this app's region and from CI, where cdn.nba.com answers 403.
 */
function espnLogo(displayAbbr: string): string {
  const slug = ESPN_SLUGS[displayAbbr] ?? displayAbbr.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/nba/500/${slug}.png`;
}

/** Current-era logo for a stored abbreviation. The one place a logo URL is built. */
export function teamLogoUrl(abbrev: string): string {
  return espnLogo(abbrev);
}

/** Current-era defaults when no historical rule applies (abbrev = DB / canonical). */
const CURRENT_TEAM_DEFAULTS: Record<string, { name: string; city: string }> = {
  ATL: { name: "Hawks", city: "Atlanta" },
  BOS: { name: "Celtics", city: "Boston" },
  BKN: { name: "Nets", city: "Brooklyn" },
  CHA: { name: "Hornets", city: "Charlotte" },
  CHI: { name: "Bulls", city: "Chicago" },
  CLE: { name: "Cavaliers", city: "Cleveland" },
  DAL: { name: "Mavericks", city: "Dallas" },
  DEN: { name: "Nuggets", city: "Denver" },
  DET: { name: "Pistons", city: "Detroit" },
  GSW: { name: "Warriors", city: "Golden State" },
  HOU: { name: "Rockets", city: "Houston" },
  IND: { name: "Pacers", city: "Indiana" },
  LAC: { name: "Clippers", city: "Los Angeles" },
  LAL: { name: "Lakers", city: "Los Angeles" },
  MEM: { name: "Grizzlies", city: "Memphis" },
  MIA: { name: "Heat", city: "Miami" },
  MIL: { name: "Bucks", city: "Milwaukee" },
  MIN: { name: "Timberwolves", city: "Minnesota" },
  NOP: { name: "Pelicans", city: "New Orleans" },
  NYK: { name: "Knicks", city: "New York" },
  OKC: { name: "Thunder", city: "Oklahoma City" },
  ORL: { name: "Magic", city: "Orlando" },
  PHI: { name: "76ers", city: "Philadelphia" },
  PHX: { name: "Suns", city: "Phoenix" },
  POR: { name: "Trail Blazers", city: "Portland" },
  SAC: { name: "Kings", city: "Sacramento" },
  SAS: { name: "Spurs", city: "San Antonio" },
  TOR: { name: "Raptors", city: "Toronto" },
  UTA: { name: "Jazz", city: "Utah" },
  WAS: { name: "Wizards", city: "Washington" },
};

function currentBranding(
  abbrev: string,
  fallback?: { name: string; city: string }
): TeamBranding {
  const defaults = CURRENT_TEAM_DEFAULTS[abbrev];
  const name = fallback?.name ?? defaults?.name ?? abbrev;
  // The brand's place name wins over `teams.city`, which is a coordinate anchor: it reads
  // "San Francisco" for Golden State and "Salt Lake City" for Utah.
  const city = defaults?.city ?? fallback?.city ?? "";
  return {
    abbreviation: abbrev,
    name,
    city,
    logoUrl: espnLogo(abbrev),
  };
}

/**
 * Returns display abbreviation, name, city, and logo for `currentAbbreviation` in `season`
 * (e.g. `"2005-06"`). Uses historical labels where the franchise rebranded or relocated;
 * otherwise current branding. Optional `fallback` overrides the name on the current-era path, and
 * supplies the city only for an abbreviation with no brand entry.
 *
 * Every logo is an ESPN PNG (see `espnLogo`).
 */
export function getTeamBranding(
  currentAbbreviation: string,
  season: string,
  fallback?: { name: string; city: string }
): TeamBranding {
  const abbr = currentAbbreviation.trim().toUpperCase();
  const startYear = parseSeasonStartYear(season);

  // New Jersey Nets → Brooklyn (2012-13+)
  if (abbr === "BKN" && startYear >= 1985 && startYear <= 2011) {
    return {
      abbreviation: "NJN",
      name: "Nets",
      city: "New Jersey",
      logoUrl: espnLogo("NJN"),
    };
  }

  // Seattle SuperSonics → Oklahoma City (2008-09+)
  if (abbr === "OKC" && startYear >= 1985 && startYear <= 2007) {
    return {
      abbreviation: "SEA",
      name: "SuperSonics",
      city: "Seattle",
      logoUrl: espnLogo("SEA"),
    };
  }

  // Vancouver Grizzlies → Memphis (2001-02+)
  if (abbr === "MEM" && startYear >= 1995 && startYear <= 2000) {
    return {
      abbreviation: "VAN",
      name: "Grizzlies",
      city: "Vancouver",
      logoUrl: espnLogo("VAN"),
    };
  }

  // New Orleans franchise (NOH / NOK / Pelicans)
  if (abbr === "NOP") {
    if (startYear >= 2002 && startYear <= 2004) {
      return {
        abbreviation: "NOH",
        name: "Hornets",
        city: "New Orleans",
        logoUrl: espnLogo("NOH"),
      };
    }
    if (startYear >= 2005 && startYear <= 2006) {
      return {
        abbreviation: "NOK",
        name: "Hornets",
        city: "New Orleans/OKC",
        logoUrl: espnLogo("NOK"),
      };
    }
    if (startYear >= 2007 && startYear <= 2012) {
      return {
        abbreviation: "NOH",
        name: "Hornets",
        city: "New Orleans",
        logoUrl: espnLogo("NOH"),
      };
    }
  }

  // Charlotte Bobcats → Hornets (2014-15+)
  if (abbr === "CHA" && startYear >= 2004 && startYear <= 2013) {
    return {
      abbreviation: "CHA",
      name: "Bobcats",
      city: "Charlotte",
      logoUrl: espnLogo("CHA"),
    };
  }

  // Washington Bullets → Wizards (1997-98+)
  if (abbr === "WAS" && startYear >= 1985 && startYear <= 1996) {
    return {
      abbreviation: "WSB",
      name: "Bullets",
      city: "Washington",
      logoUrl: espnLogo("WSB"),
    };
  }

  return currentBranding(abbr, fallback);
}

/** The other codes a franchise played under in the seasons with data: OKC → SEA. */
export function formerAbbreviations(currentAbbreviation: string): string[] {
  const current = currentAbbreviation.trim().toUpperCase();
  const codes = new Set(NBA_SEASONS.map((season) => getTeamBranding(current, season).abbreviation));
  codes.delete(current);
  return [...codes].sort();
}
