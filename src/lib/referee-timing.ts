/**
 * Referee timing and home/away splits — the shape of `src/data/referee-timing.json`.
 *
 * Written by `scripts/analyze_officials_splits.ts` under the pre-registration in
 * `docs/adr/0007-referee-analysis-axes-are-pre-registered.md`. Two of the three results in it are
 * **nulls that the page states on purpose**, so nothing here should be read as "the interesting
 * columns". A null is the finding when the claim being tested is one everybody already believes.
 *
 * The published unit is always a {@link Verdict}: how many officials cleared |z| >= 2 against how
 * many chance predicts at this sample size. A single official's z is not evidence of anything —
 * with 74 officials, roughly 3.4 clear that bar in pure noise, which is why the page never leads
 * with a name.
 */

/**
 * Officials past the bar, against the number chance puts there.
 *
 * `ratio` near 1 means "exactly what noise looks like". The shipped foul-mix finding runs 5-9x.
 */
export interface Verdict {
  observed: number;
  expected: number;
  ratio: number;
}

/** An official whose fouls sit unusually early or unusually late within a game. */
export interface ShiftRow {
  name: string;
  games: number;
  /** Percentage points of a game's own fouls, against the league's average for that season. */
  q1: number;
  q1Z: number;
  q4: number;
  q4Z: number;
  /** `q4 - q1`. Positive means fouls move from the start of the game toward the end. */
  shift: number;
}

export type QuarterKey = "q1" | "q2" | "q3" | "q4";
export type FoulTypeKey = "shooting" | "personal" | "looseBall" | "offensive" | "technical";

export interface RefereeTiming {
  source: string;
  generated: string;
  firstSeason: string;
  lastSeason: string;
  gamesCovered: number;
  eligibleOfficials: number;
  expectedByChance: number;
  minGames: number;
  notableZ: number;
  lateWindowSeconds: number;
  leagueQuarterShares: Record<QuarterKey, number>;
  leagueLateFoulsPerGame: number;
  leagueLateShareOfQ4: number;
  /** Home minus away, fouls per game. Negative means the home team commits fewer. */
  leagueHomeAwayCounts: Record<FoulTypeKey, number>;
  homeAway: Record<FoulTypeKey, Verdict>;
  byQuarter: Record<QuarterKey, Verdict>;
  lateWindow: Verdict;
  shifters: ShiftRow[];
}

/**
 * The reading a verdict supports, in the page's own words.
 *
 * The thresholds are deliberately coarse. Nothing between 1.5x and 3x is called a finding on this
 * site without saying how modest it is, and anything at or below chance is stated as a refusal
 * rather than softened into "no clear evidence" — the whole value of a null here is that it is
 * unambiguous.
 */
export type Reading = "at chance" | "modest" | "clear";

export function readingOf(v: Verdict): Reading {
  if (v.ratio >= 3) return "clear";
  if (v.ratio >= 1.5) return "modest";
  return "at chance";
}

/** The strongest early-to-late shifters first, capped for a page that is making one point. */
export function topShifters(rows: ShiftRow[], limit = 5): ShiftRow[] {
  return [...rows]
    .sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift) || a.name.localeCompare(b.name))
    .slice(0, limit);
}
