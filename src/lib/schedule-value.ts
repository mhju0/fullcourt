/**
 * What a schedule's rest edges were worth to a team, in wins.
 *
 * The unit exists because a percentage does not answer the question readers actually ask.
 * "Your rested-at-home games went 61.2%" is a rate; "the schedule was worth four-tenths of a
 * win" is an amount, and only the second one can be argued with. Both pages that rank rest
 * edges — Schedule Disparity and the Season Report — convert through this file, so the two
 * cannot publish the same team at two different values.
 *
 * **This is schedule luck, not the rest effect.** The figure is small (no team in a modern
 * season clears half a win in either direction) and the reason is the calendar, not fatigue:
 * the NBA hands out rest edges close to evenly, so no team accumulates enough of them for the
 * per-game effect to compound. {@link REST_SHARE_OF_HOME_COURT} is the per-game statement and
 * is the one that carries the model's claim. Copy that quotes the wins figure without the
 * per-game one beside it invites exactly the reading this file is not making.
 *
 * Nothing here is measured. Every constant is derived from `rest-split-facts.ts`, which is
 * pinned to `ml/rest_split_facts.json` by its own test — so a re-run of
 * `scripts/measure_uncalled_half.ts` moves these figures without anyone editing this file, and
 * an edit to this file that is not backed by that measurement cannot happen at all.
 */

import {
  RESTED_AT_HOME,
  RESTED_ON_ROAD,
  REST_SPLIT_BASELINE,
  REST_SPLIT_SAMPLE,
} from "@/lib/rest-split-facts";
import type { RestAdvantage } from "@/types";

/**
 * The six states a team can be in for one game: which side of the rest gap it was on, at which
 * venue. Neutral is a state, not an absence — a game with no rest gap still gets played and
 * still belongs in the denominator.
 */
export interface RestStateCounts {
  restedHome: number;
  neutralHome: number;
  tiredHome: number;
  restedRoad: number;
  neutralRoad: number;
  tiredRoad: number;
}

/**
 * Win-probability lift for each state, in percentage points against that venue's own baseline.
 *
 * Derived from counts rather than from the published one-decimal rates: `RESTED_AT_HOME.winPct`
 * is 61.2, and multiplying a figure already rounded to a tenth by eighty-odd games moves the
 * result by more than the tenth it saved.
 *
 * The road rows are the negations of the home rows in the same bucket, not separate
 * measurements. A game has one loser and one winner, so "the visitor was the rested side" and
 * "the home team was the tired side" are the same games counted from opposite ends —
 * `RESTED_ON_ROAD` *is* the home-tired row, read from the road.
 *
 * Note the asymmetry, which is real and survives into every figure below: being the fresher
 * side at home is worth +1.25, while facing a fresher visitor costs 2.30. Rest hurts the tired
 * team about twice as much as it helps the rested one.
 */
export const REST_STATE_LIFT_PP: Readonly<Record<keyof RestStateCounts, number>> = (() => {
  const homeBase = REST_SPLIT_BASELINE.homeWins / REST_SPLIT_BASELINE.games;
  const homeRested = RESTED_AT_HOME.wins / RESTED_AT_HOME.games;
  // The home team's record in the games where the *visitor* was the rested side.
  const homeTired = (RESTED_ON_ROAD.games - RESTED_ON_ROAD.wins) / RESTED_ON_ROAD.games;
  // Neutral is the remainder: every scored game is rested-at-home, rested-on-road, or neutral.
  const homeNeutralWins =
    REST_SPLIT_BASELINE.homeWins - RESTED_AT_HOME.wins - (RESTED_ON_ROAD.games - RESTED_ON_ROAD.wins);
  const homeNeutral = homeNeutralWins / REST_SPLIT_SAMPLE.neutral;

  const lift = (rate: number) => (rate - homeBase) * 100;

  return Object.freeze({
    restedHome: lift(homeRested),
    neutralHome: lift(homeNeutral),
    tiredHome: lift(homeTired),
    restedRoad: -lift(homeTired),
    neutralRoad: -lift(homeNeutral),
    tiredRoad: -lift(homeRested),
  });
})();

/**
 * How far a home team's win probability moves when only its rest state changes: tired to rested.
 *
 * The numerator of the model's claim. Kept separate from the wins figure because it is the
 * honest per-game effect, and it does not shrink when the league balances the schedule.
 */
export const REST_SPAN_PP =
  REST_STATE_LIFT_PP.restedHome - REST_STATE_LIFT_PP.tiredHome;

/** How far it moves when only the venue changes. The thing everyone already has a feel for. */
export const HOME_COURT_SPAN_PP =
  ((REST_SPLIT_BASELINE.homeWins - (REST_SPLIT_BASELINE.games - REST_SPLIT_BASELINE.homeWins)) /
    REST_SPLIT_BASELINE.games) *
  100;

/**
 * Rest as a fraction of home court, comparing like with like — each is one factor swapped with
 * everything else held still.
 *
 * This is the number the Season Report leads with, and the reason the wins figure below is safe
 * to publish underneath it. Given alone, four-tenths of a win reads as "rest is nothing". Given
 * after "a rest edge is worth about a fifth of home court", it reads as what it is: a real
 * per-game effect that the schedule never lets accumulate.
 *
 * The same framing `/availability` uses — the finding there is that losing a team's best player
 * and playing at home land within 0.04 points of each other.
 */
export const REST_SHARE_OF_HOME_COURT = REST_SPAN_PP / HOME_COURT_SPAN_PP;

/**
 * The bucket one game adds for each side, given which side the rest edge favours.
 *
 * One mapping for both pages that price a schedule. Until 2026-08-23 Schedule Edge and the
 * Season Report each classified games themselves — the same boundary and the same
 * advantage-to-state mapping written twice, kept identical by comments alone
 * (`rest-state-agreement.test.ts` is what those comments were standing in for). The boundary
 * itself stays in `classifyRestAdvantage`; callers classify once and map here, so neither
 * half can fork.
 */
export function restStatePair(advantageTeam: RestAdvantage["advantageTeam"]): {
  home: "restedHome" | "neutralHome" | "tiredHome";
  away: "restedRoad" | "neutralRoad" | "tiredRoad";
} {
  return {
    home:
      advantageTeam === "home" ? "restedHome" : advantageTeam === "away" ? "tiredHome" : "neutralHome",
    away:
      advantageTeam === "away" ? "restedRoad" : advantageTeam === "home" ? "tiredRoad" : "neutralRoad",
  };
}

/**
 * Games where this team held a rest edge, minus games where it faced one, across both venues.
 *
 * Schedule Disparity headlines this same quantity under the name `netEdgeGames`. It is stated
 * here as well so that both pages derive it from their own counts through one definition rather
 * than two — the counts differ between the pages by design (see {@link scheduleValueWins}), the
 * arithmetic must not.
 */
export function netEdgeGames(counts: RestStateCounts): number {
  return counts.restedHome + counts.restedRoad - counts.tiredHome - counts.tiredRoad;
}

/**
 * What the rest edges in these games were worth, in wins.
 *
 * Each game contributes its state's league-wide lift; the sum is how many more games a team of
 * any quality would be expected to win with this schedule than with a rest-neutral one. It is
 * therefore a property of the calendar alone — no score is read, and a 64-win team and a 17-win
 * team with the same schedule get the same number.
 *
 * League-wide the figure sums to approximately zero, because one team's rest edge is another's
 * disadvantage. That is a property of the metric, not a bug to correct: it is why this answers
 * "was the schedule fair" and cannot answer "does rest matter".
 *
 * **Every caller must price the same population: each scored game a team played, at the venue
 * it played it.** This is not a stylistic preference. Schedule Disparity first counted these
 * behind the opener gate its other metrics use, which dropped one game per team and moved two
 * of thirty teams by a tenth of a win against the Season Report — a quarter of the entire range
 * the figure occupies, on a number both pages label identically. A caller that needs a narrower
 * set needs a differently-named figure, not this one.
 */
export function scheduleValueWins(counts: RestStateCounts): number {
  let wins = 0;
  for (const state of Object.keys(REST_STATE_LIFT_PP) as (keyof RestStateCounts)[]) {
    wins += (counts[state] * REST_STATE_LIFT_PP[state]) / 100;
  }
  return wins;
}
