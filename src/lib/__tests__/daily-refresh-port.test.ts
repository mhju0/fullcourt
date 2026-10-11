import { describe, expect, it } from "vitest";
import { gamesToRescoreAfterFinals } from "@/lib/daily-refresh-port";

const NOW = new Date("2026-10-21T03:30:00Z");

function game(id: number, date: string, home: number, away: number, tip: string | null, status = "scheduled") {
  return {
    id,
    date,
    homeTeamId: home,
    awayTeamId: away,
    status,
    tipOffUtc: tip === null ? null : new Date(tip),
  };
}

describe("gamesToRescoreAfterFinals", () => {
  it("picks the next game of each team that has just gone final", () => {
    const picked = gamesToRescoreAfterFinals({
      finalizedTeamIds: new Set([1, 2]),
      upcoming: [
        game(10, "2026-10-21", 3, 1, "2026-10-21T23:00:00Z"),
        game(11, "2026-10-22", 2, 4, "2026-10-22T23:00:00Z"),
        game(12, "2026-10-21", 5, 6, "2026-10-21T23:00:00Z"),
      ],
      now: NOW,
    });
    expect(picked.map((g) => g.id)).toEqual([10, 11]);
  });

  it("takes only the first upcoming game per team", () => {
    const picked = gamesToRescoreAfterFinals({
      finalizedTeamIds: new Set([1]),
      upcoming: [
        game(21, "2026-10-22", 1, 4, "2026-10-22T23:00:00Z"),
        game(20, "2026-10-21", 3, 1, "2026-10-21T23:00:00Z"),
      ],
      now: NOW,
    });
    expect(picked.map((g) => g.id)).toEqual([20]);
  });

  it("leaves a game that has tipped off alone and moves to the one after", () => {
    const picked = gamesToRescoreAfterFinals({
      finalizedTeamIds: new Set([1]),
      upcoming: [
        game(30, "2026-10-20", 3, 1, "2026-10-21T02:00:00Z"),
        game(31, "2026-10-22", 1, 4, "2026-10-22T23:00:00Z"),
      ],
      now: NOW,
    });
    expect(picked.map((g) => g.id)).toEqual([31]);
  });

  it("ignores games that are not scheduled", () => {
    const picked = gamesToRescoreAfterFinals({
      finalizedTeamIds: new Set([1]),
      upcoming: [game(40, "2026-10-21", 3, 1, "2026-10-21T23:00:00Z", "final")],
      now: NOW,
    });
    expect(picked).toEqual([]);
  });

  it("rescores one game once when both of its teams went final", () => {
    const picked = gamesToRescoreAfterFinals({
      finalizedTeamIds: new Set([1, 3]),
      upcoming: [game(50, "2026-10-21", 3, 1, "2026-10-21T23:00:00Z")],
      now: NOW,
    });
    expect(picked.map((g) => g.id)).toEqual([50]);
  });

  it("returns nothing when no team went final", () => {
    expect(
      gamesToRescoreAfterFinals({
        finalizedTeamIds: new Set(),
        upcoming: [game(60, "2026-10-21", 3, 1, "2026-10-21T23:00:00Z")],
        now: NOW,
      })
    ).toEqual([]);
  });
});
