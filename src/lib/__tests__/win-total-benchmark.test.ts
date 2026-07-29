import { describe, expect, it } from "vitest";
import benchmark from "@/data/win-total-benchmark.json";

/**
 * Guards the regenerated artifact, not the pipeline: scripts/fetch_win_totals.ts rewrites
 * src/data/win-total-benchmark.json, and these invariants are what the Schedule Edge page's
 * market-check section states in prose. If a regeneration breaks one, the page would publish
 * an arithmetic lie.
 */
describe("win-total benchmark dataset", () => {
  it("buckets partition the decided team-seasons exactly", () => {
    const bucketN = benchmark.buckets.reduce((acc, b) => acc + b.n, 0);
    expect(bucketN).toBe(benchmark.overall.n);
    expect(benchmark.overall.n + benchmark.pushes).toBe(benchmark.teamSeasons);
  });

  it("over counts stay within their bucket sizes", () => {
    for (const b of benchmark.buckets) {
      expect(b.overs).toBeGreaterThanOrEqual(0);
      expect(b.overs).toBeLessThanOrEqual(b.n);
    }
    const overs = benchmark.buckets.reduce((acc, b) => acc + b.overs, 0);
    expect(overs).toBe(benchmark.overall.overs);
  });

  it("correlation is computed over every team-season and is a real r", () => {
    expect(benchmark.correlation.n).toBe(benchmark.teamSeasons);
    expect(Math.abs(benchmark.correlation.r)).toBeLessThanOrEqual(1);
  });

  it("covers the archive's full published range", () => {
    // 1993-94 is the earliest season with archived lines; the lockout 1998-99 has none and
    // 2019-20 is outside this site's dataset, so the count is (last − first + 1) − 2.
    expect(benchmark.firstSeason).toBe("1993-94");
    const first = Number(benchmark.firstSeason.slice(0, 4));
    const last = Number(benchmark.lastSeason.slice(0, 4));
    expect(benchmark.seasonsCovered).toBe(last - first + 1 - 2);
    expect(benchmark.seasonsCovered).toBeGreaterThanOrEqual(31);
  });
});
