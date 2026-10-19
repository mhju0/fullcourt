import { describe, expect, it } from "vitest";
import { buildSeasonReadiness, hasValidFinalScore, seasonExpectedTiming, type ReadinessGame } from "@/lib/season-readiness";
import { CURRENT_TEAM_ABBREVIATIONS } from "@/lib/team-history";

const directory = CURRENT_TEAM_ABBREVIATIONS.map((abbreviation, id) => ({ id: id + 1, abbreviation }));
function slate(status = "final"): ReadinessGame[] {
  return Array.from({ length: 150 }, (_, gameId) => ({
    gameId, date: `2026-11-${String(Math.floor(gameId / 15) + 2).padStart(2, "0")}`, status,
    homeTeamId: (gameId % 15) * 2 + 1, awayTeamId: (gameId % 15) * 2 + 2,
    homeScore: status === "final" ? 100 : null, awayScore: status === "final" ? 90 : null,
  }));
}

describe("season result readiness", () => {
  it("requires every franchise, counting actual home and away appearances independently of fatigue roles", () => {
    const all = slate();
    expect(buildSeasonReadiness("2026-27", all, directory).ready).toBe(true);
    expect(buildSeasonReadiness("2026-27", all.slice(0, -1), directory).ready).toBe(false);
    expect(buildSeasonReadiness("2026-27", all.filter((game) => game.homeTeamId !== 1), directory).ready).toBe(false);
    expect(buildSeasonReadiness("2026-27", all, directory.slice(1)).ready).toBe(false);
  });

  it("does not count duplicate games, invalid finals, held games or live scores as played appearances", () => {
    const all = slate();
    const incomplete = all.slice(0, -1);
    expect(buildSeasonReadiness("2026-27", [...incomplete, incomplete[0]], directory).ready).toBe(false);
    for (const patch of [
      { status: "live" }, { status: "postponed" }, { status: "cancelled" },
      { homeScore: null }, { homeScore: -1 }, { homeScore: 90 }, { homeScore: NaN },
    ]) {
      expect(buildSeasonReadiness("2026-27", [...incomplete, { ...all.at(-1)!, ...patch }], directory).ready).toBe(false);
    }
  });

  it("derives an after-games estimate from the last team's schedule and withholds incomplete or held schedules", () => {
    const all = slate("scheduled");
    expect(buildSeasonReadiness("2026-27", all, directory)).toEqual({
      season: "2026-27", ready: false, expectedAfterDate: "2026-11-11",
    });
    expect(buildSeasonReadiness("2026-27", all.slice(0, -1), directory).expectedAfterDate).toBeNull();
    for (const status of ["cancelled", "postponed"]) {
      expect(buildSeasonReadiness("2026-27", [...all.slice(0, -1), { ...all.at(-1)!, status }], directory).expectedAfterDate).toBeNull();
    }
  });

  it("does not mistake the estimate or final-score validity for analytical eligibility", () => {
    const all = slate();
    expect(hasValidFinalScore(all[0])).toBe(true);
    const result = buildSeasonReadiness("2026-27", all, directory);
    expect(Object.keys(result).sort()).toEqual(["expectedAfterDate", "ready", "season"]);
    expect(seasonExpectedTiming("2026-11-11", "2026-11-11")).toBe("Expected after the November 11 games (ET).");
    expect(seasonExpectedTiming("2026-11-11", "2026-11-12")).toBeNull();
    expect(seasonExpectedTiming(null, "2026-10-19")).toBeNull();
  });
});
