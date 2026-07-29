import { describe, expect, it } from "vitest";
import whistle from "@/data/referee-whistle.json";

/**
 * Guards the regenerated artifact: scripts/fetch_officials.ts rewrites
 * src/data/referee-whistle.json, and the /referees page renders these numbers and colors
 * cells by the z fields. A regeneration that breaks the z arithmetic would silently bold
 * noise or mute real deviations.
 */
describe("referee whistle dataset", () => {
  it("counts every collected game exactly once in the league block", () => {
    expect(whistle.league.n).toBe(whistle.gamesCovered);
    expect(whistle.gamesCovered).toBeGreaterThan(10_000);
  });

  it("assigns each game to about three officials", () => {
    const refGames = whistle.officials.reduce((acc, o) => acc + o.games, 0);
    // Crews are 3, with rare short-handed or alternate games — the ratio must stay near 3.
    expect(refGames / whistle.gamesCovered).toBeGreaterThan(2.8);
    expect(refGames / whistle.gamesCovered).toBeLessThan(3.2);
  });

  it("computes each official's home-FTA z from the league sd at their sample size", () => {
    for (const o of whistle.officials) {
      const z = (o.homeFtaEdge - whistle.league.homeFtaEdge) /
        (whistle.league.sdHomeFtaEdge / Math.sqrt(o.games));
      // Both sides round: homeFtaEdge to 2dp, z to 1dp. Allow that slack, nothing more.
      expect(Math.abs(z - o.homeFtaEdgeZ)).toBeLessThan(0.35);
    }
  });

  it("keeps rates and orderings the page relies on", () => {
    for (const o of whistle.officials) {
      expect(o.homeWinPct).toBeGreaterThanOrEqual(0);
      expect(o.homeWinPct).toBeLessThanOrEqual(100);
      expect(o.games).toBeGreaterThan(0);
    }
    const games = whistle.officials.map((o) => o.games);
    expect([...games].sort((a, b) => b - a)).toEqual(games);
  });
});
