import { describe, expect, it } from "vitest";
import style from "@/data/referee-foul-style.json";
import {
  FOUL_COLUMNS,
  MIN_GAMES,
  NOTABLE_Z,
  isNotable,
  publishable,
  relativePct,
  sortRows,
  type RefereeFoulStyle,
} from "@/lib/referee-foul-style";

const data = style as RefereeFoulStyle;

/**
 * Guards the shipped aggregate, not the arithmetic that produced it — the /referees page
 * renders these numbers directly, so a regenerated file that changed shape or lost its
 * per-season baseline would reach the page silently.
 */
describe("referee foul style — the shipped aggregate", () => {
  it("carries every column the page renders", () => {
    for (const row of data.officials) {
      for (const col of FOUL_COLUMNS) {
        expect(typeof row[col.key], `${row.name}.${col.key}`).toBe("number");
        expect(typeof row[`${col.key}Z` as keyof typeof row], `${row.name}.${col.key}Z`).toBe(
          "number"
        );
      }
    }
  });

  it("carries a within-corpus span on every row, bounded by the dataset's own", () => {
    // The SINCE column ships with a censoring caveat ("in this data, not a hire date"), and
    // this is the fact the caveat rests on: no row may claim a season outside the corpus,
    // and a span must run forward. A regeneration that dropped the fields would render an
    // empty column silently.
    const seasonShape = /^\d{4}-\d{2}$/;
    for (const row of data.officials) {
      expect(row.firstSeason, `${row.name}.firstSeason`).toMatch(seasonShape);
      expect(row.lastSeason, `${row.name}.lastSeason`).toMatch(seasonShape);
      expect(row.firstSeason >= data.firstSeason, `${row.name} predates the corpus`).toBe(true);
      expect(row.lastSeason <= data.lastSeason, `${row.name} outlives the corpus`).toBe(true);
      expect(row.firstSeason <= row.lastSeason, `${row.name} span runs backwards`).toBe(true);
    }
  });

  it("publishes deviations, so every column is zero-centred once weighted by games", () => {
    // Each game contributes its deviation to all three of its officials, and within a season
    // those deviations sum to zero by construction — so the GAME-WEIGHTED mean is zero, to
    // three decimals. Drift here means the baseline was pooled across seasons instead of taken
    // within them, which would let an era's foul mix leak in as an official's tendency.
    //
    // The unweighted mean across officials is deliberately NOT the assertion: 54 of them carry
    // a median of 29 games, and giving those rows equal weight moves loose ball to +0.24 with
    // nothing wrong. That near-miss is why this test states the invariant that actually holds.
    const totalGames = data.officials.reduce((a, r) => a + r.games, 0);
    for (const col of FOUL_COLUMNS) {
      const weighted =
        data.officials.reduce((a, r) => a + r[col.key] * r.games, 0) / totalGames;
      expect(Math.abs(weighted), `${col.key} game-weighted mean`).toBeLessThan(0.01);
    }
  });

  it("keeps published officials close to zero-centred too", () => {
    // Above the publication bar the sample sizes are even enough that the unweighted mean is
    // also near zero. If this drifts while the weighted test still passes, the bar is letting
    // through officials too thin for the z-scores beside them.
    for (const col of FOUL_COLUMNS) {
      const rows = publishable(data.officials);
      const mean = rows.reduce((a, r) => a + r[col.key], 0) / rows.length;
      expect(Math.abs(mean), `${col.key} mean over published officials`).toBeLessThan(0.1);
    }
  });

  it("excludes the offensive-foul duplicate from fouls per game", () => {
    // ESPN logs an offensive foul twice, once as the foul and once as the turnover. Counting
    // both put fouls per game near 42 against a box score of 38.8; the real figure sits just
    // under 40. This is the number that would silently drift if the exclusion were dropped.
    expect(data.foulsPerGame).toBeGreaterThan(35);
    expect(data.foulsPerGame).toBeLessThan(41);
  });

  it("only counts crew-chief games in the seasons where the role was validated", () => {
    expect(data.crewChiefFirstSeason).toBe("2024-25");
    // Two seasons at 82 games is a hard ceiling on how many any one official can have chiefed.
    for (const row of data.officials) {
      expect(row.chiefGames, row.name).toBeLessThanOrEqual(row.games);
      expect(row.chiefGames, row.name).toBeLessThanOrEqual(200);
    }
  });

  it("keeps the league shares summing to less than a whole game's fouls", () => {
    // The five published types are a subset — away-from-play, clear path, flagrant and take
    // fouls are counted in the total and shown in no column. Summing over 100 would mean a
    // type was being double counted.
    const sum = FOUL_COLUMNS.reduce((a, c) => a + data.leagueShares[c.key], 0);
    expect(sum).toBeGreaterThan(80);
    expect(sum).toBeLessThan(100);
  });

  it("has officials clearing the publication bar", () => {
    const rows = publishable(data.officials);
    expect(rows.length).toBeGreaterThan(30);
    expect(rows.every((r) => r.games >= MIN_GAMES)).toBe(true);
  });
});

describe("referee foul style — helpers", () => {
  it("marks a deviation notable only at two standard errors", () => {
    expect(isNotable(NOTABLE_Z)).toBe(true);
    expect(isNotable(-NOTABLE_Z)).toBe(true);
    expect(isNotable(1.99)).toBe(false);
    expect(isNotable(-1.99)).toBe(false);
  });


  it("scales a deviation against its own league share", () => {
    // The whole point of the conversion: the same +1.39pp is trivial on shooting fouls and the
    // largest effect in the data on offensive fouls, and the page must not present them alike.
    expect(relativePct(1.39, 6.1)).toBe(23);
    expect(relativePct(1.39, 50.2)).toBe(3);
    expect(relativePct(-0.84, 6.1)).toBe(-14);
    expect(relativePct(0, 6.1)).toBe(0);
  });



  it("breaks sort ties on name so the order is total", () => {
    const rows = [
      { name: "Zed", games: 300, offensive: 0.5 },
      { name: "Abe", games: 300, offensive: 0.5 },
    ] as never;
    const asc = sortRows(rows, "offensive", 1).map((r) => r.name);
    const desc = sortRows(rows, "offensive", -1).map((r) => r.name);
    expect(asc).toEqual(["Abe", "Zed"]);
    // Direction flips the comparison but not the tie-break, which is what keeps it stable.
    expect(desc).toEqual(["Abe", "Zed"]);
  });

  it("sorts numerically, not lexically", () => {
    const rows = [
      { name: "A", games: 9 },
      { name: "B", games: 100 },
    ] as never;
    expect(sortRows(rows, "games", -1).map((r) => r.name)).toEqual(["B", "A"]);
  });
});
