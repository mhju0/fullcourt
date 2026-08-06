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
 * The narrowing `useBacktest` applies before handing the payload to a matchup card.
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
    seasonWinRates: [{ season: "2024-25", games: 1230, restedTeamWins: 700, winPct: 56.9 }],
  } as unknown as AnalysisResponse;

  it("keeps every field the evidence sentence is built from", () => {
    const source = toEvidenceSource(payload);

    expect(source).toEqual({
      thresholds: payload.thresholds,
      overallWinRate: 54.8,
      totalGames: 39412,
      homeAwayBreakdown: payload.homeAwayBreakdown,
    });
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
    expect(ev?.classLabel).toBe("gap 3 or more");
    expect(ev?.winPct).toBe(57.2);
    expect(ev?.games).toBe(12481);
    expect(ev?.sentence).not.toContain("61.1");
  });

  it("selects the top bucket for a gap that clears every threshold", () => {
    expect(buildRestAdvantageEvidence(homeRested(9.4), source)?.classLabel).toBe(
      "gap 7 or more"
    );
  });

  it("treats a threshold boundary as cleared", () => {
    expect(buildRestAdvantageEvidence(homeRested(2), source)?.classLabel).toBe(
      "gap 2 or more"
    );
    expect(buildRestAdvantageEvidence(homeRested(1.999), source)?.classLabel).toBe(
      "gap any measurable"
    );
  });

  it("falls back to the overall rate for a called gap that clears no threshold", () => {
    const ev = buildRestAdvantageEvidence(homeRested(1.2), source);
    expect(ev?.classLabel).toBe("gap any measurable");
    expect(ev?.winPct).toBe(54.8);
    expect(ev?.games).toBe(39412);
    expect(ev?.sentence).toContain("Any measurable gap has gone");
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
      "gap any measurable"
    );
  });

  it("refuses to make a claim with no denominator at all", () => {
    expect(
      buildRestAdvantageEvidence(homeRested(8), {
        thresholds: [],
        overallWinRate: 0,
        totalGames: 0,
        homeAwayBreakdown: source.homeAwayBreakdown,
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
  // Those games are now stated as the home team's record over them rather than as the
  // visitor's loss — the same set and the same counts, with the subject changed so the
  // sentence gives the reason for the home-only rule instead of only its verdict.

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

  it("states the home team's record over the uncalled half, with its own denominator", () => {
    // 11,548 games, the rested visitor won 4,894 — so the home team won the other 6,654,
    // which is 57.6%. The visitor's own 42.4% is not what the card says any more.
    const ev = buildRestAdvantageEvidence(awayRested(4.1), source)!;

    expect(ev.classLabel).toBe("home court · rested visitor");
    expect(ev.winPct).toBe(57.6);
    expect(ev.games).toBe(11548);
    expect(ev.sentence).toBe(
      "When the fresher team is the visitor, the home team has still won 57.6% of the time (n = 11,548)."
    );
  });

  it("names the home team as the subject, so the rate cannot be read as the visitor's", () => {
    // The number and the label travel together: `/upcoming` renders classLabel directly
    // beneath winPct, so a label naming the wrong side states the opposite of the truth.
    const ev = buildRestAdvantageEvidence(awayRested(4.1), source)!;

    expect(ev.sentence).toContain("the home team");
    expect(ev.classLabel).toContain("home court");
    expect(ev.sentence).not.toContain("42.4");
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
