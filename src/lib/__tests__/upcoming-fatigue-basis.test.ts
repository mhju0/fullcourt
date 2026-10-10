import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * What a game that has not been played yet is scored against.
 *
 * The nightly job rewrites the next two weeks of fatigue rows. Until 2026-10-11 it counted only
 * `final` games as prior games, so a team's game last night (still in progress when the job ran)
 * and every game between today and the row's own date were dropped: a back-to-back read as
 * rested until the evening it was played, and before opening night whole dates read as zero.
 * The page's 3-in-4, 4-in-6 and 30-day counts had the same filter and went blank the same way.
 *
 * Each of these needs a database to exercise, so the rule is pinned in the source, the same
 * posture `publishable-games.test.ts` takes.
 */
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("the nightly fatigue refresh", () => {
  const source = read("scripts", "run-daily.ts");

  it("counts scheduled games as prior games", () => {
    expect(source).toMatch(
      /fetchRecentGamesForTeam\(\s*appDb,\s*teamId,\s*gameDate,\s*"scheduled"\s*\)/
    );
  });

  it("never falls back to the finals-only default", () => {
    expect(source).not.toMatch(/fetchRecentGamesForTeam\(\s*appDb,\s*teamId,\s*gameDate\s*\)/);
  });
});

describe("the schedule-density readers", () => {
  const queries = read("src", "lib", "db", "queries.ts");

  function bodyOf(name: string): string {
    const start = queries.indexOf(`function ${name}(`);
    expect(start, `${name} not found in queries.ts`).toBeGreaterThan(-1);
    return queries.slice(start, queries.indexOf("\n}\n", start));
  }

  it.each(["getTeamGameCountsInDaysBefore", "computeScheduleDensityMap"])(
    "%s counts prior games whether or not they have been played",
    (name) => {
      expect(bodyOf(name)).not.toContain('eq(games.status, "final")');
    }
  );
});
