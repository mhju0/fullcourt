import facts from "../../ml/availability_facts.json";

/**
 * Every figure the availability surface publishes.
 *
 * These are constants because they describe a finished measurement, not a query: they change
 * only when `ml/availability_facts.py` is re-run. `src/lib/__tests__/availability-facts.test.ts`
 * checks the generated JSON and these exports for consistency. Same arrangement as `playoff-rest-facts.ts`, for the same reason — the
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
export const AVAILABILITY_SAMPLE = Object.freeze(facts.sample);

/**
 * How "missing" is defined. Absence is inferred from prior participation rather than from
 * tonight's sheet, because a long-term-injured player may not be listed at all — so the only
 * reliable signal is the rotation the team has actually been using.
 */
export const AVAILABILITY_DEFINITION = Object.freeze(facts.definition);

/**
 * The headline: everything this site measures, in one unit.
 *
 * The best-player-out and home-court estimates have similar point scales. Their exact
 * difference changes with source coverage; the claim check in availability-facts.test.ts keeps
 * the published comparison within its stated tolerance. Each effect comes from
 * its own specification, because the absence measures are collinear with one another and split
 * unstably when entered together.
 *
 * `missValuePerPoint` is the continuous version, used for modelling rather than display: points
 * of margin per point of game score above the team's own replacement level.
 */
export const AVAILABILITY_EFFECTS = Object.freeze(facts.effectsInPoints);

/** How often it happens at all. */
export const AVAILABILITY_FREQUENCY = Object.freeze(facts.frequency);

/**
 * The defensive result, and the reason this measurement was worth taking at all.
 *
 * "Your back-to-back effect is really just teams resting their stars" is the obvious objection
 * to the whole rest-advantage premise. Putting absence and the schedule terms in one regression
 * answers it: the schedule-term shifts are measured directly, testing how much load management explains of
 * what a back-to-back costs.
 */
export const AVAILABILITY_SCHEDULE_HOLDS_UP = Object.freeze(facts.scheduleHoldsUp);

/**
 * Published so the page cannot imply it explains games. It does not.
 *
 * The margin dispersion and residual show how much everything measured here — team
 * strength included — leaves unexplained in a basketball
 * game. The effects are real and precisely estimated; they are not a prediction.
 */
export const AVAILABILITY_NOISE = Object.freeze(facts.noise);

/**
 * Annual rates describe included team-games. Source holdouts can leave sparse seasons or
 * missing years, so the chart preserves calendar gaps and does not claim a league-wide trend.
 */
export const AVAILABILITY_BEST_OUT_BY_SEASON: readonly BestOutSeason[] = Object.freeze(facts.seasonBestOutRate.map((row) => Object.freeze(row)));
