import { describe, expect, it } from "vitest";
import {
  buildRestAdvantageEvidence,
  formatRestAdvantageDisplay,
  type RestAdvantageEvidenceSource,
} from "@/lib/rest-advantage-display";

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

describe("buildRestAdvantageEvidence", () => {
  const source: RestAdvantageEvidenceSource = {
    // Cumulative buckets: each counts every game at or above its threshold.
    thresholds: [
      { threshold: 2, games: 20000, restedTeamWins: 11240, winPct: 56.2 },
      { threshold: 3, games: 12481, restedTeamWins: 7139, winPct: 57.2 },
      { threshold: 5, games: 5763, restedTeamWins: 3521, winPct: 61.1 },
      { threshold: 7, games: 1902, restedTeamWins: 1206, winPct: 63.4 },
    ],
    overallWinRate: 54.8,
    totalGames: 39412,
  };

  it("picks the highest cleared bucket, not the nearest one", () => {
    // Regression: the original spec applied the RA>=5 rate (61.1%) to a 4.1 gap.
    // Because the buckets are cumulative, 4.1 belongs to "3 or more".
    const ev = buildRestAdvantageEvidence(4.1, source);
    expect(ev?.classLabel).toBe("3 or more");
    expect(ev?.winPct).toBe(57.2);
    expect(ev?.games).toBe(12481);
    expect(ev?.sentence).not.toContain("61.1");
  });

  it("selects the top bucket for a gap that clears every threshold", () => {
    expect(buildRestAdvantageEvidence(9.4, source)?.classLabel).toBe("7 or more");
  });

  it("treats a threshold boundary as cleared", () => {
    expect(buildRestAdvantageEvidence(2, source)?.classLabel).toBe("2 or more");
    expect(buildRestAdvantageEvidence(1.999, source)?.classLabel).toBe("any measurable");
  });

  it("falls back to the overall rate for a called gap that clears no threshold", () => {
    const ev = buildRestAdvantageEvidence(1.2, source);
    expect(ev?.classLabel).toBe("any measurable");
    expect(ev?.winPct).toBe(54.8);
    expect(ev?.games).toBe(39412);
    expect(ev?.sentence).toContain("Any measurable gap has gone");
  });

  it("counts exactly 0.5 as a call, matching classifyRestAdvantage", () => {
    expect(buildRestAdvantageEvidence(0.5, source)).not.toBeNull();
    expect(buildRestAdvantageEvidence(0.49, source)).toBeNull();
  });

  it("says nothing for a neutral, absent or sourceless matchup", () => {
    expect(buildRestAdvantageEvidence(0.1, source)).toBeNull();
    expect(buildRestAdvantageEvidence(null, source)).toBeNull();
    expect(buildRestAdvantageEvidence(undefined, source)).toBeNull();
    expect(buildRestAdvantageEvidence(4.1, null)).toBeNull();
  });

  it("ignores a bucket with a zero denominator and falls through", () => {
    const sparse: RestAdvantageEvidenceSource = {
      ...source,
      thresholds: [{ threshold: 7, games: 0, restedTeamWins: 0, winPct: 0 }],
    };
    expect(buildRestAdvantageEvidence(8, sparse)?.classLabel).toBe("any measurable");
  });

  it("refuses to make a claim with no denominator at all", () => {
    expect(
      buildRestAdvantageEvidence(8, { thresholds: [], overallWinRate: 0, totalGames: 0 })
    ).toBeNull();
  });

  it("states the counterfactual in the correct direction", () => {
    const below: RestAdvantageEvidenceSource = {
      ...source,
      thresholds: [{ threshold: 2, games: 900, restedTeamWins: 405, winPct: 45.0 }],
    };
    expect(buildRestAdvantageEvidence(3, below)?.sentence).toContain(
      "5.0 points below a coin flip"
    );

    const level: RestAdvantageEvidenceSource = {
      ...source,
      thresholds: [{ threshold: 2, games: 900, restedTeamWins: 450, winPct: 50 }],
    };
    expect(buildRestAdvantageEvidence(3, level)?.sentence).toContain(
      "level with a coin flip"
    );
    expect(buildRestAdvantageEvidence(3, level)?.deviation).toBe(0);
  });

  it("renders the denominator with thousands separators", () => {
    expect(buildRestAdvantageEvidence(1.2, source)?.sentence).toContain("n = 39,412");
  });

  it("states both the denominator and the counterfactual in every sentence", () => {
    // The house rule, asserted directly.
    for (const diff of [0.6, 1.2, 2.5, 4.1, 6, 12]) {
      const ev = buildRestAdvantageEvidence(diff, source);
      expect(ev, `no evidence for ${diff}`).not.toBeNull();
      expect(ev!.sentence).toMatch(/n = [\d,]+/);
      expect(ev!.sentence).toContain("coin flip");
    }
  });
});
