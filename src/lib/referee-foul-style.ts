/**
 * Referee foul style — the shape of `src/data/referee-foul-style.json` and the one rule the
 * page applies to it.
 *
 * Every number in that file is a **deviation**, not a rate: percentage points of a game's own
 * fouls against the league's average for that same season. Zero means "calls the league mix".
 * The paired `…Z` field is how many standard errors the deviation sits from zero at that
 * official's own sample size.
 *
 * The page does NOT render those percentage points directly — `relativePct` converts each one
 * against its own league share first, because +1.39pp is a rounding error on shooting fouls and
 * the largest effect in the data on offensive fouls. The stored unit stays absolute so the
 * conversion has something stable to divide.
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

/** Officials carrying enough games for the z-scores to mean anything on a public table. */
export const MIN_GAMES = 200;

export function publishable(rows: RefereeStyleRow[]): RefereeStyleRow[] {
  return rows.filter((r) => r.games >= MIN_GAMES);
}

/**
 * A deviation expressed against its own league share — "+23%" rather than "+1.39pp".
 *
 * This is the number the table shows, because a percentage-point gap is unreadable without
 * knowing the baseline it sits on: +1.39 is a rounding error against shooting fouls at 50.2%
 * and the largest effect in the data against offensive fouls at 6.1%.
 *
 * The trade it makes, worth knowing before reading the table: relative change flatters the
 * rare types. Officials span ±5% on shooting and ±26% on technicals, but in fouls a viewer
 * would actually notice that is ±0.5 a game against ±0.2. Big relative, small absolute.
 */
export function relativePct(deviation: number, leagueShare: number): number {
  return Math.round((100 * deviation) / leagueShare);
}

/** Rank within a column, 1 = calls it most. Ties share the lower rank, as in a standings table. */
export function ranksFor(rows: RefereeStyleRow[], key: FoulColumnKey): Map<string, number> {
  const ordered = [...rows].sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name));
  const out = new Map<string, number>();
  ordered.forEach((r, i) => {
    const prev = ordered[i - 1];
    out.set(r.name, prev && prev[key] === r[key] ? out.get(prev.name)! : i + 1);
  });
  return out;
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
