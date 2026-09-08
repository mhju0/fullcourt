import { describe, expect, it } from "vitest";
import { readSlateUrl, slateUrl } from "@/lib/game-slate-url";

const read = (search: string) => readSlateUrl(search, "2025-26", "2026-09-07");

describe("Games URL selection", () => {
  it("uses explicit historical selection before the offseason default", () => {
    expect(read("?season=2024-25&date=2024-12-25")).toEqual({ season: "2024-25", date: "2024-12-25" });
    expect(read("?date=2023-12-25")).toEqual({ season: "2023-24", date: "2023-12-25" });
  });
  it("preserves the explicit season for the bubble's October games", () => {
    expect(read("?season=2019-20&date=2020-10-01")).toEqual({ season: "2019-20", date: "2020-10-01" });
  });
  it.each(["2024-02-30", "invalid", "2024-2-01", "9999-12-31"])("rejects invalid or unsupported date %s", date => {
    expect(read(`?date=${date}`).date).toBeNull();
  });
  it("rejects a date from an unrelated year", () => {
    expect(read("?season=2024-25&date=2020-12-25")).toEqual({ season: "2024-25", date: null });
  });
  it("preserves density, unrelated parameters and anchors", () => {
    expect(slateUrl("https://example.com/games?view=deep&x=1#matchups", "2024-25", "2024-12-24").href)
      .toBe("https://example.com/games?view=deep&x=1&season=2024-25&date=2024-12-24#matchups");
  });
});
