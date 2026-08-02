/**
 * Every figure the availability surface publishes.
 *
 * These are constants because they describe a finished measurement, not a query: they change
 * only when `ml/availability_facts.py` is re-run. `src/lib/__tests__/availability-facts.test.ts`
 * pins this file against `ml/availability_facts.json`, so a number edited here and nowhere else
 * fails the suite. Same arrangement as `playoff-rest-facts.ts`, for the same reason — the
 * figures on that page were once retyped into three places and drifted.
 *
 * **Everything here is retrospective.** Who sat is known only because the game was played, so
 * none of it forecasts anything. Any copy built on these numbers has to say so: this measures
 * what an absence cost, never who will be available tonight.
 */

/** A measured effect, in points of final margin, with the t-statistic behind it. */
export interface AvailabilityEffect {
  /** Points of margin. Positive means it costs the team carrying it. */
  points: number;
  /** |t| under 2 would mean "not distinguishable from zero". Everything published here clears it. */
  t: number;
}

/** One season's rate of playing without the team's best player. */
export interface BestOutSeason {
  season: string;
  /** 0-1. Share of that season's team-games. */
  rate: number;
  teamGames: number;
}

/** What the measurement was computed over. */
export const AVAILABILITY_SAMPLE = Object.freeze({
  games: 35458,
  teamGames: 70932,
  firstSeason: "1996-97",
  lastSeason: "2025-26",
});

/**
 * How "missing" is defined. Absence is inferred from prior participation rather than from
 * tonight's sheet, because a long-term-injured player may not be listed at all — so the only
 * reliable signal is the rotation the team has actually been using.
 */
export const AVAILABILITY_DEFINITION = Object.freeze({
  rotationWindowGames: 5,
  rotationMinutes: 15.0,
  minAppearances: 2,
  qualityGames: 20,
});

/**
 * The headline: everything this site measures, in one unit.
 *
 * `bestPlayerOut` and `homeCourt` landing within 0.04 points of each other is the finding —
 * losing your best player costs about what playing at home is worth. Each effect comes from
 * its own specification, because the absence measures are collinear with one another and split
 * unstably when entered together.
 *
 * `missValuePerPoint` is the continuous version, used for modelling rather than display: points
 * of margin per point of game score above the team's own replacement level.
 */
export const AVAILABILITY_EFFECTS = Object.freeze({
  bestPlayerOut: Object.freeze({ points: 2.863, t: 17.9 }) as AvailabilityEffect,
  homeCourt: Object.freeze({ points: 2.824, t: 42.3 }) as AvailabilityEffect,
  backToBack: Object.freeze({ points: 1.759, t: 13.4 }) as AvailabilityEffect,
  visitingAltitude: Object.freeze({ points: 1.358, t: 5.1 }) as AvailabilityEffect,
  priorOvertime: Object.freeze({ points: 0.544, t: 2.9 }) as AvailabilityEffect,
  missValuePerPoint: Object.freeze({ points: 0.26, t: 21.9 }) as AvailabilityEffect,
});

/** How often it happens at all. */
export const AVAILABILITY_FREQUENCY = Object.freeze({
  teamGamesMissingBestPlayer: 0.0991,
  teamGamesMissingNobody: 0.4455,
  gamesEitherSideMissingBest: 0.1714,
  meanRotationSize: 8.62,
});

/**
 * The defensive result, and the reason this measurement was worth taking at all.
 *
 * "Your back-to-back effect is really just teams resting their stars" is the obvious objection
 * to the whole rest-advantage premise. Putting absence and the schedule terms in one regression
 * answers it: every schedule term moves by under 8%, so load management explains almost none of
 * what a back-to-back costs.
 */
export const AVAILABILITY_SCHEDULE_HOLDS_UP = Object.freeze({
  backToBack: Object.freeze({ scheduleOnly: 1.759, absenceControlled: 1.641, shiftPct: 6.7 }),
  visitingAltitude: Object.freeze({ scheduleOnly: 1.358, absenceControlled: 1.282, shiftPct: 5.6 }),
  priorOvertime: Object.freeze({ scheduleOnly: 0.544, absenceControlled: 0.501, shiftPct: 7.9 }),
  scheduleDensity: Object.freeze({ scheduleOnly: 0.275, absenceControlled: 0.265, shiftPct: 3.8 }),
});

/**
 * Published so the page cannot imply it explains games. It does not.
 *
 * A margin standard deviation of 13.64 against a residual of 12.44 means everything measured
 * here — team strength included — accounts for a small share of what happens in a basketball
 * game. The effects are real and precisely estimated; they are not a prediction.
 */
export const AVAILABILITY_NOISE = Object.freeze({
  marginStdDev: 13.64,
  rmseScheduleOnly: 12.52,
  rmseWithAbsence: 12.436,
});

/**
 * The load-management era, in one column. Teams play without their best player more than three
 * times as often as they did in 1996-97 — this is context for every other number on the page,
 * since the same absence was a far rarer event across most of the sample.
 */
export const AVAILABILITY_BEST_OUT_BY_SEASON: readonly BestOutSeason[] = Object.freeze([
  Object.freeze({ season: "1996-97", rate: 0.0596, teamGames: 2233 }),
  Object.freeze({ season: "1997-98", rate: 0.0648, teamGames: 2378 }),
  Object.freeze({ season: "1998-99", rate: 0.0641, teamGames: 1450 }),
  Object.freeze({ season: "1999-00", rate: 0.0509, teamGames: 2378 }),
  Object.freeze({ season: "2000-01", rate: 0.0673, teamGames: 2378 }),
  Object.freeze({ season: "2001-02", rate: 0.0656, teamGames: 2378 }),
  Object.freeze({ season: "2002-03", rate: 0.0459, teamGames: 2373 }),
  Object.freeze({ season: "2003-04", rate: 0.077, teamGames: 2378 }),
  Object.freeze({ season: "2004-05", rate: 0.0772, teamGames: 2460 }),
  Object.freeze({ season: "2005-06", rate: 0.0675, teamGames: 2460 }),
  Object.freeze({ season: "2006-07", rate: 0.0809, teamGames: 2460 }),
  Object.freeze({ season: "2007-08", rate: 0.0707, teamGames: 2460 }),
  Object.freeze({ season: "2008-09", rate: 0.0829, teamGames: 2460 }),
  Object.freeze({ season: "2009-10", rate: 0.078, teamGames: 2460 }),
  Object.freeze({ season: "2010-11", rate: 0.0789, teamGames: 2460 }),
  Object.freeze({ season: "2011-12", rate: 0.1136, teamGames: 1980 }),
  Object.freeze({ season: "2012-13", rate: 0.0964, teamGames: 2458 }),
  Object.freeze({ season: "2013-14", rate: 0.0935, teamGames: 2460 }),
  Object.freeze({ season: "2014-15", rate: 0.1016, teamGames: 2460 }),
  Object.freeze({ season: "2015-16", rate: 0.0829, teamGames: 2460 }),
  Object.freeze({ season: "2016-17", rate: 0.0817, teamGames: 2460 }),
  Object.freeze({ season: "2017-18", rate: 0.115, teamGames: 2460 }),
  Object.freeze({ season: "2018-19", rate: 0.1106, teamGames: 2460 }),
  Object.freeze({ season: "2019-20", rate: 0.1308, teamGames: 2118 }),
  Object.freeze({ season: "2020-21", rate: 0.1417, teamGames: 2160 }),
  Object.freeze({ season: "2021-22", rate: 0.1671, teamGames: 2460 }),
  Object.freeze({ season: "2022-23", rate: 0.1772, teamGames: 2460 }),
  Object.freeze({ season: "2023-24", rate: 0.1293, teamGames: 2460 }),
  Object.freeze({ season: "2024-25", rate: 0.1918, teamGames: 2450 }),
  Object.freeze({ season: "2025-26", rate: 0.1947, teamGames: 2460 }),
]);
