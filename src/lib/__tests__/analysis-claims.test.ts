import { describe, expect, it } from "vitest";
import {
  BEYOND_CLAUSE,
  WIDER_GAP_CLAUSE,
  buildAnalysisClaims,
  sameGainTolerancePp,
  toDeviation,
} from "@/lib/analysis-claims";
import type { AnalysisResponse, ThresholdBucket } from "@/types";

/** Binomial standard error in percentage points — the module's own, restated for comparison. */
const sePp = ({ games, wins }: { games: number; wins: number }) =>
  100 * Math.sqrt(((wins / games) * (1 - wins / games)) / games);

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

  it("carries a denominator and a baseline read on every tile, never a bare rate", () => {
    const claims = buildAnalysisClaims(response());

    expect(claims?.tiles.length).toBe(2);
    for (const tile of claims?.tiles ?? []) {
      expect(tile.games).toBeGreaterThan(0);
      expect(Number.isFinite(tile.lift)).toBe(true);
      // Since ADR 0010 the lift travels structurally (lift + baselineLabel feed the tile's E1
      // slot) and the detail line carries the count alone — but the invariant is unchanged:
      // both halves must exist on every tile, and neither may read against a coin flip.
      expect(tile.detail).toMatch(/^[\d,]+ GAMES$/);
      expect(tile.baselineLabel).toMatch(/BASELINE$/);
      expect(tile.detail).not.toMatch(/coin.?flip/i);
      expect(tile.baselineLabel).not.toMatch(/coin.?flip|50/i);
    }
  });

  it("carries a negative lift as a signed value the tile can render", () => {
    const claims = buildAnalysisClaims(
      response({ overallWinRate: 57.4, thresholds: THRESHOLDS.filter((t) => t.threshold !== 5) })
    );

    // 57.4 − 59.9 = −2.5. The U+2212 rendering itself now happens in StatTile through
    // `signedNumber`, which owns that rule for the whole app — this asserts the value the
    // slot receives, since a lift folded into prose is what this module exists to prevent.
    expect(claims?.tiles[0].lift).toBe(-2.5);
    expect(claims?.tiles[0].detail).not.toContain("2.5");
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
  it("calls a wider gap the same gain when its lift sits inside the noise on that bucket", () => {
    const claims = buildAnalysisClaims(response());

    // 63.4 − 59.9 = 3.5 against 63.0 − 59.9 = 3.1. Four tenths apart, against a tolerance of
    // about 1.7 derived from these counts: flat.
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

/**
 * The bar a difference has to clear is derived from the counts behind it, not chosen. This is
 * what that buys, and none of it is reachable with a fixed threshold: the SAME difference in
 * lift is a trend on a thick bucket and silence on a thin one.
 *
 * `SAME_GAIN_TOLERANCE_PP = 1` stood here until 2026-08-13 (issue #30). It failed its own stated
 * rule — the page must not narrate a trend smaller than the noise, and on the live RA ≥ 7 bucket
 * the noise is about 1.7 points, so a 1.1-point blip would have been published as a real climb.
 */
describe("the tolerance the comparison is measured against", () => {
  /** Same shape, same lifts, 10× the games. */
  const thick = response({
    totalGames: 200_000,
    overallWins: 122_400,
    thresholds: [
      { threshold: 5, games: 37_820, restedTeamWins: 23_827, winPct: 63.0 },
      { threshold: 7, games: 11_080, restedTeamWins: 7_147, winPct: 64.5 },
    ],
  });

  const thin = response({
    thresholds: [
      { threshold: 5, games: 3_782, restedTeamWins: 2_382, winPct: 63.0 },
      { threshold: 7, games: 200, restedTeamWins: 129, winPct: 64.5 },
    ],
  });

  it("reads one and the same climb as real on a thick bucket and as noise on a thin one", () => {
    // Both are a lift of 4.6 against 3.1 — identical to one decimal, which is all the page shows.
    for (const data of [thick, thin]) {
      const r = buildAnalysisClaims(data)!.reading!;
      expect(r.beyond!.lift - r.ra5.lift).toBeCloseTo(1.5, 5);
    }

    // 11,080 games behind it: the difference clears the noise and the page may say so.
    expect(buildAnalysisClaims(thick)?.reading?.beyond?.relation).toBe("higher");
    // 200 games behind it: the same difference is indistinguishable from nothing.
    expect(buildAnalysisClaims(thin)?.reading?.beyond?.relation).toBe("flat");
  });

  it("widens as the narrow bucket thins", () => {
    const wide = { games: 37_820, wins: 23_827 };
    expect(sameGainTolerancePp({ games: 11_080, wins: 7_147 }, wide)).toBeLessThan(
      sameGainTolerancePp({ games: 200, wins: 129 }, wide)
    );
  });

  it("corrects for the buckets being nested rather than side by side", () => {
    // The API ships CUMULATIVE buckets, so the narrow one's games are also in the wide one.
    // Treating them as two independent samples understates the noise, because they share most
    // of their observations — the honest contrast is against the remainder, which is smaller
    // than the superset and therefore noisier.
    const narrow = { games: 1_108, wins: 702 };
    const wide = { games: 3_782, wins: 2_382 };
    const naive = Math.hypot(sePp(narrow), sePp(wide));

    expect(sameGainTolerancePp(narrow, wide)).toBeGreaterThan(naive);
  });

  it("claims nothing when the two buckets are the same population", () => {
    // No remainder means no independent contrast, so no difference could be real. The page has
    // to fall silent rather than compare a set with itself.
    const same = { games: 1_108, wins: 702 };
    expect(sameGainTolerancePp(same, same)).toBe(Infinity);

    const identical = response({
      thresholds: [
        { threshold: 5, games: 3_782, restedTeamWins: 2_382, winPct: 63.0 },
        { threshold: 7, games: 3_782, restedTeamWins: 2_382, winPct: 63.0 },
      ],
    });
    expect(buildAnalysisClaims(identical)?.reading?.beyond?.relation).toBe("flat");
  });

  it("never drops below the one decimal the page prints", () => {
    // A rate of exactly 100% collapses the binomial standard error to zero. Without a floor the
    // tolerance would too, and a difference of a rounding step would start a sentence.
    expect(sameGainTolerancePp({ games: 50, wins: 50 }, { games: 100, wins: 100 })).toBe(0.1);
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
