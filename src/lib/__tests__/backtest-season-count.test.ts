import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// From 1 October NBA_SEASONS already lists the season about to start, which has no completed
// games yet. The "N-SEASON BACKTEST" claim must count the seasons the backtest measured.
describe("backtest season count", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it("counts measured seasons, not the supported list, after the October rollover", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T16:00:00Z"));
    vi.resetModules();
    const { NBA_SEASONS, parseSeasonStartYear } = await import("@/lib/nba-season");
    const { BACKTEST_SEASON_COUNT, REST_SPLIT_SAMPLE } = await import("@/lib/rest-split-facts");

    const span =
      parseSeasonStartYear(REST_SPLIT_SAMPLE.lastSeason) - parseSeasonStartYear(REST_SPLIT_SAMPLE.firstSeason) + 1;
    expect(BACKTEST_SEASON_COUNT).toBe(REST_SPLIT_SAMPLE.seasons);
    expect(BACKTEST_SEASON_COUNT).toBe(span);
    expect(NBA_SEASONS).toContain("2026-27");
    expect(BACKTEST_SEASON_COUNT).toBeLessThan(NBA_SEASONS.length);
  });

  it("is what the social card prints", () => {
    const source = readFileSync(join(process.cwd(), "src/app/opengraph-image.tsx"), "utf8");

    expect(source).toContain("${BACKTEST_SEASON_COUNT}-SEASON BACKTEST");
    expect(source).not.toContain("NBA_SEASONS");
  });
});
