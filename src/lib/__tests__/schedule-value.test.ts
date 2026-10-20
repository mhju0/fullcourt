import { describe, expect, it } from "vitest";
import {
  liftOverBaseline,
  RESTED_AT_HOME,
  RESTED_ON_ROAD,
  REST_SPLIT_BASELINE,
  REST_SPLIT_SAMPLE,
} from "@/lib/rest-split-facts";
import {
  HOME_COURT_SPAN_PP,
  REST_SHARE_OF_HOME_COURT,
  REST_SPAN_PP,
  REST_STATE_LIFT_PP,
  scheduleValueWins,
  type RestStateCounts,
} from "@/lib/schedule-value";

const empty: RestStateCounts = {
  restedHome: 0,
  neutralHome: 0,
  tiredHome: 0,
  restedRoad: 0,
  neutralRoad: 0,
  tiredRoad: 0,
};

describe("the lift table derives from the pinned measurement", () => {
  /**
   * The cross-check that matters: this module recomputes from counts while
   * `/behind-the-data/rest-advantage` publishes `liftOverBaseline` on the rounded rates. If the
   * two ever disagree by more than that rounding, one of them has stopped describing the other.
   */
  it("agrees with the published lift for the row the site headlines", () => {
    const published = liftOverBaseline(RESTED_AT_HOME.winPct, REST_SPLIT_BASELINE.homeWinPct);

    expect(published).toBe(1.2);
    expect(REST_STATE_LIFT_PP.restedHome).toBeCloseTo(1.19, 2);
    expect(Math.abs(REST_STATE_LIFT_PP.restedHome - published)).toBeLessThan(0.1);
  });

  it("reads the home-tired row off the rested-visitor row, since they are the same games", () => {
    expect(REST_STATE_LIFT_PP.tiredHome).toBeCloseTo(-2.36, 2);
    // The published lift subtracts two one-decimal rates, so it can sit up to 0.1 from the
    // count-based figure — the same bound the headline row above is held to.
    expect(
      Math.abs(
        REST_STATE_LIFT_PP.restedRoad -
          liftOverBaseline(RESTED_ON_ROAD.winPct, REST_SPLIT_BASELINE.roadWinPct)
      )
    ).toBeLessThan(0.1);
  });

  it("recovers the neutral row as the remainder, so every scored game is accounted for", () => {
    const homeWinsInEachRow =
      RESTED_AT_HOME.wins +
      (RESTED_ON_ROAD.games - RESTED_ON_ROAD.wins) +
      REST_SPLIT_SAMPLE.neutral * (REST_STATE_LIFT_PP.neutralHome / 100 + REST_SPLIT_BASELINE.homeWins / REST_SPLIT_BASELINE.games);

    expect(homeWinsInEachRow).toBeCloseTo(REST_SPLIT_BASELINE.homeWins, 6);
  });

  it("mirrors every road state as the negation of its home state", () => {
    expect(REST_STATE_LIFT_PP.restedRoad).toBeCloseTo(-REST_STATE_LIFT_PP.tiredHome, 10);
    expect(REST_STATE_LIFT_PP.tiredRoad).toBeCloseTo(-REST_STATE_LIFT_PP.restedHome, 10);
    expect(REST_STATE_LIFT_PP.neutralRoad).toBeCloseTo(-REST_STATE_LIFT_PP.neutralHome, 10);
  });

  /**
   * Load-bearing, and the reason the tired arm cannot be dropped as "the same thing with a
   * minus sign": facing a fresher opponent costs roughly twice what being the fresher one pays.
   */
  it("keeps the asymmetry — being tired costs more than being rested pays", () => {
    expect(Math.abs(REST_STATE_LIFT_PP.tiredHome)).toBeGreaterThan(
      REST_STATE_LIFT_PP.restedHome * 1.5
    );
  });
});

describe("rest measured against home court", () => {
  it("states the two spans as one factor swapped each", () => {
    expect(REST_SPAN_PP).toBeCloseTo(3.55, 2);
    expect(HOME_COURT_SPAN_PP).toBeCloseTo(19.87, 2);
  });

  it("puts rest just under a fifth of home court", () => {
    expect(REST_SHARE_OF_HOME_COURT).toBeGreaterThan(0.15);
    expect(REST_SHARE_OF_HOME_COURT).toBeLessThan(0.2);
    expect(REST_SHARE_OF_HOME_COURT).toBeCloseTo(0.179, 3);
  });

  /**
   * The claim the Season Report leads with is that rest is real but far smaller than home
   * court. If this ever inverts, that sentence is wrong and must be rewritten, not re-rounded.
   */
  it("keeps home court the larger of the two by a wide margin", () => {
    expect(HOME_COURT_SPAN_PP).toBeGreaterThan(REST_SPAN_PP * 4);
  });
});

describe("scheduleValueWins", () => {
  it("is zero for a schedule with no games", () => {
    expect(scheduleValueWins(empty)).toBe(0);
  });

  /**
   * The invariant that makes this a measure of schedule *luck* rather than of anything a team
   * did: across a whole league it sums to exactly zero, because every game contributes one home
   * state and its negated road twin. One team's edge is another's disadvantage, always.
   *
   * Written as two opponents sharing one set of games — A's rested-at-home games are precisely
   * B's tired-on-the-road games — because that is the mechanism, and a single-team fixture could
   * satisfy the arithmetic by coincidence.
   */
  it("sums to zero across the two sides of the same games", () => {
    const a: RestStateCounts = {
      restedHome: 14,
      neutralHome: 9,
      tiredHome: 18,
      restedRoad: 11,
      neutralRoad: 12,
      tiredRoad: 17,
    };
    const b: RestStateCounts = {
      restedHome: a.tiredRoad,
      neutralHome: a.neutralRoad,
      tiredHome: a.restedRoad,
      restedRoad: a.tiredHome,
      neutralRoad: a.neutralHome,
      tiredRoad: a.restedHome,
    };

    expect(scheduleValueWins(a) + scheduleValueWins(b)).toBeCloseTo(0, 10);
  });

  /**
   * The trap the asymmetry sets, pinned so nobody "simplifies" it away: holding as many rest
   * edges as you face is NOT worth zero. Facing a fresher opponent at home costs more than
   * holding the edge at home pays; the mirrored road states preserve that asymmetry.
   * A team with a symmetric-looking net of zero can still be down a fifth of a win.
   */
  it("does not cancel when the same state is merely equal at both venues", () => {
    const evenLooking: RestStateCounts = {
      restedHome: 14,
      neutralHome: 9,
      tiredHome: 18,
      restedRoad: 14,
      neutralRoad: 9,
      tiredRoad: 18,
    };

    expect(scheduleValueWins(evenLooking)).toBeLessThan(-0.1);
  });

  it("pays for rest edges and charges for facing them", () => {
    expect(scheduleValueWins({ ...empty, restedHome: 10 })).toBeGreaterThan(0);
    expect(scheduleValueWins({ ...empty, restedRoad: 10 })).toBeGreaterThan(0);
    expect(scheduleValueWins({ ...empty, tiredHome: 10 })).toBeLessThan(0);
    expect(scheduleValueWins({ ...empty, tiredRoad: 10 })).toBeLessThan(0);
  });

  /**
   * Fixed 82-game regression fixture, originally Phoenix's 2025-26 counts captured 2026-08-07.
   * Retain those counts to check the unit and scale under the corrected cohort weights;
   * this is not a claim about Phoenix's freshly recalculated season classification.
   */
  it("prices a fixed 82-game schedule at under a tenth of a win, against them", () => {
    const fixedSchedule: RestStateCounts = {
      restedHome: 18,
      neutralHome: 8,
      tiredHome: 15,
      restedRoad: 11,
      neutralRoad: 11,
      tiredRoad: 19,
    };

    // Independent wins-first calculation from the corrected producer cohort: 47,094 games,
    // 28,225 home wins; the remaining no-edge bucket has 4,899 home wins in 8,309 games.
    const expectedWins =
      18 * (17180 / 28109) + 8 * (4899 / 8309) + 15 * (6146 / 10676) +
      11 * (4530 / 10676) + 11 * (3410 / 8309) + 19 * (10929 / 28109);
    // With 41 games at each venue, the venue-only expectation is exactly 41 wins.
    expect(scheduleValueWins(fixedSchedule)).toBeCloseTo(expectedWins - 41, 10);
    expect(scheduleValueWins(fixedSchedule)).toBeCloseTo(-0.0773, 4);
    expect(Math.round(scheduleValueWins(fixedSchedule) * 10) / 10).toBe(-0.1);
  });

  /**
   * The ceiling, stated as a test so it cannot drift unnoticed. The most lopsided schedule in
   * 2025-26 was Utah's at +21 net edge games, and it was worth under four-tenths of a win. Any
   * change that lets an 82-game schedule reach a full win has changed what this measures.
   */
  it("cannot reach a full win on any plausible 82-game schedule", () => {
    const mostLopsided: RestStateCounts = {
      restedHome: 41,
      neutralHome: 0,
      tiredHome: 0,
      restedRoad: 41,
      neutralRoad: 0,
      tiredRoad: 0,
    };

    expect(scheduleValueWins(mostLopsided)).toBeLessThan(1.5);
    expect(scheduleValueWins({ ...empty, restedHome: 31, neutralHome: 10, restedRoad: 21, neutralRoad: 20 })).toBeLessThan(1);
  });
});
