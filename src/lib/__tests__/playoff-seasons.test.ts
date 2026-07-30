import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NBA_SEASONS } from "../nba-season";
import { PLAYOFF_MODEL_EXCLUDED_SEASONS, playoffModelSeasons } from "../playoff-seasons";

describe("playoffModelSeasons", () => {
  it("withholds exactly the excluded seasons and keeps every other one", () => {
    const offered = playoffModelSeasons();
    expect(offered).not.toContain("2019-20");
    expect(offered).toHaveLength(NBA_SEASONS.length - PLAYOFF_MODEL_EXCLUDED_SEASONS.length);
    for (const season of NBA_SEASONS) {
      expect(offered.includes(season)).toBe(!PLAYOFF_MODEL_EXCLUDED_SEASONS.includes(season));
    }
  });

  it("names only seasons that exist", () => {
    for (const season of PLAYOFF_MODEL_EXCLUDED_SEASONS) {
      expect(NBA_SEASONS).toContain(season);
    }
  });

  // The regression this file exists for. 2019-20 entered NBA_SEASONS on 2026-07-30 and the
  // playoffs selector, which had no list of its own, began offering a season that can never
  // have series — two 0% accuracy tiles above an empty bracket, which reads as a broken tab.
  it("keeps 2019-20 available to surfaces that are not the playoff model", () => {
    expect(NBA_SEASONS).toContain("2019-20");
    expect(playoffModelSeasons()).not.toContain("2019-20");
  });

  // `ml/build_series_dataset.py` decides what reaches `playoff_series`; this module decides
  // what the selector offers. If they disagree, the selector offers a season with no rows —
  // the exact failure above, in the other direction.
  it("agrees with the Python builder that owns the exclusion", () => {
    const source = readFileSync(
      join(process.cwd(), "ml", "build_series_dataset.py"),
      "utf8"
    );
    const match = source.match(/^EXCLUDED_SEASON = "([^"]+)"/m);
    expect(match, "EXCLUDED_SEASON not found in ml/build_series_dataset.py").not.toBeNull();
    expect(PLAYOFF_MODEL_EXCLUDED_SEASONS).toContain(match![1]);
  });
});
