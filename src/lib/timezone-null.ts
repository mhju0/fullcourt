/**
 * The time-zone question, and the shape of its answer.
 *
 * ADR 0006 measured jet lag and body-clock tip time as **main effects across all games**. What it
 * had not tested was the narrow claim the literature actually makes: a long *eastward* shift
 * arriving on *short rest*, where there is no time to re-entrain. That was pre-registered
 * (`ml/timezone_preregistration.md`), run once, and came back empty.
 *
 * The figures are read from `src/data/timezone-null.json`, a committed snapshot of
 * `ml/timezone_test.py`'s output — `ml/data/` is gitignored, so a generated report does not
 * survive a clean checkout. Nothing here is hand-typed into prose; see the pinning rule in
 * CLAUDE.md and the guards in `__tests__/timezone-null.test.ts`.
 *
 * **This is a published null, and the null is the finding.** The raw east/west split looks large
 * and points the *wrong way* for circadian rhythm; it is geography and team quality. Any surface
 * quoting a figure from here quotes the confound with it.
 */

export type TimeZoneTrip = {
  trip: string;
  games: number;
  homeWinPct: number;
  /** Home minus away team strength in that cell. Null where the cell was not broken out. */
  strengthEdgeToHome: number | null;
};

export type TimeZoneTerm = {
  term: string;
  meanWeight: number;
  /** Coefficient of variation across folds. Null where the term never left zero. */
  cv: number | null;
  foldsNonZero: number;
  verdict: string;
  /** Held-out log loss change when this term alone is added to the baseline. */
  aloneVsBaseline: number;
  games: number;
  alsoAltitudePct: number;
  alsoBackToBackPct: number;
};

export type TimeZoneNull = {
  generatedBy: string;
  preRegistration: string;
  report: string;
  adr: string;
  measuredOn: string;
  protocol: {
    folds: number;
    heldOutGames: number;
    gamesInEra: number;
    baselineHomeWinPct: number;
    thresholdHours: number;
  };
  rawSplit: TimeZoneTrip[];
  logLoss: {
    strengthOnly: number;
    baseline: number;
    withCandidates: number;
    /** What the four fatigue terms are worth over strength alone. Stored, not derived: the
     *  report rounds it at a different step than a subtraction of two 5-dp figures would. */
    baselineWorth: number;
    /** Negative: the four candidates together make held-out prediction very slightly worse. */
    candidatesWorth: number;
    everyFatigueFactorCombined: number;
    strengthAlone: number;
  };
  terms: TimeZoneTerm[];
  /** The term the pre-registration named as the one that would decide the question. */
  primaryTerm: string;
};

/** One row of the raw split, by its label. Throws rather than render a blank. */
export function tripRow(data: TimeZoneNull, trip: string): TimeZoneTrip {
  const row = data.rawSplit.find((r) => r.trip === trip);
  if (!row) throw new Error(`timezone-null: no raw-split row "${trip}"`);
  return row;
}

/** One candidate term, by name. Throws rather than render a blank. */
export function termRow(data: TimeZoneNull, term: string): TimeZoneTerm {
  const row = data.terms.find((t) => t.term === term);
  if (!row) throw new Error(`timezone-null: no term "${term}"`);
  return row;
}

/**
 * The swing the raw split appears to show, in percentage points.
 *
 * Derived rather than stored, so it cannot disagree with the two rows it comes from — which is
 * the whole hazard, since this is the number a reader would take away if the page stopped here.
 */
export function rawSwingPoints(data: TimeZoneNull): number {
  return (
    tripRow(data, "west ≥ 3h").homeWinPct - tripRow(data, "east ≥ 3h").homeWinPct
  );
}

/**
 * How many times team strength outweighs every fatigue factor in the model combined.
 *
 * The scale the page needs in order to be honest about what it is reporting: these candidates
 * failed to add anything to a baseline that is itself a rounding error beside knowing which team
 * is better. Derived, so it cannot drift from the two figures above it.
 */
export function strengthVsFatigueRatio(data: TimeZoneNull): number {
  return data.logLoss.strengthAlone / data.logLoss.everyFatigueFactorCombined;
}
