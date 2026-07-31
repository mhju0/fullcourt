/**
 * Referee foul style — the shape of `src/data/referee-foul-style.json` and the one rule the
 * page applies to it.
 *
 * Every number in that file is a **deviation**, not a rate: percentage points of a game's own
 * fouls against the league's average for that same season. Zero means "calls the league mix".
 * The paired `…Z` field is how many standard errors the deviation sits from zero at that
 * official's own sample size.
 *
 * Written by `scripts/fetch_officials.ts`, which documents why shares are baselined per season
 * and why overtime games are excluded.
 */

/** Columns published on the page, in table order. `key` matches the JSON field exactly. */
export const FOUL_COLUMNS = [
  { key: "shooting", label: "Shooting" },
  { key: "personal", label: "Personal" },
  { key: "looseBall", label: "Loose ball" },
  { key: "offensive", label: "Offensive" },
  { key: "technical", label: "Technical" },
] as const;

export type FoulColumnKey = (typeof FOUL_COLUMNS)[number]["key"];

export interface RefereeStyleRow {
  name: string;
  games: number;
  /** Games as crew chief, countable only from `crewChiefFirstSeason` on. */
  chiefGames: number;
  /** Fouls per game against the season average — a count, unlike every column below. */
  fouls: number;
  foulsZ: number;
  shooting: number;
  shootingZ: number;
  personal: number;
  personalZ: number;
  looseBall: number;
  looseBallZ: number;
  offensive: number;
  offensiveZ: number;
  technical: number;
  technicalZ: number;
}

export interface RefereeFoulStyle {
  source: string;
  generated: string;
  firstSeason: string;
  lastSeason: string;
  gamesCovered: number;
  gamesExcluded: number;
  crewChiefFirstSeason: string;
  foulsPerGame: number;
  leagueShares: Record<FoulColumnKey, number>;
  officials: RefereeStyleRow[];
}

/**
 * The bar for showing a deviation as a tendency rather than as noise.
 *
 * Two standard errors, the same bar the rest of this site uses. It is deliberately not a
 * discovery threshold: with 74 officials and five columns, chance alone puts a handful over
 * it, and the page says so rather than implying every bold cell is a finding.
 */
export const NOTABLE_Z = 2;

export function isNotable(z: number): boolean {
  return Math.abs(z) >= NOTABLE_Z;
}

/**
 * A deviation with an explicit sign, in percentage points. Unsigned zero reads as "no data"
 * beside the em dashes elsewhere on the site, so exact zero renders as a signed zero.
 */
export function signedPp(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(2)}`;
}

/** Officials carrying enough games for the z-scores to mean anything on a public table. */
export const MIN_GAMES = 200;

export function publishable(rows: RefereeStyleRow[]): RefereeStyleRow[] {
  return rows.filter((r) => r.games >= MIN_GAMES);
}

/**
 * Sort by a column, descending by magnitude for deviations and plainly descending for counts.
 * Ties break on name so the order is total — two officials with identical rounded deviations
 * must not swap between renders.
 */
export function sortRows(
  rows: RefereeStyleRow[],
  key: keyof RefereeStyleRow,
  dir: 1 | -1
): RefereeStyleRow[] {
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === "number" && typeof bv === "number") {
      if (av !== bv) return (av - bv) * dir;
      return a.name.localeCompare(b.name);
    }
    return String(av).localeCompare(String(bv)) * dir;
  });
}
