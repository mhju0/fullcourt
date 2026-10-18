import { describe, expect, it } from "vitest";
import {
  RANGE_RELATION_CLAUSE,
  buildAnalysisClaims,
  eraLift,
  rangeGapTolerancePp,
  rangeStandardErrorPp,
  toDeviation,
} from "@/lib/analysis-claims";
import type { AnalysisResponse, EraRates, GapRangeBucket } from "@/types";

/** Binomial standard error in percentage points, the module's own, restated for comparison. */
const sePp = ({ games, wins }: { games: number; wins: number }) =>
  100 * Math.sqrt(((wins / games) * (1 - wins / games)) / games);

/** The live shape on 2026-10-17: small sits at the baseline, large well above it. */
const RANGES: GapRangeBucket[] = [
  { key: "small", min: 0.5, max: 3, games: 16957, restedTeamWins: 10174, winPct: 60.0 },
  { key: "medium", min: 3, max: 5, games: 6707, restedTeamWins: 4152, winPct: 61.9 },
  { key: "large", min: 5, max: null, games: 3756, restedTeamWins: 2452, winPct: 65.3 },
];

const era = (first: string, last: string, homeWinPct: number, small: number, large: number): EraRates => ({
  firstSeason: first,
  lastSeason: last,
  seasonCount: 5,
  homeGames: 5000,
  homeWins: Math.round(homeWinPct * 50),
  homeWinPct,
  ranges: [
    { ...RANGES[0], games: 2000, winPct: small },
    { ...RANGES[1], games: 800, winPct: 62 },
    { ...RANGES[2], games: 400, winPct: large },
  ],
});

function response(overrides: Partial<AnalysisResponse> = {}): AnalysisResponse {
  return {
    totalGames: 27420,
    overallWins: 16778,
    overallWinRate: 61.2,
    thresholds: [],
    gapRanges: RANGES,
    eras: [era("2015-16", "2019-20", 59, 58.5, 64), era("2020-21", "2024-25", 56, 57.2, 60.1)],
    homeAwayBreakdown: {
      homeTeamMoreRested: { games: 27420, restedTeamWins: 16778, winPct: 61.2 },
      awayTeamMoreRested: { games: 11494, restedTeamWins: 4862, winPct: 42.3 },
    },
    venueBaseline: { games: 47112, homeWins: 28220, homeWinPct: 59.9, roadWinPct: 40.1 },
    seasonWinRates: [],
    ...overrides,
  } as AnalysisResponse;
}

function withRange(key: GapRangeBucket["key"], patch: Partial<GapRangeBucket> | null): AnalysisResponse {
  const gapRanges = patch === null
    ? RANGES.filter((r) => r.key !== key)
    : RANGES.map((r) => (r.key === key ? { ...r, ...patch } : r));
  return response({ gapRanges });
}

describe("buildAnalysisClaims", () => {
  it("refuses to claim anything without a baseline to state the rates against", () => {
    expect(buildAnalysisClaims(response({
      venueBaseline: { games: 0, homeWins: 0, homeWinPct: 0, roadWinPct: 0 },
    }))).toBeNull();
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
  it("never publishes a third tile", () => {
    expect(buildAnalysisClaims(response())?.tiles.length).toBeLessThanOrEqual(2);
  });

  it("names the home team as the rested side, and never says 'any gap' or 'overall'", () => {
    for (const tile of buildAnalysisClaims(response())?.tiles ?? []) {
      expect(tile.label).toMatch(/^RESTED TEAM AT HOME/);
      expect(tile.label).not.toMatch(/any gap|overall/i);
    }
  });

  it("states the gap floor in numbers beside the denominator", () => {
    const [all, large] = buildAnalysisClaims(response())?.tiles ?? [];

    expect(all.detail).toBe("GAP 0.5 OR MORE · 27,420 GAMES");
    expect(large.detail).toBe("GAP 5 OR MORE · 3,756 GAMES");
    expect(large.range).toBe("large");
  });

  it("carries a denominator and a baseline read on every tile, never a bare rate", () => {
    const claims = buildAnalysisClaims(response());

    expect(claims?.tiles.length).toBe(2);
    for (const tile of claims?.tiles ?? []) {
      expect(tile.games).toBeGreaterThan(0);
      expect(Number.isFinite(tile.lift)).toBe(true);
      expect(tile.detail).toMatch(/· [\d,]+ GAMES$/);
      expect(tile.baselineLabel).toMatch(/BASELINE$/);
      expect(tile.baselineLabel).not.toMatch(/coin.?flip|50/i);
    }
  });

  it("states the lift against the baseline, not against a coin flip, and keeps its sign", () => {
    expect(buildAnalysisClaims(response())?.tiles.map((t) => t.lift)).toEqual([1.3, 5.4]);
    expect(buildAnalysisClaims(response({ overallWinRate: 57.4 }))?.tiles[0].lift).toBe(-2.5);
  });

  it("drops the large tile when that range is empty, rather than publishing a rate off no games", () => {
    const claims = buildAnalysisClaims(withRange("large", { games: 0, restedTeamWins: 0, winPct: 0 }));

    expect(claims?.tiles.map((t) => t.range)).toEqual([null]);
  });
});

describe("the declined half", () => {
  it("reports the home team's win rate over those games, against the same baseline", () => {
    const claims = buildAnalysisClaims(response());

    expect(claims?.declinedHalf.games).toBe(11494);
    expect(claims?.declinedHalf.homeWinPct).toBeCloseTo(57.7, 1);
    expect(claims?.declinedHalf.lift).toBeCloseTo(toDeviation(claims?.declinedHalf.homeWinPct ?? 0, 59.9), 5);
  });
});

describe("the chart zero labels", () => {
  it("names what zero is on both charts, and never a coin flip", () => {
    const claims = buildAnalysisClaims(response());

    expect(claims?.rangeZeroLabel).toContain("59.9%");
    expect(claims?.rangeZeroLabel).toMatch(/HOME TEAM WINS ANYWAY/);
    expect(claims?.eraZeroLabel).toMatch(/THAT ERA'S OWN HOME WIN RATE/);
    for (const label of [claims?.rangeZeroLabel, claims?.eraZeroLabel]) {
      expect(label).not.toMatch(/coin.?flip/i);
    }
  });
});

describe("the reading claim", () => {
  it("states every range with its span, rate, count and lift", () => {
    const ranges = buildAnalysisClaims(response())?.reading?.ranges ?? [];

    expect(ranges.map((r) => [r.name, r.span, r.winPct, r.games, r.lift])).toEqual([
      ["small", "0.5–3", 60, 16957, 0.1],
      ["medium", "3–5", 61.9, 6707, 2],
      ["large", "5+", 65.3, 3756, 5.4],
    ]);
  });

  it("calls a small-gap lift noise when the range cannot separate it from the baseline", () => {
    const ranges = buildAnalysisClaims(response())?.reading?.ranges ?? [];

    // +0.1 on 16,957 games, where two standard errors are about 0.7 points.
    expect(ranges.map((r) => r.withinNoise)).toEqual([true, false, false]);
  });

  it("says the gain sits in the bigger gaps only when large clears small by more than the noise", () => {
    expect(buildAnalysisClaims(response())?.reading?.largeVsSmall).toBe("higher");
    expect(buildAnalysisClaims(withRange("large", { winPct: 60.4 }))?.reading?.largeVsSmall).toBe("flat");
    expect(buildAnalysisClaims(withRange("large", { winPct: 56 }))?.reading?.largeVsSmall).toBe("lower");
  });

  it("makes no size comparison when either end is missing", () => {
    expect(buildAnalysisClaims(withRange("small", null))?.reading?.largeVsSmall).toBeNull();
    expect(buildAnalysisClaims(withRange("large", { games: 0, restedTeamWins: 0 }))?.reading?.largeVsSmall).toBeNull();
  });

  it("leaves an empty range out of the sentence", () => {
    const ranges = buildAnalysisClaims(withRange("medium", { games: 0, restedTeamWins: 0, winPct: 0 }))?.reading?.ranges;

    expect(ranges?.map((r) => r.key)).toEqual(["small", "large"]);
  });
});

describe("the wording each relation renders", () => {
  it("never calls a flat run a climb, and only promises more when it is measured", () => {
    expect(RANGE_RELATION_CLAUSE.flat).not.toMatch(/sits in the bigger|worth more/);
    expect(RANGE_RELATION_CLAUSE.lower).not.toMatch(/sits in the bigger/);
    expect(RANGE_RELATION_CLAUSE.higher).toMatch(/bigger gaps/);
  });
});

describe("the tolerance the size comparison is measured against", () => {
  const small = { games: 16957, wins: 10174 };
  const large = { games: 3756, wins: 2452 };

  it("is the combined standard error of two independent rates", () => {
    expect(rangeGapTolerancePp(large, small)).toBeCloseTo(Math.hypot(sePp(large), sePp(small)), 10);
  });

  it("widens as a range thins", () => {
    expect(rangeGapTolerancePp({ games: 400, wins: 260 }, small)).toBeGreaterThan(rangeGapTolerancePp(large, small));
  });

  it("claims nothing off an empty range, and never drops below the one decimal printed", () => {
    expect(rangeGapTolerancePp({ games: 0, wins: 0 }, small)).toBe(Infinity);
    expect(rangeGapTolerancePp({ games: 10, wins: 10 }, { games: 10, wins: 0 })).toBe(0.1);
  });

  it("gives the chart the same standard error the sentence reads", () => {
    expect(rangeStandardErrorPp({ games: 3756, restedTeamWins: 2452 })).toBeCloseTo(sePp(large), 10);
    expect(rangeStandardErrorPp({ games: 0, restedTeamWins: 0 })).toBe(0);
  });
});

describe("the era summary", () => {
  it("reads each era's ranges against that era's own home rate", () => {
    const [first] = response().eras;

    expect(eraLift(first, "large")).toBe(5);
    expect(eraLift(first, "small")).toBe(-0.5);
  });

  it("counts the eras where large gaps beat home court and spans the small-gap lifts", () => {
    expect(buildAnalysisClaims(response())?.eraSummary).toEqual({
      eraCount: 2,
      largeAboveCount: 2,
      smallLiftMin: -0.5,
      smallLiftMax: 1.2,
    });
  });

  it("says nothing when an era is missing a range, rather than counting around the gap", () => {
    const eras = response().eras.map((e, i) => (i === 0 ? { ...e, ranges: e.ranges.filter((r) => r.key !== "large") } : e));

    expect(buildAnalysisClaims(response({ eras }))?.eraSummary).toBeNull();
    expect(buildAnalysisClaims(response({ eras: [] }))?.eraSummary).toBeNull();
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
