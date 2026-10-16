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
  games: 33166,
  teamGames: 66622,
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
 * `bestPlayerOut` and `homeCourt` landing about a tenth of a point apart, well inside either
 * estimate's standard error, is the finding — losing your best player costs about what playing
 * at home is worth. Each effect comes from
 * its own specification, because the absence measures are collinear with one another and split
 * unstably when entered together.
 *
 * `missValuePerPoint` is the continuous version, used for modelling rather than display: points
 * of margin per point of game score above the team's own replacement level.
 */
export const AVAILABILITY_EFFECTS = Object.freeze({
  bestPlayerOut: Object.freeze({ points: 2.969, t: 17.8 }) as AvailabilityEffect,
  homeCourt: Object.freeze({ points: 2.845, t: 41.4 }) as AvailabilityEffect,
  backToBack: Object.freeze({ points: 1.764, t: 13.1 }) as AvailabilityEffect,
  visitingAltitude: Object.freeze({ points: 1.371, t: 5.0 }) as AvailabilityEffect,
  priorOvertime: Object.freeze({ points: 0.498, t: 2.7 }) as AvailabilityEffect,
  missValuePerPoint: Object.freeze({ points: 0.275, t: 22.0 }) as AvailabilityEffect,
});

/** How often it happens at all. */
export const AVAILABILITY_FREQUENCY = Object.freeze({
  teamGamesMissingBestPlayer: 0.0958,
  teamGamesMissingNobody: 0.4669,
  gamesEitherSideMissingBest: 0.1666,
  meanRotationSize: 8.52,
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
  backToBack: Object.freeze({ scheduleOnly: 1.764, absenceControlled: 1.638, shiftPct: 7.2 }),
  visitingAltitude: Object.freeze({ scheduleOnly: 1.371, absenceControlled: 1.303, shiftPct: 5.0 }),
  priorOvertime: Object.freeze({ scheduleOnly: 0.498, absenceControlled: 0.458, shiftPct: 7.9 }),
  scheduleDensity: Object.freeze({ scheduleOnly: 0.279, absenceControlled: 0.264, shiftPct: 5.3 }),
});

/**
 * Published so the page cannot imply it explains games. It does not.
 *
 * A margin standard deviation of 13.64 against a residual of 12.44 means everything measured
 * here — team strength included — accounts for a small share of what happens in a basketball
 * game. The effects are real and precisely estimated; they are not a prediction.
 */
export const AVAILABILITY_NOISE = Object.freeze({
  marginStdDev: 13.65,
  rmseScheduleOnly: 12.462,
  rmseWithAbsence: 12.372,
});

/**
 * The load-management era, in one column. Teams play without their best player more than three
 * times as often as they did in 1996-97 — this is context for every other number on the page,
 * since the same absence was a far rarer event across most of the sample.
 */
export const AVAILABILITY_BEST_OUT_BY_SEASON: readonly BestOutSeason[] = Object.freeze([
  Object.freeze({ season: "1996-97", rate: 0.0596, teamGames: 2233 }),
  Object.freeze({ season: "1997-98", rate: 0.0605, teamGames: 2233 }),
  Object.freeze({ season: "1998-99", rate: 0.0552, teamGames: 1305 }),
  Object.freeze({ season: "1999-00", rate: 0.0506, teamGames: 2233 }),
  Object.freeze({ season: "2000-01", rate: 0.0564, teamGames: 2233 }),
  Object.freeze({ season: "2001-02", rate: 0.0591, teamGames: 2233 }),
  Object.freeze({ season: "2002-03", rate: 0.0399, teamGames: 2233 }),
  Object.freeze({ season: "2003-04", rate: 0.0631, teamGames: 2233 }),
  Object.freeze({ season: "2004-05", rate: 0.074, teamGames: 2310 }),
  Object.freeze({ season: "2005-06", rate: 0.0649, teamGames: 2310 }),
  Object.freeze({ season: "2006-07", rate: 0.0797, teamGames: 2310 }),
  Object.freeze({ season: "2007-08", rate: 0.0662, teamGames: 2310 }),
  Object.freeze({ season: "2008-09", rate: 0.0797, teamGames: 2310 }),
  Object.freeze({ season: "2009-10", rate: 0.071, teamGames: 2310 }),
  Object.freeze({ season: "2010-11", rate: 0.0749, teamGames: 2310 }),
  Object.freeze({ season: "2011-12", rate: 0.1148, teamGames: 1830 }),
  Object.freeze({ season: "2012-13", rate: 0.0906, teamGames: 2308 }),
  Object.freeze({ season: "2013-14", rate: 0.0909, teamGames: 2310 }),
  Object.freeze({ season: "2014-15", rate: 0.0961, teamGames: 2310 }),
  Object.freeze({ season: "2015-16", rate: 0.0857, teamGames: 2310 }),
  Object.freeze({ season: "2016-17", rate: 0.0788, teamGames: 2310 }),
  Object.freeze({ season: "2017-18", rate: 0.1039, teamGames: 2310 }),
  Object.freeze({ season: "2018-19", rate: 0.1048, teamGames: 2310 }),
  Object.freeze({ season: "2019-20", rate: 0.1214, teamGames: 1968 }),
  Object.freeze({ season: "2020-21", rate: 0.1433, teamGames: 2010 }),
  Object.freeze({ season: "2021-22", rate: 0.1697, teamGames: 2310 }),
  Object.freeze({ season: "2022-23", rate: 0.1801, teamGames: 2310 }),
  Object.freeze({ season: "2023-24", rate: 0.1338, teamGames: 2310 }),
  Object.freeze({ season: "2024-25", rate: 0.1939, teamGames: 2300 }),
  Object.freeze({ season: "2025-26", rate: 0.1991, teamGames: 2310 }),
]);
