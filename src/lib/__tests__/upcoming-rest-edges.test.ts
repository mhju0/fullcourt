import { describe, expect, it } from "vitest";
import { compareUpcomingTipOff } from "@/lib/upcoming-rest-edges";

describe("upcoming rest edge order", () => {
  it("takes the earliest qualifying games rather than the largest gaps", () => {
    const games = [
      { gameId: 1, date: "2027-01-14", tipOffUtc: "2027-01-15T02:00:00Z", gap: 9.28 },
      { gameId: 2, date: "2026-11-05", tipOffUtc: "2026-11-06T03:00:00Z", gap: 5.12 },
      { gameId: 3, date: "2026-11-04", tipOffUtc: "2026-11-05T01:00:00Z", gap: 4.99 },
      { gameId: 4, date: "2026-11-09", tipOffUtc: "2026-11-10T03:00:00Z", gap: 6.12 },
      { gameId: 5, date: "2026-11-11", tipOffUtc: "2026-11-12T00:00:00Z", gap: 5.8 },
    ];
    expect(games.filter((game) => game.gap >= 5).sort(compareUpcomingTipOff).slice(0, 3).map((game) => game.gameId)).toEqual([2, 4, 5]);
  });

  it("uses tip-off within an ET date, then a stable game ID; unknown times come last", () => {
    const date = "2026-11-11";
    const games = [
      { gameId: 1, date, tipOffUtc: null },
      { gameId: 2, date, tipOffUtc: "2026-11-12T03:00:00Z" },
      { gameId: 4, date, tipOffUtc: "2026-11-12T00:00:00Z" },
      { gameId: 3, date, tipOffUtc: "2026-11-12T00:00:00Z" },
      { gameId: 5, date: "2026-11-12", tipOffUtc: null },
    ];
    expect(games.sort(compareUpcomingTipOff).map((game) => game.gameId)).toEqual([3, 4, 2, 1, 5]);
  });
});
