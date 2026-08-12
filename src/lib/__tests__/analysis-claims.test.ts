import { describe, expect, it } from "vitest";
import {
  BEYOND_CLAUSE,
  WIDER_GAP_CLAUSE,
  buildAnalysisClaims,
  toDeviation,
} from "@/lib/analysis-claims";
import type { AnalysisResponse, ThresholdBucket } from "@/types";

/**
 * Cumulative buckets, as the API ships them: each counts every game at or above its threshold.
 * The RA ≥ 5 and RA ≥ 7 lifts sit 0.4 points apart, which is the live shape — the rate is flat
 * from RA ≥ 5 upward rather than climbing.
 */
const THRESHOLDS: ThresholdBucket[] = [
  { threshold: 2, games: 16078, restedTeamWins: 9947, winPct: 61.9 },
  { threshold: 3, games: 10524, restedTeamWins: 6639, winPct: 63.1 },
  { threshold: 5, games: 3782, restedTeamWins: 2382, winPct: 63.0 },
  { threshold: 7, games: 1108, restedTeamWins: 702, winPct: 63.4 },
];

function response(overrides: Partial<AnalysisResponse> = {}): AnalysisResponse {
  return {
    totalGames: 39412,
    overallWins: 24120,
    overallWinRate: 61.2,
    thresholds: THRESHOLDS,
    homeAwayBreakdown: {
      homeTeamMoreRested: { games: 39412, restedTeamWins: 24120, winPct: 61.2 },
      awayTeamMoreRested: { games: 11548, restedTeamWins: 4894, winPct: 42.4 },
    },
    venueBaseline: { games: 47143, homeWins: 28239, homeWinPct: 59.9, roadWinPct: 40.1 },
    seasonWinRates: [],
    ...overrides,
  } as AnalysisResponse;
}

/** Replaces one cumulative bucket, leaving the rest of the ladder alone. */
function withBucket(threshold: number, patch: Partial<ThresholdBucket> | null): AnalysisResponse {
  const thresholds = patch === null
    ? THRESHOLDS.filter((t) => t.threshold !== threshold)
    : THRESHOLDS.map((t) => (t.threshold === threshold ? { ...t, ...patch } : t));
  return response({ thresholds });
}

describe("buildAnalysisClaims", () => {
  it("refuses to claim anything without a baseline to state the rates against", () => {
    const claims = buildAnalysisClaims(
      response({
        venueBaseline: { games: 0, homeWins: 0, homeWinPct: 0, roadWinPct: 0 },
      })
    );

    expect(claims).toBeNull();
  });

  it("refuses to claim anything before the backtest arrives", () => {
    expect(buildAnalysisClaims(undefined)).toBeNull();
    expect(buildAnalysisClaims(null)).toBeNull();
  });

  it("refuses to claim anything when no game was counted", () => {
    expect(buildAnalysisClaims(response({ totalGames: 0 }))).toBeNull();
  });
});

describe("the hero tiles", () => {
  it("never publishes a third cut", () => {
    const claims = buildAnalysisClaims(response());

    expect(claims?.tiles.length).toBeLessThanOrEqual(2);
  });

  it("names who won and over which slice, and never says 'overall'", () => {
    const claims = buildAnalysisClaims(response());

    for (const tile of claims?.tiles ?? []) {
      expect(tile.label).toMatch(/^RESTED TEAM AT HOME WON · /);
      expect(tile.label).not.toMatch(/overall/i);
    }
  });

  it("carries a denominator and a lift on every tile, never a bare rate", () => {
    const claims = buildAnalysisClaims(response());

    expect(claims?.tiles.length).toBe(2);
    for (const tile of claims?.tiles ?? []) {
      expect(tile.games).toBeGreaterThan(0);
      expect(Number.isFinite(tile.lift)).toBe(true);
      // The rendered line has to say both, not merely carry them as fields a caller may drop.
      expect(tile.detail).toMatch(/^[\d,]+ GAMES · /);
      expect(tile.detail).toMatch(/BASELINE$/);
      expect(tile.detail).not.toMatch(/coin.?flip/i);
    }
  });

  it("signs the lift with the site's minus sign rather than a hyphen", () => {
    const claims = buildAnalysisClaims(
      response({ overallWinRate: 57.4, thresholds: THRESHOLDS.filter((t) => t.threshold !== 5) })
    );

    // 57.4 − 59.9 = −2.5, and `signedNumber` emits U+2212, not "-".
    expect(claims?.tiles[0].detail).toContain("−2.5");
    expect(claims?.tiles[0].detail).not.toContain("-2.5");
  });

  it("renders the denominator with thousands separators", () => {
    const claims = buildAnalysisClaims(response());

    expect(claims?.tiles[0].detail).toContain("39,412 GAMES");
  });

  it("states the lift against the baseline, not against a coin flip", () => {
    const claims = buildAnalysisClaims(response());

    // 61.2 − 59.9 = 1.3, the one point rest accounts for. Against 50 it would read 11.2.
    expect(claims?.tiles[0].lift).toBe(1.3);
  });

  it("drops the wider tile when its bucket is empty, rather than publishing a rate off no games", () => {
    const claims = buildAnalysisClaims(withBucket(5, { games: 0, restedTeamWins: 0 }));

    expect(claims?.tiles.map((t) => t.threshold)).toEqual([null]);
  });
});

describe("the declined half", () => {
  it("is always stated, because the headline is unreadable without it", () => {
    const claims = buildAnalysisClaims(response());

    expect(claims?.declinedHalf.games).toBe(11548);
  });

  it("reports the home team's win rate over those games, not the rested visitor's", () => {
    const claims = buildAnalysisClaims(response());

    // The visitor won 42.4% of them, so the home side won 57.6% — stated as the win it is.
    expect(claims?.declinedHalf.homeWinPct).toBeCloseTo(57.6, 1);
  });

  it("reads that rate against the same baseline as the tiles", () => {
    const claims = buildAnalysisClaims(response());

    expect(claims?.declinedHalf.lift).toBeCloseTo(
      toDeviation(claims?.declinedHalf.homeWinPct ?? 0, 59.9),
      5
    );
  });
});

describe("the chart zero labels", () => {
  it("names what zero is on both charts, and never a coin flip", () => {
    const claims = buildAnalysisClaims(response());

    expect(claims?.thresholdZeroLabel).toContain("59.9%");
    expect(claims?.thresholdZeroLabel).toMatch(/HOME TEAM WINS ANYWAY/);
    expect(claims?.seasonZeroLabel).toMatch(/THAT SEASON'S OWN HOME WIN RATE/);
    for (const label of [claims?.thresholdZeroLabel, claims?.seasonZeroLabel]) {
      expect(label).not.toMatch(/coin.?flip/i);
    }
  });
});

describe("the reading-these-numbers claim", () => {
  it("calls a wider gap the same gain when its lift sits within a point of RA >= 5", () => {
    const claims = buildAnalysisClaims(response());

    // 63.4 − 59.9 = 3.5 against 63.0 − 59.9 = 3.1. Four tenths apart: flat.
    expect(claims?.reading?.beyond?.relation).toBe("flat");
  });

  /**
   * The regression this module was built for. The page asserted "the same gain, not a larger
   * one" as fixed prose over two live figures, so a genuine climb would have rendered true
   * numbers under a false sentence and nothing would have caught it. This case is what "nothing"
   * used to mean.
   */
  it("calls it higher when the wider gap genuinely climbs", () => {
    const claims = buildAnalysisClaims(withBucket(7, { winPct: 70.4, restedTeamWins: 780 }));

    // 70.4 − 59.9 = 10.5 against 3.1. Seven points of climb is not the same gain.
    expect(claims?.reading?.beyond?.relation).toBe("higher");
  });

  it("calls it lower when the wider gap falls back", () => {
    const claims = buildAnalysisClaims(withBucket(7, { winPct: 55.0, restedTeamWins: 609 }));

    expect(claims?.reading?.beyond?.relation).toBe("lower");
  });

  it("says nothing about the wider gap when that bucket is missing", () => {
    const claims = buildAnalysisClaims(withBucket(7, null));

    expect(claims?.reading?.beyond).toBeNull();
    expect(claims?.reading?.ra5.winPct).toBe(63.0);
  });

  it("says nothing at all when there is no RA >= 5 bucket to read from", () => {
    const claims = buildAnalysisClaims(withBucket(5, null));

    expect(claims?.reading).toBeNull();
  });

  it("carries the denominator for every rate it states", () => {
    const claims = buildAnalysisClaims(response());

    expect(claims?.reading?.ra5.games).toBe(3782);
    expect(claims?.reading?.beyond?.games).toBe(1108);
  });
});

describe("the wording each relation renders", () => {
  /**
   * A relation is only half the fix: the sentence still has to agree with it. These pin the
   * mapping so pointing "higher" at "the same gain" fails here rather than shipping.
   */
  it("never calls a climb the same gain, nor a flat run a climb", () => {
    expect(BEYOND_CLAUSE.flat.tail).toMatch(/same gain/);
    expect(BEYOND_CLAUSE.higher.tail).not.toMatch(/same gain/);
    expect(BEYOND_CLAUSE.lower.tail).not.toMatch(/same gain/);

    expect(BEYOND_CLAUSE.flat.lead).toMatch(/does not keep climbing/);
    expect(BEYOND_CLAUSE.higher.lead).not.toMatch(/does not keep climbing/);
  });

  it("only promises a bigger gap is worth more when it measurably is", () => {
    expect(WIDER_GAP_CLAUSE.higher).toMatch(/worth more/);
    expect(WIDER_GAP_CLAUSE.flat).not.toMatch(/worth more/);
    expect(WIDER_GAP_CLAUSE.lower).not.toMatch(/worth more/);
  });

  it("has wording for every relation the builder can produce", () => {
    for (const relation of ["flat", "higher", "lower"] as const) {
      expect(WIDER_GAP_CLAUSE[relation]).toBeTruthy();
      expect(BEYOND_CLAUSE[relation].lead).toBeTruthy();
      expect(BEYOND_CLAUSE[relation].tail).toBeTruthy();
    }
  });
});

describe("the reading claim's relation to the any-gap tile", () => {
  it("reads RA >= 5 as the bigger gain when it clears the any-gap lift", () => {
    const claims = buildAnalysisClaims(response());

    // 3.1 against 1.3 — 1.8 points apart, so the page may say a bigger gap is worth more.
    expect(claims?.reading?.ra5.relationToAnyGap).toBe("higher");
  });

  it("refuses that sentence when RA >= 5 lands level with the any-gap rate", () => {
    const claims = buildAnalysisClaims(withBucket(5, { winPct: 61.5 }));

    // 1.6 against 1.3 — three tenths apart, which is not a bigger gain.
    expect(claims?.reading?.ra5.relationToAnyGap).toBe("flat");
    expect(WIDER_GAP_CLAUSE[claims!.reading!.ra5.relationToAnyGap]).not.toMatch(/worth more/);
  });
});

describe("the header description", () => {
  it("names the population and the baseline it is measured against", () => {
    const claims = buildAnalysisClaims(response());

    expect(claims?.headerDescription).toMatch(/completed regular-season games/);
    expect(claims?.headerDescription).toMatch(/also at home/);
    expect(claims?.headerDescription).toContain("59.9%");
    expect(claims?.headerDescription).not.toMatch(/coin.?flip/i);
  });
});
