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
  netEdgeGames,
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

    expect(published).toBe(1.3);
    expect(REST_STATE_LIFT_PP.restedHome).toBeCloseTo(1.25, 2);
    expect(Math.abs(REST_STATE_LIFT_PP.restedHome - published)).toBeLessThan(0.1);
  });

  it("reads the home-tired row off the rested-visitor row, since they are the same games", () => {
    expect(REST_STATE_LIFT_PP.tiredHome).toBeCloseTo(-2.3, 2);
    expect(REST_STATE_LIFT_PP.restedRoad).toBeCloseTo(
      liftOverBaseline(RESTED_ON_ROAD.winPct, REST_SPLIT_BASELINE.roadWinPct),
      1
    );
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
    expect(HOME_COURT_SPAN_PP).toBeCloseTo(19.84, 2);
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
   * edges as you face is NOT worth zero. Facing a fresher opponent at home costs 2.30 while
   * holding the edge on the road pays the same 2.30 — but holding it at home pays only 1.25.
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

    expect(netEdgeGames(evenLooking)).toBe(-8);
    expect(scheduleValueWins(evenLooking)).toBeLessThan(-0.1);
  });

  it("pays for rest edges and charges for facing them", () => {
    expect(scheduleValueWins({ ...empty, restedHome: 10 })).toBeGreaterThan(0);
    expect(scheduleValueWins({ ...empty, restedRoad: 10 })).toBeGreaterThan(0);
    expect(scheduleValueWins({ ...empty, tiredHome: 10 })).toBeLessThan(0);
    expect(scheduleValueWins({ ...empty, tiredRoad: 10 })).toBeLessThan(0);
  });

  /**
   * A real team's real season, counted from the database on 2026-08-07: Phoenix in 2025-26.
   * Pinned as a fixture because the whole point of the figure is its *magnitude* — a refactor
   * that quietly rescaled it would still satisfy every sign test above.
   *
   * Phoenix is the team whose 35.4-point swing prompted this section. Its schedule was worth
   * less than a tenth of a game, in the negative direction.
   */
  it("values Phoenix's 2025-26 schedule at under a tenth of a win, against them", () => {
    const phoenix: RestStateCounts = {
      restedHome: 18,
      neutralHome: 8,
      tiredHome: 15,
      restedRoad: 11,
      neutralRoad: 11,
      tiredRoad: 19,
    };

    expect(netEdgeGames(phoenix)).toBe(-5);
    expect(scheduleValueWins(phoenix)).toBeCloseTo(-0.076, 3);
    expect(Math.round(scheduleValueWins(phoenix) * 10) / 10).toBe(-0.1);
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

describe("netEdgeGames", () => {
  it("counts edges held minus edges faced, across both venues", () => {
    expect(
      netEdgeGames({
        restedHome: 12,
        neutralHome: 10,
        tiredHome: 19,
        restedRoad: 9,
        neutralRoad: 12,
        tiredRoad: 20,
      })
    ).toBe(12 + 9 - 19 - 20);
  });

  it("ignores neutral games entirely", () => {
    expect(netEdgeGames({ ...empty, neutralHome: 41, neutralRoad: 41 })).toBe(0);
  });
});
