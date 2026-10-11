import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HOME_REST_CONFOUND } from "@/lib/home-rest-confound-facts";
import { REST_SPLIT_SAMPLE } from "@/lib/rest-split-facts";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");
const facts = JSON.parse(read("ml", "home_rest_confound_facts.json"));

describe("home-rest confound facts mirror the generated measurement", () => {
  it("every group matches", () => {
    expect(HOME_REST_CONFOUND).toEqual(facts);
  });

  it("was measured on the population the rest split publishes", () => {
    expect(facts.population).toBe(REST_SPLIT_SAMPLE.scoredGames);
  });

  it("is what the method page prints, not typed rates", () => {
    const page = read("src", "app", "behind-the-data", "rest-advantage", "page.tsx");
    expect(page).toContain("HOME_REST_CONFOUND.bothTravelledIn.homeWinPct");
    expect(page).toContain("HOME_REST_CONFOUND.homeFlewFarther.homeWinPct");
    expect(page).toContain("HOME_REST_CONFOUND.homeTravelledInOnBackToBack.homeWinPct");
    expect(page).not.toMatch(/still won \d/);
  });
});
