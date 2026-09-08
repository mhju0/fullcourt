import { describe, expect, it } from "vitest";
import data from "@/data/officiating.json";
import {
  categoryLabel,
  filterReviews,
  reviewUrl,
  type ReviewSeason,
} from "@/lib/officiating";

describe("officiating evidence and browsing", () => {
  it("pins the reviewed regular-season populations", () => {
    expect(
      data.seasons.filter((s) => ["2023-24", "2024-25", "2025-26"].includes(s.season)).map((s) => [s.season, s.games.length, s.missed, s.wrong]),
    ).toEqual([
      ["2023-24", 367, 363, 66],
      ["2024-25", 399, 244, 61],
      ["2025-26", 386, 308, 68],
    ]);
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
