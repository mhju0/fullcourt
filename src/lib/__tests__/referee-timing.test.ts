/**
 * Guards the timing aggregate, and through it the sentences written against it.
 *
 * `RefereeEffectContent` states two results as **nulls** in its own prose — officials do not
 * swallow the whistle late, and no official tilts the whistle home. Those sentences are only true
 * while the data says so, and nothing else in the suite would notice if a regeneration flipped
 * one. The assertions below fail in that case, which is the point: the copy then has to be
 * rewritten rather than quietly becoming false.
 */
import { describe, expect, it } from "vitest";
import timingData from "@/data/referee-timing.json";
import {
  readingOf,
  topShifters,
  type RefereeTiming,
  type ShiftRow,
} from "@/lib/referee-timing";
import { MIN_GAMES, NOTABLE_Z } from "@/lib/referee-foul-style";

const data = timingData as RefereeTiming;
const QUARTERS = ["q1", "q2", "q3", "q4"] as const;
const FOUL_TYPES = ["shooting", "personal", "looseBall", "offensive", "technical"] as const;

describe("referee timing — the shipped aggregate", () => {
  it("shares the bar with the foul-mix table it sits beside", () => {
    // Two surfaces on one page quoting two different bars would be indefensible.
    expect(data.minGames).toBe(MIN_GAMES);
    expect(data.notableZ).toBe(NOTABLE_Z);
  });

  it("spreads a whole game across the four quarters", () => {
    // Shares of a game's own fouls, so they must account for all of it. Drift here means the
    // denominator moved, and every quarter figure in the copy moves with it.
    const sum = QUARTERS.reduce((a, q) => a + data.leagueQuarterShares[q], 0);
    expect(sum).toBeGreaterThan(99.5);
    expect(sum).toBeLessThan(100.5);
  });

  it("keeps every verdict's ratio consistent with its own counts", () => {
    const all = [...QUARTERS.map((q) => data.byQuarter[q]), data.lateWindow];
    for (const v of all) {
      expect(v.expected).toBeGreaterThan(0);
      expect(v.ratio).toBeCloseTo(v.observed / v.expected, 1);
    }
  });

  it("still finds the late window at or below chance", () => {
    // The copy says "below chance, not above it" in as many words.
    expect(data.lateWindow.ratio).toBeLessThan(1);
  });

  it("still finds home tilt inside noise on every foul type", () => {
    // The copy calls this the second no to the same question. `readingOf` draws the line at 3x;
    // anything reaching it would make "no official tilts the whistle home" a false sentence.
    for (const k of FOUL_TYPES) {
      expect(readingOf(data.homeAway[k]), k).not.toBe("clear");
    }
  });

  it("still separates officials at the ends of a game and not in the middle", () => {
    // The section is built on this contrast, not on any one quarter's count.
    expect(data.byQuarter.q1.ratio).toBeGreaterThan(data.byQuarter.q2.ratio);
    expect(data.byQuarter.q4.ratio).toBeGreaterThan(data.byQuarter.q2.ratio);
  });

  it("still shows the home team committing fewer shooting fouls", () => {
    // The copy states the league gap and its direction. Negative is home minus away.
    expect(data.leagueHomeAwayCounts.shooting).toBeLessThan(0);
  });

  it("lists only shifters that clear the bar the page claims for them", () => {
    for (const s of data.shifters) {
      expect(s.games, s.name).toBeGreaterThanOrEqual(data.minGames);
      const notable =
        Math.abs(s.q1Z) >= data.notableZ || Math.abs(s.q4Z) >= data.notableZ;
      expect(notable, `${s.name} clears |z| >= ${data.notableZ}`).toBe(true);
      expect(s.shift, s.name).toBeCloseTo(s.q4 - s.q1, 1);
    }
  });

  it("has shifters to show at all", () => {
    // An empty list would render a heading over nothing rather than fail visibly.
    expect(data.shifters.length).toBeGreaterThan(2);
  });
});

describe("referee timing — helpers", () => {
  it("calls a ratio at or below 1.5 what it is", () => {
    expect(readingOf({ observed: 2, expected: 3.4, ratio: 0.59 })).toBe("at chance");
    expect(readingOf({ observed: 5, expected: 3.4, ratio: 1.47 })).toBe("at chance");
    expect(readingOf({ observed: 8, expected: 3.4, ratio: 2.35 })).toBe("modest");
    expect(readingOf({ observed: 24, expected: 3.4, ratio: 7.1 })).toBe("clear");
  });

  it("ranks shifters by magnitude in either direction", () => {
    // An official who calls unusually EARLY is as much a finding as one who calls late, so the
    // ranking is on absolute shift. Sorting on the raw value would hide half the effect.
    const rows: ShiftRow[] = [
      { name: "Late", games: 300, q1: -1, q1Z: -3, q4: 1, q4Z: 3, shift: 2 },
      { name: "Early", games: 300, q1: 1.5, q1Z: 3, q4: -1.5, q4Z: -3, shift: -3 },
      { name: "Flat", games: 300, q1: 0.1, q1Z: 2, q4: 0, q4Z: 0, shift: 0.1 },
    ];
    expect(topShifters(rows).map((r) => r.name)).toEqual(["Early", "Late", "Flat"]);
  });

  it("caps the list the page renders", () => {
    const rows: ShiftRow[] = Array.from({ length: 12 }, (_, i) => ({
      name: `O${i}`,
      games: 300,
      q1: 0,
      q1Z: 3,
      q4: i,
      q4Z: 3,
      shift: i,
    }));
    expect(topShifters(rows)).toHaveLength(5);
    expect(topShifters(rows, 3)).toHaveLength(3);
  });
});
