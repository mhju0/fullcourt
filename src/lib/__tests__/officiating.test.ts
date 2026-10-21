import { describe, expect, it } from "vitest";
import data from "@/data/officiating.json";
import {
  categoryLabel,
  filterReviews,
  reviewUrl,
  summarizeSeasons,
  type ReviewSeason,
} from "@/lib/officiating";

describe("officiating evidence and browsing", () => {
  it("pins the reviewed regular-season populations", () => {
    expect(
      data.seasons.filter((s) => s.season <= "2025-26").map((s) => [s.season, s.games.length, s.missed, s.wrong]),
    ).toEqual([
      ["2014-15", 113, 184, 21],
      ["2015-16", 410, 585, 105],
      ["2016-17", 403, 508, 39],
      ["2017-18", 452, 517, 58],
      ["2018-19", 424, 612, 68],
      ["2019-20", 363, 451, 63],
      ["2020-21", 379, 356, 79],
      ["2021-22", 409, 536, 90],
      ["2022-23", 441, 572, 84],
      ["2023-24", 367, 363, 66],
      ["2024-25", 399, 244, 61],
      ["2025-26", 386, 308, 68],
    ]);
    expect(data.seasons[0].games.map((g) => g.date).sort()[0]).toBe("2015-03-01");
  });
  it("retains clean team games, but excludes them for an error category", () => {
    const games = (data.seasons as ReviewSeason[])[2].games;
    const clean = games.find((g) => g.missed + g.wrong === 0)!;
    expect(filterReviews(games, clean.home, "")).toContain(clean);
    expect(filterReviews(games, clean.home, "Foul: Shooting")).not.toContain(
      clean,
    );
    expect(filterReviews(games, "UNKNOWN", "")).toEqual([]);
  });
  it("joins the Cup semifinal by canonical ID while retaining NBA report identity", () => {
    const games = (data.seasons as ReviewSeason[]).flatMap((s) => s.games);
    const game = games.find((g) => g.id === "0022401229")!;
    expect(game.canonicalExternalId).toBe("bref-202412140MIL");
    expect([game.date, game.home, game.away]).toEqual(["2024-12-14", "MIL", "ATL"]);
    expect(game.source).toBe("https://official.nba.com/l2m/L2MReport.html?gameId=0022401229");
    expect(games.filter((g) => g.canonicalExternalId)).toHaveLength(1);
    expect(reviewUrl("2024-25", "MIL", "", game.id)).toContain("game=0022401229");
  });
  it("keeps distinct NBA categories distinguishable in the chips", () => {
    for (const season of data.seasons) {
      const labels = Object.keys(season.categories).map(categoryLabel);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
  it("preserves season, team, category and game in a shared link", () => {
    const params = new URL(
      reviewUrl("2024-25", "NYK", "Foul: Shooting", "0022400011"),
      "https://example.test",
    ).searchParams;
    expect(Object.fromEntries(params)).toEqual({
      season: "2024-25",
      team: "NYK",
      type: "Foul: Shooting",
      game: "0022400011",
    });
  });
});

describe("officiating page payload", () => {
  it("summarizes every season without its game list", () => {
    const seasons = data.seasons as ReviewSeason[];
    const summaries = summarizeSeasons(seasons);

    expect(summaries.map((s) => [s.season, s.gameCount])).toEqual(seasons.map((s) => [s.season, s.games.length]));
    expect(summaries.every((s) => !("games" in s))).toBe(true);
    // The page used to serialize all ~4,500 games (~1.6 MB) into its first load.
    expect(JSON.stringify(summaries).length).toBeLessThan(20_000);
  });
});
