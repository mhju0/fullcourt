import { describe, expect, it } from "vitest";
import {
  buildRestAdvantageEvidence,
  formatRestAdvantageDisplay,
  homeWinRateWhenVisitorRested,
  toEvidenceSource,
  type RestAdvantageEvidenceSource,
} from "@/lib/rest-advantage-display";
import type { AnalysisResponse, RestAdvantage } from "@/types";

describe("formatRestAdvantageDisplay", () => {
  it("labels the away team when the API marks away as advantaged", () => {
    expect(
      formatRestAdvantageDisplay(
        { differential: 3.2, advantageTeam: "away" },
        "BOS",
        "LAL"
      )
    ).toMatchObject({
      kind: "team",
      teamAbbreviation: "LAL",
      value: "3.2",
      text: "LAL 3.2",
    });
  });

  it("labels the home team when the API marks home as advantaged", () => {
    expect(
      formatRestAdvantageDisplay(
        { differential: -3.2, advantageTeam: "home" },
        "BOS",
        "LAL"
      )
    ).toMatchObject({
      kind: "team",
      teamAbbreviation: "BOS",
      value: "3.2",
      text: "BOS 3.2",
    });
  });

  it("keeps one decimal for small non-zero values", () => {
    expect(
      formatRestAdvantageDisplay(
        { differential: 0.3, advantageTeam: "away" },
        "BOS",
        "LAL"
      )
    ).toMatchObject({
      value: "0.3",
      text: "LAL 0.3",
    });
  });

  it("displays neutral text for neutral/no-call values", () => {
    expect(
      formatRestAdvantageDisplay(
        { differential: 0.3, advantageTeam: "neutral" },
        "BOS",
        "LAL"
      )
    ).toEqual({
      kind: "neutral",
      text: "NEUTRAL",
    });
  });
});

/**
 * The games the model does not call, stated as the home team's win rather than the rested
 * visitor's loss. Same set, same counts — only the subject changes.
 */
describe("homeWinRateWhenVisitorRested", () => {
  it("reports the complement of the rested visitor's record", () => {
    expect(
      homeWinRateWhenVisitorRested({ games: 1000, restedTeamWins: 424, winPct: 42.4 })
    ).toBe(57.6);
  });

  /**
   * Derived from the counts, never as `100 − winPct`, and this fixture is the one that can
   * tell the difference.
   *
   * 66/160 is 41.25% and 94/160 is 58.75% — both land exactly on a rounding tie, and
   * `Math.round` takes both upward, so the two published halves come to 100.1. Subtracting
   * the stored `winPct` would give 58.7 where the counts give 58.8.
   */
  it("derives from the counts rather than subtracting a rounded percentage", () => {
    const split = { games: 160, restedTeamWins: 66, winPct: 41.3 };

    expect(homeWinRateWhenVisitorRested(split)).toBe(58.8);
    expect(homeWinRateWhenVisitorRested(split)).not.toBe(100 - split.winPct);
  });

  it("answers 0 for an empty set rather than dividing by zero", () => {
    expect(
      homeWinRateWhenVisitorRested({ games: 0, restedTeamWins: 0, winPct: 0 })
    ).toBe(0);
  });

  it("reports a clean sweep as 100", () => {
    expect(
      homeWinRateWhenVisitorRested({ games: 50, restedTeamWins: 0, winPct: 0 })
    ).toBe(100);
  });
});

/**
 * The narrowing `useBacktest` applies before handing the payload to a matchup row.
 * Four surfaces read the backtest and two of them used to re-list these four keys by
 * hand, which is how the `Pick` above stopped being the single statement of the slice.
 */
describe("toEvidenceSource", () => {
  const payload = {
    thresholds: [{ threshold: 2, games: 20000, restedTeamWins: 11240, winPct: 56.2 }],
    overallWinRate: 54.8,
    totalGames: 39412,
    homeAwayBreakdown: {
      homeTeamMoreRested: { games: 39412, restedTeamWins: 21598, winPct: 54.8 },
      awayTeamMoreRested: { games: 11548, restedTeamWins: 4894, winPct: 42.4 },
    },
    venueBaseline: { games: 47143, homeWins: 28248, homeWinPct: 59.9, roadWinPct: 40.1 },
    seasonWinRates: [{ season: "2024-25", games: 1230, restedTeamWins: 700, winPct: 56.9 }],
  } as unknown as AnalysisResponse;

  it("keeps every field the evidence sentence is built from", () => {
    const source = toEvidenceSource(payload);

    expect(source).toEqual({
      thresholds: payload.thresholds,
      overallWinRate: 54.8,
      totalGames: 39412,
      homeAwayBreakdown: payload.homeAwayBreakdown,
      venueBaseline: payload.venueBaseline,
    });
  });

  it("keeps the baseline, without which no rate on a card means anything", () => {
    const source = toEvidenceSource(payload);

    expect(source?.venueBaseline.homeWinPct).toBe(59.9);
    expect(source?.venueBaseline.roadWinPct).toBe(40.1);
  });

  /**
   * `thresholds` and `overallWinRate` describe called (home-rested) games alone, so a
   * rested-visitor card has nothing to say without the breakdown. Dropping it would not
   * fail a type check — the field is optional to no one — but it would silently unwrite
   * the declined half of the model.
   */
  it("keeps the breakdown, which is the only field that speaks for rested visitors", () => {
    const source = toEvidenceSource(payload);

    expect(source?.homeAwayBreakdown.awayTeamMoreRested.winPct).toBe(42.4);
  });

  it("does not carry fields the evidence sentence has no use for", () => {
    const source = toEvidenceSource(payload);

    expect(Object.keys(source ?? {}).sort()).toEqual([
      "homeAwayBreakdown",
      "overallWinRate",
      "thresholds",
      "totalGames",
      "venueBaseline",
    ]);
  });

  it("answers null before the backtest arrives, rather than a half-built source", () => {
    expect(toEvidenceSource(undefined)).toBeNull();
    expect(toEvidenceSource(null)).toBeNull();
  });
});

describe("buildRestAdvantageEvidence", () => {
  const source: RestAdvantageEvidenceSource = {
    // Cumulative buckets: each counts every game at or above its threshold. Every one of
    // these is built from CALLED games only — i.e. the rested team was also at home.
    thresholds: [
      { threshold: 2, games: 20000, restedTeamWins: 11240, winPct: 56.2 },
      { threshold: 3, games: 12481, restedTeamWins: 7139, winPct: 57.2 },
      { threshold: 5, games: 5763, restedTeamWins: 3521, winPct: 61.1 },
      { threshold: 7, games: 1902, restedTeamWins: 1206, winPct: 63.4 },
    ],
    overallWinRate: 54.8,
    totalGames: 39412,
    homeAwayBreakdown: {
      homeTeamMoreRested: { games: 39412, restedTeamWins: 21598, winPct: 54.8 },
      awayTeamMoreRested: { games: 11548, restedTeamWins: 4894, winPct: 42.4 },
    },
    // Wider than any row above, and neutral games are in it. Every rate here is stated
    // against whichever of these two the rested team was playing under.
    venueBaseline: { games: 47143, homeWins: 28248, homeWinPct: 59.9, roadWinPct: 40.1 },
  };

  /**
   * `classifyRestAdvantage` derives `differential` as away fatigue minus home fatigue, so a
   * POSITIVE gap means the home team is the rested one. These two helpers keep the fixtures
   * on that convention rather than restating it at fifteen call sites.
   */
  const homeRested = (gap: number): RestAdvantage => ({
    differential: gap,
    advantageTeam: "home",
  });
  const awayRested = (gap: number): RestAdvantage => ({
    differential: -gap,
    advantageTeam: "away",
  });

  it("picks the highest cleared bucket, not the nearest one", () => {
    // Regression: the original spec applied the RA>=5 rate (61.1%) to a 4.1 gap.
    // Because the buckets are cumulative, 4.1 belongs to "3 or more".
    const ev = buildRestAdvantageEvidence(homeRested(4.1), source);
    expect(ev?.classLabel).toBe("at home · gap ≥ 3");
    expect(ev?.winPct).toBe(57.2);
    expect(ev?.games).toBe(12481);
    expect(ev?.sentence).not.toContain("61.1");
  });

  it("selects the top bucket for a gap that clears every threshold", () => {
    expect(buildRestAdvantageEvidence(homeRested(9.4), source)?.classLabel).toBe(
      "at home · gap ≥ 7"
    );
  });

  it("treats a threshold boundary as cleared", () => {
    expect(buildRestAdvantageEvidence(homeRested(2), source)?.classLabel).toBe(
      "at home · gap ≥ 2"
    );
    expect(buildRestAdvantageEvidence(homeRested(1.999), source)?.classLabel).toBe(
      "at home · any gap"
    );
  });

  it("falls back to the overall rate for a called gap that clears no threshold", () => {
    const ev = buildRestAdvantageEvidence(homeRested(1.2), source);
    expect(ev?.classLabel).toBe("at home · any gap");
    expect(ev?.winPct).toBe(54.8);
    expect(ev?.games).toBe(39412);
    expect(ev?.sentence).toContain("Rested team at home, any gap: won 54.8%");
  });

  it("counts exactly 0.5 as a call, matching classifyRestAdvantage", () => {
    expect(buildRestAdvantageEvidence(homeRested(0.5), source)).not.toBeNull();
    expect(buildRestAdvantageEvidence(homeRested(0.49), source)).toBeNull();
  });

  it("says nothing for a neutral, absent or sourceless matchup", () => {
    expect(
      buildRestAdvantageEvidence(
        { differential: 0.1, advantageTeam: "neutral" },
        source
      )
    ).toBeNull();
    expect(buildRestAdvantageEvidence(null, source)).toBeNull();
    expect(buildRestAdvantageEvidence(undefined, source)).toBeNull();
    expect(buildRestAdvantageEvidence(homeRested(4.1), null)).toBeNull();
  });

  it("ignores a bucket with a zero denominator and falls through", () => {
    const sparse: RestAdvantageEvidenceSource = {
      ...source,
      thresholds: [{ threshold: 7, games: 0, restedTeamWins: 0, winPct: 0 }],
    };
    expect(buildRestAdvantageEvidence(homeRested(8), sparse)?.classLabel).toBe(
      "at home · any gap"
    );
  });

  it("refuses to make a claim with no denominator at all", () => {
    expect(
      buildRestAdvantageEvidence(homeRested(8), {
        thresholds: [],
        overallWinRate: 0,
        totalGames: 0,
        homeAwayBreakdown: source.homeAwayBreakdown,
        venueBaseline: source.venueBaseline,
      })
    ).toBeNull();
  });

  it("says nothing at all without a baseline to state the rate against", () => {
    // A rate with no baseline is the thing this whole frame exists to stop publishing.
    expect(
      buildRestAdvantageEvidence(homeRested(4.1), {
        ...source,
        venueBaseline: { games: 0, homeWins: 0, homeWinPct: 0, roadWinPct: 0 },
      })
    ).toBeNull();
  });

  it("publishes a class that lost, rather than suppressing it", () => {
    // A bucket below a coin flip still gets stated. The house rule is to publish the
    // record, not only the flattering ones.
    const below: RestAdvantageEvidenceSource = {
      ...source,
      thresholds: [{ threshold: 2, games: 900, restedTeamWins: 405, winPct: 45.0 }],
    };
    const ev = buildRestAdvantageEvidence(homeRested(3), below)!;

    expect(ev.winPct).toBe(45);
    expect(ev.sentence).toContain("45.0%");
  });

  it("renders the denominator with thousands separators", () => {
    expect(buildRestAdvantageEvidence(homeRested(1.2), source)?.sentence).toContain(
      "n = 39,412"
    );
  });

  it("states the denominator, and no coin flip, in every sentence", () => {
    // The house rule, asserted directly.
    for (const gap of [0.6, 1.2, 2.5, 4.1, 6, 12]) {
      for (const ra of [homeRested(gap), awayRested(gap)]) {
        const ev = buildRestAdvantageEvidence(ra, source);
        expect(ev, `no evidence for ${ra.advantageTeam} ${gap}`).not.toBeNull();
        expect(ev!.sentence).toMatch(/n = [\d,]+/);
        expect(ev!.sentence).not.toContain("coin flip");
      }
    }
  });

  // ─── The rested team is the visitor ──────────────────────────────
  //
  // Every `thresholds` bucket and `overallWinRate` above is built from CALLED games only —
  // `buildHistoricalBacktest` filters through `isCalledSide`, which is true for "home" alone.
  // Keying the sentence off `Math.abs(differential)` therefore printed a home-rested-only win
  // rate onto a card whose rested team is the visitor: the exact games the model does not call.
  //
  // Both branches now report the RESTED team's own rate against that side's own baseline.
  // The subject no longer flips between them: `/upcoming` renders one column from `winPct`,
  // and a column that meant the rested team on one row and the home team on the next was
  // unreadable. What varies is the baseline, not the subject.

  it("never states a called-games win rate on a rested-visitor matchup", () => {
    for (const gap of [0.6, 1.2, 2.5, 4.1, 6, 12]) {
      const sentence = buildRestAdvantageEvidence(awayRested(gap), source)!.sentence;
      for (const homeOnlyRate of ["56.2", "57.2", "61.1", "63.4", "54.8"]) {
        expect(sentence, `leaked the home-rested rate at gap ${gap}`).not.toContain(
          homeOnlyRate
        );
      }
      expect(sentence).not.toContain("n = 39,412");
    }
  });

  it("states the rested road team's own record against the road baseline", () => {
    const ev = buildRestAdvantageEvidence(awayRested(4.1), source)!;

    expect(ev.classLabel).toBe("on the road · all gaps");
    expect(ev.winPct).toBe(42.4);
    expect(ev.baselinePct).toBe(40.1);
    expect(ev.lift).toBe(2.3);
    expect(ev.games).toBe(11548);
    expect(ev.sentence).toBe(
      "Rested team on the road: won 42.4% — road teams win 40.1% overall (n = 11,548)."
    );
  });

  /**
   * The reason 42.4% is publishable at all. Alone beside a coloured rest badge it reads as
   * an endorsement of a side that loses more than it wins; against 40.1% it is a measurement.
   * They are in one sentence so no truncation can separate them.
   */
  it("never states the road rate without the road baseline in the same sentence", () => {
    for (const gap of [0.6, 1.2, 2.5, 4.1, 6, 12]) {
      const ev = buildRestAdvantageEvidence(awayRested(gap), source)!;

      expect(ev.sentence).toContain("42.4");
      expect(ev.sentence, `baseline missing at gap ${gap}`).toContain("40.1");
    }
  });

  it("keeps the rested team as the subject on both branches", () => {
    const home = buildRestAdvantageEvidence(homeRested(4.1), source)!;
    const road = buildRestAdvantageEvidence(awayRested(4.1), source)!;

    // Same subject, same verb, same denominator form — so a reader can compare the two.
    expect(home.sentence.startsWith("Rested team at home")).toBe(true);
    expect(road.sentence.startsWith("Rested team on the road")).toBe(true);
    expect(home.winPct).toBe(57.2);
    expect(road.winPct).toBe(42.4);
  });

  it("states each side against its own baseline, not against the other's", () => {
    expect(buildRestAdvantageEvidence(homeRested(4.1), source)!.baselinePct).toBe(59.9);
    expect(buildRestAdvantageEvidence(awayRested(4.1), source)!.baselinePct).toBe(40.1);
  });

  it("says nothing when the uncalled half has no denominator either", () => {
    expect(
      buildRestAdvantageEvidence(awayRested(4.1), {
        ...source,
        homeAwayBreakdown: {
          homeTeamMoreRested: { games: 39412, restedTeamWins: 21598, winPct: 54.8 },
          awayTeamMoreRested: { games: 0, restedTeamWins: 0, winPct: 0 },
        },
      })
    ).toBeNull();
  });
});
