import { describe, expect, it } from "vitest";
import { reconcileLiveScores } from "@/lib/live-score-sync";

describe("reconcileLiveScores", () => {
  it("does not update an unchanged live game", () => {
    const result = reconcileLiveScores(
      [
        {
          id: 1,
          externalId: "0022500001",
          status: "live",
          homeScore: 48,
          awayScore: 45,
        },
      ],
      [
        {
          gameId: "22500001",
          gameStatus: 2,
          homeTeam: { score: 48 },
          awayTeam: { score: 45 },
        },
      ]
    );

    expect(result).toEqual([]);
  });

  it("returns only games whose status or stored scores changed", () => {
    const result = reconcileLiveScores(
      [
        {
          id: 1,
          externalId: "0022500001",
          status: "live",
          homeScore: 48,
          awayScore: 45,
        },
        {
          id: 2,
          externalId: "0022500002",
          status: "scheduled",
          homeScore: null,
          awayScore: null,
        },
        {
          id: 3,
          externalId: "0022500003",
          status: "scheduled",
          homeScore: null,
          awayScore: null,
        },
      ],
      [
        {
          gameId: "22500001",
          gameStatus: 2,
          homeTeam: { score: 50 },
          awayTeam: { score: 45 },
        },
        {
          gameId: "0022500002",
          gameStatus: 2,
          homeTeam: { score: 0 },
          awayTeam: { score: 0 },
        },
      ]
    );

    expect(result).toEqual([
      {
        gameId: 1,
        status: "live",
        homeScore: 50,
        awayScore: 45,
      },
      {
        gameId: 2,
        status: "live",
        homeScore: null,
        awayScore: null,
      },
    ]);
  });
});
