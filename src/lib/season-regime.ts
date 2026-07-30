/**
 * Which games count as normally-played basketball.
 *
 * Every model on this site assumes a game was reached by travelling to it and rested for it.
 * A few stretches of NBA history break that assumption while still carrying an ordinary season
 * label, and this module is the single place that names them.
 *
 * **Why a list and not a calendar window.** This rule used to be expressed as "the date must
 * fall between October 1 and April 30 of its season", which happens to exclude the 2019-20
 * Orlando bubble — but only by coincidence of dates, and at a real cost: it also excluded 179
 * legitimate games from seasons that did not run October to April. The 2020-21 season ran to
 * 16 May 2021 and the 1998-99 lockout season to 5 May 1999, so 135 and 44 of their regular-
 * season games respectively were silently dropped from the backtest. There were **no**
 * mis-tagged playoff rows for the window to catch — it was defending against a problem the
 * data does not have, and clipping real seasons to do it.
 *
 * Naming the abnormal stretches instead means the rule excludes exactly what it intends to,
 * is a no-op for every other season, and cannot be broken by a season with unusual dates.
 *
 * Adding an entry is the supported way to exclude a stretch. Excluding a *whole season* is a
 * different decision and does not belong here — see Schedule Edge for the truncated-season
 * rule, which is about comparability rather than about how the games were played.
 */
export interface AbnormalStretch {
  /** Season label the stretch belongs to, e.g. "2019-20". */
  season: string;
  /** Inclusive start date, YYYY-MM-DD. */
  from: string;
  /** Inclusive end date, YYYY-MM-DD. */
  to: string;
  /** Why these games are not normally-played basketball. Shown in docs, not in the UI. */
  why: string;
}

export const ABNORMAL_STRETCHES: readonly AbnormalStretch[] = [
  {
    season: "2019-20",
    from: "2020-07-30",
    to: "2020-10-11",
    why: "Orlando bubble — every game at a single site, so there is no travel to measure and no home crowd. The 63-67 games each team played before the 2020-03-11 suspension are ordinary and are not excluded.",
  },
];

/**
 * Whether a game counts as normally-played basketball.
 *
 * The SQL predicate in `db/queries.ts` evaluates the same list; keeping the *data* in one
 * place is the point, since drift between two hand-written copies of the rule is what caused
 * the 179-game loss this module exists to fix.
 */
export function isNormallyPlayed(season: string, date: string): boolean {
  return !ABNORMAL_STRETCHES.some(
    (stretch) => stretch.season === season && date >= stretch.from && date <= stretch.to
  );
}
