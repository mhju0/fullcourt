/**
 * Guards the folklore artifact, and through it the argument written against it.
 *
 * The page makes a claim that is only safe while three things stay true at once: the famous
 * record is real, the grid it came from is noise, and the famous record is *not* more extreme
 * than that noise floor. Flip any one and the copy turns from an honest debunk into either an
 * accusation or a whitewash — and nothing else in the suite would notice.
 *
 * These assertions are therefore two-sided wherever the prose is. Pinning only the direction a
 * figure currently points is how `referee-timing.test.ts` let "no official tilts the whistle
 * home" survive beside `2.06x chance` for a fortnight.
 */
import { describe, expect, it } from "vitest";
import legendsData from "@/data/referee-legends.json";
import {
  beatsNoiseFloor,
  formatRecord,
  readNoiseFloor,
  winnersFirst,
  type RefereeLegends,
} from "@/lib/referee-legends";

const data = legendsData as RefereeLegends;

describe("referee legends — the shipped artifact", () => {
  it("keeps the famous record lopsided, which is the page's opening claim", () => {
    const { legend } = data;
    expect(legend.wins + legend.losses).toBeGreaterThanOrEqual(legend.minGamesToJudge);
    expect(legend.wins).toBeLessThan(legend.expectedWins);
  });

  it("rules out the assignment explanation the page says it ruled out", () => {
    // The copy states the opponents were "if anything, slightly weaker". If a regeneration made
    // them harder, that sentence is false and the confound is back in play.
    expect(data.legend.opponentStrengthWith).toBeLessThanOrEqual(
      data.legend.opponentStrengthWithout
    );
  });

  it("holds the grid at chance, which is the whole argument", () => {
    // If the grid ever climbs above chance, the page cannot go on saying there is no pattern to
    // find — it would have found one.
    expect(readNoiseFloor(data.noiseFloor)).toBe("at chance");
    expect(data.noiseFloor.clearedPoint01).toBeLessThanOrEqual(
      data.noiseFloor.expectedPoint01 * 1.5
    );
    expect(data.noiseFloor.clearedPoint05).toBeLessThanOrEqual(data.noiseFloor.expectedPoint05);
  });

  it("keeps the famous pair short of the noise floor it is measured against", () => {
    // The turn the page is built on: rank #1 of the grid, and still no more extreme than the
    // maximum a grid that size produces from nothing. Both halves are asserted.
    expect(data.legend.rank).toBe(1);
    expect(beatsNoiseFloor(data.legend.p, data.noiseFloor)).toBe(false);
  });

  it("quotes the legend two-sided, like the floor it is compared against", () => {
    // The bug this test was written for: a one-sided 0.0006 against a two-sided 0.00145 floor
    // reads as "past the mark" when the like-for-like figure is short of it.
    expect(data.legend.p).toBeGreaterThan(data.legend.pOneSided);
    expect(data.legend.p).toBeCloseTo(data.legend.pOneSided * 2, 3);
  });

  it("refuses to judge either era of the famous claim", () => {
    // The out-of-sample split is the only clean test and it is underpowered. The page says so;
    // a regeneration that quietly made one era testable would strand that paragraph.
    expect(data.legend.beforeClaimWasFamous.testable).toBe(false);
    expect(data.legend.afterClaimWasFamous.testable).toBe(false);
  });

  it("carries the same official at both ends, so the page cannot read as an accusation", () => {
    const charms = data.sameOfficialOtherPairs.filter((p) => p.playerWon);
    const curses = data.sameOfficialOtherPairs.filter((p) => !p.playerWon);
    expect(charms.length).toBeGreaterThan(1);
    expect(curses.length).toBeGreaterThan(0);
    expect(winnersFirst(data.sameOfficialOtherPairs)[0].playerWon).toBe(true);
  });

  it("keeps the unnamed pair wider than the famous one", () => {
    // The sentence "a bigger gap than the one everybody knows about" depends on it.
    const famous = data.legend.expectedWins - data.legend.wins;
    const unnamed = data.pairNobodyNamed.expectedWins - data.pairNobodyNamed.wins;
    expect(unnamed).toBeGreaterThan(famous);
  });

  it("keeps the make-up-call sign flip, which is what kills the t = 27", () => {
    // Compensation predicts both above 0.5. Possession predicts the offensive case below it.
    expect(data.makeupCalls.afterDefensiveFoul).toBeGreaterThan(0.5);
    expect(data.makeupCalls.afterOffensiveFoul).toBeLessThan(0.5);
    expect(data.makeupCalls.afterOffensiveWithin15s).toBeLessThan(
      data.makeupCalls.afterOffensiveFoul
    );
  });

  it("keeps star foul trouble a null and its cost real", () => {
    expect(data.starFoulTrouble.spreadRatio).toBeLessThan(1.5);
    expect(data.starFoulTrouble.p).toBeGreaterThan(0.05);
    // The one real thing in that section: it costs him time.
    expect(data.starFoulTrouble.minutesLost).toBeLessThan(0);
  });

  it("publishes every pre-registered claim, including the ones that found nothing", () => {
    // ADR 0007's standing rule. Dropping the empties would turn a pre-registration into a sweep.
    expect(data.preRegisteredClaims.length).toBeGreaterThanOrEqual(4);
    expect(data.preRegisteredClaims.some((c) => c.pOneSided > 0.5)).toBe(true);
  });

  it("formats a record with an en dash rather than a hyphen", () => {
    expect(formatRecord(1, 10)).toBe("1–10");
  });
});
